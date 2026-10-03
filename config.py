import os
from dotenv import load_dotenv

load_dotenv()

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
