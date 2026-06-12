import asyncio
import json
import os
from collections import defaultdict
from pathlib import Path
from typing import AsyncGenerator

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

BASE_DIR = Path(__file__).resolve().parent
SYSTEM_PROMPT_PATH = BASE_DIR / "prompts" / "omni-agent-v1.md"
FRONTEND_DIR = BASE_DIR / "frontend"
CONFIG_PATH = BASE_DIR / "config.txt"
MAX_HISTORY = 50

ANTHROPIC_MODEL = "claude-sonnet-4-6"
GROQ_MODEL = "llama-3.3-70b-versatile"

try:
    with open(SYSTEM_PROMPT_PATH, "r", encoding="utf-8") as f:
        SYSTEM_PROMPT = f.read()
except OSError:
    SYSTEM_PROMPT = "Sen OMNI AGENT v1'sin: uzman seviyesinde, verimli ve profesyonel bir dijital operatör."

conversation_history: dict[str, list[dict]] = defaultdict(list)


def get_keys() -> dict:
    """Her istekte config.txt'i oku — restart gerekmez."""
    cfg = {}
    if CONFIG_PATH.exists():
        for line in CONFIG_PATH.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            v = v.strip()
            if v and v != "buraya_groq_key_yapistir" and v != "buraya_anthropic_key_yapistir":
                cfg[k.strip().upper()] = v
    # Ortam degiskenleri config'i ezer
    for k in ("GROQ_API_KEY", "ANTHROPIC_API_KEY"):
        if os.environ.get(k):
            cfg[k] = os.environ[k]
    return cfg


app = FastAPI(title="Artus AI", version="1.5.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True,
                   allow_methods=["*"], allow_headers=["*"])


class ChatRequest(BaseModel):
    session_id: str
    message: str
    model: str = ""
    mode: str = "chat"


async def stream_anthropic(history: list[dict], key: str) -> AsyncGenerator[str, None]:
    import anthropic
    client = anthropic.AsyncAnthropic(api_key=key)
    async with client.messages.stream(
        model=ANTHROPIC_MODEL, max_tokens=8096,
        system=SYSTEM_PROMPT, messages=history,
    ) as stream:
        async for text in stream.text_stream:
            yield text


GROQ_MODELS = [
    "llama-3.3-70b-versatile",
    "llama-3.1-8b-instant",
    "gemma2-9b-it",
    "llama3-8b-8192",
]

def _trim_history(history: list[dict], max_chars: int = 12000) -> list[dict]:
    """Toplam karakter sınırı aşarsa eski mesajları at. Her zaman user ile başla."""
    trimmed = list(history)
    while trimmed:
        total = sum(len(m.get("content", "")) for m in trimmed)
        if total <= max_chars:
            break
        trimmed = trimmed[2:]  # en eski user+assistant çiftini at
    # Boş içerik veya assistant ile başlama durumunu düzelt
    trimmed = [m for m in trimmed if m.get("content", "").strip()]
    while trimmed and trimmed[0]["role"] != "user":
        trimmed = trimmed[1:]
    return trimmed if trimmed else history[-1:]


async def stream_groq(history: list[dict], key: str, preferred_model: str = "") -> AsyncGenerator[str, None]:
    headers = {"Authorization": f"Bearer {key}", "Content-Type": "application/json"}
    # Use preferred model as starting point if valid, otherwise default
    if preferred_model and preferred_model in GROQ_MODELS:
        start_model = preferred_model
        fallback_models = [m for m in GROQ_MODELS if m != preferred_model] + [preferred_model]
    else:
        start_model = GROQ_MODELS[0]
        fallback_models = GROQ_MODELS
    model_idx = 0
    safe_history = _trim_history(history)

    while True:  # rate limit olunca asla hata verme, sessizce retry yap
        if model_idx == 0:
            model = start_model
        else:
            model = fallback_models[(model_idx - 1) % len(fallback_models)]
        payload = {
            "model": model,
            "messages": [{"role": "system", "content": SYSTEM_PROMPT}] + safe_history,
            "stream": True,
            "max_tokens": 4096,
        }
        try:
            async with httpx.AsyncClient(timeout=90) as client:
                async with client.stream(
                    "POST", "https://api.groq.com/openai/v1/chat/completions",
                    json=payload, headers=headers,
                ) as resp:
                    if resp.status_code == 429:
                        wait = int(resp.headers.get("retry-after", 5))
                        await asyncio.sleep(min(wait, 10))
                        model_idx += 1  # sonraki modeli dene
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
                    return  # basarili bitti
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 429:
                await asyncio.sleep(8)
                model_idx += 1
                continue
            if e.response.status_code == 413:
                # Hala buyukse daha agresif kirp
                safe_history = safe_history[-2:] if len(safe_history) > 2 else safe_history
                continue
            raise  # diger hatalar gercek hata
        except Exception:
            await asyncio.sleep(3)
            continue


