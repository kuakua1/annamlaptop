@echo off
title Kho Hang An Nam - Cloudflare Runner
echo ========================================================
echo   HE THONG QUAN LY KHO AN NAM LAPTOP (CLOUDFLARE RUNNER)
echo ========================================================
echo.

cd /d "%~dp0"

echo [1/2] Dang khoi dong Backend FastAPI...
start /b python -m uvicorn main:app --host 127.0.0.1 --port 8000 > nul 2>&1

timeout /t 2 /nobreak > nul

echo [2/2] Dang ket noi Cloudflare Tunnel...
cloudflared tunnel --url http://127.0.0.1:8000
