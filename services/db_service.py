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
                            float(r.get("gia_nhap") or 0),
                            float(r.get("gia_ban") or 0),
                            int(r.get("ton_kho") or r.get("so_luong") or 0),
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
                            int(r.get("so_luong") or 0),
                            float(r.get("gia_nhap") or 0),
                            float(r.get("thanh_tien") or 0),
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
                            int(r.get("so_luong") or 0),
                            float(r.get("gia_ban") or 0),
                            float(r.get("thanh_tien") or 0),
                            str(r.get("khach_hang_id") or r.get("ten_kh") or ""),
                            str(r.get("dia_chi") or ""),
                            str(r.get("dien_thoai") or ""),
                            str(r.get("ghi_chu") or "")
                        ))
                    counts["XuatHang"] = len(records)
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

    def get_all(self, table_name: str) -> list[dict]:
        """Truy vấn tức thì từ SQLite."""
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(f"SELECT * FROM {table_name}")
            return [dict(row) for row in cursor.fetchall()]


db_manager = DatabaseManager()
