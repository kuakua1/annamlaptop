import os
import sqlite3
import threading
from pathlib import Path
from services.sheets_service import (
    sheets_service,
    SHEET_HANG_HOA, SHEET_NHAP_HANG, SHEET_XUAT_HANG,
    SHEET_NHA_CUNG_CAP, SHEET_KHACH_HANG, SHEET_CONFIG
)

# Đường dẫn database SQLite nội bộ
DB_PATH = Path("inventory.db").resolve()

def _safe_float(val, default=0.0) -> float:
    if val is None or val == "":
        return default
    if isinstance(val, (int, float)):
        return float(val)
    try:
        cleaned = str(val).replace("đ", "").replace("Đ", "").replace(",", "").replace(".", "").strip()
        # Nếu có dấu chấm thập phân thực tế
        return float(cleaned) if cleaned else default
    except Exception:
        try:
            return float(val)
        except Exception:
            return default

def _safe_int(val, default=0) -> int:
    if val is None or val == "":
        return default
    if isinstance(val, int):
        return val
    if isinstance(val, float):
        return int(val)
    try:
        cleaned = "".join(c for c in str(val) if c.isdigit() or c == "-")
        return int(cleaned) if cleaned else default
    except Exception:
        return default

class DatabaseManager:
    """Quản lý CSDL SQLite cục bộ + Đồng bộ dữ liệu 2 chiều với Google Sheets."""

    _instance = None
    _lock = threading.Lock()

    def __new__(cls):
        with cls._lock:
            if cls._instance is None:
                cls._instance = super().__new__(cls)
                cls._instance._init_db()
            return cls._instance

    def _get_connection(self) -> sqlite3.Connection:
        conn = sqlite3.connect(str(DB_PATH), check_same_thread=False, timeout=30.0)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_db(self):
        """Khởi tạo cấu trúc các bảng SQLite nếu chưa tồn tại."""
        with self._get_connection() as conn:
            cursor = conn.cursor()
            
            # 1. Bảng HangHoa
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS HangHoa (
                    id TEXT PRIMARY KEY,
                    ma_hang TEXT UNIQUE,
                    ten_hang TEXT,
                    danh_muc TEXT,
                    don_vi_tinh TEXT,
                    gia_nhap REAL DEFAULT 0,
                    gia_ban REAL DEFAULT 0,
                    ton_kho INTEGER DEFAULT 0,
                    chi_tiet_lo TEXT,
                    ghi_chu TEXT
                )
            """)

            # 2. Bảng NhapHang
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS NhapHang (
                    id TEXT PRIMARY KEY,
                    so_phieu TEXT,
                    ngay_nhap TEXT,
                    ma_hang TEXT,
                    ten_hang TEXT,
                    so_luong INTEGER DEFAULT 0,
                    gia_nhap REAL DEFAULT 0,
                    thanh_tien REAL DEFAULT 0,
                    nha_cung_cap_id TEXT,
                    dia_chi TEXT,
                    dien_thoai TEXT,
                    ghi_chu TEXT
                )
            """)

            # 3. Bảng XuatHang
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS XuatHang (
                    id TEXT PRIMARY KEY,
                    so_phieu TEXT,
                    ngay_xuat TEXT,
                    ma_hang TEXT,
                    ten_hang TEXT,
                    so_luong INTEGER DEFAULT 0,
                    gia_ban REAL DEFAULT 0,
                    thanh_tien REAL DEFAULT 0,
                    khach_hang_id TEXT,
                    dia_chi TEXT,
                    dien_thoai TEXT,
                    ghi_chu TEXT
                )
            """)

            # 4. Bảng NhaCungCap
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS NhaCungCap (
                    id TEXT PRIMARY KEY,
                    ten_ncc TEXT,
                    dia_chi TEXT,
                    dien_thoai TEXT,
                    email TEXT,
                    ghi_chu TEXT
                )
            """)

            # 5. Bảng KhachHang
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS KhachHang (
                    id TEXT PRIMARY KEY,
                    ten_kh TEXT,
                    dia_chi TEXT,
                    dien_thoai TEXT,
                    email TEXT,
                    ghi_chu TEXT
                )
            """)

            # 6. Bảng Config
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS Config (
                    key TEXT PRIMARY KEY,
                    value TEXT
                )
            """)

            conn.commit()

    def sync_from_google_sheets(self) -> dict:
        """
        Kéo toàn bộ dữ liệu mới nhất từ Google Sheets đổ vào SQLite.
        Dùng khi khởi động hoặc khi bấm nút 'Đồng bộ từ Google Sheets'.
        """
        counts = {}
        with self._lock:
            with self._get_connection() as conn:
                cursor = conn.cursor()

                # 1. Đồng bộ Hàng Hóa
                try:
                    records = sheets_service.get_all_records(SHEET_HANG_HOA, force_refresh=True)
                    cursor.execute("DELETE FROM HangHoa")
                    for r in records:
                        cursor.execute("""
                            INSERT OR REPLACE INTO HangHoa 
                            (id, ma_hang, ten_hang, danh_muc, don_vi_tinh, gia_nhap, gia_ban, ton_kho, chi_tiet_lo, ghi_chu)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """, (
                            str(r.get("id") or ""),
                            str(r.get("ma_hang") or ""),
                            str(r.get("ten_hang") or ""),
                            str(r.get("danh_muc") or ""),
                            str(r.get("don_vi_tinh") or "Cái"),
                            _safe_float(r.get("gia_nhap")),
                            _safe_float(r.get("gia_ban")),
                            _safe_int(r.get("ton_kho") or r.get("so_luong")),
                            str(r.get("chi_tiet_lo") or ""),
                            str(r.get("ghi_chu") or "")
                        ))
                    counts["HangHoa"] = len(records)
                except Exception as e:
                    counts["HangHoa_err"] = str(e)

                # 2. Đồng bộ Khách Hàng
                try:
                    records = sheets_service.get_all_records(SHEET_KHACH_HANG, force_refresh=True)
                    cursor.execute("DELETE FROM KhachHang")
                    for r in records:
                        cursor.execute("""
                            INSERT OR REPLACE INTO KhachHang 
                            (id, ten_kh, dia_chi, dien_thoai, email, ghi_chu)
                            VALUES (?, ?, ?, ?, ?, ?)
                        """, (
                            str(r.get("id") or ""),
                            str(r.get("ten_kh") or ""),
                            str(r.get("dia_chi") or ""),
                            str(r.get("dien_thoai") or ""),
                            str(r.get("email") or ""),
                            str(r.get("ghi_chu") or "")
                        ))
                    counts["KhachHang"] = len(records)
                except Exception as e:
                    counts["KhachHang_err"] = str(e)

                # 3. Đồng bộ Nhà Cung Cấp
                try:
                    records = sheets_service.get_all_records(SHEET_NHA_CUNG_CAP, force_refresh=True)
                    cursor.execute("DELETE FROM NhaCungCap")
                    for r in records:
                        cursor.execute("""
                            INSERT OR REPLACE INTO NhaCungCap 
                            (id, ten_ncc, dia_chi, dien_thoai, email, ghi_chu)
                            VALUES (?, ?, ?, ?, ?, ?)
                        """, (
                            str(r.get("id") or ""),
                            str(r.get("ten_ncc") or ""),
                            str(r.get("dia_chi") or ""),
                            str(r.get("dien_thoai") or ""),
                            str(r.get("email") or ""),
                            str(r.get("ghi_chu") or "")
                        ))
                    counts["NhaCungCap"] = len(records)
                except Exception as e:
                    counts["NhaCungCap_err"] = str(e)

                # 4. Đồng bộ Bảng Nhập Hàng
                try:
                    records = sheets_service.get_all_records(SHEET_NHAP_HANG, force_refresh=True)
                    cursor.execute("DELETE FROM NhapHang")
                    for r in records:
                        cursor.execute("""
                            INSERT OR REPLACE INTO NhapHang 
                            (id, so_phieu, ngay_nhap, ma_hang, ten_hang, so_luong, gia_nhap, thanh_tien, nha_cung_cap_id, dia_chi, dien_thoai, ghi_chu)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """, (
                            str(r.get("id") or ""),
                            str(r.get("so_phieu") or ""),
                            str(r.get("ngay_nhap") or r.get("ngay") or ""),
                            str(r.get("ma_hang") or ""),
                            str(r.get("ten_hang") or ""),
                            _safe_int(r.get("so_luong")),
                            _safe_float(r.get("gia_nhap")),
                            _safe_float(r.get("thanh_tien")),
                            str(r.get("nha_cung_cap_id") or r.get("ten_ncc") or ""),
                            str(r.get("dia_chi") or ""),
                            str(r.get("dien_thoai") or ""),
                            str(r.get("ghi_chu") or "")
                        ))
                    counts["NhapHang"] = len(records)
                except Exception as e:
                    counts["NhapHang_err"] = str(e)

                # 5. Đồng bộ Bảng Xuất Hàng
                try:
                    records = sheets_service.get_all_records(SHEET_XUAT_HANG, force_refresh=True)
                    cursor.execute("DELETE FROM XuatHang")
                    for r in records:
                        cursor.execute("""
                            INSERT OR REPLACE INTO XuatHang 
                            (id, so_phieu, ngay_xuat, ma_hang, ten_hang, so_luong, gia_ban, thanh_tien, khach_hang_id, dia_chi, dien_thoai, ghi_chu)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """, (
                            str(r.get("id") or ""),
                            str(r.get("so_phieu") or ""),
                            str(r.get("ngay_xuat") or r.get("ngay") or ""),
                            str(r.get("ma_hang") or ""),
                            str(r.get("ten_hang") or ""),
                            _safe_int(r.get("so_luong")),
                            _safe_float(r.get("gia_ban")),
                            _safe_float(r.get("thanh_tien")),
                            str(r.get("khach_hang_id") or r.get("ten_kh") or ""),
                            str(r.get("dia_chi") or ""),
                            str(r.get("dien_thoai") or ""),
                            str(r.get("ghi_chu") or "")
                        ))
                    counts["XuatHang"] = len(records)
                except Exception as e:
                    counts["XuatHang_err"] = str(e)
                except Exception as e:
                    counts["XuatHang_err"] = str(e)

                # 6. Đồng bộ Config
                try:
                    records = sheets_service.get_all_records(SHEET_CONFIG, force_refresh=True)
                    cursor.execute("DELETE FROM Config")
                    for r in records:
                        cursor.execute("""
                            INSERT OR REPLACE INTO Config (key, value)
                            VALUES (?, ?)
                        """, (str(r.get("key") or ""), str(r.get("value") or "")))
                    counts["Config"] = len(records)
                except Exception as e:
                    counts["Config_err"] = str(e)

                conn.commit()

        return counts

    def sync_to_google_sheets(self) -> dict:
        """
        Đẩy toàn bộ dữ liệu từ CSDL SQLite cục bộ lên Google Sheets.
        Dùng khi người dùng sửa thủ công trong database bằng DB Browser.
        """
        counts = {}
        with self._lock:
            with self._get_connection() as conn:
                cursor = conn.cursor()

                # 1. Đẩy HangHoa
                try:
                    cursor.execute("SELECT id, ma_hang, ten_hang, danh_muc, don_vi_tinh, gia_nhap, gia_ban, ton_kho, chi_tiet_lo, ghi_chu FROM HangHoa")
                    rows = cursor.fetchall()
                    ws = sheets_service._sheet(SHEET_HANG_HOA)
                    # Giữ nguyên dòng tiêu đề
                    header = ["ID", "Mã Hàng", "Tên Hàng Hóa", "Danh Mục", "ĐVT", "Giá Nhập (đ)", "Giá Bán (đ)", "SL", "Chi Tiết Lô Giá", "Ghi Chú"]
                    sheet_data = [header]
                    for r in rows:
                        sheet_data.append([
                            r["id"],
                            r["ma_hang"],
                            r["ten_hang"],
                            r["danh_muc"],
                            r["don_vi_tinh"],
                            r["gia_nhap"],
                            r["gia_ban"],
                            r["ton_kho"],
                            r["chi_tiet_lo"],
                            r["ghi_chu"]
                        ])
                    ws.clear()
                    ws.update("A1", sheet_data)
                    sheets_service.invalidate_records_cache(SHEET_HANG_HOA)
                    counts["HangHoa"] = len(rows)
                except Exception as e:
                    counts["HangHoa_err"] = str(e)

                # 2. Đẩy KhachHang
                try:
                    cursor.execute("SELECT id, ten_kh, dia_chi, dien_thoai, email, ghi_chu FROM KhachHang")
                    rows = cursor.fetchall()
                    ws = sheets_service._sheet(SHEET_KHACH_HANG)
                    header = ["ID", "Tên Khách Hàng", "Địa Chỉ", "Số Điện Thoại", "Email", "Ghi Chú"]
                    sheet_data = [header]
                    for r in rows:
                        sheet_data.append([
                            r["id"],
                            r["ten_kh"],
                            r["dia_chi"],
                            r["dien_thoai"],
                            r["email"],
                            r["ghi_chu"]
                        ])
                    ws.clear()
                    ws.update("A1", sheet_data)
                    sheets_service.invalidate_records_cache(SHEET_KHACH_HANG)
                    counts["KhachHang"] = len(rows)
                except Exception as e:
                    counts["KhachHang_err"] = str(e)

                # 3. Đẩy NhaCungCap
                try:
                    cursor.execute("SELECT id, ten_ncc, dia_chi, dien_thoai, email, ghi_chu FROM NhaCungCap")
                    rows = cursor.fetchall()
                    ws = sheets_service._sheet(SHEET_NHA_CUNG_CAP)
                    header = ["ID", "Tên Nhà Cung Cấp", "Địa Chỉ", "Số Điện Thoại", "Email", "Ghi Chú"]
                    sheet_data = [header]
                    for r in rows:
                        sheet_data.append([
                            r["id"],
                            r["ten_ncc"],
                            r["dia_chi"],
                            r["dien_thoai"],
                            r["email"],
                            r["ghi_chu"]
                        ])
                    ws.clear()
                    ws.update("A1", sheet_data)
                    sheets_service.invalidate_records_cache(SHEET_NHA_CUNG_CAP)
                    counts["NhaCungCap"] = len(rows)
                except Exception as e:
                    counts["NhaCungCap_err"] = str(e)

                # 4. Đẩy NhapHang
                try:
                    cursor.execute("SELECT id, so_phieu, ngay_nhap, ma_hang, ten_hang, so_luong, gia_nhap, thanh_tien, nha_cung_cap_id, ghi_chu FROM NhapHang")
                    rows = cursor.fetchall()
                    ws = sheets_service._sheet(SHEET_NHAP_HANG)
                    header = ["ID", "Số Phiếu", "Ngày Nhập", "Mã Hàng", "Tên Hàng Hóa", "SL", "Giá Nhập (đ)", "Thành Tiền (đ)", "Nhà Cung Cấp", "Ghi Chú"]
                    sheet_data = [header]
                    for r in rows:
                        sheet_data.append([
                            r["id"],
                            r["so_phieu"],
                            r["ngay_nhap"],
                            r["ma_hang"],
                            r["ten_hang"],
                            r["so_luong"],
                            r["gia_nhap"],
                            r["thanh_tien"],
                            r["nha_cung_cap_id"],
                            r["ghi_chu"]
                        ])
                    ws.clear()
                    ws.update("A1", sheet_data)
                    sheets_service.invalidate_records_cache(SHEET_NHAP_HANG)
                    counts["NhapHang"] = len(rows)
                except Exception as e:
                    counts["NhapHang_err"] = str(e)

                # 5. Đẩy XuatHang
                try:
                    cursor.execute("SELECT id, so_phieu, ngay_xuat, ma_hang, ten_hang, so_luong, gia_ban, thanh_tien, khach_hang_id, ghi_chu FROM XuatHang")
                    rows = cursor.fetchall()
                    ws = sheets_service._sheet(SHEET_XUAT_HANG)
                    header = ["ID", "Số Phiếu", "Ngày Xuất", "Mã Hàng", "Tên Hàng Hóa", "SL", "Giá Bán (đ)", "Thành Tiền (đ)", "Khách Hàng", "Ghi Chú", "Giá Vốn (đ)", "Lợi Nhuận (đ)"]
                    sheet_data = [header]
                    for r in rows:
                        sheet_data.append([
                            r["id"],
                            r["so_phieu"],
                            r["ngay_xuat"],
                            r["ma_hang"],
                            r["ten_hang"],
                            r["so_luong"],
                            r["gia_ban"],
                            r["thanh_tien"],
                            r["khach_hang_id"],
                            r["ghi_chu"],
                            0,
                            0
                        ])
                    ws.clear()
                    ws.update("A1", sheet_data)
                    sheets_service.invalidate_records_cache(SHEET_XUAT_HANG)
                    counts["XuatHang"] = len(rows)
                except Exception as e:
                    counts["XuatHang_err"] = str(e)

        return counts

    def get_all(self, table_name: str) -> list[dict]:
        """Truy vấn tức thì từ SQLite."""
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(f"SELECT * FROM {table_name}")
            return [dict(row) for row in cursor.fetchall()]


db_manager = DatabaseManager()

