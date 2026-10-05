import os
import json
import time
import datetime
import threading
import gspread
from google.oauth2.service_account import Credentials
from config import (
    GOOGLE_SERVICE_ACCOUNT_JSON,
    GOOGLE_SERVICE_ACCOUNT_FILE,
    SPREADSHEET_ID,
    SHEET_HANG_HOA, SHEET_NHAP_HANG, SHEET_XUAT_HANG,
    SHEET_NHA_CUNG_CAP, SHEET_KHACH_HANG, SHEET_CONFIG,
)

SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive",
]


def normalize_date_val(val) -> str:
    """Normalize Excel/Google Sheets serial date (e.g. 46298) or strings to YYYY-MM-DD."""
    if val is None or val == "":
        return ""
    if isinstance(val, (int, float)):
        # Excel/Google Sheets serial number (40000 - 60000 represents 2009 - 2064)
        if 20000 <= val <= 90000:
            base = datetime.date(1899, 12, 30)
            return (base + datetime.timedelta(days=int(val))).isoformat()
    s = str(val).strip()
    if s.isdigit() and 20000 <= int(s) <= 90000:
        base = datetime.date(1899, 12, 30)
        return (base + datetime.timedelta(days=int(s))).isoformat()
    return s


# ── Batch inventory helpers ───────────────────────────────────────────────────
def parse_batches_str(s: str, sl: int = 0, gia_nhap: float = 0.0) -> list[dict]:
    """
    Parse '10 x 200.000 đ | 20 x 250.000 đ' into:
    [{'so_luong': 10, 'gia_nhap': 200000.0}, {'so_luong': 20, 'gia_nhap': 250000.0}]
    """
    batches = []
    if s and isinstance(s, str) and s.strip():
        parts = s.split("|")
        for part in parts:
            part = part.strip()
            if "x" in part:
                try:
                    sl_part, gia_part = part.split("x", 1)
                    q = int("".join(filter(str.isdigit, sl_part)))
                    clean_gia = gia_part.replace("đ", "").replace("Đ", "").replace(",", "").replace(".", "").strip()
                    g = float(clean_gia) if clean_gia else 0.0
                    if q > 0:
                        batches.append({"so_luong": q, "gia_nhap": g})
                except Exception:
                    pass
    if not batches and sl > 0:
        batches.append({"so_luong": int(sl), "gia_nhap": float(gia_nhap)})
    elif len(batches) == 1 and sl > 0 and gia_nhap > 0:
        batches[0]["gia_nhap"] = float(gia_nhap)
    return batches


def format_batches_str(batches: list[dict]) -> str:
    """
    Format [{'so_luong': 10, 'gia_nhap': 200000.0}, ...] into:
    '10 x 200.000 đ | 20 x 250.000 đ'
    """
    parts = []
    for b in batches:
        q = int(b.get("so_luong", 0))
        g = float(b.get("gia_nhap", 0) or 0)
        if q > 0:
            g_str = f"{int(g):,}".replace(",", ".")
            parts.append(f"{q} x {g_str} đ")
    return " | ".join(parts)


def sanitize_cell_value(val):
    """Sanitize cell value to prevent Google Sheets Formula Injection (CSV injection)."""
    if isinstance(val, str) and val.startswith(("=", "+", "-", "@")):
        return "'" + val
    return val


