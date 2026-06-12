import asyncio
import json
import os
from collections import defaultdict
from pathlib import Path
from typing import AsyncGenerator

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

BASE_DIR = Path(__file__).resolve().parent
SYSTEM_PROMPT_PATH = BASE_DIR / "prompts" / "omni-agent-v1.md"
FRONTEND_DIR = BASE_DIR / "frontend"
MAX_HISTORY = 50

ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
USE_ANTHROPIC = bool(ANTHROPIC_API_KEY)
ANTHROPIC_MODEL = "claude-sonnet-4-6"

# Sırayla denenen ücretsiz, key'siz API'ler
FREE_PROVIDERS = [
    {
        "url": "https://api.llm7.io/v1/chat/completions",
        "model": "gpt-4o-mini",
        "headers": {"Authorization": "Bearer unused"},
    },
    {
        "url": "https://text.pollinations.ai/openai",
        "model": "openai",
        "headers": {"Referer": "https://pollinations.ai"},
    },
    {
        "url": "https://text.pollinations.ai/openai",
        "model": "mistral",
        "headers": {"Referer": "https://pollinations.ai"},
    },
]

try:
    with open(SYSTEM_PROMPT_PATH, "r", encoding="utf-8") as f:
        SYSTEM_PROMPT = f.read()
except OSError:
    SYSTEM_PROMPT = "Sen OMNI AGENT v1'sin: uzman seviyesinde, verimli ve profesyonel bir dijital operatör."

conversation_history: dict[str, list[dict]] = defaultdict(list)

app = FastAPI(title="Artus AI", version="1.2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ChatRequest(BaseModel):
    session_id: str
    message: str


async def stream_anthropic(history: list[dict]) -> AsyncGenerator[str, None]:
    import anthropic
    client = anthropic.AsyncAnthropic(api_key=ANTHROPIC_API_KEY)
    async with client.messages.stream(
        model=ANTHROPIC_MODEL,
        max_tokens=8096,
        system=SYSTEM_PROMPT,
        messages=history,
    ) as stream:
        async for text in stream.text_stream:
            yield text


async def _try_provider(provider: dict, history: list[dict]) -> AsyncGenerator[str, None]:
    payload = {
        "model": provider["model"],
        "messages": [{"role": "system", "content": SYSTEM_PROMPT}] + history,
        "stream": True,
    }
    async with httpx.AsyncClient(timeout=90, headers=provider.get("headers", {})) as client:
        async with client.stream("POST", provider["url"], json=payload) as response:
            if response.status_code == 429:
                raise httpx.HTTPStatusError("429", request=response.request, response=response)
            response.raise_for_status()
            async for line in response.aiter_lines():
                if not line.startswith("data:"):
                    continue
                data = line[5:].strip()
                if data == "[DONE]":
                    return
                try:
                    chunk = json.loads(data)
                    text = chunk["choices"][0]["delta"].get("content") or ""
                except (json.JSONDecodeError, KeyError, IndexError):
                    continue
                if text:
                    yield text


async def stream_free(history: list[dict]) -> AsyncGenerator[str, None]:
    last_error = None
    for attempt in range(3):  # 3 retry
        for provider in FREE_PROVIDERS:
            try:
                async for text in _try_provider(provider, history):
                    yield text
                return  # basarili
            except httpx.HTTPStatusError as e:
                last_error = e
                if e.response.status_code == 429:
                    # Rate limit: biraz bekle ve sonraki provider'ı dene
                    await asyncio.sleep(2 + attempt * 3)
                    continue
                raise
            except Exception as e:
                last_error = e
                await asyncio.sleep(1)
                continue

    raise Exception(
        f"Tum providerlar basarisiz oldu (muhtemelen rate limit). "
        f"Bir sire bekleyip tekrar dene. Son hata: {last_error}"
    )


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "provider": "anthropic" if USE_ANTHROPIC else "free",
        "model": ANTHROPIC_MODEL if USE_ANTHROPIC else "auto",
    }


@app.post("/api/chat")
async def chat(request: ChatRequest):
    session_id = request.session_id.strip()
    user_message = request.message.strip()

    if not session_id:
        raise HTTPException(status_code=400, detail="session_id is required")
    if not user_message:
        raise HTTPException(status_code=400, detail="message is required")

    history = conversation_history[session_id]
    history.append({"role": "user", "content": user_message})

    if len(history) > MAX_HISTORY:
        conversation_history[session_id] = history[-MAX_HISTORY:]
        history = conversation_history[session_id]

    provider = stream_anthropic if USE_ANTHROPIC else stream_free

    async def event_stream() -> AsyncGenerator[str, None]:
        full_response = ""
        try:
            async for text in provider(history):
                full_response += text
                yield f"data: {json.dumps({'type': 'text', 'content': text})}\n\n"
            history.append({"role": "assistant", "content": full_response})
            yield f"data: {json.dumps({'type': 'done'})}\n\n"
        except Exception as exc:
            # Hata olursa user mesajını history'den cikar
            if history and history[-1]["role"] == "user":
                history.pop()
            yield f"data: {json.dumps({'type': 'error', 'content': str(exc)})}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


if FRONTEND_DIR.exists():
    app.mount("/", StaticFiles(directory=str(FRONTEND_DIR), html=True), name="frontend")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)
