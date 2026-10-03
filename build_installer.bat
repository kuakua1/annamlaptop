@echo off
chcp 65001 >nul
title Build Kho Hang An Nam Installer
cd /d "%~dp0"

echo ======================================================
echo    ĐANG ĐÓNG GÓI ỨNG DỤNG VÀ TẠO FILE setupKhoHang.exe
echo ======================================================
echo.

echo [1/3] Đang đóng gói file nhị phân bằng PyInstaller...
python -m PyInstaller build_desktop.spec --noconfirm
if %errorlevel% neq 0 (
    echo [ERROR] Đóng gói PyInstaller thất bại!
    pause
    exit /b %errorlevel%
)

echo.
echo [2/3] Đang sao chép các tệp cấu hình và icon...
copy /y ".env" "dist\KhoHangAnNam\.env" >nul
copy /y "static\app_icon.ico" "dist\KhoHangAnNam\app_icon.ico" >nul

echo.
echo [3/3] Đang biên dịch bộ cài đặt Inno Setup...
set "ISCC=C:\Users\Admin\AppData\Local\Programs\Inno Setup 6\ISCC.exe"
if not exist "%ISCC%" (
    set "ISCC=ISCC.exe"
)

"%ISCC%" setup.iss
if %errorlevel% neq 0 (
    echo [ERROR] Biên dịch Inno Setup thất bại!
    pause
    exit /b %errorlevel%
)

copy /y "installer\setupKhoHang.exe" "setupKhoHang.exe" >nul

echo.
echo ======================================================
echo   THÀNH CÔNG! ĐÃ TẠO FILE: setupKhoHang.exe
echo ======================================================
pause
