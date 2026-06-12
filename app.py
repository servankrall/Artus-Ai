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
CONFIG_PATH = BASE_DIR / "config.txt"
MAX_HISTORY = 50

# config.txt'den key oku (varsa)
def _load_config() -> dict:
    cfg = {}
    if CONFIG_PATH.exists():
        for line in CONFIG_PATH.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            cfg[k.strip().upper()] = v.strip()
    return cfg

_cfg = _load_config()
GROQ_API_KEY     = _cfg.get("GROQ_API_KEY")     or os.environ.get("GROQ_API_KEY", "")
ANTHROPIC_API_KEY = _cfg.get("ANTHROPIC_API_KEY") or os.environ.get("ANTHROPIC_API_KEY", "")

if ANTHROPIC_API_KEY:
    PROVIDER = "anthropic"
elif GROQ_API_KEY:
    PROVIDER = "groq"
else:
    PROVIDER = "free"

ANTHROPIC_MODEL = "claude-sonnet-4-6"
GROQ_MODEL      = "llama-3.3-70b-versatile"

try:
    with open(SYSTEM_PROMPT_PATH, "r", encoding="utf-8") as f:
        SYSTEM_PROMPT = f.read()
except OSError:
    SYSTEM_PROMPT = "Sen OMNI AGENT v1'sin: uzman seviyesinde, verimli ve profesyonel bir dijital operatör."

conversation_history: dict[str, list[dict]] = defaultdict(list)

app = FastAPI(title="Artus AI", version="1.4.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True,
                   allow_methods=["*"], allow_headers=["*"])


class ChatRequest(BaseModel):
    session_id: str
    message: str


async def stream_anthropic(history: list[dict]) -> AsyncGenerator[str, None]:
    import anthropic
    client = anthropic.AsyncAnthropic(api_key=ANTHROPIC_API_KEY)
    async with client.messages.stream(
        model=ANTHROPIC_MODEL, max_tokens=8096,
        system=SYSTEM_PROMPT, messages=history,
    ) as stream:
        async for text in stream.text_stream:
            yield text


async def stream_groq(history: list[dict]) -> AsyncGenerator[str, None]:
    payload = {
        "model": GROQ_MODEL,
        "messages": [{"role": "system", "content": SYSTEM_PROMPT}] + history,
        "stream": True,
        "max_tokens": 8096,
    }
    headers = {
        "Authorization": f"Bearer {GROQ_API_KEY}",
        "Content-Type": "application/json",
    }
    async with httpx.AsyncClient(timeout=90) as client:
        async with client.stream("POST", "https://api.groq.com/openai/v1/chat/completions",
                                  json=payload, headers=headers) as resp:
            resp.raise_for_status()
            async for line in resp.aiter_lines():
                if not line.startswith("data:"):
                    continue
                data = line[5:].strip()
                if data == "[DONE]":
                    break
                try:
                    text = json.loads(data)["choices"][0]["delta"].get("content") or ""
                except (json.JSONDecodeError, KeyError, IndexError):
                    continue
                if text:
                    yield text


async def stream_free(history: list[dict]) -> AsyncGenerator[str, None]:
    """Son care: Pollinations — rate limit yasanabilir."""
    payload = {
        "model": "openai",
        "messages": [{"role": "system", "content": SYSTEM_PROMPT}] + history,
        "stream": True,
    }
    for attempt in range(4):
        try:
            async with httpx.AsyncClient(timeout=90) as client:
                async with client.stream(
                    "POST", "https://text.pollinations.ai/openai",
                    json=payload, headers={"Referer": "https://pollinations.ai"}
                ) as resp:
                    if resp.status_code == 429:
                        await asyncio.sleep(5 * (attempt + 1))
                        continue
                    resp.raise_for_status()
                    async for line in resp.aiter_lines():
                        if not line.startswith("data:"):
                            continue
                        data = line[5:].strip()
                        if data == "[DONE]":
                            return
                        try:
                            text = json.loads(data)["choices"][0]["delta"].get("content") or ""
                        except (json.JSONDecodeError, KeyError, IndexError):
                            continue
                        if text:
                            yield text
                    return
        except Exception:
            await asyncio.sleep(3)
    raise Exception(
        "Ucretsiz API rate limit yedi. config.txt dosyasina GROQ_API_KEY ekle "
        "(groq.com - ucretsiz kayit, 1 dakika)."
    )


_providers = {"anthropic": stream_anthropic, "groq": stream_groq, "free": stream_free}


@app.get("/health")
async def health():
    return {"status": "ok", "provider": PROVIDER,
            "model": ANTHROPIC_MODEL if PROVIDER == "anthropic" else
                     GROQ_MODEL if PROVIDER == "groq" else "pollinations"}


@app.post("/api/chat")
async def chat(request: ChatRequest):
    session_id = request.session_id.strip()
    user_message = request.message.strip()
    if not session_id:
        raise HTTPException(400, "session_id is required")
    if not user_message:
        raise HTTPException(400, "message is required")

    history = conversation_history[session_id]
    history.append({"role": "user", "content": user_message})
    if len(history) > MAX_HISTORY:
        conversation_history[session_id] = history[-MAX_HISTORY:]
        history = conversation_history[session_id]

    provider_fn = _providers[PROVIDER]

    async def event_stream() -> AsyncGenerator[str, None]:
        full_response = ""
        try:
            async for text in provider_fn(history):
                full_response += text
                yield f"data: {json.dumps({'type': 'text', 'content': text})}\n\n"
            history.append({"role": "assistant", "content": full_response})
            yield f"data: {json.dumps({'type': 'done'})}\n\n"
        except Exception as exc:
            if history and history[-1]["role"] == "user":
                history.pop()
            yield f"data: {json.dumps({'type': 'error', 'content': str(exc)})}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


if FRONTEND_DIR.exists():
    app.mount("/", StaticFiles(directory=str(FRONTEND_DIR), html=True), name="frontend")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)
