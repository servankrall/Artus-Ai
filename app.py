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

try:
    with open(SYSTEM_PROMPT_PATH, "r", encoding="utf-8") as f:
        SYSTEM_PROMPT = f.read()
except OSError:
    SYSTEM_PROMPT = "Sen OMNI AGENT v1'sin: uzman seviyesinde, verimli ve profesyonel bir dijital operatör."

conversation_history: dict[str, list[dict]] = defaultdict(list)

app = FastAPI(title="Artus AI", version="1.3.0")

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


DDG_VQID_URL = "https://duckduckgo.com/duckchat/v1/status"
DDG_CHAT_URL = "https://duckduckgo.com/duckchat/v1/chat"
DDG_MODEL = "gpt-4o-mini"

_ddg_vqd: str = ""
_ddg_vqd_lock = asyncio.Lock()


async def _get_ddg_vqd(client: httpx.AsyncClient) -> str:
    global _ddg_vqd
    r = await client.get(DDG_VQID_URL, headers={"x-vqd-accept": "1"})
    r.raise_for_status()
    _ddg_vqd = r.headers.get("x-vqd-4", "")
    return _ddg_vqd


async def stream_free(history: list[dict]) -> AsyncGenerator[str, None]:
    global _ddg_vqd
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "text/event-stream",
        "Content-Type": "application/json",
        "Origin": "https://duckduckgo.com",
        "Referer": "https://duckduckgo.com/",
    }

    # DDG'ye gönderilecek mesajlar: sistem promptunu ilk user mesajına ekle
    ddg_messages = []
    for i, msg in enumerate(history):
        if i == 0 and msg["role"] == "user":
            ddg_messages.append({
                "role": "user",
                "content": f"{SYSTEM_PROMPT}\n\n---\n\n{msg['content']}"
            })
        else:
            ddg_messages.append(msg)

    payload = {"model": DDG_MODEL, "messages": ddg_messages}

    async with httpx.AsyncClient(timeout=90, headers=headers) as client:
        # VQD token al (yoksa veya süresi dolduysa)
        async with _ddg_vqd_lock:
            if not _ddg_vqd:
                await _get_ddg_vqd(client)

        for attempt in range(3):
            req_headers = {**headers, "x-vqd-4": _ddg_vqd}
            try:
                async with client.stream("POST", DDG_CHAT_URL, json=payload, headers=req_headers) as resp:
                    if resp.status_code == 429:
                        await asyncio.sleep(3 * (attempt + 1))
                        continue
                    if resp.status_code in (401, 403):
                        # VQD süresi dolmuş — yenile
                        async with _ddg_vqd_lock:
                            await _get_ddg_vqd(client)
                        continue
                    resp.raise_for_status()

                    new_vqd = ""
                    async for line in resp.aiter_lines():
                        if not line.startswith("data:"):
                            continue
                        data = line[5:].strip()
                        if data == "[DONE]":
                            break
                        try:
                            chunk = json.loads(data)
                            # Yanıtta yeni VQD token varsa sakla
                            if "x-vqd-4" in chunk:
                                new_vqd = chunk["x-vqd-4"]
                            text = chunk.get("message", "")
                        except (json.JSONDecodeError, KeyError):
                            continue
                        if text:
                            yield text

                    if new_vqd:
                        _ddg_vqd = new_vqd
                    return  # basarili

            except (httpx.HTTPStatusError, httpx.RemoteProtocolError):
                await asyncio.sleep(2)
                async with _ddg_vqd_lock:
                    await _get_ddg_vqd(client)

        # DDG de tutmazsa Pollinations fallback
        payload2 = {
            "model": "openai",
            "messages": [{"role": "system", "content": SYSTEM_PROMPT}] + history,
            "stream": True,
        }
        async with client.stream(
            "POST", "https://text.pollinations.ai/openai",
            json=payload2,
            headers={"Referer": "https://pollinations.ai"},
        ) as resp:
            resp.raise_for_status()
            async for line in resp.aiter_lines():
                if not line.startswith("data:"):
                    continue
                data = line[5:].strip()
                if data == "[DONE]":
                    break
                try:
                    chunk = json.loads(data)
                    text = chunk["choices"][0]["delta"].get("content") or ""
                except (json.JSONDecodeError, KeyError, IndexError):
                    continue
                if text:
                    yield text


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "provider": "anthropic" if USE_ANTHROPIC else "duckduckgo+fallback",
        "model": ANTHROPIC_MODEL if USE_ANTHROPIC else DDG_MODEL,
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