async def stream_free(history: list[dict]) -> AsyncGenerator[str, None]:
    payload = {
        "model": "openai",
        "messages": [{"role": "system", "content": SYSTEM_PROMPT}] + history,
        "stream": True,
    }
    for attempt in range(5):
        try:
            async with httpx.AsyncClient(timeout=90) as client:
                async with client.stream(
                    "POST", "https://text.pollinations.ai/openai",
                    json=payload,
                    headers={"Referer": "https://pollinations.ai"},
                ) as resp:
                    if resp.status_code == 429:
                        wait = 8 * (attempt + 1)
                        yield f"__WAIT__{wait}"
                        await asyncio.sleep(wait)
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
        "Ucretsiz API cevap vermiyor. "
        "Lutfen config.txt dosyasina Groq key ekle: console.groq.com (ucretsiz)"
    )


@app.get("/")
async def root():
    return RedirectResponse("/loading.html")


@app.get("/api/user-check")
async def user_check():
    return {"ok": True}


@app.get("/health")
async def health():
    keys = get_keys()
    if keys.get("ANTHROPIC_API_KEY"):
        provider = "anthropic"
    elif keys.get("GROQ_API_KEY"):
        provider = "groq"
    else:
        provider = "free"
    return {"status": "ok", "provider": provider}


@app.get("/debug")
async def debug():
    """config.txt okunuyor mu, key var mi? Tarayicida localhost:8000/debug ile bak."""
    keys = get_keys()
    groq = keys.get("GROQ_API_KEY", "")
    anth = keys.get("ANTHROPIC_API_KEY", "")
    config_exists = CONFIG_PATH.exists()
    config_raw = CONFIG_PATH.read_text(encoding="utf-8") if config_exists else "(yok)"
    return {
        "config_txt_bulundu": config_exists,
        "config_txt_icerik": config_raw,
        "groq_key_algilandi": bool(groq),
        "groq_key_onizleme": (groq[:8] + "...") if groq else "YOK - key eklenmemis!",
        "anthropic_key_algilandi": bool(anth),
        "kullanilacak_provider": "groq" if groq else ("anthropic" if anth else "FREE (rate limit riski!)"),
    }


@app.post("/api/chat")
async def chat(request: ChatRequest):
    session_id = request.session_id.strip()
    user_message = request.message.strip()
    if not session_id:
        raise HTTPException(400, "session_id required")
    if not user_message:
        raise HTTPException(400, "message required")

    history = conversation_history[session_id]
    history.append({"role": "user", "content": user_message})
    if len(history) > MAX_HISTORY:
        conversation_history[session_id] = history[-MAX_HISTORY:]
        history = conversation_history[session_id]

    # Her istekte config'i taze oku
    keys = get_keys()
    anthropic_key = keys.get("ANTHROPIC_API_KEY", "")
    groq_key = keys.get("GROQ_API_KEY", "")

    async def event_stream() -> AsyncGenerator[str, None]:
        full_response = ""
        try:
            if anthropic_key:
                gen = stream_anthropic(history, anthropic_key)
            elif groq_key:
                gen = stream_groq(history, groq_key, preferred_model=request.model)
            else:
                gen = stream_free(history)

            async for text in gen:
                if text.startswith("__WAIT__"):
                    secs = text.replace("__WAIT__", "")
                    yield f"data: {json.dumps({'type': 'text', 'content': f'[Sunucu mesgul, {secs}s bekleniyor...]'})}\n\n"
                    continue
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
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
