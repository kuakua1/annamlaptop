import os
import sys
import bcrypt

# Allow running from project root
sys.path.insert(0, os.path.dirname(__file__))

from dotenv import load_dotenv
load_dotenv()

from services.sheets_service import sheets_service
from config import (
    SHEET_HANG_HOA, SHEET_NHAP_HANG, SHEET_XUAT_HANG,
    SHEET_NHA_CUNG_CAP, SHEET_KHACH_HANG, SHEET_CONFIG,
    ADMIN_USERNAME, ADMIN_PASSWORD,
)

SHEET_HEADERS = {
    SHEET_HANG_HOA: ["id", "ma_hang", "ten_hang", "danh_muc", "don_vi_tinh", "gia_nhap", "gia_ban", "ton_kho", "ghi_chu"],
    SHEET_NHAP_HANG: ["id", "so_phieu", "ngay_nhap", "ma_hang", "ten_hang", "so_luong", "gia_nhap", "thanh_tien", "nha_cung_cap_id", "ghi_chu"],
    SHEET_XUAT_HANG: ["id", "so_phieu", "ngay_xuat", "ma_hang", "ten_hang", "so_luong", "gia_ban", "thanh_tien", "khach_hang_id", "ghi_chu", "gia_von", "loi_nhuan"],
    SHEET_NHA_CUNG_CAP: ["id", "ten_ncc", "dia_chi", "dien_thoai", "email", "ghi_chu"],
    SHEET_KHACH_HANG: ["id", "ten_kh", "dia_chi", "dien_thoai", "email", "ghi_chu"],
    SHEET_CONFIG: ["key", "value"],
}


def setup_sheet(spreadsheet, sheet_name: str, headers: list):
    """Create sheet if not exists and set headers."""
    # Check if sheet exists
    existing = [ws.title for ws in spreadsheet.worksheets()]
    if sheet_name not in existing:
        ws = spreadsheet.add_worksheet(title=sheet_name, rows=1000, cols=len(headers))
        print(f"  ✓ Tạo sheet '{sheet_name}'")
    else:
        ws = spreadsheet.worksheet(sheet_name)
        print(f"  ✓ Sheet '{sheet_name}' đã tồn tại")

    # Check if header already set
    first_row = ws.row_values(1) if ws.row_count > 0 else []
    if first_row != headers:
        ws.update("A1", [headers])
        print(f"  ✓ Đặt header cho sheet '{sheet_name}'")
    else:
        print(f"  ✓ Header sheet '{sheet_name}' đã đúng")
    return ws


def setup_admin_config(config_ws):
    """Add admin credentials to Config sheet."""
    import gspread
    # Read existing
    try:
        records = config_ws.get_all_records(empty2zero=False, default_blank="")
    except Exception:
        records = []

    existing_keys = {r.get("key"): i + 2 for i, r in enumerate(records)}

    password_hash = bcrypt.hashpw(ADMIN_PASSWORD.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

    configs = {
        "admin_username": ADMIN_USERNAME,
        "admin_password_hash": password_hash,
        "secret_key": os.urandom(32).hex(),
    }

    for key, value in configs.items():
        if key in existing_keys:
            row_num = existing_keys[key]
            config_ws.update(f"A{row_num}:B{row_num}", [[key, value]])
            print(f"  ✓ Cập nhật config '{key}'")
        else:
            config_ws.append_row([key, value])
            print(f"  ✓ Thêm config '{key}'")


def main():
    print("=" * 50)
    print("KHỞI TẠO CẤU TRÚC GOOGLE SHEETS")
    print("=" * 50)

    print("\n1. Kết nối Google Sheets...")
    try:
        sheets_service.initialize()
        spreadsheet = sheets_service._spreadsheet
        print(f"  ✓ Đã kết nối spreadsheet: {spreadsheet.title}")
    except Exception as e:
        print(f"  ✗ Lỗi kết nối: {e}")
        sys.exit(1)

    print("\n2. Tạo và cấu hình các sheet...")
    config_ws = None
    for sheet_name, headers in SHEET_HEADERS.items():
        try:
            ws = setup_sheet(spreadsheet, sheet_name, headers)
            if sheet_name == SHEET_CONFIG:
                config_ws = ws
        except Exception as e:
            print(f"  ✗ Lỗi với sheet '{sheet_name}': {e}")

    print("\n3. Thiết lập thông tin admin...")
    if config_ws:
        try:
            setup_admin_config(config_ws)
        except Exception as e:
            print(f"  ✗ Lỗi thiết lập admin: {e}")
    else:
        print("  ✗ Không tìm thấy Config sheet")

    print("\n" + "=" * 50)
    print("HOÀN THÀNH! Thông tin đăng nhập mặc định:")
    print(f"  Username: {ADMIN_USERNAME}")
    print(f"  Password: {ADMIN_PASSWORD}")
    print("=" * 50)


if __name__ == "__main__":
    main()
