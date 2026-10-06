from pydantic import BaseModel
from typing import Optional, List
from datetime import date


# ─── Auth ─────────────────────────────────────────────────────────────────────

class LoginRequest(BaseModel):
    username: str
    password: str


# ─── HangHoa (Products) ───────────────────────────────────────────────────────

class HangHoaCreate(BaseModel):
    ten_hang: str
    danh_muc: Optional[str] = ""
    don_vi_tinh: Optional[str] = "Cái"
    gia_nhap: float = 0
    gia_ban: Optional[float] = 0
    ton_kho: int = 0
    chi_tiet_lo: Optional[str] = ""
    batches: Optional[List[dict]] = None
    ghi_chu: Optional[str] = ""


class HangHoaUpdate(BaseModel):
    ten_hang: Optional[str] = None
    danh_muc: Optional[str] = None
    don_vi_tinh: Optional[str] = None
    gia_nhap: Optional[float] = None
    gia_ban: Optional[float] = None
    ton_kho: Optional[int] = None
    chi_tiet_lo: Optional[str] = None
    batches: Optional[List[dict]] = None
    ghi_chu: Optional[str] = None


class HangHoa(BaseModel):
    id: str
    ma_hang: str
    ten_hang: str
    danh_muc: str
    don_vi_tinh: str
    gia_nhap: float
    gia_ban: Optional[float] = 0
    ton_kho: int
    chi_tiet_lo: Optional[str] = ""
    ghi_chu: str
    row_num: Optional[int] = None


# ─── NhaCungCap (Suppliers) ───────────────────────────────────────────────────

class NhaCungCapCreate(BaseModel):
    ten_ncc: str
    dia_chi: Optional[str] = ""
    dien_thoai: Optional[str] = ""
    email: Optional[str] = ""
    ghi_chu: Optional[str] = ""


class NhaCungCapUpdate(BaseModel):
    ten_ncc: Optional[str] = None
    dia_chi: Optional[str] = None
    dien_thoai: Optional[str] = None
    email: Optional[str] = None
    ghi_chu: Optional[str] = None


class NhaCungCap(BaseModel):
    id: str
    ten_ncc: str
    dia_chi: str
    dien_thoai: str
    email: str
    ghi_chu: str
    row_num: Optional[int] = None


# ─── KhachHang (Customers) ────────────────────────────────────────────────────

class KhachHangCreate(BaseModel):
    ten_kh: str
    dia_chi: Optional[str] = ""
    dien_thoai: Optional[str] = ""
    email: Optional[str] = ""
    ghi_chu: Optional[str] = ""


class KhachHangUpdate(BaseModel):
    ten_kh: Optional[str] = None
    dia_chi: Optional[str] = None
    dien_thoai: Optional[str] = None
    email: Optional[str] = None
    ghi_chu: Optional[str] = None


class KhachHang(BaseModel):
    id: str
    ten_kh: str
    dia_chi: str
    dien_thoai: str
    email: str
    ghi_chu: str
    row_num: Optional[int] = None


# ─── DoiTuong (Unified Partners: Suppliers & Customers) ───────────────────────

class DoiTuongCreate(BaseModel):
    ten: str
    phan_loai: Optional[str] = "CA_HAI"  # 'CA_HAI', 'KHACH_HANG', 'NHA_CUNG_CAP'
    ma_so_thue: Optional[str] = ""
    dia_chi: Optional[str] = ""
    dien_thoai: Optional[str] = ""
    email: Optional[str] = ""
    ghi_chu: Optional[str] = ""


class DoiTuongUpdate(BaseModel):
    ten: Optional[str] = None
    phan_loai: Optional[str] = None
    ma_so_thue: Optional[str] = None
    dia_chi: Optional[str] = None
    dien_thoai: Optional[str] = None
    email: Optional[str] = None
    ghi_chu: Optional[str] = None


class DoiTuong(BaseModel):
    id: str
    ten: str
    phan_loai: str = "CA_HAI"
    ma_so_thue: str = ""
    dia_chi: str = ""
    dien_thoai: str = ""
    email: str = ""
    ghi_chu: str = ""
    row_num: Optional[int] = None


# ─── NhapHang (Import Goods) ─────────────────────────────────────────────────

class NhapHangItem(BaseModel):
    ma_hang: str
    ten_hang: str
    so_luong: int
    gia_nhap: float


