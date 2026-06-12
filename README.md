# OMNI AGENT v1 — Artus AI

API key GEREKMEZ. Ücretsiz Pollinations API ile çalışır.
(İstersen `ANTHROPIC_API_KEY` ortam değişkeni ayarlayarak Claude'a geçebilirsin.)

## Kurulum

Bilgisayarında Python 3.10+ kurulu olmalı: https://www.python.org/downloads/
(Kurulumda "Add Python to PATH" kutusunu işaretle.)

## Çalıştırma

**Windows:** `start.bat` dosyasına çift tıkla.

**Linux / Mac:**
```bash
./start.sh
```

Sonra tarayıcıda aç: http://localhost:8000

## Dosya Yapısı

```
├── prompts/omni-agent-v1.md   # Sistem promptu (AI'nın kişiliği)
├── backend/main.py            # FastAPI sunucu
├── frontend/index.html        # Chat arayüzü
├── start.bat                  # Windows başlatıcı
└── start.sh                   # Linux/Mac başlatıcı
```