# ── Key normalization map for Google Sheets Vietnamese/English headers ──────
COLUMN_ALIAS_MAP = {
    # HangHoa
    "id": "id",
    "mã hàng": "ma_hang",
    "ma_hang": "ma_hang",
    "tên hàng": "ten_hang",
    "tên hàng hóa": "ten_hang",
    "ten_hang": "ten_hang",
    "danh mục": "danh_muc",
    "danh_muc": "danh_muc",
    "đvt": "don_vi_tinh",
    "đơn vị tính": "don_vi_tinh",
    "don_vi_tinh": "don_vi_tinh",
    "giá nhập": "gia_nhap",
    "giá nhập (đ)": "gia_nhap",
    "gia_nhap": "gia_nhap",
    "giá bán": "gia_ban",
    "giá bán (đ)": "gia_ban",
    "gia_ban": "gia_ban",
    "sl": "ton_kho",
    "tồn kho": "ton_kho",
    "tồn kho (sl)": "ton_kho",
    "ton_kho": "ton_kho",
    "số lượng": "so_luong",
    "so_luong": "so_luong",
    "chi tiết lô giá": "chi_tiet_lo",
    "chi tiết lô": "chi_tiet_lo",
    "chi tiết tồn": "chi_tiet_lo",
    "chi_tiet_lo": "chi_tiet_lo",
    "ghi chú": "ghi_chu",
    "ghi_chu": "ghi_chu",
    # NhapHang & XuatHang
    "số phiếu": "so_phieu",
    "so_phieu": "so_phieu",
    "ngày nhập": "ngay_nhap",
    "ngay_nhap": "ngay_nhap",
    "ngày xuất": "ngay_xuat",
    "ngay_xuat": "ngay_xuat",
    "thành tiền": "thanh_tien",
    "thành tiền (đ)": "thanh_tien",
    "thanh_tien": "thanh_tien",
    "nhà cung cấp": "nha_cung_cap_id",
    "nhà cung cấp id": "nha_cung_cap_id",
    "nha_cung_cap_id": "nha_cung_cap_id",
    "khách hàng": "khach_hang_id",
    "khách hàng id": "khach_hang_id",
    "khach_hang_id": "khach_hang_id",
    "giá vốn": "gia_von",
    "giá vốn (đ)": "gia_von",
    "gia_von": "gia_von",
    "lợi nhuận": "loi_nhuan",
    "lợi nhuận (đ)": "loi_nhuan",
    "loi_nhuan": "loi_nhuan",
    # NhaCungCap & KhachHang
    "tên nhà cung cấp": "ten_ncc",
    "tên ncc": "ten_ncc",
    "ten_ncc": "ten_ncc",
    "tên khách hàng": "ten_kh",
    "tên kh": "ten_kh",
    "ten_kh": "ten_kh",
    "địa chỉ": "dia_chi",
    "dia_chi": "dia_chi",
    "số điện thoại": "dien_thoai",
    "điện thoại": "dien_thoai",
    "dien_thoai": "dien_thoai",
    "sđt": "dien_thoai",
    "email": "email",
    # Config
    "key": "key",
    "value": "value",
}


