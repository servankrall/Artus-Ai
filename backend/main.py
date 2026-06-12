import json
import os
import uuid
from collections import defaultdict
from pathlib import Path
from typing import AsyncGenerator

import anthropic
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
MODEL = "claude-sonnet-4-6"
MAX_HISTORY = 50

# Load system prompt once at startup
with open(SYSTEM_PROMPT_PATH, "r", encoding="utf-8") as f:
    SYSTEM_PROMPT = f.read()

client = anthropic.Anthropic()

# In-memory conversation history: session_id -> list of messages
conversation_history: dict[str, list[dict]] = defaultdict(list)

# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------

app = FastAPI(title="Artus AI", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------

class ChatRequest(BaseModel):
    session_id: str
    message: str


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.get("/health")
async def health():
    return {"status": "ok", "model": MODEL}


@app.post("/api/chat")
async def chat(request: ChatRequest):
    session_id = request.session_id.strip()
    user_message = request.message.strip()

    if not session_id:
        raise HTTPException(status_code=400, detail="session_id is required")
    if not user_message:
        raise HTTPException(status_code=400, detail="message is required")

    # Append user message
    history = conversation_history[session_id]
    history.append({"role": "user", "content": user_message})

    # Cap history
    if len(history) > MAX_HISTORY:
        conversation_history[session_id] = history[-MAX_HISTORY:]
        history = conversation_history[session_id]

    async def event_stream() -> AsyncGenerator[str, None]:
        full_response = ""
        try:
            with client.messages.stream(
                model=MODEL,
                max_tokens=8096,
                system=SYSTEM_PROMPT,
                messages=history,
            ) as stream:
                for text in stream.text_stream:
                    full_response += text
                    payload = json.dumps({"type": "text", "content": text})
                    yield f"data: {payload}\n\n"

            # Persist assistant reply
            history.append({"role": "assistant", "content": full_response})

            # Signal done
            yield f"data: {json.dumps({'type': 'done'})}\n\n"

        except anthropic.APIError as exc:
            error_payload = json.dumps({"type": "error", "content": str(exc)})
            yield f"data: {error_payload}\n\n"

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
