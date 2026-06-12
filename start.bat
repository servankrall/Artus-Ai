@echo off
chcp 65001 >nul
cd /d "%~dp0backend"

where python >nul 2>nul
if errorlevel 1 (
    echo HATA: Python bulunamadi!
    echo Lutfen https://www.python.org/downloads/ adresinden Python kurun.
    echo Kurulumda "Add Python to PATH" kutusunu isaretlemeyi unutmayin.
    pause
    exit /b 1
)

echo Gerekli paketler kuruluyor, lutfen bekleyin...
python -m pip install -r requirements.txt -q

echo.
echo Sunucu baslatiliyor... Tarayicida http://localhost:8000 adresini acin.
echo Kapatmak icin bu pencereyi kapatin.
echo.
start "" http://localhost:8000
python -m uvicorn main:app --host 127.0.0.1 --port 8000
pause