class SheetsService:
    """Singleton service for Google Sheets CRUD operations."""

    _instance = None
    _lock = threading.Lock()

    def __new__(cls):
        with cls._lock:
            if cls._instance is None:
                cls._instance = super().__new__(cls)
                cls._instance._initialized = False
                cls._instance._sheet_cache = {}
                cls._instance._records_cache = {}
                cls._instance._CACHE_TTL_SECONDS = 15
            return cls._instance

    def initialize(self):
        """Initialize gspread client and open spreadsheet."""
        if self._initialized:
            return

        creds = None
        if GOOGLE_SERVICE_ACCOUNT_JSON and GOOGLE_SERVICE_ACCOUNT_JSON.strip():
            info = json.loads(GOOGLE_SERVICE_ACCOUNT_JSON)
            creds = Credentials.from_service_account_info(info, scopes=SCOPES)
        elif os.path.exists(GOOGLE_SERVICE_ACCOUNT_FILE):
            creds = Credentials.from_service_account_file(GOOGLE_SERVICE_ACCOUNT_FILE, scopes=SCOPES)
        else:
            raise RuntimeError(
                "Google credentials not found. Set GOOGLE_SERVICE_ACCOUNT_JSON or GOOGLE_SERVICE_ACCOUNT_FILE."
            )

        self._client = gspread.authorize(creds)
        self._spreadsheet = self._client.open_by_key(SPREADSHEET_ID)
        self._sheet_cache: dict[str, gspread.Worksheet] = {}
        # Bộ đệm dữ liệu thông minh TTL (Time-To-Live) chống vượt hạn ngạch 429 Google Sheets API
        self._records_cache: dict[str, tuple[float, list[dict]]] = {}
        self._CACHE_TTL_SECONDS = 15  # Tái sử dụng dữ liệu trong 15s nếu không có thay đổi
        self._initialized = True

    def _sheet(self, name: str) -> gspread.Worksheet:
        if name not in self._sheet_cache:
            self._sheet_cache[name] = self._spreadsheet.worksheet(name)
        return self._sheet_cache[name]

    def _invalidate_cache(self, name: str):
        self._sheet_cache.pop(name, None)
        self.invalidate_records_cache(name)

    def invalidate_records_cache(self, sheet_name: str | None = None):
        """Xóa cache bộ nhớ khi có thao tác ghi mới vào Google Sheet."""
        if sheet_name:
            self._records_cache.pop(sheet_name, None)
        else:
            self._records_cache.clear()

    # ── Core CRUD ────────────────────────────────────────────────────────────

    def get_all_records(self, sheet_name: str, force_refresh: bool = False) -> list[dict]:
        """Return all rows as list of dicts with normalized keys with smart TTL caching and 429 backoff."""
        now = time.time()
        if not force_refresh and sheet_name in self._records_cache:
            cache_time, cached_data = self._records_cache[sheet_name]
            if now - cache_time < self._CACHE_TTL_SECONDS:
                return [dict(d) for d in cached_data]

        max_retries = 3
        delay = 1.5
        for attempt in range(max_retries):
            try:
                ws = self._sheet(sheet_name)
                raw_records = ws.get_all_records(empty2zero=False, default_blank="", value_render_option="UNFORMATTED_VALUE")
                normalized = []
                for r in raw_records:
                    item = {}
                    for k, v in r.items():
                        item[k] = v
                        clean_k = str(k).strip().lower()
                        target_k = COLUMN_ALIAS_MAP.get(clean_k)
                        if target_k:
                            item[target_k] = v

                    # Đồng bộ số lượng & tồn kho
                    if "ton_kho" in item and "so_luong" not in item:
                        item["so_luong"] = item["ton_kho"]
                    elif "so_luong" in item and "ton_kho" not in item:
                        item["ton_kho"] = item["so_luong"]

                    # Đồng bộ tên nhà cung cấp / đối tác
                    if "nha_cung_cap_id" in item:
                        val = item["nha_cung_cap_id"]
                        item["ten_ncc"] = val
                        item["nha_cung_cap"] = val
                    elif "ten_ncc" in item:
                        val = item["ten_ncc"]
                        item["nha_cung_cap_id"] = val
                        item["nha_cung_cap"] = val

                    # Đồng bộ tên khách hàng / đối tác
                    if "khach_hang_id" in item:
                        val = item["khach_hang_id"]
                        item["ten_kh"] = val
                        item["khach_hang"] = val
                    elif "ten_kh" in item:
                        val = item["ten_kh"]
                        item["khach_hang_id"] = val
                        item["khach_hang"] = val

                    # Chuẩn hóa ngày nếu là số serial Excel/Sheets (như 46298 -> '2026-10-03')
                    for dk in ("ngay_nhap", "ngay_xuat", "ngay", "Ngày Nhập", "Ngày Xuất", "Ngày"):
                        if dk in item:
                            item[dk] = normalize_date_val(item[dk])

                    normalized.append(item)

                # Lưu vào cache TTL
                self._records_cache[sheet_name] = (time.time(), normalized)
                return [dict(d) for d in normalized]

            except Exception as e:
                err_msg = str(e)
                # Tự động chờ và thử lại nếu chạm hạn ngạch 429 của Google API
                if ("429" in err_msg or "Quota exceeded" in err_msg) and attempt < max_retries - 1:
                    time.sleep(delay)
                    delay *= 2
                    continue
                # Nếu có cache cũ và gặp lỗi, trả về cache cũ dự phòng thay vì crash ứng dụng
                if sheet_name in self._records_cache:
                    return [dict(d) for d in self._records_cache[sheet_name][1]]
                raise RuntimeError(f"Lỗi khi đọc sheet {sheet_name}: {err_msg}")

    def get_all_values(self, sheet_name: str) -> list[list]:
        """Return all rows as list of lists including header."""
        try:
            ws = self._sheet(sheet_name)
            return ws.get_all_values()
        except Exception as e:
            raise RuntimeError(f"Lỗi khi đọc sheet {sheet_name}: {str(e)}")

    def append_row(self, sheet_name: str, row: list) -> int:
        """Append a row and return the new row number (1-based)."""
        try:
            ws = self._sheet(sheet_name)
            clean_row = [sanitize_cell_value(c) for c in row]
            result = ws.append_row(clean_row, value_input_option="USER_ENTERED")
            self.invalidate_records_cache(sheet_name)
            # Parse updated range to get row number
            updated_range = result.get("updates", {}).get("updatedRange", "")
            if updated_range:
                # e.g. "HangHoa!A5:I5"
                range_part = updated_range.split("!")[-1]
                row_num = int("".join(filter(str.isdigit, range_part.split(":")[0])))
                return row_num
            # Fallback: get last row
            all_values = ws.get_all_values()
            return len(all_values)
        except Exception as e:
            raise RuntimeError(f"Lỗi khi thêm dòng vào sheet {sheet_name}: {str(e)}")

    def update_row(self, sheet_name: str, row_num: int, row: list):
        """Update all cells in a row (row_num is 1-based)."""
        try:
            ws = self._sheet(sheet_name)
            clean_row = [sanitize_cell_value(c) for c in row]
            # Build A1 notation range for the whole row
            num_cols = len(clean_row)
            end_col_letter = self._col_letter(num_cols)
            cell_range = f"A{row_num}:{end_col_letter}{row_num}"
            ws.update(cell_range, [clean_row], value_input_option="USER_ENTERED")
            self.invalidate_records_cache(sheet_name)
        except Exception as e:
            raise RuntimeError(f"Lỗi khi cập nhật dòng {row_num} trong sheet {sheet_name}: {str(e)}")

    def delete_row(self, sheet_name: str, row_num: int):
        """Delete a row by 1-based row number."""
        try:
            ws = self._sheet(sheet_name)
            ws.delete_rows(row_num)
            self.invalidate_records_cache(sheet_name)
        except Exception as e:
            raise RuntimeError(f"Lỗi khi xóa dòng {row_num} trong sheet {sheet_name}: {str(e)}")

    def find_row(self, sheet_name: str, col: int, value: str) -> int:
        """Find row number (1-based) by column index (1-based) and value. Returns -1 if not found."""
        try:
            ws = self._sheet(sheet_name)
            all_values = ws.get_all_values()
            col_idx = col - 1  # convert to 0-based
            for i, row in enumerate(all_values):
                if i == 0:
                    continue  # skip header
                if col_idx < len(row) and str(row[col_idx]) == str(value):
                    return i + 1  # 1-based
            return -1
        except Exception as e:
            raise RuntimeError(f"Lỗi khi tìm kiếm trong sheet {sheet_name}: {str(e)}")

    def update_cell(self, sheet_name: str, row: int, col: int, value):
        """Update a single cell. row and col are 1-based."""
        try:
            ws = self._sheet(sheet_name)
            ws.update_cell(row, col, sanitize_cell_value(value))
            self.invalidate_records_cache(sheet_name)
        except Exception as e:
            raise RuntimeError(f"Lỗi khi cập nhật ô ({row},{col}) trong sheet {sheet_name}: {str(e)}")

    def get_row(self, sheet_name: str, row_num: int) -> list:
        """Get all values in a specific row (1-based)."""
        try:
            ws = self._sheet(sheet_name)
            return ws.row_values(row_num)
        except Exception as e:
            raise RuntimeError(f"Lỗi khi đọc dòng {row_num} trong sheet {sheet_name}: {str(e)}")

    # ── Helpers ───────────────────────────────────────────────────────────────

    @staticmethod
    def _col_letter(n: int) -> str:
        """Convert column number to letter (1=A, 26=Z, 27=AA, ...)."""
        result = ""
        while n > 0:
            n, remainder = divmod(n - 1, 26)
            result = chr(65 + remainder) + result
        return result

    @staticmethod
    def new_id() -> str:
        """Generate a timestamp-based unique ID."""
        return str(int(time.time() * 1000))

    # ── Sheet-specific helpers ────────────────────────────────────────────────

    def find_hang_hoa_by_ma(self, ma_hang: str) -> tuple[int, dict | None]:
        """Find a HangHoa record by ma_hang. Returns (row_num, record) or (-1, None)."""
        records = self.get_all_records(SHEET_HANG_HOA)
        for i, rec in enumerate(records):
            if str(rec.get("ma_hang", "")) == str(ma_hang):
                return i + 2, rec  # +2 because header is row 1
        return -1, None

    def find_hang_hoa_by_id(self, record_id: str) -> tuple[int, dict | None]:
        """Find a HangHoa record by id. Returns (row_num, record) or (-1, None)."""
        records = self.get_all_records(SHEET_HANG_HOA)
        for i, rec in enumerate(records):
            if str(rec.get("id", "")) == str(record_id):
                return i + 2, rec
        return -1, None

    def update_ton_kho(self, ma_hang: str, delta: int):
        """Add delta to ton_kho for a product (can be negative for exports)."""
        row_num, rec = self.find_hang_hoa_by_ma(ma_hang)
        if row_num == -1:
            raise ValueError(f"Không tìm thấy hàng hóa với mã {ma_hang}")
        current = int(rec.get("ton_kho", 0) or 0)
        new_value = current + delta
        # ton_kho is column 8 (1-based)
        self.update_cell(SHEET_HANG_HOA, row_num, 8, new_value)
        return new_value

    def nhap_hang_batch(self, ma_hang: str, so_luong: int, gia_nhap: float) -> tuple[int, str]:
        """
        Thêm số lượng và đơn giá nhập vào các lô tồn kho của sản phẩm.
        Cập nhật Google Sheet:
          - Cột 6: Giá Nhập (đơn giá mới nhất)
          - Cột 8: Tổng SL tồn
          - Cột 9: Chi Tiết Lô Giá (VD: '10 x 200.000 đ | 20 x 250.000 đ')
        """
        row_num, rec = self.find_hang_hoa_by_ma(ma_hang)
        if row_num == -1:
            raise ValueError(f"Không tìm thấy hàng hóa với mã {ma_hang}")

        cur_sl = int(rec.get("ton_kho", 0) or 0)
        cur_lo_str = str(rec.get("chi_tiet_lo", "") or "")
        cur_gia = float(rec.get("gia_nhap", 0) or 0)

        batches = parse_batches_str(cur_lo_str, cur_sl, cur_gia)

        # Nếu cùng giá nhập (chênh lệch < 1đ), gộp chung vào lô đó
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

        # Cập nhật các ô tương ứng trên Sheet HangHoa
        self.update_cell(SHEET_HANG_HOA, row_num, 6, gia_nhap)      # Cột 6: Giá nhập mới nhất
        self.update_cell(SHEET_HANG_HOA, row_num, 8, new_total_sl)  # Cột 8: SL
        self.update_cell(SHEET_HANG_HOA, row_num, 9, new_lo_str)    # Cột 9: Chi Tiết Lô Giá

        return new_total_sl, new_lo_str

    def xuat_hang_batch(self, ma_hang: str, so_luong: int) -> tuple[int, str, float]:
        """
        Trừ số lượng tồn theo nguyên tắc FIFO (lô nhập cũ xuất trước).
        Cập nhật Google Sheet:
          - Cột 8: Tổng SL tồn còn lại
          - Cột 9: Chi Tiết Lô Giá còn lại
        Trả về: (tổng_sl_mới, chuỗi_lô_mới, tổng_giá_vốn_thực_tế)
        """
        row_num, rec = self.find_hang_hoa_by_ma(ma_hang)
        if row_num == -1:
            raise ValueError(f"Không tìm thấy hàng hóa với mã {ma_hang}")

        cur_sl = int(rec.get("ton_kho", 0) or 0)
        if so_luong > cur_sl:
            raise ValueError(f"Hàng {ma_hang} không đủ tồn kho (còn {cur_sl}, yêu cầu xuất {so_luong})")

        cur_lo_str = str(rec.get("chi_tiet_lo", "") or "")
        cur_gia = float(rec.get("gia_nhap", 0) or 0)

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

        # Cập nhật Sheet HangHoa
        self.update_cell(SHEET_HANG_HOA, row_num, 8, new_total_sl)  # Cột 8: SL
        self.update_cell(SHEET_HANG_HOA, row_num, 9, new_lo_str)    # Cột 9: Chi Tiết Lô Giá

        return new_total_sl, new_lo_str, total_cost

    def get_config(self, key: str) -> str | None:
        """Get a config value by key from Config sheet."""
        records = self.get_all_records(SHEET_CONFIG)
        for rec in records:
            if rec.get("key") == key:
                return str(rec.get("value", ""))
        return None

    def set_config(self, key: str, value: str):
        """Set a config value (upsert)."""
        records = self.get_all_records(SHEET_CONFIG)
        for i, rec in enumerate(records):
            if rec.get("key") == key:
                row_num = i + 2
                self.update_row(SHEET_CONFIG, row_num, [key, value])
                return
        # Not found, append
        self.append_row(SHEET_CONFIG, [key, value])

    def generate_ma_hang(self) -> str:
        """Generate next product code like HH001, HH002..."""
        records = self.get_all_records(SHEET_HANG_HOA)
        max_num = 0
        for rec in records:
            ma = str(rec.get("ma_hang", ""))
            if ma.startswith("HH") and ma[2:].isdigit():
                max_num = max(max_num, int(ma[2:]))
        return f"HH{max_num + 1:03d}"

    def generate_so_phieu_nhap(self, date_str: str) -> str:
        """Generate import receipt number: NH{YYYYMMDD}{seq:04d}."""
        date_compact = date_str.replace("-", "")
        records = self.get_all_records(SHEET_NHAP_HANG)
        prefix = f"NH{date_compact}"
        max_seq = 0
        for rec in records:
            sp = str(rec.get("so_phieu", ""))
            if sp.startswith(prefix) and sp[len(prefix):].isdigit():
                max_seq = max(max_seq, int(sp[len(prefix):]))
        return f"{prefix}{max_seq + 1:04d}"

    def generate_so_phieu_xuat(self, date_str: str) -> str:
        """Generate export receipt number: XH{YYYYMMDD}{seq:04d}."""
        date_compact = date_str.replace("-", "")
        records = self.get_all_records(SHEET_XUAT_HANG)
        prefix = f"XH{date_compact}"
        max_seq = 0
        for rec in records:
            sp = str(rec.get("so_phieu", ""))
            if sp.startswith(prefix) and sp[len(prefix):].isdigit():
                max_seq = max(max_seq, int(sp[len(prefix):]))
        return f"{prefix}{max_seq + 1:04d}"


# Singleton instance
sheets_service = SheetsService()
