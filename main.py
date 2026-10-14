import os
import sys
import time
from contextlib import asynccontextmanager
from pathlib import Path

# Đường dẫn tuyệt đối tới thư mục gốc project
BASE_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(BASE_DIR))
os.chdir(BASE_DIR)

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse

from config import HOST, PORT, DEBUG, ALLOWED_ORIGINS
from services.sheets_service import sheets_service
from routers import auth, hang_hoa, nhap_hang, xuat_hang, nha_cung_cap, khach_hang, bao_cao, lich_su, danh_muc, system, tai_chinh, doi_tuong


from services.db_service import db_manager
import threading


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize services on startup."""
    try:
        sheets_service.initialize()
        try:
            print("[OK] Google Sheets service khoi tao thanh cong")
        except Exception:
            pass
        
        # Khởi chạy đồng bộ ngầm từ Google Sheets vào SQLite khi khởi động và định kỳ mỗi 10 phút
        def _auto_sync_worker():
            # Lần 1: Đồng bộ ngay khi khởi động
            try:
                db_manager.sync_from_google_sheets()
            except Exception as ex:
                print(f"[WARN] Lỗi đồng bộ Google Sheets lần đầu: {ex}")

            # Các lần tiếp theo: Tự động chạy ngầm mỗi 10 phút (600 giây)
            while True:
                time.sleep(600)
                try:
                    db_manager.sync_from_google_sheets()
                except Exception as ex:
                    print(f"[WARN] Lỗi tự động đồng bộ Google Sheets định kỳ: {ex}")

        threading.Thread(target=_auto_sync_worker, daemon=True).start()
    except Exception as e:
        try:
            print(f"[ERROR] Loi khoi tao Google Sheets: {e}")
        except Exception:
            pass
    yield


app = FastAPI(
    title="Kho Hàng An Nam",
    description="Hệ thống quản lý kho hàng với Google Sheets - Kho Hàng An Nam",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS
cors_origins = ALLOWED_ORIGINS if ALLOWED_ORIGINS else [
    "http://localhost:8000",
    "http://127.0.0.1:8000",
    "http://localhost",
    "http://127.0.0.1",
]

from fastapi.middleware.gzip import GZipMiddleware

app.add_middleware(GZipMiddleware, minimum_size=1000)

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|.*\.trycloudflare\.com)(:\d+)?$",
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

from services.logger_service import log_activity, log_error

@app.middleware("http")
async def activity_audit_middleware(request: Request, call_next):
    start_time = time.time()
    method = request.method
    path = request.url.path

    try:
        response = await call_next(request)
        duration_ms = int((time.time() - start_time) * 1000)

        # Ghi log mọi request thay đổi trạng thái (POST, PUT, DELETE)
        if method in ("POST", "PUT", "DELETE") and not path.startswith("/static"):
            # Bỏ qua log tải lại file hoặc mật khẩu nếu không cần thiết
            status_code = response.status_code
            lvl = "INFO" if status_code < 400 else ("WARNING" if status_code < 500 else "ERROR")
            action_name = f"HTTP_{method}"
            msg = f"{path} -> Mã {status_code} ({duration_ms}ms)"
            log_activity(action=action_name, message=msg, request=request, level=lvl)
        return response
    except Exception as exc:
        duration_ms = int((time.time() - start_time) * 1000)
        log_error(action=f"LỖI_{method}", exc=exc, message=f"{path} ({duration_ms}ms)", request=request)
        raise exc

@app.middleware("http")
async def security_and_cache_headers(request: Request, call_next):
    # Chặn truy cập trực tiếp vào thư mục mã nguồn template Jinja2
    if request.url.path.lower().startswith("/static/templates"):
        from fastapi.responses import RedirectResponse
        return RedirectResponse(url="/login")

    response = await call_next(request)
    # Header bảo mật chuẩn OWASP
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "SAMEORIGIN"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "geolocation=(), camera=(), microphone=()"

    if DEBUG:
        response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
    else:
        if request.url.path.startswith("/api/"):
            response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
        elif request.url.path.startswith("/static/"):
            response.headers["Cache-Control"] = "public, max-age=86400"
    return response

# Static files
app.mount("/static", StaticFiles(directory=str(BASE_DIR / "static")), name="static")

@app.get("/favicon.ico", include_in_schema=False)
async def favicon():
    from fastapi.responses import FileResponse
    return FileResponse(BASE_DIR / "static" / "img" / "favicon.png")



# Routers
app.include_router(auth.router)
app.include_router(hang_hoa.router)
app.include_router(nhap_hang.router)
app.include_router(xuat_hang.router)
app.include_router(nha_cung_cap.router)
app.include_router(khach_hang.router)
app.include_router(bao_cao.router)
app.include_router(lich_su.router)
app.include_router(danh_muc.router)
app.include_router(system.router)
app.include_router(tai_chinh.router)
app.include_router(doi_tuong.router)


from fastapi.exceptions import RequestValidationError


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    errors = exc.errors()
    messages = []
    for err in errors:
        loc = " -> ".join(str(l) for l in err.get("loc", []) if l != "body")
        msg = err.get("msg", "Dữ liệu không hợp lệ")
        messages.append(f"{loc}: {msg}" if loc else msg)
    detail_str = "; ".join(messages) if messages else "Dữ liệu gửi lên không đúng định dạng"
    log_activity(
        action="DỮ_LIỆU_KHÔNG_HỢP_LỆ",
        message=f"{request.method} {request.url.path} - {detail_str}",
        request=request,
        level="WARNING"
    )
    return JSONResponse(
        status_code=422,
        content={"success": False, "detail": detail_str, "errors": errors}
    )


@app.exception_handler(404)
async def not_found_handler(request: Request, exc):
    from fastapi.responses import RedirectResponse
    if not request.url.path.startswith("/api"):
        return RedirectResponse(url="/login")
    return JSONResponse(status_code=404, content={"success": False, "detail": "Không tìm thấy tài nguyên"})


@app.exception_handler(500)
async def server_error_handler(request: Request, exc):
    log_activity(
        action="LỖI_MÁY_CHỦ_500",
        message=f"{request.method} {request.url.path} - {str(exc)}",
        request=request,
        level="ERROR"
    )
    return JSONResponse(status_code=500, content={"success": False, "detail": "Lỗi máy chủ nội bộ"})


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    import traceback
    traceback.print_exc()
    log_error(
        action="LỖI_HỆ_THỐNG",
        exc=exc,
        message=f"Đường dẫn: {request.method} {request.url.path}",
        request=request
    )
    if request.url.path.startswith("/api"):
        return JSONResponse(
            status_code=500,
            content={"success": False, "detail": f"Lỗi hệ thống: {str(exc)}"}
        )
    return JSONResponse(status_code=500, content={"success": False, "detail": "Lỗi máy chủ nội bộ"})


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host=HOST, port=PORT, reload=DEBUG)
