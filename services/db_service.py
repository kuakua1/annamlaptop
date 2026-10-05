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
                    ghi_chu TEXT,
                    gia_von REAL DEFAULT 0,
                    loi_nhuan REAL DEFAULT 0
                )
            """)

            # Kiểm tra và thêm cột gia_von, loi_nhuan nếu bảng XuatHang cũ chưa có
            cursor.execute("PRAGMA table_info(XuatHang)")
            xuat_cols = [c["name"] for c in cursor.fetchall()]
            if "gia_von" not in xuat_cols:
                cursor.execute("ALTER TABLE XuatHang ADD COLUMN gia_von REAL DEFAULT 0")
            if "loi_nhuan" not in xuat_cols:
                cursor.execute("ALTER TABLE XuatHang ADD COLUMN loi_nhuan REAL DEFAULT 0")

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
                                sheets_service.update_cell(sheet_name, row_num, 8, payload["ton_kho"])
                                sheets_service.update_cell(sheet_name, row_num, 9, payload["chi_tiet_lo"])
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

    def nhap_hang_batch_local(self, ma_hang: str, so_luong: int, gia_nhap: float) -> tuple[int, str]:
        """Cập nhật tồn kho theo lô trong SQLite."""
        with self._lock:
            with self._get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("SELECT ton_kho, chi_tiet_lo, gia_nhap FROM HangHoa WHERE ma_hang = ?", (ma_hang,))
                row = cursor.fetchone()
                if not row:
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
                conn.commit()

        # Enqueue cập nhật lô giá & tồn kho lên Sheet HangHoa
        self._enqueue_task("UPDATE_HANG_HOA_STOCK", SHEET_HANG_HOA, {
            "ma_hang": ma_hang,
            "ton_kho": new_total_sl,
            "chi_tiet_lo": new_lo_str,
            "gia_nhap": gia_nhap
        })
        return new_total_sl, new_lo_str

    def create_nhap_hang_transaction(self, so_phieu: str, ngay_nhap: str, ncc_save_ref: str, ghi_chu: str, items: list[dict]) -> list[dict]:
        """Lưu toàn bộ dòng phiếu nhập vào SQLite và enqueue lên Sheet."""
        created_rows = []
        with self._lock:
            with self._get_connection() as conn:
                cursor = conn.cursor()
                for it in items:
                    new_id = str(int(time.time() * 1000)) + str(len(created_rows))
                    thanh_tien = it["so_luong"] * it["gia_nhap"]
                    cursor.execute("""
                        INSERT INTO NhapHang (id, so_phieu, ngay_nhap, ma_hang, ten_hang, so_luong, gia_nhap, thanh_tien, nha_cung_cap_id, ghi_chu)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """, (
                        new_id, so_phieu, ngay_nhap, it["ma_hang"], it["ten_hang"],
                        it["so_luong"], it["gia_nhap"], thanh_tien, ncc_save_ref, ghi_chu
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
                        "ghi_chu": ghi_chu
                    })
                conn.commit()

        # Cập nhật tồn kho từng món & enqueue lên Google Sheet
        for it in items:
            self.nhap_hang_batch_local(it["ma_hang"], it["so_luong"], it["gia_nhap"])

        for r in created_rows:
            sheet_row = [
                r["id"], r["so_phieu"], r["ngay_nhap"], r["ma_hang"], r["ten_hang"],
                r["so_luong"], r["gia_nhap"], r["thanh_tien"], r["nha_cung_cap_id"], r["ghi_chu"]
            ]
            self._enqueue_task("APPEND_ROW", SHEET_NHAP_HANG, {"row": sheet_row})

        return created_rows

    def revert_nhap_hang_batch_local(self, ma_hang: str, so_luong: int, gia_nhap: float) -> tuple[int, str]:
        """Trừ bớt số lượng đã nhập ra khỏi lô và tồn kho của sản phẩm trong SQLite."""
        with self._lock:
            with self._get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("SELECT ton_kho, chi_tiet_lo, gia_nhap FROM HangHoa WHERE ma_hang = ?", (ma_hang,))
                row = cursor.fetchone()
                if not row:
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
                conn.commit()

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

                cursor.execute("DELETE FROM NhapHang WHERE so_phieu = ?", (so_phieu,))
                conn.commit()

        # Hoàn trả tồn kho từng món
        for it in items:
            sl = int(it.get("so_luong", 0) or 0)
            gia = float(it.get("gia_nhap", 0) or 0)
            ma = str(it.get("ma_hang", ""))
            if sl > 0 and ma:
                self.revert_nhap_hang_batch_local(ma, sl, gia)

        # Xóa trên Google Sheet
        self._enqueue_task("DELETE_RECEIPT_ROWS", SHEET_NHAP_HANG, {"so_phieu": so_phieu})
        return True

    def update_nhap_hang_receipt(self, so_phieu: str, ngay_nhap: str, ncc_save_ref: str, ghi_chu: str, items: list[dict]) -> list[dict]:
        """Cập nhật phiếu nhập kho: hoàn trả kho cũ, nạp kho mới, cập nhật NhapHang."""
        # 1. Lấy và hoàn trả các món cũ
        with self._lock:
            with self._get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("SELECT * FROM NhapHang WHERE so_phieu = ?", (so_phieu,))
                old_rows = cursor.fetchall()
                old_items = [dict(r) for r in old_rows]

                cursor.execute("DELETE FROM NhapHang WHERE so_phieu = ?", (so_phieu,))
                conn.commit()

        for it in old_items:
            sl = int(it.get("so_luong", 0) or 0)
            gia = float(it.get("gia_nhap", 0) or 0)
            ma = str(it.get("ma_hang", ""))
            if sl > 0 and ma:
                self.revert_nhap_hang_batch_local(ma, sl, gia)

        # 2. Xóa các dòng cũ trên Google Sheet
        self._enqueue_task("DELETE_RECEIPT_ROWS", SHEET_NHAP_HANG, {"so_phieu": so_phieu})

        # 3. Tạo lại phiếu với các món mới (giữ nguyên so_phieu)
        created_rows = []
        with self._lock:
            with self._get_connection() as conn:
                cursor = conn.cursor()
                for it in items:
                    new_id = str(int(time.time() * 1000)) + str(len(created_rows))
                    thanh_tien = it["so_luong"] * it["gia_nhap"]
                    cursor.execute("""
                        INSERT INTO NhapHang (id, so_phieu, ngay_nhap, ma_hang, ten_hang, so_luong, gia_nhap, thanh_tien, nha_cung_cap_id, ghi_chu)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """, (
                        new_id, so_phieu, ngay_nhap, it["ma_hang"], it["ten_hang"],
                        it["so_luong"], it["gia_nhap"], thanh_tien, ncc_save_ref, ghi_chu
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
                        "ghi_chu": ghi_chu
                    })
                conn.commit()

        # Cập nhật tồn kho mới & enqueue Google Sheets
        for it in items:
            self.nhap_hang_batch_local(it["ma_hang"], it["so_luong"], it["gia_nhap"])

        for r in created_rows:
            sheet_row = [
                r["id"], r["so_phieu"], r["ngay_nhap"], r["ma_hang"], r["ten_hang"],
                r["so_luong"], r["gia_nhap"], r["thanh_tien"], r["nha_cung_cap_id"], r["ghi_chu"]
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

    def xuat_hang_batch_local(self, ma_hang: str, so_luong: int) -> tuple[int, str, float]:
        """Trừ tồn kho FIFO trong SQLite và tính chính xác giá vốn (COGS)."""
        with self._lock:
            with self._get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("SELECT ton_kho, chi_tiet_lo, gia_nhap FROM HangHoa WHERE ma_hang = ?", (ma_hang,))
                row = cursor.fetchone()
                if not row:
                    raise ValueError(f"Không tìm thấy hàng hóa mã {ma_hang}")
                cur_sl = int(row["ton_kho"] or 0)
                if so_luong > cur_sl:
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
                conn.commit()

        # Enqueue cập nhật lô giá & tồn kho lên Sheet HangHoa
        self._enqueue_task("UPDATE_HANG_HOA_STOCK", SHEET_HANG_HOA, {
            "ma_hang": ma_hang,
            "ton_kho": new_total_sl,
            "chi_tiet_lo": new_lo_str
        })
        return new_total_sl, new_lo_str, total_cost

    def create_xuat_hang_transaction(self, so_phieu: str, ngay_xuat: str, kh_save_ref: str, ghi_chu: str, items: list[dict]) -> list[dict]:
        """Tạo phiếu xuất hàng: trừ FIFO trong SQLite và enqueue lên Sheet."""
        created_rows = []
        with self._lock:
            with self._get_connection() as conn:
                cursor = conn.cursor()
                for it in items:
                    new_id = str(int(time.time() * 1000)) + str(len(created_rows))
                    thanh_tien = it["so_luong"] * it["gia_ban"]
                    # Tính FIFO trực tiếp trong SQLite
                    _, _, gia_von = self.xuat_hang_batch_local(it["ma_hang"], it["so_luong"])
                    loi_nhuan = float(thanh_tien) - float(gia_von)

                    cursor.execute("""
                        INSERT INTO XuatHang (id, so_phieu, ngay_xuat, ma_hang, ten_hang, so_luong, gia_ban, thanh_tien, khach_hang_id, ghi_chu, gia_von, loi_nhuan)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """, (
                        new_id, so_phieu, ngay_xuat, it["ma_hang"], it["ten_hang"],
                        it["so_luong"], it["gia_ban"], thanh_tien, kh_save_ref, ghi_chu, gia_von, loi_nhuan
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
                        "loi_nhuan": loi_nhuan
                    })
                conn.commit()

        # Enqueue từng dòng phiếu xuất lên Google Sheet
        for r in created_rows:
            sheet_row = [
                r["id"], r["so_phieu"], r["ngay_xuat"], r["ma_hang"], r["ten_hang"],
                r["so_luong"], r["gia_ban"], r["thanh_tien"], r["khach_hang_id"],
                r["ghi_chu"], r["gia_von"], r["loi_nhuan"]
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
                    _, _, gia_von = self.xuat_hang_batch_local(it["ma_hang"], it["so_luong"])
                    loi_nhuan = float(thanh_tien) - float(gia_von)

                    cursor.execute("""
                        INSERT INTO XuatHang (id, so_phieu, ngay_xuat, ma_hang, ten_hang, so_luong, gia_ban, thanh_tien, khach_hang_id, ghi_chu, gia_von, loi_nhuan)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """, (
                        new_id, so_phieu, ngay_xuat, it["ma_hang"], it["ten_hang"],
                        it["so_luong"], it["gia_ban"], thanh_tien, kh_save_ref, ghi_chu, gia_von, loi_nhuan
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
                        "loi_nhuan": loi_nhuan
                    })
                conn.commit()

        for r in created_rows:
            sheet_row = [
                r["id"], r["so_phieu"], r["ngay_xuat"], r["ma_hang"], r["ten_hang"],
                r["so_luong"], r["gia_ban"], r["thanh_tien"], r["khach_hang_id"],
                r["ghi_chu"], r["gia_von"], r["loi_nhuan"]
            ]
            self._enqueue_task("APPEND_ROW", SHEET_XUAT_HANG, {"row": sheet_row})

        return created_rows


    # ── 6. Config CRUD ────────────────────────────────────────────────────────

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

                # 2. Đồng bộ Khách Hàng
                if do_all or target in ("khachhang", "kh"):
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
                if do_all or target in ("nhacungcap", "ncc"):
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
                if do_all or target in ("nhaphang", "nhap"):
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
                if do_all or target in ("xuathang", "xuat"):
                    try:
                        records = sheets_service.get_all_records(SHEET_XUAT_HANG, force_refresh=True)
                        cursor.execute("DELETE FROM XuatHang")
                        for r in records:
                            cursor.execute("""
                                INSERT OR REPLACE INTO XuatHang 
                                (id, so_phieu, ngay_xuat, ma_hang, ten_hang, so_luong, gia_ban, thanh_tien, khach_hang_id, dia_chi, dien_thoai, ghi_chu, gia_von, loi_nhuan)
                                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
                                str(r.get("ghi_chu") or ""),
                                _safe_float(r.get("gia_von")),
                                _safe_float(r.get("loi_nhuan"))
                            ))
                        counts["XuatHang"] = len(records)
                    except Exception as e:
                        counts["XuatHang_err"] = str(e)

                # 6. Đồng bộ Config
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

                # 2. Đẩy KhachHang
                try:
                    cursor.execute("SELECT id, ten_kh, dia_chi, dien_thoai, email, ghi_chu FROM KhachHang")
                    rows = cursor.fetchall()
                    ws = sheets_service._sheet(SHEET_KHACH_HANG)
                    header = ["ID", "Tên Khách Hàng", "Địa Chỉ", "Số Điện Thoại", "Email", "Ghi Chú"]
                    sheet_data = [header]
                    for r in rows:
                        sheet_data.append([
                            r["id"], r["ten_kh"], r["dia_chi"],
                            r["dien_thoai"], r["email"], r["ghi_chu"]
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
                            r["id"], r["ten_ncc"], r["dia_chi"],
                            r["dien_thoai"], r["email"], r["ghi_chu"]
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
                            r["id"], r["so_phieu"], r["ngay_nhap"], r["ma_hang"],
                            r["ten_hang"], r["so_luong"], r["gia_nhap"],
                            r["thanh_tien"], r["nha_cung_cap_id"], r["ghi_chu"]
                        ])
                    ws.clear()
                    ws.update("A1", sheet_data)
                    sheets_service.invalidate_records_cache(SHEET_NHAP_HANG)
                    counts["NhapHang"] = len(rows)
                except Exception as e:
                    counts["NhapHang_err"] = str(e)

                # 5. Đẩy XuatHang
                try:
                    cursor.execute("SELECT id, so_phieu, ngay_xuat, ma_hang, ten_hang, so_luong, gia_ban, thanh_tien, khach_hang_id, ghi_chu, gia_von, loi_nhuan FROM XuatHang")
                    rows = cursor.fetchall()
                    ws = sheets_service._sheet(SHEET_XUAT_HANG)
                    header = ["ID", "Số Phiếu", "Ngày Xuất", "Mã Hàng", "Tên Hàng Hóa", "SL", "Giá Bán (đ)", "Thành Tiền (đ)", "Khách Hàng", "Ghi Chú", "Giá Vốn (đ)", "Lợi Nhuận (đ)"]
                    sheet_data = [header]
                    for r in rows:
                        sheet_data.append([
                            r["id"], r["so_phieu"], r["ngay_xuat"], r["ma_hang"],
                            r["ten_hang"], r["so_luong"], r["gia_ban"],
                            r["thanh_tien"], r["khach_hang_id"], r["ghi_chu"],
                            r["gia_von"], r["loi_nhuan"]
                        ])
                    ws.clear()
                    ws.update("A1", sheet_data)
                    sheets_service.invalidate_records_cache(SHEET_XUAT_HANG)
                    counts["XuatHang"] = len(rows)
                except Exception as e:
                    counts["XuatHang_err"] = str(e)

        return counts


db_manager = DatabaseManager()
