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

# App Settings
SECRET_KEY = os.getenv("SECRET_KEY", "change-this-secret-key-in-production")
ADMIN_USERNAME = os.getenv("ADMIN_USERNAME", "admin")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "admin123")

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

# Session
SESSION_COOKIE_NAME = "inventory_session"
SESSION_MAX_AGE = 60 * 60 * 24 * 7  # 7 days
