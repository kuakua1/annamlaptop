import os
import sqlite3
import threading
import queue
import time
from datetime import date
from pathlib import Path
from services.sheets_service import (
    sheets_service,
    parse_batches_str, format_batches_str,
    SHEET_HANG_HOA, SHEET_NHAP_HANG, SHEET_XUAT_HANG,
    SHEET_NHA_CUNG_CAP, SHEET_KHACH_HANG, SHEET_CONFIG, SHEET_SO_QUY, SHEET_DOI_TUONG
)

# Đường dẫn database SQLite nội bộ
DB_PATH = Path("inventory.db").resolve()

def _safe_float(val, default=0.0) -> float:
    if val is None or val == "":
        return default
    if isinstance(val, (int, float)):
        return float(val)
    val_str = str(val).strip()
    try:
        return float(val_str)
    except ValueError:
        pass
    try:
        cleaned = val_str.replace("đ", "").replace("Đ", "").replace(" ", "").strip()
        if "," in cleaned and "." in cleaned:
            if cleaned.rfind(",") > cleaned.rfind("."):
                cleaned = cleaned.replace(".", "").replace(",", ".")
            else:
                cleaned = cleaned.replace(",", "")
        elif "," in cleaned:
            parts = cleaned.split(",")
            if len(parts) > 1 and all(len(p) == 3 for p in parts[1:]):
                cleaned = cleaned.replace(",", "")
            else:
                cleaned = cleaned.replace(",", ".")
        elif "." in cleaned:
            parts = cleaned.split(".")
            if len(parts) > 1 and all(len(p) == 3 for p in parts[1:]):
                cleaned = cleaned.replace(".", "")
        return float(cleaned) if cleaned else default
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
        val_str = str(val).strip()
        try:
            return int(float(val_str))
        except ValueError:
            pass
        cleaned = "".join(c for c in val_str if c.isdigit() or c == "-")
        return int(cleaned) if cleaned else default
    except Exception:
        return default


