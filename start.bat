@echo off
rem ============================================================
rem  Artus AI - YEREL GELISTIRME baslaticisi (opsiyonel)
rem  Canli site: https://artus-ai.pages.dev  (Cloudflare Pages)
rem  Bu dosya yalnizca bilgisayarinda yerel test icindir.
rem ============================================================
cd /d "%~dp0"

where python >nul 2>nul
if errorlevel 1 (
    echo HATA: Python bulunamadi!
    echo https://www.python.org/downloads/ adresinden Python kurun.
    echo Kurulumda "Add Python to PATH" kutusunu isaretleyin.
    pause
    exit /b 1
)

echo Gerekli paketler kuruluyor...
python -m pip install fastapi "uvicorn[standard]" httpx anthropic python-multipart -q

echo.
echo YEREL sunucu baslatiliyor (sadece gelistirme icin)...
echo Tarayicida http://localhost:8000 adresini acin.
echo Canli/gercek site: https://artus-ai.pages.dev
echo Kapatmak icin bu pencereyi kapatin.
echo.

start "" http://localhost:8000
python app.py

pause
