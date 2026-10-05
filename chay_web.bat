@echo off
chcp 65001 >nul
title Kho Hang An Nam - Tunnel
cd /d "%~dp0"

echo ============================================
echo   KHO HANG AN NAM - KHOI DONG WEBSITE
echo ============================================

:: Kiem tra server da chay chua (cong 8000)
netstat -ano | findstr ":8000 " | findstr "LISTENING" >nul
if %errorlevel%==0 (
    echo [OK] Server da chay san tren cong 8000.
) else (
    echo [..] Dang khoi dong server...
    start "Kho Hang An Nam - Server (dung tat cua so nay)" cmd /k "cd /d %~dp0 && python -m uvicorn main:app --host 127.0.0.1 --port 8000"
    timeout /t 6 /nobreak >nul
)

echo.
echo [..] Dang tao link cong khai. Tim dong https://....trycloudflare.com ben duoi:
echo      (Gui link do cho nguoi khac. Dong cua so nay = tat link.)
echo.

set CF="%~dp0cloudflared.exe"
if not exist %CF% set CF="C:\Program Files (x86)\cloudflared\cloudflared.exe"
if not exist %CF% set CF=cloudflared
%CF% tunnel --url http://127.0.0.1:8000

pause
