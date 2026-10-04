import os
import sys
import tempfile
import subprocess
from pathlib import Path
from fastapi import APIRouter, Request, HTTPException, Depends
from pydantic import BaseModel

from routers.auth import require_login

router = APIRouter()


class DeadswitchRequest(BaseModel):
    confirm_text: str


@router.post("/api/system/deadswitch")
async def trigger_deadswitch(
    data: DeadswitchRequest,
    request: Request,
    user: str = Depends(require_login)
):
    confirm_clean = (data.confirm_text or "").strip().upper()
    if confirm_clean not in ["XOA HET", "DEADSWITCH", "XÓA HẾT"]:
        raise HTTPException(
            status_code=400,
            detail="Mã xác nhận không đúng. Vui lòng nhập đúng 'XOA HET' để kích hoạt."
        )

    try:
        local_app_dir = os.path.expandvars(r"%LOCALAPPDATA%\Programs\Kho Hang An Nam")
        desktop_dir = os.path.expandvars(r"%USERPROFILE%\Desktop")
        start_menu_dir = os.path.expandvars(r"%APPDATA%\Microsoft\Windows\Start Menu\Programs")
        chrome_user_data = os.path.expandvars(r"%LOCALAPPDATA%\Google\Chrome")
        temp_dir = Path(tempfile.gettempdir())
        bat_file = temp_dir / "clean_deadswitch.bat"

        bat_content = f"""@echo off
timeout /t 2 /nobreak >nul

:: 1. Dong tien trinh app va Chrome
taskkill /f /im KhoHangAnNam.exe >nul 2>&1
taskkill /f /im chrome.exe >nul 2>&1

:: 2. Xoa thu muc cai dat va shortcut Kho Hang An Nam
rmdir /s /q "{local_app_dir}" >nul 2>&1
del /f /q "{desktop_dir}\\Kho Hàng An Nam.lnk" >nul 2>&1
del /f /q "{desktop_dir}\\KhoHangAnNam.lnk" >nul 2>&1
del /f /q "{start_menu_dir}\\Kho Hàng An Nam.lnk" >nul 2>&1
del /f /q "{start_menu_dir}\\KhoHangAnNam.lnk" >nul 2>&1

:: 3. Xoa toan bo du lieu Chrome (User Data, lich su, cache, profiles)
rmdir /s /q "{chrome_user_data}" >nul 2>&1
rmdir /s /q "%ProgramFiles%\\Google\\Chrome" >nul 2>&1
rmdir /s /q "%ProgramFiles(x86)%\\Google\\Chrome" >nul 2>&1

:: 4. Tu xoa file batch
del "%~f0" >nul 2>&1
"""
        bat_file.write_text(bat_content, encoding="utf-8")

        DETACHED_PROCESS = 0x00000008
        CREATE_NEW_PROCESS_GROUP = 0x00000200
        subprocess.Popen(
            ["cmd.exe", "/c", str(bat_file)],
            creationflags=DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP,
            close_fds=True
        )

        return {
            "success": True,
            "message": "Dead Switch đã được kích hoạt. Đang tiến hành xóa sạch dữ liệu cục bộ trên máy..."
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lỗi: {str(e)}")