class DatabaseManager:
    """
    Quản lý CSDL SQLite cục bộ (Local-First) + Hàng đợi đồng bộ ngầm lên Google Sheets.
    Mọi thao tác Đọc & Ghi phản hồi tức thì (< 5ms) từ SQLite.
    Sau đó đồng bộ bất đồng bộ lên Google Sheets qua Background Worker Thread.
    """

    _instance = None
    _lock = threading.RLock()

    def __new__(cls):
        with cls._lock:
            if cls._instance is None:
                cls._instance = super().__new__(cls)
                cls._instance._init_queue_and_db()
            return cls._instance

    def _init_queue_and_db(self):
        self._sync_queue = queue.Queue()
        self._worker_thread = None
        self._init_db()
        self._start_worker()

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
                    ghi_chu TEXT,
                    cong_no REAL DEFAULT 0
                )
            """)

            # Kiểm tra và thêm cột cong_no nếu bảng NhapHang cũ chưa có
            cursor.execute("PRAGMA table_info(NhapHang)")
            nhap_cols = [c["name"] for c in cursor.fetchall()]
            if "cong_no" not in nhap_cols:
                cursor.execute("ALTER TABLE NhapHang ADD COLUMN cong_no REAL DEFAULT 0")

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
                    ghi_chu TEXT,
                    gia_von REAL DEFAULT 0,
                    loi_nhuan REAL DEFAULT 0,
                    tien_khach_no REAL DEFAULT 0
                )
            """)

            # Kiểm tra và thêm cột gia_von, loi_nhuan, tien_khach_no nếu bảng XuatHang cũ chưa có
            cursor.execute("PRAGMA table_info(XuatHang)")
            xuat_cols = [c["name"] for c in cursor.fetchall()]
            if "gia_von" not in xuat_cols:
                cursor.execute("ALTER TABLE XuatHang ADD COLUMN gia_von REAL DEFAULT 0")
            if "loi_nhuan" not in xuat_cols:
                cursor.execute("ALTER TABLE XuatHang ADD COLUMN loi_nhuan REAL DEFAULT 0")
            if "tien_khach_no" not in xuat_cols:
                cursor.execute("ALTER TABLE XuatHang ADD COLUMN tien_khach_no REAL DEFAULT 0")

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

            # 7. Bảng SoQuy (Thu / Chi)
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS SoQuy (
                    id TEXT PRIMARY KEY,
                    ma_phieu TEXT UNIQUE,
                    ngay TEXT,
                    loai_phieu TEXT,
                    loai_quy TEXT,
                    doi_tuong TEXT,
                    dien_thoai TEXT,
                    so_tien REAL DEFAULT 0,
                    phieu_lien_quan TEXT,
                    ghi_chu TEXT
                )
            """)

            # 8. Bảng DoiTuong (Danh Mục Đối Tượng: Gộp Khách Hàng & Nhà Cung Cấp)
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS DoiTuong (
                    id TEXT PRIMARY KEY,
                    ten TEXT NOT NULL,
                    phan_loai TEXT DEFAULT 'CA_HAI',
                    ma_so_thue TEXT DEFAULT '',
                    dia_chi TEXT,
                    dien_thoai TEXT,
                    email TEXT,
                    ghi_chu TEXT
                )
            """)

            # Thêm cột ma_so_thue nếu bảng DoiTuong chưa có
            cursor.execute("PRAGMA table_info(DoiTuong)")
            dt_cols = [c["name"] for c in cursor.fetchall()]
            if "ma_so_thue" not in dt_cols:
                cursor.execute("ALTER TABLE DoiTuong ADD COLUMN ma_so_thue TEXT DEFAULT ''")

            # Tự động gộp dữ liệu từ NhaCungCap và KhachHang vào DoiTuong nếu DoiTuong còn trống
            try:
                cursor.execute("SELECT COUNT(*) as cnt FROM DoiTuong")
                dt_count = cursor.fetchone()["cnt"]
                if dt_count == 0:
                    cursor.execute("SELECT id, ten_ncc, dia_chi, dien_thoai, email, ghi_chu FROM NhaCungCap")
                    ncc_rows = [dict(r) for r in cursor.fetchall()]
                    cursor.execute("SELECT id, ten_kh, dia_chi, dien_thoai, email, ghi_chu FROM KhachHang")
                    kh_rows = [dict(r) for r in cursor.fetchall()]

                    phone_map = {}
                    name_map = {}

                    for n in ncc_rows:
                        nid = str(n["id"])
                        nten = str(n.get("ten_ncc", "") or "").strip()
                        nsdt = str(n.get("dien_thoai", "") or "").strip()
                        cursor.execute("""
                            INSERT INTO DoiTuong (id, ten, phan_loai, dia_chi, dien_thoai, email, ghi_chu)
                            VALUES (?, ?, ?, ?, ?, ?, ?)
                        """, (nid, nten, "NHA_CUNG_CAP", str(n.get("dia_chi", "") or ""), nsdt, str(n.get("email", "") or ""), str(n.get("ghi_chu", "") or "")))
                        if nsdt:
                            phone_map[nsdt] = nid
                        if nten:
                            name_map[nten.lower()] = nid

                    for k in kh_rows:
                        kid = str(k["id"])
                        kten = str(k.get("ten_kh", "") or "").strip()
                        ksdt = str(k.get("dien_thoai", "") or "").strip()
                        matched_id = None
                        if ksdt and ksdt in phone_map:
                            matched_id = phone_map[ksdt]
                        elif kten and kten.lower() in name_map:
                            matched_id = name_map[kten.lower()]

                        if matched_id:
                            cursor.execute("UPDATE DoiTuong SET phan_loai = 'CA_HAI' WHERE id = ?", (matched_id,))
                        else:
                            cursor.execute("""
                                INSERT INTO DoiTuong (id, ten, phan_loai, dia_chi, dien_thoai, email, ghi_chu)
                                VALUES (?, ?, ?, ?, ?, ?, ?)
                            """, (kid, kten, "KHACH_HANG", str(k.get("dia_chi", "") or ""), ksdt, str(k.get("email", "") or ""), str(k.get("ghi_chu", "") or "")))
                            if ksdt:
                                phone_map[ksdt] = kid
                            if kten:
                                name_map[kten.lower()] = kid
            except Exception as mig_e:
                print(f"[INIT DB] Lỗi khởi tạo/gộp DoiTuong: {mig_e}")

            conn.commit()

    # ── Background Sync Worker ────────────────────────────────────────────────

    def _start_worker(self):
        if self._worker_thread is None or not self._worker_thread.is_alive():
            self._worker_thread = threading.Thread(target=self._process_sync_queue, daemon=True)
            self._worker_thread.start()

    def _enqueue_task(self, task_type: str, sheet_name: str, payload: dict):
        """Đưa tác vụ đồng bộ vào hàng đợi ngầm."""
        self._sync_queue.put({
            "type": task_type,
            "sheet_name": sheet_name,
            "payload": payload,
            "time": time.time()
        })

    def _process_sync_queue(self):
        """Worker thread xử lý tuần tự các tác vụ đồng bộ lên Google Sheets."""
        while True:
            try:
                task = self._sync_queue.get()
                t_type = task["type"]
                sheet_name = task["sheet_name"]
                payload = task["payload"]

                # Thử đồng bộ với retry
                for attempt in range(3):
                    try:
                        if t_type == "APPEND_ROW":
                            sheets_service.append_row(sheet_name, payload["row"])
                        elif t_type == "UPDATE_ROW":
                            row_id = payload.get("id")
                            row = payload.get("row")
                            # Tìm vị trí dòng trên Google Sheet theo ID (cột A)
                            found_idx = sheets_service.find_row(sheet_name, 1, str(row_id))
                            if found_idx != -1:
                                sheets_service.update_row(sheet_name, found_idx, row)
                            else:
                                # Nếu chưa có trên sheet, append
                                sheets_service.append_row(sheet_name, row)
                        elif t_type == "DELETE_ROW":
                            row_id = payload.get("id")
                            found_idx = sheets_service.find_row(sheet_name, 1, str(row_id))
                            if found_idx != -1:
                                sheets_service.delete_row(sheet_name, found_idx)
                        elif t_type == "DELETE_RECEIPT_ROWS":
                            so_phieu = payload.get("so_phieu")
                            if so_phieu:
                                sheets_service.delete_receipt_rows(sheet_name, so_phieu)
                        elif t_type == "UPDATE_HANG_HOA_STOCK":
                            # Cập nhật tồn kho hàng hóa trên sheet
                            ma_hang = payload["ma_hang"]
                            row_num, _ = sheets_service.find_hang_hoa_by_ma(ma_hang)
                            if row_num != -1:
                                if "gia_nhap" in payload:
                                    sheets_service.update_cell(sheet_name, row_num, 6, payload["gia_nhap"])
                                sheets_service.update_cell(sheet_name, row_num, 7, payload["ton_kho"])
                                sheets_service.update_cell(sheet_name, row_num, 8, payload["chi_tiet_lo"])
                        elif t_type == "SET_CONFIG":
                            key = payload["key"]
                            value = payload["value"]
                            sheets_service.set_config(key, value)
                        break
                    except Exception as e:
                        if attempt == 2:
                            print(f"[SYNC ERROR] Lỗi đồng bộ ngầm task {t_type} lên {sheet_name}: {e}")
                        time.sleep(2.0)
                self._sync_queue.task_done()
            except Exception as outer_e:
                time.sleep(1.0)

    # ── CRUD Methods Trực Tiếp Trên SQLite + Enqueue Sheet ────────────────────

    def get_all(self, table_name: str, where_clause: str = "", params: tuple = ()) -> list[dict]:
        """Đọc tức thì từ SQLite (< 2ms)."""
        with self._get_connection() as conn:
            cursor = conn.cursor()
            query = f"SELECT * FROM {table_name}"
            if where_clause:
                query += f" WHERE {where_clause}"
            cursor.execute(query, params)
            return [dict(row) for row in cursor.fetchall()]

    def get_by_id(self, table_name: str, record_id: str) -> dict | None:
        """Lấy 1 bản ghi theo ID từ SQLite."""
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(f"SELECT * FROM {table_name} WHERE id = ?", (str(record_id),))
            row = cursor.fetchone()
            return dict(row) if row else None

    # ── 1. Hàng Hóa CRUD ──────────────────────────────────────────────────────

    def generate_ma_hang(self) -> str:
        """Tạo mã hàng hóa kế tiếp (HH001, HH002...) dựa trên SQLite."""
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT ma_hang FROM HangHoa WHERE ma_hang LIKE 'HH%'")
            rows = cursor.fetchall()
            max_num = 0
            for r in rows:
                ma = str(r["ma_hang"] or "")
                num_part = ma[2:]
                if num_part.isdigit():
                    max_num = max(max_num, int(num_part))
            return f"HH{max_num + 1:03d}"

    def get_hang_hoa_by_ma(self, ma_hang: str) -> dict | None:
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM HangHoa WHERE ma_hang = ?", (str(ma_hang),))
            row = cursor.fetchone()
            return dict(row) if row else None

    def insert_hang_hoa(self, item: dict) -> dict:
        """Thêm hàng hóa vào SQLite và enqueue lên Google Sheet."""
        with self._lock:
            with self._get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("""
                    INSERT INTO HangHoa (id, ma_hang, ten_hang, danh_muc, don_vi_tinh, gia_nhap, ton_kho, chi_tiet_lo, ghi_chu)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    item["id"], item["ma_hang"], item["ten_hang"], item.get("danh_muc", ""),
                    item.get("don_vi_tinh", "Cái"), float(item.get("gia_nhap", 0)),
                    int(item.get("ton_kho", 0)), item.get("chi_tiet_lo", ""), item.get("ghi_chu", "")
                ))
                conn.commit()

        row = [
            item["id"], item["ma_hang"], item["ten_hang"], item.get("danh_muc", ""),
            item.get("don_vi_tinh", "Cái"), float(item.get("gia_nhap", 0)),
            int(item.get("ton_kho", 0)), item.get("chi_tiet_lo", ""), item.get("ghi_chu", "")
        ]
        self._enqueue_task("APPEND_ROW", SHEET_HANG_HOA, {"row": row})
        return item

    def update_hang_hoa(self, record_id: str, data: dict) -> dict | None:
        """Cập nhật hàng hóa trong SQLite và enqueue lên Google Sheet."""
        with self._lock:
            with self._get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("SELECT * FROM HangHoa WHERE id = ?", (str(record_id),))
                cur = cursor.fetchone()
                if not cur:
                    return None
                cur_dict = dict(cur)

                updated = {
                    "id": cur_dict["id"],
                    "ma_hang": cur_dict["ma_hang"],
                    "ten_hang": data.get("ten_hang", cur_dict["ten_hang"]),
                    "danh_muc": data.get("danh_muc", cur_dict["danh_muc"]),
                    "don_vi_tinh": data.get("don_vi_tinh", cur_dict["don_vi_tinh"]),
                    "gia_nhap": float(data.get("gia_nhap", cur_dict["gia_nhap"])),
                    "ton_kho": int(data.get("ton_kho", cur_dict["ton_kho"])),
                    "chi_tiet_lo": data.get("chi_tiet_lo", cur_dict.get("chi_tiet_lo", "")),
                    "ghi_chu": data.get("ghi_chu", cur_dict["ghi_chu"]),
                }

                cursor.execute("""
                    UPDATE HangHoa SET ten_hang = ?, danh_muc = ?, don_vi_tinh = ?, gia_nhap = ?,
                        ton_kho = ?, chi_tiet_lo = ?, ghi_chu = ?
                    WHERE id = ?
                """, (
                    updated["ten_hang"], updated["danh_muc"], updated["don_vi_tinh"],
                    updated["gia_nhap"], updated["ton_kho"], updated["chi_tiet_lo"],
                    updated["ghi_chu"], record_id
                ))
                conn.commit()

        row = [
            updated["id"], updated["ma_hang"], updated["ten_hang"], updated["danh_muc"],
            updated["don_vi_tinh"], updated["gia_nhap"],
            updated["ton_kho"], updated["chi_tiet_lo"], updated["ghi_chu"]
        ]
        self._enqueue_task("UPDATE_ROW", SHEET_HANG_HOA, {"id": record_id, "row": row})
        return updated

    def delete_hang_hoa(self, record_id: str) -> bool:
        """Xóa hàng hóa khỏi SQLite và enqueue xóa trên Sheet."""
        with self._lock:
            with self._get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("DELETE FROM HangHoa WHERE id = ?", (str(record_id),))
                conn.commit()
        self._enqueue_task("DELETE_ROW", SHEET_HANG_HOA, {"id": record_id})
        return True

    # ── 2. Khách Hàng CRUD ────────────────────────────────────────────────────

    def insert_khach_hang(self, item: dict) -> dict:
        with self._lock:
            with self._get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("""
                    INSERT INTO KhachHang (id, ten_kh, dia_chi, dien_thoai, email, ghi_chu)
                    VALUES (?, ?, ?, ?, ?, ?)
                """, (
                    item["id"], item["ten_kh"], item.get("dia_chi", ""),
                    item.get("dien_thoai", ""), item.get("email", ""), item.get("ghi_chu", "")
                ))
                conn.commit()
        row = [item["id"], item["ten_kh"], item.get("dia_chi", ""), item.get("dien_thoai", ""), item.get("email", ""), item.get("ghi_chu", "")]
        self._enqueue_task("APPEND_ROW", SHEET_KHACH_HANG, {"row": row})
        return item

    def update_khach_hang(self, record_id: str, data: dict) -> dict | None:
        with self._lock:
            with self._get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("SELECT * FROM KhachHang WHERE id = ?", (str(record_id),))
                cur = cursor.fetchone()
                if not cur:
                    return None
                cur_dict = dict(cur)
                updated = {
                    "id": record_id,
                    "ten_kh": data.get("ten_kh", cur_dict["ten_kh"]),
                    "dia_chi": data.get("dia_chi", cur_dict["dia_chi"]),
                    "dien_thoai": data.get("dien_thoai", cur_dict["dien_thoai"]),
                    "email": data.get("email", cur_dict["email"]),
                    "ghi_chu": data.get("ghi_chu", cur_dict["ghi_chu"]),
                }
                cursor.execute("""
                    UPDATE KhachHang SET ten_kh = ?, dia_chi = ?, dien_thoai = ?, email = ?, ghi_chu = ?
                    WHERE id = ?
                """, (updated["ten_kh"], updated["dia_chi"], updated["dien_thoai"], updated["email"], updated["ghi_chu"], record_id))
                conn.commit()
        row = [record_id, updated["ten_kh"], updated["dia_chi"], updated["dien_thoai"], updated["email"], updated["ghi_chu"]]
        self._enqueue_task("UPDATE_ROW", SHEET_KHACH_HANG, {"id": record_id, "row": row})
        return updated

    def delete_khach_hang(self, record_id: str) -> bool:
        with self._lock:
            with self._get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("DELETE FROM KhachHang WHERE id = ?", (str(record_id),))
                conn.commit()
        self._enqueue_task("DELETE_ROW", SHEET_KHACH_HANG, {"id": record_id})
        return True

    # ── 3. Nhà Cung Cấp CRUD ──────────────────────────────────────────────────

    def insert_nha_cung_cap(self, item: dict) -> dict:
        with self._lock:
            with self._get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("""
                    INSERT INTO NhaCungCap (id, ten_ncc, dia_chi, dien_thoai, email, ghi_chu)
                    VALUES (?, ?, ?, ?, ?, ?)
                """, (
                    item["id"], item["ten_ncc"], item.get("dia_chi", ""),
                    item.get("dien_thoai", ""), item.get("email", ""), item.get("ghi_chu", "")
                ))
                conn.commit()
        row = [item["id"], item["ten_ncc"], item.get("dia_chi", ""), item.get("dien_thoai", ""), item.get("email", ""), item.get("ghi_chu", "")]
        self._enqueue_task("APPEND_ROW", SHEET_NHA_CUNG_CAP, {"row": row})
        return item

    def update_nha_cung_cap(self, record_id: str, data: dict) -> dict | None:
        with self._lock:
            with self._get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("SELECT * FROM NhaCungCap WHERE id = ?", (str(record_id),))
                cur = cursor.fetchone()
                if not cur:
                    return None
                cur_dict = dict(cur)
                updated = {
                    "id": record_id,
                    "ten_ncc": data.get("ten_ncc", cur_dict["ten_ncc"]),
                    "dia_chi": data.get("dia_chi", cur_dict["dia_chi"]),
                    "dien_thoai": data.get("dien_thoai", cur_dict["dien_thoai"]),
                    "email": data.get("email", cur_dict["email"]),
                    "ghi_chu": data.get("ghi_chu", cur_dict["ghi_chu"]),
                }
                cursor.execute("""
                    UPDATE NhaCungCap SET ten_ncc = ?, dia_chi = ?, dien_thoai = ?, email = ?, ghi_chu = ?
                    WHERE id = ?
                """, (updated["ten_ncc"], updated["dia_chi"], updated["dien_thoai"], updated["email"], updated["ghi_chu"], record_id))
                conn.commit()
        row = [record_id, updated["ten_ncc"], updated["dia_chi"], updated["dien_thoai"], updated["email"], updated["ghi_chu"]]
        self._enqueue_task("UPDATE_ROW", SHEET_NHA_CUNG_CAP, {"id": record_id, "row": row})
        return updated

    def delete_nha_cung_cap(self, record_id: str) -> bool:
        with self._lock:
            with self._get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("DELETE FROM NhaCungCap WHERE id = ?", (str(record_id),))
                conn.commit()
        self._enqueue_task("DELETE_ROW", SHEET_NHA_CUNG_CAP, {"id": record_id})
        return True

    # ── 4. Danh Mục Đối Tượng CRUD (Hợp Nhất NCC & Khách Hàng) ─────────────────

    def generate_ma_doi_tuong(self) -> str:
        """Tạo mã đối tượng kế tiếp định dạng DTxxxx (DT0001, DT0002...)."""
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT id FROM DoiTuong WHERE id LIKE 'DT%'")
            rows = cursor.fetchall()
            max_num = 0
            for r in rows:
                mid = str(r["id"] or "").strip().upper()
                if mid.startswith("DT"):
                    num_part = mid[2:]
                    if num_part.isdigit():
                        max_num = max(max_num, int(num_part))
            return f"DT{max_num + 1:04d}"

    def insert_doi_tuong(self, item: dict) -> dict:
        dt_id = str(item.get("id") or "").strip()
        if not dt_id:
            dt_id = self.generate_ma_doi_tuong()
        item["id"] = dt_id
        ten = str(item.get("ten") or "").strip()
        phan_loai = str(item.get("phan_loai") or "CA_HAI").strip().upper()
        ma_so_thue = str(item.get("ma_so_thue") or "").strip()
        dia_chi = str(item.get("dia_chi") or "").strip()
        dien_thoai = str(item.get("dien_thoai") or "").strip()
        email = str(item.get("email") or "").strip()
        ghi_chu = str(item.get("ghi_chu") or "").strip()

        with self._lock:
            with self._get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("""
                    INSERT INTO DoiTuong (id, ten, phan_loai, ma_so_thue, dia_chi, dien_thoai, email, ghi_chu)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """, (dt_id, ten, phan_loai, ma_so_thue, dia_chi, dien_thoai, email, ghi_chu))
                conn.commit()

        row = [dt_id, ten, ma_so_thue, dien_thoai, dia_chi, phan_loai, email, ghi_chu]
        self._enqueue_task("APPEND_ROW", SHEET_DOI_TUONG, {"row": row})
        return item

    def update_doi_tuong(self, record_id: str, data: dict) -> dict | None:
        with self._lock:
            with self._get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("SELECT * FROM DoiTuong WHERE id = ?", (str(record_id),))
                cur = cursor.fetchone()
                if not cur:
                    return None
                cur_dict = dict(cur)
                updated = {
                    "id": record_id,
                    "ten": str(data.get("ten", cur_dict["ten"]) or "").strip(),
                    "phan_loai": str(data.get("phan_loai", cur_dict["phan_loai"]) or "CA_HAI").strip().upper(),
                    "ma_so_thue": str(data.get("ma_so_thue", cur_dict.get("ma_so_thue", "")) or "").strip(),
                    "dia_chi": str(data.get("dia_chi", cur_dict["dia_chi"]) or "").strip(),
                    "dien_thoai": str(data.get("dien_thoai", cur_dict["dien_thoai"]) or "").strip(),
                    "email": str(data.get("email", cur_dict["email"]) or "").strip(),
                    "ghi_chu": str(data.get("ghi_chu", cur_dict["ghi_chu"]) or "").strip(),
                }
                cursor.execute("""
                    UPDATE DoiTuong SET ten = ?, phan_loai = ?, ma_so_thue = ?, dia_chi = ?, dien_thoai = ?, email = ?, ghi_chu = ?
                    WHERE id = ?
                """, (updated["ten"], updated["phan_loai"], updated["ma_so_thue"], updated["dia_chi"], updated["dien_thoai"], updated["email"], updated["ghi_chu"], record_id))
                conn.commit()

        row = [record_id, updated["ten"], updated["ma_so_thue"], updated["dien_thoai"], updated["dia_chi"], updated["phan_loai"], updated["email"], updated["ghi_chu"]]
        self._enqueue_task("UPDATE_ROW", SHEET_DOI_TUONG, {"id": record_id, "row": row})
        return updated

    def delete_doi_tuong(self, record_id: str) -> bool:
        with self._lock:
            with self._get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("DELETE FROM DoiTuong WHERE id = ?", (str(record_id),))
                conn.commit()
        self._enqueue_task("DELETE_ROW", SHEET_DOI_TUONG, {"id": record_id})
        return True

    def find_or_create_doi_tuong(self, ten: str, sdt: str = "", dia_chi: str = "", default_type: str = "CA_HAI") -> str:
        """Tìm đối tượng theo SĐT hoặc Tên trong DoiTuong. Nếu chưa có, tự động tạo mới."""
        ten_clean = (ten or "").strip()
        sdt_clean = (sdt or "").strip()
        dia_chi_clean = (dia_chi or "").strip()

        with self._lock:
            with self._get_connection() as conn:
                cursor = conn.cursor()
                matched = None
                if sdt_clean:
                    cursor.execute("SELECT id, ten FROM DoiTuong WHERE dien_thoai = ? LIMIT 1", (sdt_clean,))
                    matched = cursor.fetchone()
                if not matched and ten_clean:
                    cursor.execute("SELECT id, ten FROM DoiTuong WHERE LOWER(TRIM(ten)) = LOWER(?) LIMIT 1", (ten_clean,))
                    matched = cursor.fetchone()

                if matched:
                    return str(matched["id"])

                # Tạo mới
                new_id = self.generate_ma_doi_tuong()
                cursor.execute("""
                    INSERT INTO DoiTuong (id, ten, phan_loai, dia_chi, dien_thoai, email, ghi_chu)
                    VALUES (?, ?, ?, ?, ?, '', 'Tự động lưu từ phiếu')
                """, (new_id, ten_clean or f"Đối tác {new_id}", default_type, dia_chi_clean, sdt_clean))
                conn.commit()

        row = [new_id, ten_clean, "", sdt_clean, dia_chi_clean, default_type, "", "Tự động lưu từ phiếu"]
        self._enqueue_task("APPEND_ROW", SHEET_DOI_TUONG, {"row": row})
        return new_id

    def get_doi_tuong_history(self, record_id: str) -> dict:
        """Lấy toàn bộ lịch sử giao dịch 2 chiều (Cả Nhập hàng & Xuất hàng) của một đối tượng."""
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM DoiTuong WHERE id = ?", (str(record_id),))
            dt_cur = cursor.fetchone()
            if not dt_cur:
                return {}
            dt = dict(dt_cur)

            target_id = str(dt["id"]).strip()
            target_name = str(dt["ten"] or "").strip().lower()
            target_phone = str(dt.get("dien_thoai") or "").strip()

            # 1. Phiếu Nhập
            cursor.execute("SELECT * FROM NhapHang")
            nhap_all = [dict(r) for r in cursor.fetchall()]
            nhap_matched = []
            for n in nhap_all:
                ref = str(n.get("nha_cung_cap_id") or "").strip()
                sdt = str(n.get("dien_thoai") or "").strip()
                if (ref == target_id) or (target_name and ref.lower() == target_name) or (target_phone and sdt == target_phone):
                    nhap_matched.append(n)

            # 2. Phiếu Xuất
            cursor.execute("SELECT * FROM XuatHang")
            xuat_all = [dict(r) for r in cursor.fetchall()]
            xuat_matched = []
            for x in xuat_all:
                ref = str(x.get("khach_hang_id") or "").strip()
                sdt = str(x.get("dien_thoai") or "").strip()
                if (ref == target_id) or (target_name and ref.lower() == target_name) or (target_phone and sdt == target_phone):
                    xuat_matched.append(x)

        # Gom nhóm phiếu nhập theo so_phieu
        nhap_by_so_phieu = {}
        for row in nhap_matched:
            sp = str(row.get("so_phieu") or "").strip()
            if sp not in nhap_by_so_phieu:
                nhap_by_so_phieu[sp] = {
                    "so_phieu": sp,
                    "ngay": str(row.get("ngay_nhap") or "").strip(),
                    "loai": "NHAP",
                    "items": [],
                    "tong_sl": 0,
                    "tong_tien": 0.0,
                    "ghi_chu": str(row.get("ghi_chu") or "").strip(),
                }
            sl = int(row.get("so_luong") or 0)
            tien = float(row.get("thanh_tien") or 0)
            nhap_by_so_phieu[sp]["items"].append(row)
            nhap_by_so_phieu[sp]["tong_sl"] += sl
            nhap_by_so_phieu[sp]["tong_tien"] += tien

        # Gom nhóm phiếu xuất theo so_phieu
        xuat_by_so_phieu = {}
        for row in xuat_matched:
            sp = str(row.get("so_phieu") or "").strip()
            if sp not in xuat_by_so_phieu:
                xuat_by_so_phieu[sp] = {
                    "so_phieu": sp,
                    "ngay": str(row.get("ngay_xuat") or "").strip(),
                    "loai": "XUAT",
                    "items": [],
                    "tong_sl": 0,
                    "tong_tien": 0.0,
                    "ghi_chu": str(row.get("ghi_chu") or "").strip(),
                }
            sl = int(row.get("so_luong") or 0)
            tien = float(row.get("thanh_tien") or 0)
            xuat_by_so_phieu[sp]["items"].append(row)
            xuat_by_so_phieu[sp]["tong_sl"] += sl
            xuat_by_so_phieu[sp]["tong_tien"] += tien

        receipts_nhap = list(nhap_by_so_phieu.values())
        receipts_nhap.sort(key=lambda x: (x["ngay"], x["so_phieu"]), reverse=True)

        receipts_xuat = list(xuat_by_so_phieu.values())
        receipts_xuat.sort(key=lambda x: (x["ngay"], x["so_phieu"]), reverse=True)

        all_receipts = receipts_nhap + receipts_xuat
        all_receipts.sort(key=lambda x: (x["ngay"], x["so_phieu"]), reverse=True)

        all_items = []
        for n in nhap_matched:
            item_copy = dict(n)
            item_copy["loai"] = "NHAP"
            item_copy["ngay"] = n.get("ngay_nhap")
            item_copy["don_gia"] = n.get("gia_nhap")
            all_items.append(item_copy)
        for x in xuat_matched:
            item_copy = dict(x)
            item_copy["loai"] = "XUAT"
            item_copy["ngay"] = x.get("ngay_xuat")
            item_copy["don_gia"] = x.get("gia_ban")
            all_items.append(item_copy)
        all_items.sort(key=lambda x: (str(x.get("ngay") or ""), str(x.get("so_phieu") or "")), reverse=True)

        return {
            "doi_tuong": dt,
            "summary": {
                "tong_so_phieu_nhap": len(receipts_nhap),
                "tong_tien_nhap": sum(r["tong_tien"] for r in receipts_nhap),
                "tong_so_phieu_xuat": len(receipts_xuat),
                "tong_tien_xuat": sum(r["tong_tien"] for r in receipts_xuat),
                "tong_so_phieu": len(all_receipts),
            },
            "phieu_nhap": receipts_nhap,
            "phieu_xuat": receipts_xuat,
            "tat_ca_phieu": all_receipts,
            "chi_tiet_hang": all_items
        }

    def generate_so_phieu_nhap(self, date_str: str = "") -> str:
        """Tạo mã số phiếu nhập rút gọn dạng NHxxxx/MM (ví dụ: NH1003/10)."""
        if not date_str:
            date_str = date.today().isoformat()
        parts = date_str.split("-")
        month = parts[1] if len(parts) >= 2 else f"{date.today().month:02d}"
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT so_phieu FROM NhapHang WHERE so_phieu LIKE ? OR so_phieu LIKE ?", (f"NH%/{month}", f"NH%{month}%"))
            rows = cursor.fetchall()
            max_seq = 1000
            for r in rows:
                sp = str(r["so_phieu"] or "").strip()
                if "/" in sp:
                    p_part, m_part = sp.split("/", 1)
                    if m_part == month and p_part.startswith("NH"):
                        digits = p_part[2:]
                        if digits.isdigit():
                            max_seq = max(max_seq, int(digits))
            return f"NH{max_seq + 1:04d}/{month}"

    def nhap_hang_batch_local(self, ma_hang: str, so_luong: int, gia_nhap: float, conn: sqlite3.Connection = None) -> tuple[int, str]:
        """Cập nhật tồn kho theo lô trong SQLite."""
        should_close = False
        with self._lock:
            if conn is None:
                conn = self._get_connection()
                should_close = True

            cursor = conn.cursor()
            cursor.execute("SELECT ton_kho, chi_tiet_lo, gia_nhap FROM HangHoa WHERE ma_hang = ?", (ma_hang,))
            row = cursor.fetchone()
            if not row:
                if should_close: conn.close()
                raise ValueError(f"Không tìm thấy hàng hóa mã {ma_hang}")
            cur_sl = int(row["ton_kho"] or 0)
            cur_lo_str = str(row["chi_tiet_lo"] or "")
            cur_gia = float(row["gia_nhap"] or 0)

            batches = parse_batches_str(cur_lo_str, cur_sl, cur_gia)
            found = False
            for b in batches:
                if abs(b["gia_nhap"] - gia_nhap) < 1.0:
                    b["so_luong"] += so_luong
                    found = True
                    break
            if not found:
                batches.append({"so_luong": so_luong, "gia_nhap": float(gia_nhap)})

            new_total_sl = sum(b["so_luong"] for b in batches)
            new_lo_str = format_batches_str(batches)

            cursor.execute("""
                UPDATE HangHoa SET ton_kho = ?, chi_tiet_lo = ?, gia_nhap = ? WHERE ma_hang = ?
            """, (new_total_sl, new_lo_str, gia_nhap, ma_hang))
            if should_close:
                conn.commit()
                conn.close()

        # Enqueue cập nhật lô giá & tồn kho lên Sheet HangHoa
        self._enqueue_task("UPDATE_HANG_HOA_STOCK", SHEET_HANG_HOA, {
            "ma_hang": ma_hang,
            "ton_kho": new_total_sl,
            "chi_tiet_lo": new_lo_str,
            "gia_nhap": gia_nhap
        })
        return new_total_sl, new_lo_str

    def create_nhap_hang_transaction(self, so_phieu: str, ngay_nhap: str, ncc_save_ref: str, ghi_chu: str, items: list[dict], cong_no: float = None) -> list[dict]:
        """Lưu toàn bộ dòng phiếu nhập vào SQLite và enqueue lên Sheet."""
        created_rows = []
        tong_tien = sum(float(it["so_luong"] * it["gia_nhap"]) for it in items)
        rem_no = tong_tien if cong_no is None else float(cong_no)

        with self._lock:
            with self._get_connection() as conn:
                cursor = conn.cursor()
                for it in items:
                    new_id = str(int(time.time() * 1000)) + str(len(created_rows))
                    thanh_tien = float(it["so_luong"] * it["gia_nhap"])
                    line_no = min(thanh_tien, max(0.0, rem_no))
                    rem_no -= line_no

                    # Cập nhật tồn kho theo lô trong cùng connection (atomic, siêu nhanh cho nhiều dòng)
                    self.nhap_hang_batch_local(it["ma_hang"], it["so_luong"], it["gia_nhap"], conn=conn)

                    cursor.execute("""
                        INSERT INTO NhapHang (id, so_phieu, ngay_nhap, ma_hang, ten_hang, so_luong, gia_nhap, thanh_tien, nha_cung_cap_id, ghi_chu, cong_no)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """, (
                        new_id, so_phieu, ngay_nhap, it["ma_hang"], it["ten_hang"],
                        it["so_luong"], it["gia_nhap"], thanh_tien, ncc_save_ref, ghi_chu, line_no
                    ))

                    created_rows.append({
                        "id": new_id,
                        "so_phieu": so_phieu,
                        "ngay_nhap": ngay_nhap,
                        "ma_hang": it["ma_hang"],
                        "ten_hang": it["ten_hang"],
                        "so_luong": it["so_luong"],
                        "gia_nhap": it["gia_nhap"],
                        "thanh_tien": thanh_tien,
                        "nha_cung_cap_id": ncc_save_ref,
                        "ghi_chu": ghi_chu,
                        "cong_no": line_no
                    })
                conn.commit()

        for r in created_rows:
            sheet_row = [
                r["id"], r["so_phieu"], r["ngay_nhap"], r["ma_hang"], r["ten_hang"],
                r["so_luong"], r["gia_nhap"], r["thanh_tien"], r["nha_cung_cap_id"], r["ghi_chu"], r["cong_no"]
            ]
            self._enqueue_task("APPEND_ROW", SHEET_NHAP_HANG, {"row": sheet_row})

        return created_rows

    def revert_nhap_hang_batch_local(self, ma_hang: str, so_luong: int, gia_nhap: float, conn: sqlite3.Connection = None) -> tuple[int, str]:
        """Trừ bớt số lượng đã nhập ra khỏi lô và tồn kho của sản phẩm trong SQLite."""
        should_close = False
        with self._lock:
            if conn is None:
                conn = self._get_connection()
                should_close = True

            cursor = conn.cursor()
            cursor.execute("SELECT ton_kho, chi_tiet_lo, gia_nhap FROM HangHoa WHERE ma_hang = ?", (ma_hang,))
            row = cursor.fetchone()
            if not row:
                if should_close: conn.close()
                return 0, ""
            cur_sl = int(row["ton_kho"] or 0)
            cur_lo_str = str(row["chi_tiet_lo"] or "")
            cur_gia = float(row["gia_nhap"] or 0)

            batches = parse_batches_str(cur_lo_str, cur_sl, cur_gia)
            remaining_to_remove = so_luong

            # Ưu tiên trừ vào lô có giá nhập khớp
            for b in batches:
                if abs(b["gia_nhap"] - gia_nhap) < 1.0:
                    deduct = min(b["so_luong"], remaining_to_remove)
                    b["so_luong"] -= deduct
                    remaining_to_remove -= deduct
                    if remaining_to_remove <= 0:
                        break

            # Nếu còn dư chưa trừ hết, trừ tiếp từ các lô khác
            if remaining_to_remove > 0:
                for b in batches:
                    deduct = min(b["so_luong"], remaining_to_remove)
                    b["so_luong"] -= deduct
                    remaining_to_remove -= deduct
                    if remaining_to_remove <= 0:
                        break

            batches = [b for b in batches if b["so_luong"] > 0]
            new_total_sl = max(0, sum(b["so_luong"] for b in batches))
            new_lo_str = format_batches_str(batches)

            cursor.execute("""
                UPDATE HangHoa SET ton_kho = ?, chi_tiet_lo = ? WHERE ma_hang = ?
            """, (new_total_sl, new_lo_str, ma_hang))
            if should_close:
                conn.commit()
                conn.close()

        self._enqueue_task("UPDATE_HANG_HOA_STOCK", SHEET_HANG_HOA, {
            "ma_hang": ma_hang,
            "ton_kho": new_total_sl,
            "chi_tiet_lo": new_lo_str
        })
        return new_total_sl, new_lo_str

    def delete_nhap_hang_receipt(self, so_phieu: str) -> bool:
        """Xóa toàn bộ phiếu nhập kho, hoàn trả tồn kho và đồng bộ Sheet."""
        with self._lock:
            with self._get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("SELECT * FROM NhapHang WHERE so_phieu = ?", (so_phieu,))
                rows = cursor.fetchall()
                if not rows:
                    return False
                items = [dict(r) for r in rows]

                # Hoàn trả tồn kho từng món trong cùng connection
                for it in items:
                    sl = int(it.get("so_luong", 0) or 0)
                    gia = float(it.get("gia_nhap", 0) or 0)
                    ma = str(it.get("ma_hang", ""))
                    if sl > 0 and ma:
                        self.revert_nhap_hang_batch_local(ma, sl, gia, conn=conn)

                cursor.execute("DELETE FROM NhapHang WHERE so_phieu = ?", (so_phieu,))
                conn.commit()

        # Xóa trên Google Sheet
        self._enqueue_task("DELETE_RECEIPT_ROWS", SHEET_NHAP_HANG, {"so_phieu": so_phieu})
        return True

    def update_nhap_hang_receipt(self, so_phieu: str, ngay_nhap: str, ncc_save_ref: str, ghi_chu: str, items: list[dict], cong_no: float = None) -> list[dict]:
        """Cập nhật phiếu nhập kho: hoàn trả kho cũ, nạp kho mới, cập nhật NhapHang."""
        created_rows = []
        with self._lock:
            with self._get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("SELECT * FROM NhapHang WHERE so_phieu = ?", (so_phieu,))
                old_rows = cursor.fetchall()
                old_items = [dict(r) for r in old_rows]

                # 1. Hoàn trả tồn kho cũ trong cùng connection
                for it in old_items:
                    sl = int(it.get("so_luong", 0) or 0)
                    gia = float(it.get("gia_nhap", 0) or 0)
                    ma = str(it.get("ma_hang", ""))
                    if sl > 0 and ma:
                        self.revert_nhap_hang_batch_local(ma, sl, gia, conn=conn)

                # Nếu cong_no không truyền, tính tổng nợ cũ còn lại
                if cong_no is None and old_items:
                    old_cong_no = sum(float(r["cong_no"] if r["cong_no"] is not None else r["thanh_tien"] or 0) for r in old_items)
                    rem_no = old_cong_no
                else:
                    tong_tien = sum(float(it["so_luong"] * it["gia_nhap"]) for it in items)
                    rem_no = tong_tien if cong_no is None else float(cong_no)

                cursor.execute("DELETE FROM NhapHang WHERE so_phieu = ?", (so_phieu,))

                # 2. Nạp kho mới & chèn các dòng mới trong cùng connection
                for it in items:
                    new_id = str(int(time.time() * 1000)) + str(len(created_rows))
                    thanh_tien = float(it["so_luong"] * it["gia_nhap"])
                    line_no = min(thanh_tien, max(0.0, rem_no))
                    rem_no -= line_no

                    self.nhap_hang_batch_local(it["ma_hang"], it["so_luong"], it["gia_nhap"], conn=conn)

                    cursor.execute("""
                        INSERT INTO NhapHang (id, so_phieu, ngay_nhap, ma_hang, ten_hang, so_luong, gia_nhap, thanh_tien, nha_cung_cap_id, ghi_chu, cong_no)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """, (
                        new_id, so_phieu, ngay_nhap, it["ma_hang"], it["ten_hang"],
                        it["so_luong"], it["gia_nhap"], thanh_tien, ncc_save_ref, ghi_chu, line_no
                    ))
                    created_rows.append({
                        "id": new_id,
                        "so_phieu": so_phieu,
                        "ngay_nhap": ngay_nhap,
                        "ma_hang": it["ma_hang"],
                        "ten_hang": it["ten_hang"],
                        "so_luong": it["so_luong"],
                        "gia_nhap": it["gia_nhap"],
                        "thanh_tien": thanh_tien,
                        "nha_cung_cap_id": ncc_save_ref,
                        "ghi_chu": ghi_chu,
                        "cong_no": line_no
                    })
                conn.commit()

        # Enqueue xóa cũ & append mới trên Sheet
        self._enqueue_task("DELETE_RECEIPT_ROWS", SHEET_NHAP_HANG, {"so_phieu": so_phieu})
        for r in created_rows:
            sheet_row = [
                r["id"], r["so_phieu"], r["ngay_nhap"], r["ma_hang"], r["ten_hang"],
                r["so_luong"], r["gia_nhap"], r["thanh_tien"], r["nha_cung_cap_id"], r["ghi_chu"], r["cong_no"]
            ]
            self._enqueue_task("APPEND_ROW", SHEET_NHAP_HANG, {"row": sheet_row})

        return created_rows


    def generate_so_phieu_xuat(self, date_str: str = "") -> str:
        """Tạo mã số phiếu xuất rút gọn dạng XHxxxx/MM (ví dụ: XH1020/10)."""
        if not date_str:
            date_str = date.today().isoformat()
        parts = date_str.split("-")
        month = parts[1] if len(parts) >= 2 else f"{date.today().month:02d}"
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT so_phieu FROM XuatHang WHERE so_phieu LIKE ? OR so_phieu LIKE ?", (f"XH%/{month}", f"XH%{month}%"))
            rows = cursor.fetchall()
            max_seq = 1000
            for r in rows:
                sp = str(r["so_phieu"] or "").strip()
                if "/" in sp:
                    p_part, m_part = sp.split("/", 1)
                    if m_part == month and p_part.startswith("XH"):
                        digits = p_part[2:]
                        if digits.isdigit():
                            max_seq = max(max_seq, int(digits))
            return f"XH{max_seq + 1:04d}/{month}"

    def xuat_hang_batch_local(self, ma_hang: str, so_luong: int, conn: sqlite3.Connection = None) -> tuple[int, str, float]:
        """Trừ tồn kho FIFO trong SQLite và tính chính xác giá vốn (COGS)."""
        should_close = False
        with self._lock:
            if conn is None:
                conn = self._get_connection()
                should_close = True

            cursor = conn.cursor()
            cursor.execute("SELECT ton_kho, chi_tiet_lo, gia_nhap FROM HangHoa WHERE ma_hang = ?", (ma_hang,))
            row = cursor.fetchone()
            if not row:
                if should_close: conn.close()
                raise ValueError(f"Không tìm thấy hàng hóa mã {ma_hang}")
            cur_sl = int(row["ton_kho"] or 0)
            if so_luong > cur_sl:
                if should_close: conn.close()
                raise ValueError(f"Hàng {ma_hang} không đủ tồn kho (còn {cur_sl}, yêu cầu xuất {so_luong})")

            cur_lo_str = str(row["chi_tiet_lo"] or "")
            cur_gia = float(row["gia_nhap"] or 0)
            batches = parse_batches_str(cur_lo_str, cur_sl, cur_gia)

            remaining_need = so_luong
            total_cost = 0.0
            new_batches = []
            for b in batches:
                if remaining_need <= 0:
                    new_batches.append(b)
                elif b["so_luong"] <= remaining_need:
                    total_cost += b["so_luong"] * b["gia_nhap"]
                    remaining_need -= b["so_luong"]
                else:
                    total_cost += remaining_need * b["gia_nhap"]
                    b["so_luong"] -= remaining_need
                    remaining_need = 0
                    new_batches.append(b)

            if remaining_need > 0:
                total_cost += remaining_need * cur_gia

            new_total_sl = sum(b["so_luong"] for b in new_batches)
            new_lo_str = format_batches_str(new_batches)

            cursor.execute("""
                UPDATE HangHoa SET ton_kho = ?, chi_tiet_lo = ? WHERE ma_hang = ?
            """, (new_total_sl, new_lo_str, ma_hang))
            if should_close:
                conn.commit()
                conn.close()

        # Enqueue cập nhật lô giá & tồn kho lên Sheet HangHoa
        self._enqueue_task("UPDATE_HANG_HOA_STOCK", SHEET_HANG_HOA, {
            "ma_hang": ma_hang,
            "ton_kho": new_total_sl,
            "chi_tiet_lo": new_lo_str
        })
        return new_total_sl, new_lo_str, total_cost

    def create_xuat_hang_transaction(self, so_phieu: str, ngay_xuat: str, kh_save_ref: str, ghi_chu: str, items: list[dict], tien_khach_no_dict: dict = None) -> list[dict]:
        """Tạo phiếu xuất hàng: trừ FIFO trong SQLite và enqueue lên Sheet."""
        created_rows = []
        with self._lock:
            with self._get_connection() as conn:
                cursor = conn.cursor()
                for it in items:
                    new_id = str(int(time.time() * 1000)) + str(len(created_rows))
                    thanh_tien = it["so_luong"] * it["gia_ban"]
                    # Tính FIFO trực tiếp trong SQLite bằng cùng connection
                    _, _, gia_von = self.xuat_hang_batch_local(it["ma_hang"], it["so_luong"], conn=conn)
                    loi_nhuan = float(thanh_tien) - float(gia_von)
                    tien_no = float(it.get("tien_khach_no", thanh_tien))

                    cursor.execute("""
                        INSERT INTO XuatHang (id, so_phieu, ngay_xuat, ma_hang, ten_hang, so_luong, gia_ban, thanh_tien, khach_hang_id, ghi_chu, gia_von, loi_nhuan, tien_khach_no)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """, (
                        new_id, so_phieu, ngay_xuat, it["ma_hang"], it["ten_hang"],
                        it["so_luong"], it["gia_ban"], thanh_tien, kh_save_ref, ghi_chu, gia_von, loi_nhuan, tien_no
                    ))

                    created_rows.append({
                        "id": new_id,
                        "so_phieu": so_phieu,
                        "ngay_xuat": ngay_xuat,
                        "ma_hang": it["ma_hang"],
                        "ten_hang": it["ten_hang"],
                        "so_luong": it["so_luong"],
                        "gia_ban": it["gia_ban"],
                        "thanh_tien": thanh_tien,
                        "khach_hang_id": kh_save_ref,
                        "ghi_chu": ghi_chu,
                        "gia_von": gia_von,
                        "loi_nhuan": loi_nhuan,
                        "tien_khach_no": tien_no
                    })
                conn.commit()

        # Enqueue từng dòng phiếu xuất lên Google Sheet
        for r in created_rows:
            sheet_row = [
                r["id"], r["so_phieu"], r["ngay_xuat"], r["ma_hang"], r["ten_hang"],
                r["so_luong"], r["gia_ban"], r["thanh_tien"], r["khach_hang_id"],
                r["ghi_chu"], r["gia_von"], r["loi_nhuan"], r["tien_khach_no"]
            ]
            self._enqueue_task("APPEND_ROW", SHEET_XUAT_HANG, {"row": sheet_row})

        return created_rows

    def delete_xuat_hang_receipt(self, so_phieu: str) -> bool:
        """Xóa toàn bộ phiếu xuất kho, hoàn trả hàng về kho và đồng bộ Sheet."""
        with self._lock:
            with self._get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("SELECT * FROM XuatHang WHERE so_phieu = ?", (so_phieu,))
                rows = cursor.fetchall()
                if not rows:
                    return False
                items = [dict(r) for r in rows]

                cursor.execute("DELETE FROM XuatHang WHERE so_phieu = ?", (so_phieu,))
                conn.commit()

        # Hoàn trả hàng vào kho (như nhập lại)
        for it in items:
            sl = int(it.get("so_luong", 0) or 0)
            ma = str(it.get("ma_hang", ""))
            gia_von = float(it.get("gia_von", 0) or 0)
            cost = (gia_von / sl) if sl > 0 else 0
            if sl > 0 and ma:
                if cost <= 0:
                    h = self.get_hang_hoa_by_ma(ma)
                    cost = float(h.get("gia_nhap", 0) or 0) if h else 0
                self.nhap_hang_batch_local(ma, sl, cost)

        # Xóa trên Google Sheet
        self._enqueue_task("DELETE_RECEIPT_ROWS", SHEET_XUAT_HANG, {"so_phieu": so_phieu})
        return True

    def update_xuat_hang_receipt(self, so_phieu: str, ngay_xuat: str, kh_save_ref: str, ghi_chu: str, items: list[dict]) -> list[dict]:
        """Cập nhật phiếu xuất kho: hoàn trả hàng cũ, kiểm tra tồn kho, xuất FIFO mới."""
        # 1. Lấy các dòng cũ
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM XuatHang WHERE so_phieu = ?", (so_phieu,))
            old_rows = cursor.fetchall()
            old_items = [dict(r) for r in old_rows]

        # 2. Tạm hoàn trả hàng cũ vào kho
        for it in old_items:
            sl = int(it.get("so_luong", 0) or 0)
            ma = str(it.get("ma_hang", ""))
            gia_von = float(it.get("gia_von", 0) or 0)
            cost = (gia_von / sl) if sl > 0 else 0
            if sl > 0 and ma:
                if cost <= 0:
                    h = self.get_hang_hoa_by_ma(ma)
                    cost = float(h.get("gia_nhap", 0) or 0) if h else 0
                self.nhap_hang_batch_local(ma, sl, cost)

        # 3. Kiểm tra xem kho có đủ cho danh sách mới không
        for it in items:
            rec = self.get_hang_hoa_by_ma(it["ma_hang"])
            if not rec:
                for o_it in old_items:
                    self.xuat_hang_batch_local(o_it["ma_hang"], int(o_it["so_luong"]))
                raise ValueError(f"Không tìm thấy hàng hóa {it['ma_hang']}")
            ton_kho = int(rec.get("ton_kho", 0) or 0)
            if ton_kho < it["so_luong"]:
                for o_it in old_items:
                    self.xuat_hang_batch_local(o_it["ma_hang"], int(o_it["so_luong"]))
                raise ValueError(f"Hàng {it.get('ten_hang', it['ma_hang'])} chỉ còn tồn {ton_kho}, không đủ xuất {it['so_luong']}")

        # 4. Đã đủ tồn kho: Xóa các bản ghi cũ trong SQLite
        with self._lock:
            with self._get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("DELETE FROM XuatHang WHERE so_phieu = ?", (so_phieu,))
                conn.commit()

        # Xóa các dòng cũ trên Sheet
        self._enqueue_task("DELETE_RECEIPT_ROWS", SHEET_XUAT_HANG, {"so_phieu": so_phieu})

        # 5. Xuất FIFO cho danh sách mới và chèn vào SQLite
        created_rows = []
        with self._lock:
            with self._get_connection() as conn:
                cursor = conn.cursor()
                for it in items:
                    new_id = str(int(time.time() * 1000)) + str(len(created_rows))
                    thanh_tien = it["so_luong"] * it["gia_ban"]
                    _, _, gia_von = self.xuat_hang_batch_local(it["ma_hang"], it["so_luong"], conn=conn)
                    loi_nhuan = float(thanh_tien) - float(gia_von)
                    tien_no = float(it.get("tien_khach_no", thanh_tien))

                    cursor.execute("""
                        INSERT INTO XuatHang (id, so_phieu, ngay_xuat, ma_hang, ten_hang, so_luong, gia_ban, thanh_tien, khach_hang_id, ghi_chu, gia_von, loi_nhuan, tien_khach_no)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """, (
                        new_id, so_phieu, ngay_xuat, it["ma_hang"], it["ten_hang"],
                        it["so_luong"], it["gia_ban"], thanh_tien, kh_save_ref, ghi_chu, gia_von, loi_nhuan, tien_no
                    ))

                    created_rows.append({
                        "id": new_id,
                        "so_phieu": so_phieu,
                        "ngay_xuat": ngay_xuat,
                        "ma_hang": it["ma_hang"],
                        "ten_hang": it["ten_hang"],
                        "so_luong": it["so_luong"],
                        "gia_ban": it["gia_ban"],
                        "thanh_tien": thanh_tien,
                        "khach_hang_id": kh_save_ref,
                        "ghi_chu": ghi_chu,
                        "gia_von": gia_von,
                        "loi_nhuan": loi_nhuan,
                        "tien_khach_no": tien_no
                    })
                conn.commit()

        for r in created_rows:
            sheet_row = [
                r["id"], r["so_phieu"], r["ngay_xuat"], r["ma_hang"], r["ten_hang"],
                r["so_luong"], r["gia_ban"], r["thanh_tien"], r["khach_hang_id"],
                r["ghi_chu"], r["gia_von"], r["loi_nhuan"], r["tien_khach_no"]
            ]
            self._enqueue_task("APPEND_ROW", SHEET_XUAT_HANG, {"row": sheet_row})

        return created_rows


    # ── 6. SoQuy (Thu / Chi) CRUD ─────────────────────────────────────────────

    def generate_ma_phieu_thu(self, loai_quy: str = "TIEN_MAT", date_str: str = "") -> str:
        """
        Tạo mã phiếu thu theo định dạng người dùng yêu cầu:
        - Tiền mặt: TMxxxx/MM (ví dụ TM0001/10)
        - Tiền gửi: TGxxxx/MM (ví dụ TG0001/10)
        """
        if not date_str:
            date_str = date.today().isoformat()
        parts = date_str.split("-")
        month = parts[1] if len(parts) >= 2 else f"{date.today().month:02d}"
        prefix = "TM" if str(loai_quy).upper() == "TIEN_MAT" else "TG"

        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT ma_phieu FROM SoQuy WHERE ma_phieu LIKE ? OR ma_phieu LIKE ?", (f"{prefix}%/{month}", f"{prefix}%"))
            rows = cursor.fetchall()
            max_seq = 0
            for r in rows:
                mp = str(r["ma_phieu"] or "").strip()
                if "/" in mp:
                    p_part, m_part = mp.split("/", 1)
                    if m_part == month and p_part.startswith(prefix):
                        digits = p_part[len(prefix):]
                        if digits.isdigit():
                            max_seq = max(max_seq, int(digits))
            return f"{prefix}{max_seq + 1:04d}/{month}"

    def generate_ma_phieu_chi(self, loai_quy: str = "TIEN_MAT", date_str: str = "") -> str:
        """
        Tạo mã phiếu chi:
        - Tiền mặt: CMxxxx/MM (hoặc PCxxxx/MM)
        - Tiền gửi: CGxxxx/MM
        """
        if not date_str:
            date_str = date.today().isoformat()
        parts = date_str.split("-")
        month = parts[1] if len(parts) >= 2 else f"{date.today().month:02d}"
        prefix = "CM" if str(loai_quy).upper() == "TIEN_MAT" else "CG"

        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT ma_phieu FROM SoQuy WHERE ma_phieu LIKE ? OR ma_phieu LIKE ?", (f"{prefix}%/{month}", f"{prefix}%"))
            rows = cursor.fetchall()
            max_seq = 0
            for r in rows:
                mp = str(r["ma_phieu"] or "").strip()
                if "/" in mp:
                    p_part, m_part = mp.split("/", 1)
                    if m_part == month and p_part.startswith(prefix):
                        digits = p_part[len(prefix):]
                        if digits.isdigit():
                            max_seq = max(max_seq, int(digits))
            return f"{prefix}{max_seq + 1:04d}/{month}"

    def create_phieu_thu(self, data: dict) -> dict:
        """
        Tạo phiếu thu tiền, cập nhật trừ công nợ phiếu xuất tương ứng (nếu có liên quan)
        và enqueue lên Google Sheet SoQuy.
        """
        record_id = str(int(time.time() * 1000))
        loai_quy = data.get("loai_quy", "TIEN_MAT")
        ngay = data.get("ngay") or date.today().isoformat()
        ma_phieu = data.get("ma_phieu") or self.generate_ma_phieu_thu(loai_quy, ngay)
        so_tien = float(data.get("so_tien", 0) or 0)
        phieu_lien_quan = str(data.get("phieu_lien_quan") or "").strip()
        doi_tuong = str(data.get("doi_tuong") or "").strip()
        dien_thoai = str(data.get("dien_thoai") or "").strip()
        ghi_chu = str(data.get("ghi_chu") or "").strip()

        with self._lock:
            with self._get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("""
                    INSERT INTO SoQuy (id, ma_phieu, ngay, loai_phieu, loai_quy, doi_tuong, dien_thoai, so_tien, phieu_lien_quan, ghi_chu)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (record_id, ma_phieu, ngay, "THU", loai_quy, doi_tuong, dien_thoai, so_tien, phieu_lien_quan, ghi_chu))

                modified_xuat_ids = []
                # Nếu thu tiền cho 1 phiếu xuất cụ thể hoặc tất cả công nợ (ALL)
                if phieu_lien_quan:
                    if phieu_lien_quan == 'ALL':
                        unpaid_invs = self.get_customer_unpaid_invoices(doi_tuong, dien_thoai)
                        rem_payment = so_tien
                        for inv in unpaid_invs:
                            if rem_payment <= 0:
                                break
                            sp = inv["so_phieu"]
                            cursor.execute("SELECT id, tien_khach_no, thanh_tien FROM XuatHang WHERE so_phieu = ? ORDER BY id ASC", (sp,))
                            xuat_rows = cursor.fetchall()
                            for xr in xuat_rows:
                                if rem_payment <= 0:
                                    break
                                cur_no = float(xr["tien_khach_no"] if xr["tien_khach_no"] is not None else xr["thanh_tien"] or 0)
                                if cur_no <= 0:
                                    continue
                                deduct = min(cur_no, rem_payment)
                                new_no = max(0.0, cur_no - deduct)
                                rem_payment -= deduct
                                cursor.execute("UPDATE XuatHang SET tien_khach_no = ? WHERE id = ?", (new_no, xr["id"]))
                                modified_xuat_ids.append(xr["id"])
                    else:
                        cursor.execute("SELECT id, tien_khach_no, thanh_tien FROM XuatHang WHERE so_phieu = ?", (phieu_lien_quan,))
                        xuat_rows = cursor.fetchall()
                        if xuat_rows:
                            rem_payment = so_tien
                            for xr in xuat_rows:
                                cur_no = float(xr["tien_khach_no"] if xr["tien_khach_no"] is not None else xr["thanh_tien"] or 0)
                                deduct = min(cur_no, rem_payment)
                                new_no = max(0.0, cur_no - deduct)
                                rem_payment -= deduct
                                cursor.execute("UPDATE XuatHang SET tien_khach_no = ? WHERE id = ?", (new_no, xr["id"]))
                                modified_xuat_ids.append(xr["id"])
                conn.commit()

        # Enqueue lên Google Sheet
        sheet_row = [record_id, ma_phieu, ngay, "THU", loai_quy, doi_tuong, dien_thoai, so_tien, phieu_lien_quan, ghi_chu]
        self._enqueue_task("APPEND_ROW", SHEET_SO_QUY, {"row": sheet_row})

        # Cập nhật các dòng phiếu xuất tương ứng trên Google Sheets
        if modified_xuat_ids:
            with self._get_connection() as conn:
                cursor = conn.cursor()
                for mid in modified_xuat_ids:
                    cursor.execute("SELECT * FROM XuatHang WHERE id = ?", (mid,))
                    ux = cursor.fetchone()
                    if ux:
                        u_row = [
                            ux["id"], ux["so_phieu"], ux["ngay_xuat"], ux["ma_hang"], ux["ten_hang"],
                            ux["so_luong"], ux["gia_ban"], ux["thanh_tien"], ux["khach_hang_id"],
                            ux["ghi_chu"], ux["gia_von"], ux["loi_nhuan"], ux["tien_khach_no"]
                        ]
                        self._enqueue_task("UPDATE_ROW", SHEET_XUAT_HANG, {"id": ux["id"], "row": u_row})

        return {
            "id": record_id,
            "ma_phieu": ma_phieu,
            "ngay": ngay,
            "loai_phieu": "THU",
            "loai_quy": loai_quy,
            "doi_tuong": doi_tuong,
            "dien_thoai": dien_thoai,
            "so_tien": so_tien,
            "phieu_lien_quan": phieu_lien_quan,
            "ghi_chu": ghi_chu
        }

    def create_phieu_chi(self, data: dict) -> dict:
        """Tạo phiếu chi tiền và lưu vào SQLite + Google Sheet."""
        record_id = str(int(time.time() * 1000))
        loai_quy = data.get("loai_quy", "TIEN_MAT")
        ngay = data.get("ngay") or date.today().isoformat()
        ma_phieu = data.get("ma_phieu") or self.generate_ma_phieu_chi(loai_quy, ngay)
        so_tien = float(data.get("so_tien", 0) or 0)
        phieu_lien_quan = str(data.get("phieu_lien_quan") or "").strip()
        doi_tuong = str(data.get("doi_tuong") or "").strip()
        dien_thoai = str(data.get("dien_thoai") or "").strip()
        ghi_chu = str(data.get("ghi_chu") or "").strip()

        # Kiểm tra số dư khả dụng của công ty trước khi chi tiền
        balances = self.get_so_quy_balances()
        is_tm = (str(loai_quy).upper() == "TIEN_MAT")
        avail_balance = float(balances["tien_mat"] if is_tm else balances["tien_gui"])
        fund_name = "Tiền mặt" if is_tm else "Tiền gửi ngân hàng"
        if so_tien > avail_balance:
            raise ValueError(
                f"Số dư {fund_name} của công ty không đủ để chi! "
                f"Khả dụng: {avail_balance:,.0f} đ, Số tiền cần chi: {so_tien:,.0f} đ. "
                f"Vui lòng nạp thêm quỹ vào Quản Lý Dòng Tiền hoặc chọn nguồn tiền khác."
            )

        with self._lock:
            with self._get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("""
                    INSERT INTO SoQuy (id, ma_phieu, ngay, loai_phieu, loai_quy, doi_tuong, dien_thoai, so_tien, phieu_lien_quan, ghi_chu)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (record_id, ma_phieu, ngay, "CHI", loai_quy, doi_tuong, dien_thoai, so_tien, phieu_lien_quan, ghi_chu))

                modified_nhap_ids = []
                # Nếu có phiếu liên quan (phiếu nhập kho), trừ dần công nợ
                if phieu_lien_quan:
                    if phieu_lien_quan == 'ALL':
                        unpaid_invs = self.get_supplier_unpaid_invoices(doi_tuong, dien_thoai)
                        rem_payment = so_tien
                        for inv in unpaid_invs:
                            if rem_payment <= 0:
                                break
                            sp = inv["so_phieu"]
                            cursor.execute("SELECT * FROM NhapHang WHERE so_phieu = ? ORDER BY id ASC", (sp,))
                            nhap_rows = cursor.fetchall()
                            for nr in nhap_rows:
                                if rem_payment <= 0:
                                    break
                                cur_no = float(nr["cong_no"] if nr["cong_no"] is not None else nr["thanh_tien"] or 0)
                                if cur_no <= 0:
                                    continue
                                deduct = min(cur_no, rem_payment)
                                new_no = max(0.0, cur_no - deduct)
                                rem_payment -= deduct
                                cursor.execute("UPDATE NhapHang SET cong_no = ? WHERE id = ?", (new_no, nr["id"]))
                                modified_nhap_ids.append(nr["id"])
                    else:
                        cursor.execute("SELECT * FROM NhapHang WHERE so_phieu = ?", (phieu_lien_quan,))
                        nhap_rows = cursor.fetchall()
                        if nhap_rows:
                            rem_payment = so_tien
                            for nr in nhap_rows:
                                cur_no = float(nr["cong_no"] if nr["cong_no"] is not None else nr["thanh_tien"] or 0)
                                deduct = min(cur_no, rem_payment)
                                new_no = max(0.0, cur_no - deduct)
                                rem_payment -= deduct
                                cursor.execute("UPDATE NhapHang SET cong_no = ? WHERE id = ?", (new_no, nr["id"]))
                                modified_nhap_ids.append(nr["id"])

                conn.commit()

        sheet_row = [record_id, ma_phieu, ngay, "CHI", loai_quy, doi_tuong, dien_thoai, so_tien, phieu_lien_quan, ghi_chu]
        self._enqueue_task("APPEND_ROW", SHEET_SO_QUY, {"row": sheet_row})

        # Cập nhật các dòng phiếu nhập tương ứng trên Google Sheets
        if modified_nhap_ids:
            with self._get_connection() as conn:
                cursor = conn.cursor()
                for mid in modified_nhap_ids:
                    cursor.execute("SELECT * FROM NhapHang WHERE id = ?", (mid,))
                    un = cursor.fetchone()
                    if un:
                        u_row = [
                            un["id"], un["so_phieu"], un["ngay_nhap"], un["ma_hang"], un["ten_hang"],
                            un["so_luong"], un["gia_nhap"], un["thanh_tien"], un["nha_cung_cap_id"],
                            un["ghi_chu"], un["cong_no"]
                        ]
                        self._enqueue_task("UPDATE_ROW", SHEET_NHAP_HANG, {"id": un["id"], "row": u_row})

        return {
            "id": record_id,
            "ma_phieu": ma_phieu,
            "ngay": ngay,
            "loai_phieu": "CHI",
            "loai_quy": loai_quy,
            "doi_tuong": doi_tuong,
            "dien_thoai": dien_thoai,
            "so_tien": so_tien,
            "phieu_lien_quan": phieu_lien_quan,
            "ghi_chu": ghi_chu
        }

    def delete_phieu_so_quy(self, record_id: str) -> bool:
        """Xóa phiếu thu/chi và đồng bộ."""
        with self._lock:
            with self._get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("SELECT * FROM SoQuy WHERE id = ? OR ma_phieu = ?", (str(record_id), str(record_id)))
                rec = cursor.fetchone()
                if not rec:
                    return False
                rec_id = str(rec["id"])
                loai_phieu = str(rec["loai_phieu"] or "").upper()
                phieu_lq = str(rec["phieu_lien_quan"] or "").strip()
                so_tien = float(rec["so_tien"] or 0)

                # Nếu xóa phiếu chi có liên quan đến phiếu nhập, hoàn trả nợ
                if loai_phieu == "CHI" and phieu_lq:
                    cursor.execute("SELECT * FROM NhapHang WHERE so_phieu = ?", (phieu_lq,))
                    nhap_rows = cursor.fetchall()
                    if nhap_rows:
                        rem_refund = so_tien
                        for nr in nhap_rows:
                            cur_no = float(nr["cong_no"] if nr["cong_no"] is not None else 0.0)
                            max_no = float(nr["thanh_tien"] or 0.0)
                            refund = min(max_no - cur_no, rem_refund)
                            if refund > 0:
                                cursor.execute("UPDATE NhapHang SET cong_no = ? WHERE id = ?", (cur_no + refund, nr["id"]))
                                rem_refund -= refund

                # Nếu xóa phiếu thu có liên quan đến phiếu xuất, hoàn trả nợ
                elif loai_phieu == "THU" and phieu_lq:
                    cursor.execute("SELECT * FROM XuatHang WHERE so_phieu = ?", (phieu_lq,))
                    xuat_rows = cursor.fetchall()
                    if xuat_rows:
                        rem_refund = so_tien
                        for xr in xuat_rows:
                            cur_no = float(xr["tien_khach_no"] if xr["tien_khach_no"] is not None else 0.0)
                            max_no = float(xr["thanh_tien"] or 0.0)
                            refund = min(max_no - cur_no, rem_refund)
                            if refund > 0:
                                cursor.execute("UPDATE XuatHang SET tien_khach_no = ? WHERE id = ?", (cur_no + refund, xr["id"]))
                                rem_refund -= refund

                cursor.execute("DELETE FROM SoQuy WHERE id = ?", (rec_id,))
                conn.commit()

        self._enqueue_task("DELETE_ROW", SHEET_SO_QUY, {"id": rec_id})

        # Đồng bộ cập nhật lại dòng phiếu nhập/xuất trên Google Sheets nếu có
        if phieu_lq:
            if loai_phieu == "CHI":
                with self._get_connection() as conn:
                    cursor = conn.cursor()
                    cursor.execute("SELECT * FROM NhapHang WHERE so_phieu = ?", (phieu_lq,))
                    for un in cursor.fetchall():
                        u_row = [
                            un["id"], un["so_phieu"], un["ngay_nhap"], un["ma_hang"], un["ten_hang"],
                            un["so_luong"], un["gia_nhap"], un["thanh_tien"], un["nha_cung_cap_id"],
                            un["ghi_chu"], un["cong_no"]
                        ]
                        self._enqueue_task("UPDATE_ROW", SHEET_NHAP_HANG, {"id": un["id"], "row": u_row})
            elif loai_phieu == "THU":
                with self._get_connection() as conn:
                    cursor = conn.cursor()
                    cursor.execute("SELECT * FROM XuatHang WHERE so_phieu = ?", (phieu_lq,))
                    for ux in cursor.fetchall():
                        u_row = [
                            ux["id"], ux["so_phieu"], ux["ngay_xuat"], ux["ma_hang"], ux["ten_hang"],
                            ux["so_luong"], ux["gia_ban"], ux["thanh_tien"], ux["khach_hang_id"],
                            ux["ghi_chu"], ux["gia_von"], ux["loi_nhuan"], ux["tien_khach_no"]
                        ]
                        self._enqueue_task("UPDATE_ROW", SHEET_XUAT_HANG, {"id": ux["id"], "row": u_row})

        return True

    def get_customer_unpaid_invoices(self, kh_id_or_name: str, dien_thoai: str = "") -> list[dict]:
        """Lấy danh sách các phiếu xuất mà khách hàng này còn nợ (tien_khach_no > 0)."""
        def _clean_p(p):
            p = str(p or "").replace("None", "").strip()
            if p.endswith(".0"):
                p = p[:-2]
            if len(p) == 9 and p.isdigit() and not p.startswith("0"):
                p = "0" + p
            return p

        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM XuatHang ORDER BY ngay_xuat DESC, id DESC")
            all_rows = cursor.fetchall()
            cursor.execute("SELECT * FROM KhachHang")
            kh_rows = cursor.fetchall()

        # Map danh mục KhachHang tra cứu chéo
        kh_lookup_by_id = {}
        kh_lookup_by_name = {}
        kh_lookup_by_phone = {}
        for k in kh_rows:
            kid = str(k["id"] or "").strip()
            kname = str(k["ten_kh"] or "").strip()
            kphone = _clean_p(k["dien_thoai"])
            kinfo = {
                "id": kid,
                "ten_kh": kname,
                "dia_chi": str(k["dia_chi"] or "").strip(),
                "dien_thoai": kphone
            }
            if kid:
                kh_lookup_by_id[kid] = kinfo
            if kname:
                kh_lookup_by_name[kname.lower()] = kinfo
            if kphone:
                kh_lookup_by_phone[kphone] = kinfo
                if kphone.startswith("0"):
                    kh_lookup_by_phone[kphone[1:]] = kinfo

        q_raw = str(kh_id_or_name or "").strip()
        q_phone = _clean_p(dien_thoai)

        # Xác định đối tượng khách hàng mục tiêu
        target_customer = None
        if q_raw:
            target_customer = kh_lookup_by_id.get(q_raw) or kh_lookup_by_name.get(q_raw.lower())
        if not target_customer and q_phone:
            target_customer = kh_lookup_by_phone.get(q_phone)

        target_ids = {x for x in [q_raw, target_customer.get("id") if target_customer else None] if x}
        target_names = {x.lower() for x in [q_raw, target_customer.get("ten_kh") if target_customer else None] if x}
        target_phones = {x for x in [q_phone, target_customer.get("dien_thoai") if target_customer else None] if x}
        if q_phone and q_phone.startswith("0"):
            target_phones.add(q_phone[1:])

        # Nhóm phiếu xuất theo so_phieu
        receipt_map = {}
        for r in all_rows:
            sp = str(r["so_phieu"] or "").strip()
            if not sp:
                continue

            tt = float(r["thanh_tien"] or 0)
            no = float(r["tien_khach_no"] if r["tien_khach_no"] is not None else tt)

            if sp not in receipt_map:
                inv_kh_ref = str(r["khach_hang_id"] or "").strip()
                inv_phone = _clean_p(r["dien_thoai"])
                inv_dia_chi = str(r["dia_chi"] or "").strip()

                cust_info = kh_lookup_by_id.get(inv_kh_ref) or kh_lookup_by_name.get(inv_kh_ref.lower()) or target_customer or {}
                disp_ten_kh = cust_info.get("ten_kh") or inv_kh_ref
                disp_phone = cust_info.get("dien_thoai") or inv_phone
                disp_dia_chi = cust_info.get("dia_chi") or inv_dia_chi

                receipt_map[sp] = {
                    "so_phieu": sp,
                    "ngay_xuat": str(r["ngay_xuat"] or ""),
                    "khach_hang_id": inv_kh_ref,
                    "ten_kh": disp_ten_kh,
                    "dia_chi": disp_dia_chi,
                    "dien_thoai": disp_phone,
                    "ghi_chu": str(r["ghi_chu"] or ""),
                    "tong_tien": 0.0,
                    "tong_no": 0.0,
                    "items": []
                }

            receipt_map[sp]["tong_tien"] += tt
            receipt_map[sp]["tong_no"] += no
            receipt_map[sp]["items"].append(dict(r))

        matched_invoices = []
        for sp, inv in receipt_map.items():
            if inv["tong_no"] <= 0:
                continue  # Đã trả hết

            inv_kh = str(inv["khach_hang_id"] or "").strip()
            inv_phone = _clean_p(inv["dien_thoai"])

            is_match = (
                inv_kh in target_ids or
                inv_kh.lower() in target_names or
                (inv_phone and inv_phone in target_phones)
            )
            if not is_match and inv_kh in kh_lookup_by_id:
                c = kh_lookup_by_id[inv_kh]
                if c["id"] in target_ids or c["ten_kh"].lower() in target_names:
                    is_match = True

            if is_match:
                matched_invoices.append(inv)

        return matched_invoices

    def get_supplier_unpaid_invoices(self, ncc_id_or_name: str, dien_thoai: str = "") -> list[dict]:
        """Lấy danh sách các phiếu nhập mà công ty còn nợ nhà cung cấp / đối tác (cong_no > 0)."""
        def _clean_p(p):
            p = str(p or "").replace("None", "").strip()
            if p.endswith(".0"):
                p = p[:-2]
            if len(p) == 9 and p.isdigit() and not p.startswith("0"):
                p = "0" + p
            return p

        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM NhapHang ORDER BY ngay_nhap DESC, id DESC")
            all_rows = cursor.fetchall()
            cursor.execute("SELECT * FROM DoiTuong")
            dt_rows = cursor.fetchall()
            cursor.execute("SELECT * FROM NhaCungCap")
            ncc_rows = cursor.fetchall()

        # Map danh mục DoiTuong & NhaCungCap tra cứu chéo
        ncc_lookup_by_id = {}
        ncc_lookup_by_name = {}
        ncc_lookup_by_phone = {}

        for n in ncc_rows:
            nid = str(n["id"] or "").strip()
            nname = str(n["ten_ncc"] or "").strip()
            nphone = _clean_p(n["dien_thoai"])
            ninfo = {
                "id": nid,
                "ten_ncc": nname,
                "dia_chi": str(n["dia_chi"] or "").strip(),
                "dien_thoai": nphone
            }
            if nid:
                ncc_lookup_by_id[nid] = ninfo
            if nname:
                ncc_lookup_by_name[nname.lower()] = ninfo
            if nphone:
                ncc_lookup_by_phone[nphone] = ninfo
                if nphone.startswith("0"):
                    ncc_lookup_by_phone[nphone[1:]] = ninfo

        for d in dt_rows:
            did = str(d["id"] or "").strip()
            dname = str(d["ten"] or "").strip()
            dphone = _clean_p(d["dien_thoai"])
            dinfo = {
                "id": did,
                "ten_ncc": dname,
                "dia_chi": str(d["dia_chi"] or "").strip(),
                "dien_thoai": dphone
            }
            if did:
                ncc_lookup_by_id[did] = dinfo
            if dname:
                ncc_lookup_by_name[dname.lower()] = dinfo
            if dphone:
                ncc_lookup_by_phone[dphone] = dinfo
                if dphone.startswith("0"):
                    ncc_lookup_by_phone[dphone[1:]] = dinfo

        q_raw = str(ncc_id_or_name or "").strip()
        q_phone = _clean_p(dien_thoai)

        target_ncc = None
        if q_raw:
            target_ncc = ncc_lookup_by_id.get(q_raw) or ncc_lookup_by_name.get(q_raw.lower())
        if not target_ncc and q_phone:
            target_ncc = ncc_lookup_by_phone.get(q_phone)

        target_ids = {x for x in [q_raw, target_ncc.get("id") if target_ncc else None] if x}
        target_names = {x.lower() for x in [q_raw, target_ncc.get("ten_ncc") if target_ncc else None] if x}
        target_phones = {x for x in [q_phone, target_ncc.get("dien_thoai") if target_ncc else None] if x}
        if q_phone and q_phone.startswith("0"):
            target_phones.add(q_phone[1:])

        receipt_map = {}
        for r in all_rows:
            sp = str(r["so_phieu"] or "").strip()
            if not sp:
                continue

            tt = float(r["thanh_tien"] or 0)
            no = float(r["cong_no"] if r["cong_no"] is not None else tt)

            if sp not in receipt_map:
                inv_ncc_ref = str(r["nha_cung_cap_id"] or "").strip()
                inv_phone = _clean_p(r["dien_thoai"])
                inv_dia_chi = str(r["dia_chi"] or "").strip()

                ncc_info = ncc_lookup_by_id.get(inv_ncc_ref) or ncc_lookup_by_name.get(inv_ncc_ref.lower()) or target_ncc or {}
                disp_ten_ncc = ncc_info.get("ten_ncc") or inv_ncc_ref
                disp_phone = ncc_info.get("dien_thoai") or inv_phone
                disp_dia_chi = ncc_info.get("dia_chi") or inv_dia_chi

                receipt_map[sp] = {
                    "so_phieu": sp,
                    "ngay_nhap": str(r["ngay_nhap"] or ""),
                    "nha_cung_cap_id": inv_ncc_ref,
                    "ten_ncc": disp_ten_ncc,
                    "dia_chi": disp_dia_chi,
                    "dien_thoai": disp_phone,
                    "ghi_chu": str(r["ghi_chu"] or ""),
                    "tong_tien": 0.0,
                    "tong_no": 0.0,
                    "cong_no": 0.0,
                    "items": []
                }

            receipt_map[sp]["tong_tien"] += tt
            receipt_map[sp]["tong_no"] += no
            receipt_map[sp]["cong_no"] += no
            receipt_map[sp]["items"].append(dict(r))

        matched_invoices = []
        for sp, inv in receipt_map.items():
            if inv["tong_no"] <= 0:
                continue  # Đã thanh toán hết

            inv_ncc = str(inv["nha_cung_cap_id"] or "").strip()
            inv_phone = _clean_p(inv["dien_thoai"])

            is_match = (
                inv_ncc in target_ids or
                inv_ncc.lower() in target_names or
                str(inv.get("ten_ncc", "")).strip().lower() in target_names or
                (inv_phone and inv_phone in target_phones)
            )
            if not is_match and inv_ncc in ncc_lookup_by_id:
                c = ncc_lookup_by_id[inv_ncc]
                if c["id"] in target_ids or c["ten_ncc"].lower() in target_names:
                    is_match = True

            if is_match:
                matched_invoices.append(inv)

        return matched_invoices

    def get_so_quy_balances(self) -> dict:
        """Tính số dư hiện tại của Tiền mặt, Tiền gửi và Tổng quỹ."""
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT loai_phieu, loai_quy, SUM(so_tien) as total FROM SoQuy GROUP BY loai_phieu, loai_quy")
            rows = cursor.fetchall()

        tm_thu = 0.0
        tm_chi = 0.0
        tg_thu = 0.0
        tg_chi = 0.0

        for r in rows:
            lp = str(r["loai_phieu"] or "").upper()
            lq = str(r["loai_quy"] or "").upper()
            amt = float(r["total"] or 0)
            if lq == "TIEN_MAT":
                if lp == "THU":
                    tm_thu += amt
                elif lp == "CHI":
                    tm_chi += amt
            else:  # NGAN_HANG
                if lp == "THU":
                    tg_thu += amt
                elif lp == "CHI":
                    tg_chi += amt

        # Lấy số dư ban đầu được cấu hình trong Config (nếu có)
        so_du_dau_tm = _safe_float(self.get_config("so_du_dau_tien_mat"), 0.0)
        so_du_dau_tg = _safe_float(self.get_config("so_du_dau_tien_gui"), 0.0)

        tien_mat = so_du_dau_tm + tm_thu - tm_chi
        tien_gui = so_du_dau_tg + tg_thu - tg_chi
        tong_quy = tien_mat + tien_gui

        return {
            "so_du_dau_tien_mat": so_du_dau_tm,
            "so_du_dau_tien_gui": so_du_dau_tg,
            "tm_thu": tm_thu,
            "tm_chi": tm_chi,
            "tg_thu": tg_thu,
            "tg_chi": tg_chi,
            "tien_mat": tien_mat,
            "tien_gui": tien_gui,
            "tong_quy": tong_quy
        }

    def update_company_balances(self, mode: str, tien_mat: float, tien_gui: float) -> dict:
        """
        Cập nhật số tiền hiện tại hoặc số dư ban đầu của công ty và lưu vào Config (cả SQLite lẫn Google Sheet).
        mode == 'current': Người dùng nhập trực tiếp số tiền hiện tại mong muốn -> quy đổi ra số dư đầu.
        mode == 'initial': Người dùng nhập số dư đầu kỳ.
        """
        balances = self.get_so_quy_balances()
        net_tm = balances["tm_thu"] - balances["tm_chi"]
        net_tg = balances["tg_thu"] - balances["tg_chi"]

        if mode == "current":
            so_du_dau_tm = tien_mat - net_tm
            so_du_dau_tg = tien_gui - net_tg
        else:
            so_du_dau_tm = tien_mat
            so_du_dau_tg = tien_gui

        self.set_config("so_du_dau_tien_mat", str(int(round(so_du_dau_tm))))
        self.set_config("so_du_dau_tien_gui", str(int(round(so_du_dau_tg))))

        try:
            from datetime import datetime
            self.set_config("cap_nhat_quy_luc", datetime.now().strftime("%Y-%m-%d %H:%M:%S"))
        except Exception:
            pass

        return self.get_so_quy_balances()

    # ── 7. Config CRUD ────────────────────────────────────────────────────────

    def get_config(self, key: str) -> str:
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT value FROM Config WHERE key = ?", (key,))
            row = cursor.fetchone()
            return str(row["value"]) if row else ""

    def set_config(self, key: str, value: str):
        with self._lock:
            with self._get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("INSERT OR REPLACE INTO Config (key, value) VALUES (?, ?)", (key, str(value)))
                conn.commit()
        self._enqueue_task("SET_CONFIG", SHEET_CONFIG, {"key": key, "value": value})

    # ── 7. Bulk Sync 2 Chiều ──────────────────────────────────────────────────

    def sync_from_google_sheets(self, target_table: str = "") -> dict:
        """Kéo dữ liệu từ Google Sheets đổ vào SQLite (toàn bộ hoặc chỉ 1 bảng cụ thể)."""
        counts = {}
        target = target_table.lower().replace("_", "").replace("-", "").strip()
        do_all = not target or target == "all"

        with self._lock:
            with self._get_connection() as conn:
                cursor = conn.cursor()

                # 1. Đồng bộ Hàng Hóa
                if do_all or target in ("hanghoa", "sanpham"):
                    try:
                        records = sheets_service.get_all_records(SHEET_HANG_HOA, force_refresh=True)
                        cursor.execute("DELETE FROM HangHoa")
                        for r in records:
                            cursor.execute("""
                                INSERT OR REPLACE INTO HangHoa 
                                (id, ma_hang, ten_hang, danh_muc, don_vi_tinh, gia_nhap, ton_kho, chi_tiet_lo, ghi_chu)
                                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                            """, (
                                str(r.get("id") or ""),
                                str(r.get("ma_hang") or ""),
                                str(r.get("ten_hang") or ""),
                                str(r.get("danh_muc") or ""),
                                str(r.get("don_vi_tinh") or "Cái"),
                                _safe_float(r.get("gia_nhap")),
                                _safe_int(r.get("ton_kho") or r.get("so_luong")),
                                str(r.get("chi_tiet_lo") or ""),
                                str(r.get("ghi_chu") or "")
                            ))
                        counts["HangHoa"] = len(records)
                    except Exception as e:
                        counts["HangHoa_err"] = str(e)

                # 2. Đồng bộ Khách Hàng (chỉ khi có yêu cầu riêng và sheet còn tồn tại)
                if target in ("khachhang", "kh"):
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

                # 3. Đồng bộ Nhà Cung Cấp (chỉ khi có yêu cầu riêng và sheet còn tồn tại)
                if target in ("nhacungcap", "ncc"):
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

                # 3.1. Đồng bộ Danh Mục Đối Tượng (Nguồn dữ liệu đối tác chính thức)
                if do_all or target in ("doituong", "doitac", "danhsachdoituong"):
                    try:
                        records = sheets_service.get_all_records(SHEET_DOI_TUONG, force_refresh=True)
                        if records:
                            cursor.execute("DELETE FROM DoiTuong")
                            for idx, r in enumerate(records):
                                dt_id = str(r.get("id") or r.get("ma_doi_tuong") or r.get("Mã Đối Tượng") or "").strip()
                                dt_ten = str(r.get("ten") or r.get("ten_doi_tuong") or r.get("Tên Đối Tượng") or "").strip()
                                if not dt_id:
                                    dt_id = dt_ten or f"DT_{idx+1:04d}"
                                if not dt_ten:
                                    dt_ten = dt_id

                                cursor.execute("""
                                    INSERT OR REPLACE INTO DoiTuong 
                                    (id, ten, phan_loai, ma_so_thue, dia_chi, dien_thoai, email, ghi_chu)
                                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                                """, (
                                    dt_id,
                                    dt_ten,
                                    str(r.get("phan_loai") or r.get("Phân Loại") or "CA_HAI").strip(),
                                    str(r.get("ma_so_thue") or r.get("mst") or r.get("Mã Số Thuế") or "").strip(),
                                    str(r.get("dia_chi") or r.get("Địa Chỉ") or "").strip(),
                                    str(r.get("dien_thoai") or r.get("Điện Thoại") or "").strip(),
                                    str(r.get("email") or r.get("Email") or "").strip(),
                                    str(r.get("ghi_chu") or r.get("Ghi Chú") or "").strip()
                                ))
                            counts["DoiTuong"] = len(records)
                    except Exception as e:
                        counts["DoiTuong_err"] = str(e)

                # 4. Đồng bộ Bảng Nhập Hàng
                if do_all or target in ("nhaphang", "nhap"):
                    try:
                        records = sheets_service.get_all_records(SHEET_NHAP_HANG, force_refresh=True)
                        cursor.execute("DELETE FROM NhapHang")
                        for r in records:
                            thanh_tien_val = _safe_float(r.get("thanh_tien"))
                            raw_no = r.get("cong_no")
                            cong_no_val = _safe_float(raw_no) if (raw_no is not None and str(raw_no).strip() != "") else thanh_tien_val
                            cursor.execute("""
                                INSERT OR REPLACE INTO NhapHang 
                                (id, so_phieu, ngay_nhap, ma_hang, ten_hang, so_luong, gia_nhap, thanh_tien, nha_cung_cap_id, dia_chi, dien_thoai, ghi_chu, cong_no)
                                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                            """, (
                                str(r.get("id") or ""),
                                str(r.get("so_phieu") or ""),
                                str(r.get("ngay_nhap") or r.get("ngay") or ""),
                                str(r.get("ma_hang") or ""),
                                str(r.get("ten_hang") or ""),
                                _safe_int(r.get("so_luong")),
                                _safe_float(r.get("gia_nhap")),
                                thanh_tien_val,
                                str(r.get("nha_cung_cap_id") or r.get("ten_ncc") or ""),
                                str(r.get("dia_chi") or ""),
                                str(r.get("dien_thoai") or ""),
                                str(r.get("ghi_chu") or ""),
                                cong_no_val
                            ))
                        counts["NhapHang"] = len(records)
                    except Exception as e:
                        counts["NhapHang_err"] = str(e)

                # 5. Đồng bộ Bảng Xuất Hàng
                if do_all or target in ("xuathang", "xuat"):
                    try:
                        records = sheets_service.get_all_records(SHEET_XUAT_HANG, force_refresh=True)
                        cursor.execute("DELETE FROM XuatHang")
                        for r in records:
                            thanh_tien_val = _safe_float(r.get("thanh_tien"))
                            # Nếu cột tien_khach_no có giá trị thì lấy, nếu rỗng thì mặc định bằng thanh_tien
                            raw_no = r.get("tien_khach_no")
                            tien_no_val = _safe_float(raw_no) if (raw_no is not None and str(raw_no).strip() != "") else thanh_tien_val
                            cursor.execute("""
                                INSERT OR REPLACE INTO XuatHang 
                                (id, so_phieu, ngay_xuat, ma_hang, ten_hang, so_luong, gia_ban, thanh_tien, khach_hang_id, dia_chi, dien_thoai, ghi_chu, gia_von, loi_nhuan, tien_khach_no)
                                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                            """, (
                                str(r.get("id") or ""),
                                str(r.get("so_phieu") or ""),
                                str(r.get("ngay_xuat") or r.get("ngay") or ""),
                                str(r.get("ma_hang") or ""),
                                str(r.get("ten_hang") or ""),
                                _safe_int(r.get("so_luong")),
                                _safe_float(r.get("gia_ban")),
                                thanh_tien_val,
                                str(r.get("khach_hang_id") or r.get("ten_kh") or ""),
                                str(r.get("dia_chi") or ""),
                                str(r.get("dien_thoai") or ""),
                                str(r.get("ghi_chu") or ""),
                                _safe_float(r.get("gia_von")),
                                _safe_float(r.get("loi_nhuan")),
                                tien_no_val
                            ))
                        counts["XuatHang"] = len(records)
                    except Exception as e:
                        counts["XuatHang_err"] = str(e)

                # 6. Đồng bộ Sổ Quỹ (Thu / Chi)
                if do_all or target in ("soquy", "dongtien", "phieuthu", "phieuchi"):
                    try:
                        records = sheets_service.get_all_records(SHEET_SO_QUY, force_refresh=True)
                        cursor.execute("DELETE FROM SoQuy")
                        for idx, r in enumerate(records):
                            rec_id = str(r.get("id") or r.get("ID") or "").strip()
                            ma_phieu = str(r.get("ma_phieu") or r.get("Mã Phiếu") or r.get("so_phieu") or r.get("Số Phiếu") or "").strip()
                            if not rec_id:
                                rec_id = ma_phieu or f"SQ_{int(time.time()*1000)}_{idx+1}"
                            if not ma_phieu:
                                ma_phieu = f"PH_{rec_id}"

                            ngay = str(r.get("ngay") or r.get("Ngày") or "").strip()
                            loai_phieu = str(r.get("loai_phieu") or r.get("Loại Phiếu") or "THU").strip().upper()
                            loai_quy = str(r.get("loai_quy") or r.get("Loại Quỹ") or "TIEN_MAT").strip().upper()
                            doi_tuong = str(r.get("doi_tuong") or r.get("Đối Tượng") or "").strip()
                            dien_thoai = str(r.get("dien_thoai") or r.get("Điện Thoại") or "").strip()
                            so_tien = _safe_float(r.get("so_tien") if r.get("so_tien") is not None else (r.get("Số Tiền (đ)") or r.get("Số Tiền")))
                            phieu_lien_quan = str(r.get("phieu_lien_quan") or r.get("Phiếu Liên Quan") or "").strip()
                            ghi_chu = str(r.get("ghi_chu") or r.get("Ghi Chú") or "").strip()

                            cursor.execute("""
                                INSERT OR REPLACE INTO SoQuy
                                (id, ma_phieu, ngay, loai_phieu, loai_quy, doi_tuong, dien_thoai, so_tien, phieu_lien_quan, ghi_chu)
                                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                            """, (
                                rec_id,
                                ma_phieu,
                                ngay,
                                loai_phieu,
                                loai_quy,
                                doi_tuong,
                                dien_thoai,
                                so_tien,
                                phieu_lien_quan,
                                ghi_chu
                            ))
                        counts["SoQuy"] = len(records)
                    except Exception as e:
                        counts["SoQuy_err"] = str(e)

                # 7. Đồng bộ Config
                if do_all or target in ("config", "cauhinh"):
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
        """Đẩy toàn bộ dữ liệu từ CSDL SQLite cục bộ lên Google Sheets."""
        counts = {}
        with self._lock:
            with self._get_connection() as conn:
                cursor = conn.cursor()

                # 1. Đẩy HangHoa
                try:
                    cursor.execute("SELECT id, ma_hang, ten_hang, danh_muc, don_vi_tinh, gia_nhap, ton_kho, chi_tiet_lo, ghi_chu FROM HangHoa")
                    rows = cursor.fetchall()
                    ws = sheets_service._sheet(SHEET_HANG_HOA)
                    header = ["ID", "Mã Hàng", "Tên Hàng Hóa", "Danh Mục", "ĐVT", "Giá Nhập (đ)", "SL", "Chi Tiết Lô Giá", "Ghi Chú"]
                    sheet_data = [header]
                    for r in rows:
                        sheet_data.append([
                            r["id"], r["ma_hang"], r["ten_hang"], r["danh_muc"],
                            r["don_vi_tinh"], r["gia_nhap"],
                            r["ton_kho"], r["chi_tiet_lo"], r["ghi_chu"]
                        ])
                    ws.clear()
                    ws.update("A1", sheet_data)
                    sheets_service.invalidate_records_cache(SHEET_HANG_HOA)
                    counts["HangHoa"] = len(rows)
                except Exception as e:
                    counts["HangHoa_err"] = str(e)

                # 2. Đẩy DoiTuong (Danh Mục Đối Tượng Doanh Nghiệp)
                try:
                    cursor.execute("SELECT id, ten, phan_loai, ma_so_thue, dia_chi, dien_thoai, email, ghi_chu FROM DoiTuong")
                    rows = cursor.fetchall()
                    ws = sheets_service._sheet(SHEET_DOI_TUONG)
                    header = ["Mã Đối Tượng", "Tên Đối Tượng", "Mã Số Thuế", "Điện Thoại", "Địa Chỉ", "Phân Loại", "Email", "Ghi Chú"]
                    sheet_data = [header]
                    for r in rows:
                        rid = str(r["id"] or "")
                        mst = str(r["ma_so_thue"] or "")
                        phone = str(r["dien_thoai"] or "")
                        rid_val = f"'{rid}" if (rid.isdigit() and rid.startswith("0")) else rid
                        mst_val = f"'{mst}" if (mst.isdigit() and mst.startswith("0")) else mst
                        phone_val = f"'{phone}" if (phone.isdigit() and phone.startswith("0")) else phone
                        sheet_data.append([
                            rid_val,
                            str(r["ten"] or ""),
                            mst_val,
                            phone_val,
                            str(r["dia_chi"] or ""),
                            str(r["phan_loai"] or "CA_HAI"),
                            str(r["email"] or ""),
                            str(r["ghi_chu"] or "")
                        ])
                    ws.clear()
                    ws.update("A1", sheet_data, value_input_option="USER_ENTERED")
                    sheets_service.invalidate_records_cache(SHEET_DOI_TUONG)
                    counts["DoiTuong"] = len(rows)
                except Exception as e:
                    counts["DoiTuong_err"] = str(e)

                # 4. Đẩy NhapHang
                try:
                    cursor.execute("SELECT id, so_phieu, ngay_nhap, ma_hang, ten_hang, so_luong, gia_nhap, thanh_tien, nha_cung_cap_id, ghi_chu, cong_no FROM NhapHang")
                    rows = cursor.fetchall()
                    ws = sheets_service._sheet(SHEET_NHAP_HANG)
                    header = ["ID", "Số Phiếu", "Ngày Nhập", "Mã Hàng", "Tên Hàng Hóa", "SL", "Giá Nhập (đ)", "Thành Tiền (đ)", "Nhà Cung Cấp", "Ghi Chú", "Công Nợ (đ)"]
                    sheet_data = [header]
                    for r in rows:
                        sheet_data.append([
                            r["id"], r["so_phieu"], r["ngay_nhap"], r["ma_hang"],
                            r["ten_hang"], r["so_luong"], r["gia_nhap"],
                            r["thanh_tien"], r["nha_cung_cap_id"], r["ghi_chu"],
                            r["cong_no"]
                        ])
                    ws.clear()
                    ws.update("A1", sheet_data)
                    sheets_service.invalidate_records_cache(SHEET_NHAP_HANG)
                    counts["NhapHang"] = len(rows)
                except Exception as e:
                    counts["NhapHang_err"] = str(e)

                # 5. Đẩy XuatHang
                try:
                    cursor.execute("SELECT id, so_phieu, ngay_xuat, ma_hang, ten_hang, so_luong, gia_ban, thanh_tien, khach_hang_id, ghi_chu, gia_von, loi_nhuan, tien_khach_no FROM XuatHang")
                    rows = cursor.fetchall()
                    ws = sheets_service._sheet(SHEET_XUAT_HANG)
                    header = ["ID", "Số Phiếu", "Ngày Xuất", "Mã Hàng", "Tên Hàng Hóa", "SL", "Giá Bán (đ)", "Thành Tiền (đ)", "Khách Hàng", "Ghi Chú", "Giá Vốn (đ)", "Lợi Nhuận (đ)", "Tiền Khách Nợ (đ)"]
                    sheet_data = [header]
                    for r in rows:
                        sheet_data.append([
                            r["id"], r["so_phieu"], r["ngay_xuat"], r["ma_hang"],
                            r["ten_hang"], r["so_luong"], r["gia_ban"],
                            r["thanh_tien"], r["khach_hang_id"], r["ghi_chu"],
                            r["gia_von"], r["loi_nhuan"], r["tien_khach_no"]
                        ])
                    ws.clear()
                    ws.update("A1", sheet_data)
                    sheets_service.invalidate_records_cache(SHEET_XUAT_HANG)
                    counts["XuatHang"] = len(rows)
                except Exception as e:
                    counts["XuatHang_err"] = str(e)

                # 6. Đẩy SoQuy
                try:
                    cursor.execute("SELECT id, ma_phieu, ngay, loai_phieu, loai_quy, doi_tuong, dien_thoai, so_tien, phieu_lien_quan, ghi_chu FROM SoQuy")
                    rows = cursor.fetchall()
                    ws = sheets_service._sheet(SHEET_SO_QUY)
                    header = ["ID", "Mã Phiếu", "Ngày", "Loại Phiếu", "Loại Quỹ", "Đối Tượng", "Điện Thoại", "Số Tiền (đ)", "Phiếu Liên Quan", "Ghi Chú"]
                    sheet_data = [header]
                    for r in rows:
                        sheet_data.append([
                            r["id"], r["ma_phieu"], r["ngay"], r["loai_phieu"],
                            r["loai_quy"], r["doi_tuong"], r["dien_thoai"],
                            r["so_tien"], r["phieu_lien_quan"], r["ghi_chu"]
                        ])
                    ws.clear()
                    ws.update("A1", sheet_data)
                    sheets_service.invalidate_records_cache(SHEET_SO_QUY)
                    counts["SoQuy"] = len(rows)
                except Exception as e:
                    counts["SoQuy_err"] = str(e)

        return counts


db_manager = DatabaseManager()
