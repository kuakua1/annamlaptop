@echo off
chcp 65001 >nul
title KHO HANG AN NAM - CLOUDFLARE RUNNER
echo ========================================================
echo   KHO HÀNG AN NAM - KHỞI CHẠY HỆ THỐNG QUA CLOUDFLARE
echo ========================================================
echo.

cd /d "%~dp0"

echo [1/2] Đang khởi động Backend FastAPI (Port 8000)...
start "AnNam Backend" /b python -m uvicorn main:app --host 127.0.0.1 --port 8000

timeout /t 3 /nobreak >nul

echo [2/2] Đang khởi tạo Cloudflare Tunnel tốc độ cao...
echo.
echo Link Cloudflare công khai sẽ hiển thị ngay bên dưới:
echo ========================================================
cloudflared tunnel --url http://127.0.0.1:8000
pause
