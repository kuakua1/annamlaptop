import os
import sys
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse

# Đường dẫn tuyệt đối tới thư mục gốc project (không phụ thuộc vào thư mục chạy lệnh)
BASE_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(BASE_DIR))

# Chuyển working directory về project root để các module khác hoạt động đúng
os.chdir(BASE_DIR)

from config import HOST, PORT, DEBUG
from services.sheets_service import sheets_service
from routers import auth, hang_hoa, nhap_hang, xuat_hang, nha_cung_cap, khach_hang, bao_cao, lich_su, danh_muc


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize services on startup."""
    try:
        sheets_service.initialize()
        print("✓ Google Sheets service khởi tạo thành công")
    except Exception as e:
        print(f"✗ Lỗi khởi tạo Google Sheets: {e}")
        print("  Ứng dụng vẫn khởi động nhưng các tính năng liên quan đến Sheets sẽ không hoạt động.")
    yield


app = FastAPI(
    title="Kho Hàng An Nam",
    description="Hệ thống quản lý kho hàng với Google Sheets - Kho Hàng An Nam",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if DEBUG else ["http://localhost:8000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.middleware("http")
async def add_no_cache_header(request: Request, call_next):
    response = await call_next(request)
    if DEBUG:
        response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
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


@app.exception_handler(404)
async def not_found_handler(request: Request, exc):
    from fastapi.responses import RedirectResponse
    if not request.url.path.startswith("/api"):
        return RedirectResponse(url="/login")
    return JSONResponse(status_code=404, content={"success": False, "detail": "Không tìm thấy tài nguyên"})


@app.exception_handler(500)
async def server_error_handler(request: Request, exc):
    return JSONResponse(status_code=500, content={"success": False, "detail": "Lỗi máy chủ nội bộ"})


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host=HOST, port=PORT, reload=DEBUG)
