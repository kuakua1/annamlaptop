import os
import sys
import tempfile
import subprocess
from pathlib import Path
from datetime import datetime
from fastapi import APIRouter, Request, HTTPException, Depends
from fastapi.responses import FileResponse
from pydantic import BaseModel

from routers.auth import require_login
from services.logger_service import log_activity, get_recent_logs, clear_logs, LOG_FILE

router = APIRouter()


from services.db_service import db_manager, DB_PATH
from config import SECRET_KEY


@router.get("/api/system/sheets-status")
async def get_sheets_status(
    user: str = Depends(require_login)
):
    """Kiểm tra trạng thái kết nối Google Sheets."""
    from services.sheets_service import sheets_service
    from config import SPREADSHEET_ID
    try:
        sheets_service.initialize()
        title = sheets_service._spreadsheet.title if sheets_service._spreadsheet else "OK"
        return {
            "connected": True,
            "spreadsheet_id": SPREADSHEET_ID,
            "title": title,
            "message": f"Đã kết nối thành công tới Google Sheet: {title}"
        }
    except Exception as e:
        return {
            "connected": False,
            "spreadsheet_id": SPREADSHEET_ID,
            "error": str(e),
            "message": f"Chưa kết nối được Google Sheet: {str(e)}"
        }


@router.post("/api/system/sync-to-sheets")
async def sync_to_sheets_api(
    request: Request,
    user: str = Depends(require_login)
):
    """Đẩy toàn bộ dữ liệu SQLite hiện tại lên Google Sheets."""
    try:
        counts = db_manager.sync_to_google_sheets()
        log_activity(
            action="ĐỒNG_BỘ_LÊN_SHEETS",
            message=f"Đẩy toàn bộ dữ liệu từ SQLite lên Google Sheets: {counts}",
            username=user,
            request=request,
            level="INFO"
        )
        return {
            "success": True,
            "message": "Đã đẩy toàn bộ dữ liệu từ phần mềm lên Google Sheets thành công!",
            "details": counts
        }
    except Exception as e:
        log_activity(
            action="LỖI_ĐỒNG_BỘ_SHEETS",
            message=f"Lỗi khi đẩy dữ liệu lên Google Sheets: {str(e)}",
            username=user,
            request=request,
            level="ERROR"
        )
        raise HTTPException(status_code=500, detail=f"Lỗi khi đẩy dữ liệu lên Google Sheets: {str(e)}")


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
            "doituong": "Danh Mục Đối Tượng",
            "doitac": "Danh Mục Đối Tượng",
            "nhacungcap": "Nhà Cung Cấp",
            "khachhang": "Khách Hàng",
            "config": "Cấu hình"
        }
        ten_bang = name_map.get(target.lower().replace("_", "").strip(), target or "toàn bộ dữ liệu")
        log_activity(
            action="ĐỒNG_BỘ_VỀ_SQLITE",
            message=f"Đồng bộ bảng [{ten_bang}] từ Google Sheets về SQLite",
            username=user,
            request=request,
            level="INFO"
        )
        return {
            "success": True,
            "message": f"Đã đồng bộ thành công [{ten_bang}] từ Google Sheets vào Database SQLite!",
            "details": counts
        }
    except Exception as e:
        log_activity(
            action="LỖI_ĐỒNG_BỘ_SHEETS",
            message=f"Lỗi khi đồng bộ từ Google Sheets: {str(e)}",
            username=user,
            request=request,
            level="ERROR"
        )
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
    # Bảo mật: Chỉ Admin mới có quyền kích hoạt deadswitch
    user_rec = db_manager.get_user_by_username(user) or {}
    role = user_rec.get("role") or ("admin" if user.lower() == "admin" else "kho")
    if role != "admin" and user.lower() != "admin":
        raise HTTPException(
            status_code=403,
            detail="Chỉ tài khoản Quản Trị Viên (Admin) mới có quyền thực hiện thao tác này."
        )

    if not data.confirm:
        raise HTTPException(
            status_code=400,
            detail="Chưa xác nhận yêu cầu xóa."
        )

    try:
        # Xóa file CSDL SQLite cục bộ và khởi tạo lại cấu trúc sạch
        if DB_PATH.exists():
            DB_PATH.unlink(missing_ok=True)
        db_manager._init_db()

        log_activity(
            action="DEADSWITCH",
            message="KÍCH HOẠT DEAD SWITCH XÓA TOÀN BỘ CSDL CỤC BỘ VÀ KHỞI TẠO LẠI",
            username=user,
            request=request,
            level="CRITICAL"
        )

        return {
            "success": True,
            "message": "Đã đặt lại dữ liệu cơ sở dữ liệu hệ thống sạch thành công."
        }
    except Exception as e:
        log_activity("LỖI_DEADSWITCH", f"Lỗi kích hoạt deadswitch: {str(e)}", username=user, request=request, level="ERROR")
        raise HTTPException(status_code=500, detail=f"Lỗi: {str(e)}")


# ── API Quản Lý Nhật Ký Hoạt Động (Activity & Audit Logs) ────────────────────

@router.get("/api/system/activity-logs")
async def get_activity_logs(
    lines: int = 150,
    search: str = "",
    level: str = "",
    user: str = Depends(require_login)
):
    """Lấy danh sách các dòng nhật ký hoạt động mới nhất."""
    max_lines = min(max(lines, 10), 1000)
    result = get_recent_logs(lines=max_lines, search=search, level=level)
    return {
        "success": True,
        **result
    }


@router.get("/api/system/activity-logs/download")
async def download_activity_logs(
    user: str = Depends(require_login)
):
    """Tải toàn bộ file log logs/activity.log về máy tính."""
    if not LOG_FILE.exists():
        raise HTTPException(status_code=404, detail="File log chưa tồn tại hoặc chưa có dữ liệu")
    
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"kho_annam_activity_log_{timestamp}.log"
    return FileResponse(
        path=str(LOG_FILE),
        filename=filename,
        media_type="text/plain; charset=utf-8"
    )


@router.post("/api/system/activity-logs/clear")
async def clear_activity_logs_api(
    request: Request,
    user: str = Depends(require_login)
):
    """Xóa / làm mới file nhật ký (chỉ Quản Trị Viên mới có quyền)."""
    user_rec = db_manager.get_user_by_username(user) or {}
    role = user_rec.get("role") or ("admin" if user.lower() == "admin" else "kho")
    if role != "admin" and user.lower() != "admin":
        raise HTTPException(
            status_code=403,
            detail="Chỉ Quản trị viên (Admin) mới có quyền dọn dẹp file nhật ký."
        )

    ok = clear_logs(admin_username=user)
    if not ok:
        raise HTTPException(status_code=500, detail="Không thể xóa file log")

    return {
        "success": True,
        "message": "Đã làm mới toàn bộ file nhật ký hoạt động thành công"
    }
