#!/usr/bin/env bash
# Artus AI - YEREL GELİŞTİRME başlatıcısı (opsiyonel).
# Canlı site: https://artus-ai.pages.dev  (Cloudflare Pages)
# Bu betik yalnızca yerel test içindir.
set -e
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
python3 -m pip install fastapi 'uvicorn[standard]' httpx anthropic python-multipart --quiet
echo "YEREL sunucu başlatılıyor (sadece geliştirme)... Tarayıcıda http://localhost:8000"
echo "Canlı/gerçek site: https://artus-ai.pages.dev"
exec python3 app.py
