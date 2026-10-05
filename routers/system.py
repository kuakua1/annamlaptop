import os
import sys
import tempfile
import subprocess
from pathlib import Path
from fastapi import APIRouter, Request, HTTPException, Depends
from pydantic import BaseModel

from routers.auth import require_login

router = APIRouter()


from services.db_service import db_manager, DB_PATH
from config import SECRET_KEY


@router.post("/api/system/sync-sheets")
async def sync_from_sheets(
    request: Request,
    table: str = "",
    user: str = Depends(require_login)
):
    """Kéo dữ liệu từ Google Sheets về cập nhật vào SQLite (Gọi từ Web Admin)."""
    target = table or request.query_params.get("table", "")
    try:
        counts = db_manager.sync_from_google_sheets(target)
        name_map = {
            "hanghoa": "Hàng Hóa & Tồn Kho",
            "nhaphang": "Nhập Hàng",
            "xuathang": "Xuất Hàng",
            "nhacungcap": "Nhà Cung Cấp",
            "khachhang": "Khách Hàng",
            "config": "Cấu hình"
        }
        ten_bang = name_map.get(target.lower().replace("_", "").strip(), target or "toàn bộ dữ liệu")
        return {
            "success": True,
            "message": f"Đã đồng bộ thành công [{ten_bang}] từ Google Sheets vào Database SQLite!",
            "details": counts
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lỗi khi đồng bộ: {str(e)}")


@router.post("/api/system/sync-sheets-webhook")
async def sync_from_sheets_webhook(
    request: Request,
    table: str = ""
):
    """Webhook cho phép Google Apps Script gọi trực tiếp bằng token bảo mật."""
    token = request.headers.get("X-Sync-Token") or request.query_params.get("token")
    if not token or token != SECRET_KEY:
        raise HTTPException(
            status_code=403,
            detail="Token bảo mật không hợp lệ hoặc thiếu X-Sync-Token."
        )

    target = table or request.query_params.get("table", "")
    if not target:
        try:
            body = await request.json()
            if isinstance(body, dict):
                target = body.get("table", "")
        except Exception:
            pass

    try:
        counts = db_manager.sync_from_google_sheets(target)
        name_map = {
            "hanghoa": "Hàng Hóa & Tồn Kho",
            "nhaphang": "Nhập Hàng",
            "xuathang": "Xuất Hàng",
            "nhacungcap": "Nhà Cung Cấp",
            "khachhang": "Khách Hàng",
            "config": "Cấu hình"
        }
        ten_bang = name_map.get(target.lower().replace("_", "").strip(), target or "toàn bộ các bảng")
        return {
            "success": True,
            "message": f"Đã cập nhật thành công bảng [{ten_bang}] vào Database SQLite!",
            "details": counts
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lỗi khi đồng bộ: {str(e)}")


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
        # Xóa file CSDL SQLite cục bộ nếu có
        try:
            if DB_PATH.exists():
                DB_PATH.unlink(missing_ok=True)
        except Exception:
            pass

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