class NhapHangCreate(BaseModel):
    ngay_nhap: str  # YYYY-MM-DD
    nha_cung_cap_id: Optional[str] = ""
    nha_cung_cap_ten: Optional[str] = ""
    nha_cung_cap_dia_chi: Optional[str] = ""
    nha_cung_cap_sdt: Optional[str] = ""
    dia_chi: Optional[str] = ""
    dien_thoai: Optional[str] = ""
    items: List[NhapHangItem]
    ghi_chu: Optional[str] = ""
    cong_no: Optional[float] = None


class NhapHang(BaseModel):
    id: str
    so_phieu: str
    ngay_nhap: str
    ma_hang: str
    ten_hang: str
    so_luong: int
    gia_nhap: float
    thanh_tien: float
    nha_cung_cap_id: str
    ghi_chu: str
    cong_no: Optional[float] = 0
    row_num: Optional[int] = None


# ─── XuatHang (Export Goods) ─────────────────────────────────────────────────

class XuatHangItem(BaseModel):
    ma_hang: str
    ten_hang: str
    so_luong: int
    gia_ban: float


class XuatHangCreate(BaseModel):
    ngay_xuat: str  # YYYY-MM-DD
    khach_hang_id: Optional[str] = ""
    khach_hang_ten: Optional[str] = ""
    khach_hang_dia_chi: Optional[str] = ""
    khach_hang_sdt: Optional[str] = ""
    dia_chi: Optional[str] = ""
    dien_thoai: Optional[str] = ""
    items: List[XuatHangItem]
    ghi_chu: Optional[str] = ""


class XuatHang(BaseModel):
    id: str
    so_phieu: str
    ngay_xuat: str
    ma_hang: str
    ten_hang: str
    so_luong: int
    gia_ban: float
    thanh_tien: float
    khach_hang_id: str
    ghi_chu: str
    tien_khach_no: Optional[float] = 0
    row_num: Optional[int] = None


class NhapHangUpdate(BaseModel):
    ngay_nhap: Optional[str] = None
    nha_cung_cap_id: Optional[str] = ""
    nha_cung_cap_ten: Optional[str] = ""
    nha_cung_cap_dia_chi: Optional[str] = ""
    nha_cung_cap_sdt: Optional[str] = ""
    dia_chi: Optional[str] = ""
    dien_thoai: Optional[str] = ""
    ghi_chu: Optional[str] = ""
    cong_no: Optional[float] = None
    items: List[NhapHangItem]


class XuatHangUpdate(BaseModel):
    ngay_xuat: Optional[str] = None
    khach_hang_id: Optional[str] = ""
    khach_hang_ten: Optional[str] = ""
    khach_hang_dia_chi: Optional[str] = ""
    khach_hang_sdt: Optional[str] = ""
    dia_chi: Optional[str] = ""
    dien_thoai: Optional[str] = ""
    ghi_chu: Optional[str] = ""
    items: List[XuatHangItem]


# ─── SoQuy (Cash Flow) ────────────────────────────────────────────────────────

class PhieuThuCreate(BaseModel):
    loai_quy: str = "TIEN_MAT"  # "TIEN_MAT" | "NGAN_HANG"
    ngay: str  # YYYY-MM-DD
    doi_tuong: str  # Tên khách hàng (bắt buộc)
    dien_thoai: Optional[str] = ""  # Số điện thoại (không bắt buộc)
    dia_chi: Optional[str] = ""
    khach_hang_id: Optional[str] = ""
    so_tien: float
    phieu_lien_quan: Optional[str] = ""  # Số phiếu xuất (nếu có)
    ghi_chu: Optional[str] = ""


class PhieuChiCreate(BaseModel):
    loai_quy: str = "TIEN_MAT"
    ngay: str
    doi_tuong: str
    dien_thoai: Optional[str] = ""
    dia_chi: Optional[str] = ""
    doi_tuong_id: Optional[str] = ""
    nha_cung_cap_id: Optional[str] = ""
    so_tien: float
    phieu_lien_quan: Optional[str] = ""
    ghi_chu: Optional[str] = ""


class QuyConfigUpdate(BaseModel):
    mode: str = "current"  # "current" (số tiền hiện tại) | "initial" (số dư ban đầu)
    tien_mat: float = 0.0
    tien_gui: float = 0.0


