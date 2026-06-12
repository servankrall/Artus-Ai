@echo off
chcp 65001 >nul
setlocal

:: Bu bat dosyasının bulunduğu klasör (sondaki \ dahil)
set "ROOT=%~dp0"

where python >nul 2>nul
if errorlevel 1 (
    echo HATA: Python bulunamadi!
    echo Lutfen https://www.python.org/downloads/ adresinden Python kurun.
    echo Kurulumda "Add Python to PATH" kutusunu isaretlemeyi unutmayin.
    pause
    exit /b 1
)

echo Gerekli paketler kuruluyor...
python -m pip install fastapi "uvicorn[standard]" httpx anthropic python-multipart -q

echo.
echo Sunucu baslatiliyor...
echo Tarayicida http://localhost:8000 adresini acin.
echo Kapatmak icin bu pencereyi kapatin.
echo.

timeout /t 2 /nobreak >nul
start "" http://localhost:8000

cd /d "%ROOT%backend"
python -m uvicorn main:app --host 127.0.0.1 --port 8000

pause
