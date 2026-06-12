@echo off
rem Son surumu GitHub'dan indirip dosyalari gunceller. Git kurulu olmali: https://git-scm.com/download/win
cd /d "%~dp0"

where git >nul 2>nul
if errorlevel 1 (
    echo HATA: Git bulunamadi!
    echo https://git-scm.com/download/win adresinden Git'i kurun ve tekrar deneyin.
    pause
    exit /b 1
)

if not exist ".git" (
    git init -q
    git remote add origin https://github.com/servankrall/Artus-Ai.git
)

echo Guncellemeler indiriliyor...
git fetch origin claude/epic-bohr-sk2ofu
git checkout -f -B claude/epic-bohr-sk2ofu origin/claude/epic-bohr-sk2ofu

echo.
echo Guncelleme tamam! Simdi start.bat'a tiklayabilirsin.
pause
