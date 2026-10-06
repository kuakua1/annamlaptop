import os
import sys
from pathlib import Path
from dotenv import load_dotenv

if getattr(sys, "frozen", False):
    BASE_DIR = Path(getattr(sys, "_MEIPASS", Path(sys.executable).parent)).resolve()
    EXE_DIR = Path(sys.executable).parent.resolve()
    if (EXE_DIR / ".env").exists():
        load_dotenv(dotenv_path=EXE_DIR / ".env")
    else:
        load_dotenv(dotenv_path=BASE_DIR / ".env")
else:
    BASE_DIR = Path(__file__).resolve().parent
    load_dotenv(dotenv_path=BASE_DIR / ".env")

# Google Sheets
GOOGLE_SERVICE_ACCOUNT_JSON = os.getenv("GOOGLE_SERVICE_ACCOUNT_JSON", "")
GOOGLE_SERVICE_ACCOUNT_FILE = os.getenv("GOOGLE_SERVICE_ACCOUNT_FILE", "./credentials.json")
SPREADSHEET_ID = os.getenv("SPREADSHEET_ID", "")

import secrets

# App Settings
env_secret = os.getenv("SECRET_KEY", "").strip()
if not env_secret or env_secret == "change-this-secret-key-in-production":
    # Sinh secret key 256-bit ngẫu nhiên và lưu cố định vào .secret_key nếu chưa cấu hình trong .env
    secret_file = (EXE_DIR if getattr(sys, "frozen", False) else BASE_DIR) / ".secret_key"
    try:
        if secret_file.exists():
            SECRET_KEY = secret_file.read_text(encoding="utf-8").strip()
        else:
            SECRET_KEY = secrets.token_hex(32)
            secret_file.write_text(SECRET_KEY, encoding="utf-8")
    except Exception:
        SECRET_KEY = secrets.token_hex(32)
else:
    SECRET_KEY = env_secret

ADMIN_USERNAME = os.getenv("ADMIN_USERNAME", "admin")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "admin123")
ALLOWED_ORIGINS = [o.strip() for o in os.getenv("ALLOWED_ORIGINS", "").split(",") if o.strip()]

# Server
HOST = os.getenv("HOST", "0.0.0.0")
PORT = int(os.getenv("PORT", "8000"))
DEBUG = os.getenv("DEBUG", "true").lower() == "true"

# Sheet names
SHEET_HANG_HOA = "HangHoa"
SHEET_NHAP_HANG = "NhapHang"
SHEET_XUAT_HANG = "XuatHang"
SHEET_NHA_CUNG_CAP = "NhaCungCap"
SHEET_KHACH_HANG = "KhachHang"
SHEET_CONFIG = "Config"
SHEET_SO_QUY = "SoQuy"

# Session
SESSION_COOKIE_NAME = "inventory_session"
SESSION_MAX_AGE = 60 * 60 * 24 * 7  # 7 days
