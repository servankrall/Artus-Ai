@echo off
rem OMNI AGENT launcher
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
echo Sunucu baslatiliyor...
echo Tarayicida http://localhost:8000 adresini acin.
echo Kapatmak icin bu pencereyi kapatin.
echo.

start "" http://localhost:8000
python app.py

pause
