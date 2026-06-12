#!/usr/bin/env bash
set -e
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
python3 -m pip install fastapi 'uvicorn[standard]' httpx anthropic python-multipart --quiet
echo "Sunucu başlatılıyor... Tarayıcıda http://localhost:8000 adresini açın."
exec python3 app.py
