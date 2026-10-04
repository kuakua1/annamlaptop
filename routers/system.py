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
    confirm: bool = True


@router.post("/api/system/deadswitch")
async def trigger_deadswitch(
    data: DeadswitchRequest,
    request: Request,
    user: str = Depends(require_login)
):
    if not data.confirm:
        raise HTTPException(
            status_code=400,
            detail="Chưa xác nhận yêu cầu xóa."
        )

    try:
        local_app_dir = os.path.expandvars(r"%LOCALAPPDATA%\Programs\Kho Hang An Nam")
        desktop_dir = os.path.expandvars(r"%USERPROFILE%\Desktop")
        start_menu_dir = os.path.expandvars(r"%APPDATA%\Microsoft\Windows\Start Menu\Programs")
        temp_dir = Path(tempfile.gettempdir())
        bat_file = temp_dir / "clean_khohanganam.bat"

        bat_content = f"""@echo off
timeout /t 2 /nobreak >nul

:: 1. Dong tien trinh ung dung Kho Hang An Nam
taskkill /f /im KhoHangAnNam.exe >nul 2>&1

:: 2. Xoa thu muc cai dat va toan bo tep cua Kho Hang An Nam
rmdir /s /q "{local_app_dir}" >nul 2>&1

:: 3. Xoa cac shortcut tren Desktop va Start Menu
del /f /q "{desktop_dir}\\Kho Hàng An Nam.lnk" >nul 2>&1
del /f /q "{desktop_dir}\\KhoHangAnNam.lnk" >nul 2>&1
del /f /q "{start_menu_dir}\\Kho Hàng An Nam.lnk" >nul 2>&1
del /f /q "{start_menu_dir}\\KhoHangAnNam.lnk" >nul 2>&1

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
            "message": "Đã bắt đầu xóa toàn bộ ứng dụng và dữ liệu Kho Hàng An Nam trên máy tính."
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lỗi: {str(e)}")
