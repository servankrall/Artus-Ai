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

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

BASE_DIR = Path(__file__).resolve().parent
SYSTEM_PROMPT_PATH = BASE_DIR.parent / "prompts" / "omni-agent-v1.md"
FRONTEND_DIR = BASE_DIR.parent / "frontend"
MAX_HISTORY = 50

# Provider selection:
#   - ANTHROPIC_API_KEY varsa Claude kullanılır (claude-sonnet-4-6)
#   - yoksa ücretsiz, key gerektirmeyen Pollinations API kullanılır
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
USE_ANTHROPIC = bool(ANTHROPIC_API_KEY)

ANTHROPIC_MODEL = "claude-sonnet-4-6"
FREE_API_URL = "https://text.pollinations.ai/openai"
FREE_MODEL = "openai"  # Pollinations'ın ücretsiz varsayılan modeli

with open(SYSTEM_PROMPT_PATH, "r", encoding="utf-8") as f:
    SYSTEM_PROMPT = f.read()

# In-memory conversation history: session_id -> list of messages
conversation_history: dict[str, list[dict]] = defaultdict(list)

# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------

app = FastAPI(title="Artus AI", version="1.1.0")

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


# ---------------------------------------------------------------------------
# Providers
# ---------------------------------------------------------------------------

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


async def stream_free(history: list[dict]) -> AsyncGenerator[str, None]:
    """Key gerektirmeyen ücretsiz Pollinations API (OpenAI uyumlu, SSE stream)."""
    payload = {
        "model": FREE_MODEL,
        "messages": [{"role": "system", "content": SYSTEM_PROMPT}] + history,
        "stream": True,
    }
    async with httpx.AsyncClient(timeout=120) as client:
        async with client.stream("POST", FREE_API_URL, json=payload) as response:
            response.raise_for_status()
            async for line in response.aiter_lines():
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


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.get("/health")
async def health():
    return {
        "status": "ok",
        "provider": "anthropic" if USE_ANTHROPIC else "free (pollinations)",
        "model": ANTHROPIC_MODEL if USE_ANTHROPIC else FREE_MODEL,
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
            yield f"data: {json.dumps({'type': 'error', 'content': str(exc)})}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


# ---------------------------------------------------------------------------
# Static frontend — mount last so API routes take priority
# ---------------------------------------------------------------------------

if FRONTEND_DIR.exists():
    app.mount("/", StaticFiles(directory=str(FRONTEND_DIR), html=True), name="frontend")
