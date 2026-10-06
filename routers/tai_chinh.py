from fastapi import APIRouter, Request, HTTPException, Depends
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates
from datetime import date

from routers.auth import get_current_user, require_login
from models.schemas import PhieuThuCreate, PhieuChiCreate, QuyConfigUpdate
from services.db_service import db_manager

router = APIRouter()
templates = Jinja2Templates(directory="static/templates")


# ── Page Routes ───────────────────────────────────────────────────────────────

@router.get("/dong-tien", response_class=HTMLResponse)
async def dong_tien_page(request: Request):
    user = get_current_user(request)
    if not user:
        from fastapi.responses import RedirectResponse
        return RedirectResponse(url="/login")
    return templates.TemplateResponse("dong_tien.html", {"request": request, "username": user})


@router.get("/phieu-thu", response_class=HTMLResponse)
async def phieu_thu_page(request: Request):
    user = get_current_user(request)
    if not user:
        from fastapi.responses import RedirectResponse
        return RedirectResponse(url="/login")
    return templates.TemplateResponse("phieu_thu.html", {"request": request, "username": user})


@router.get("/phieu-chi", response_class=HTMLResponse)
async def phieu_chi_page(request: Request):
    user = get_current_user(request)
    if not user:
        from fastapi.responses import RedirectResponse
        return RedirectResponse(url="/login")
    return templates.TemplateResponse("phieu_chi.html", {"request": request, "username": user})


@router.get("/cong-no", response_class=HTMLResponse)
async def cong_no_page(request: Request):
    user = get_current_user(request)
    if not user:
        from fastapi.responses import RedirectResponse
        return RedirectResponse(url="/login")
    return templates.TemplateResponse("cong_no.html", {"request": request, "username": user})


# ── API Mã Phiếu & Kiểm Tra Nợ ──────────────────────────────────────────────

@router.get("/api/phieu-thu/next-code")
async def get_next_phieu_thu_code(loai_quy: str = "TIEN_MAT", ngay: str = "", user: str = Depends(require_login)):
    """Sinh trước mã phiếu thu hiển thị trên giao diện (TMxxxx/MM hoặc TGxxxx/MM)."""
    code = db_manager.generate_ma_phieu_thu(loai_quy, ngay)
    return {"success": True, "ma_phieu": code}


@router.get("/api/phieu-chi/next-code")
async def get_next_phieu_chi_code(loai_quy: str = "TIEN_MAT", ngay: str = "", user: str = Depends(require_login)):
    """Sinh trước mã phiếu chi hiển thị trên giao diện (CMxxxx/MM hoặc CGxxxx/MM)."""
    code = db_manager.generate_ma_phieu_chi(loai_quy, ngay)
    return {"success": True, "ma_phieu": code}


@router.get("/api/khach-hang/unpaid-invoices")
@router.get("/api/cong-no/khach-hang/unpaid-invoices")
async def get_customer_unpaid_invoices(
    ten_kh: str = "",
    kh_id: str = "",
    sdt: str = "",
    user: str = Depends(require_login)
):
    """
    Kiểm tra xem khách hàng có đang nợ công ty phiếu xuất nào không.
    Trả về danh sách phiếu xuất còn nợ, kèm thông tin tiền nợ và gợi ý nội dung.
    """
    query_name = kh_id or ten_kh
    if not query_name and not sdt:
        return {"success": True, "has_debt": False, "invoices": []}

    invoices = db_manager.get_customer_unpaid_invoices(query_name, sdt)
    has_debt = len(invoices) > 0
    return {
        "success": True,
        "has_debt": has_debt,
        "count": len(invoices),
        "invoices": invoices
    }


@router.get("/api/nha-cung-cap/unpaid-invoices")
@router.get("/api/cong-no/nha-cung-cap/unpaid-invoices")
@router.get("/api/doi-tuong/unpaid-invoices")
async def get_supplier_unpaid_invoices_api(
    ten_ncc: str = "",
    ncc_id: str = "",
    sdt: str = "",
    user: str = Depends(require_login)
):
    """
    Kiểm tra xem nhà cung cấp / đối tác có phiếu nhập kho nào mà công ty đang nợ tiền không.
    Trả về danh sách phiếu nhập còn nợ, kèm thông tin tiền nợ và gợi ý nội dung.
    """
    query_name = ncc_id or ten_ncc
    if not query_name and not sdt:
        return {"success": True, "has_debt": False, "invoices": []}

    invoices = db_manager.get_supplier_unpaid_invoices(query_name, sdt)
    has_debt = len(invoices) > 0
    return {
        "success": True,
        "has_debt": has_debt,
        "count": len(invoices),
        "invoices": invoices
    }


# ── CRUD Phiếu Thu & Phiếu Chi ────────────────────────────────────────────────

@router.get("/api/phieu-thu")
async def get_list_phieu_thu(user: str = Depends(require_login)):
    """Lấy danh sách phiếu thu (để hiển thị danh sách gần đây và báo cáo)."""
    all_rows = db_manager.get_all("SoQuy")
    thu_rows = [r for r in all_rows if str(r.get("loai_phieu", "")).upper() == "THU"]
    thu_rows.sort(key=lambda x: (str(x.get("ngay", "")), str(x.get("id", ""))), reverse=True)
    return {"success": True, "data": thu_rows, "total": len(thu_rows)}


@router.post("/api/phieu-thu")
async def create_phieu_thu(data: PhieuThuCreate, user: str = Depends(require_login)):
    if not data.doi_tuong or not str(data.doi_tuong).strip():
        raise HTTPException(status_code=400, detail="Vui lòng nhập Tên Người / Đơn Vị Nộp Tiền")
    data.dien_thoai = (data.dien_thoai or "").strip()
    data.dia_chi = (data.dia_chi or "").strip()
    if data.so_tien is None or data.so_tien <= 0:
        raise HTTPException(status_code=400, detail="Số tiền thu phải lớn hơn 0")

    try:
        created = db_manager.create_phieu_thu(data.model_dump())
        return {
            "success": True,
            "message": f"Tạo phiếu thu {created.get('ma_phieu')} thành công",
            "data": created
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/phieu-chi")
async def get_list_phieu_chi(user: str = Depends(require_login)):
    """Lấy danh sách phiếu chi."""
    all_rows = db_manager.get_all("SoQuy")
    chi_rows = [r for r in all_rows if str(r.get("loai_phieu", "")).upper() == "CHI"]
    chi_rows.sort(key=lambda x: (str(x.get("ngay", "")), str(x.get("id", ""))), reverse=True)
    return {"success": True, "data": chi_rows, "total": len(chi_rows)}


@router.get("/api/so-quy/balances")
async def get_so_quy_balances_endpoint(user: str = Depends(require_login)):
    """Lấy số dư hiện tại của công ty (Tiền mặt, Tiền gửi, Tổng quỹ)."""
    balances = db_manager.get_so_quy_balances()
    return {
        "success": True,
        "tien_mat": balances["tien_mat"],
        "tien_gui": balances["tien_gui"],
        "tong_quy": balances["tong_quy"],
        "balances": balances
    }


@router.post("/api/phieu-chi")
async def create_phieu_chi(data: PhieuChiCreate, user: str = Depends(require_login)):
    if not data.doi_tuong or not str(data.doi_tuong).strip():
        raise HTTPException(status_code=400, detail="Vui lòng nhập Tên Người / Đơn Vị Nhận Tiền")
    if data.so_tien is None or data.so_tien <= 0:
        raise HTTPException(status_code=400, detail="Số tiền chi phải lớn hơn 0")

    try:
        created = db_manager.create_phieu_chi(data.model_dump())
        balances = db_manager.get_so_quy_balances()
        return {
            "success": True,
            "message": f"Tạo phiếu chi {created.get('ma_phieu')} thành công",
            "data": created,
            "balances": balances
        }
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/api/so-quy/{record_id}")
async def delete_phieu_so_quy(record_id: str, user: str = Depends(require_login)):
    success = db_manager.delete_phieu_so_quy(record_id)
    if not success:
        raise HTTPException(status_code=404, detail="Không tìm thấy phiếu thu/chi")
    return {"success": True, "message": "Xóa phiếu thành công"}


# ── Tổng quan Dòng Tiền & Cấu Hình Quỹ ───────────────────────────────────────

@router.get("/api/dong-tien/tong-quan")
async def get_tong_quan_dong_tien(user: str = Depends(require_login)):
    """Thống kê quỹ tiền hiện tại và danh sách giao dịch gần nhất."""
    balances = db_manager.get_so_quy_balances()
    all_rows = db_manager.get_all("SoQuy")
    all_rows.sort(key=lambda x: (str(x.get("ngay", "")), str(x.get("id", ""))), reverse=True)

    return {
        "success": True,
        "tien_mat": balances["tien_mat"],
        "tien_gui": balances["tien_gui"],
        "tong_quy": balances["tong_quy"],
        "so_du_dau_tien_mat": balances.get("so_du_dau_tien_mat", 0.0),
        "so_du_dau_tien_gui": balances.get("so_du_dau_tien_gui", 0.0),
        "tm_thu": balances.get("tm_thu", 0.0),
        "tm_chi": balances.get("tm_chi", 0.0),
        "tg_thu": balances.get("tg_thu", 0.0),
        "tg_chi": balances.get("tg_chi", 0.0),
        "transactions": all_rows[:50]
    }


@router.get("/api/dong-tien/quy-config")
async def get_quy_config(user: str = Depends(require_login)):
    """Lấy thông tin số dư quỹ ban đầu và số tiền hiện tại."""
    balances = db_manager.get_so_quy_balances()
    last_updated = db_manager.get_config("cap_nhat_quy_luc")
    return {
        "success": True,
        "balances": balances,
        "last_updated": last_updated
    }


@router.post("/api/dong-tien/quy-config")
async def update_quy_config(data: QuyConfigUpdate, user: str = Depends(require_login)):
    """
    Cập nhật số tiền hiện tại hoặc số dư ban đầu của công ty và đồng bộ lên Google Sheets.
    """
    try:
        new_balances = db_manager.update_company_balances(
            mode=data.mode,
            tien_mat=float(data.tien_mat or 0),
            tien_gui=float(data.tien_gui or 0)
        )
        return {
            "success": True,
            "message": "Đã lưu số tiền của công ty thành công vào Config (Database & Google Sheets)!",
            "balances": new_balances
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))



def _clean_phone(p: str) -> str:
    p = str(p or "").replace("None", "").strip()
    if p.endswith(".0"):
        p = p[:-2]
    if len(p) == 9 and p.isdigit() and not p.startswith("0"):
        p = "0" + p
    return p


@router.get("/api/cong-no/tong-quan")
async def get_tong_quan_cong_no(user: str = Depends(require_login)):
    """Thống kê tổng công nợ phải thu (khách nợ) và công nợ phải trả (nợ NCC)."""
    # 1. Phải thu: từ bảng XuatHang có tien_khach_no > 0
    all_xuat = db_manager.get_all("XuatHang")
    kh_records = db_manager.get_all("DoiTuong") or db_manager.get_all("KhachHang")

    # Map tra cứu khách hàng theo ID hoặc Tên
    kh_map = {}
    for k in kh_records:
        kid = str(k.get("id", "")).strip()
        kten = str(k.get("ten") or k.get("ten_kh") or "").strip()
        sdt_clean = _clean_phone(k.get("dien_thoai"))
        info = {
            "id": kid,
            "ten_kh": kten,
            "dien_thoai": sdt_clean,
            "dia_chi": str(k.get("dia_chi", "") or "").replace("None", "").strip()
        }
        if kid:
            kh_map[kid] = info
        if kten:
            kh_map[kten.lower()] = info
        if sdt_clean:
            kh_map[sdt_clean] = info

    kh_debts = {}
    tong_phai_thu = 0.0

    for r in all_xuat:
        tt = float(r.get("thanh_tien", 0) or 0)
        no = float(r.get("tien_khach_no") if r.get("tien_khach_no") is not None else tt)
        if no > 0:
            tong_phai_thu += no
            kh_ref = str(r.get("khach_hang_id", "") or "Khách lẻ").strip()
            raw_sdt = _clean_phone(r.get("dien_thoai"))
            
            # Tra cứu thông tin khách hàng từ danh mục KhachHang
            matched_kh = kh_map.get(kh_ref) or kh_map.get(kh_ref.lower()) or (kh_map.get(raw_sdt) if raw_sdt else None) or {}
            
            # Xác định ID, Tên, SĐT chuẩn
            kh_id_val = matched_kh.get("id") or (kh_ref if kh_ref.startswith("KH") or (kh_ref.isdigit() and len(kh_ref) > 8) else "")
            kh_ten_val = matched_kh.get("ten_kh") or (kh_ref if not (kh_ref.isdigit() and len(kh_ref) > 8) and not kh_ref.startswith("KH") else "Khách hàng " + kh_ref)
            
            # SĐT và Địa chỉ ưu tiên lấy từ danh mục KhachHang hoặc XuatHang
            sdt_val = matched_kh.get("dien_thoai") or raw_sdt
            dia_chi_val = matched_kh.get("dia_chi") or str(r.get("dia_chi", "") or "").replace("None", "").strip()

            key = kh_id_val or kh_ten_val or kh_ref
            if key not in kh_debts:
                kh_debts[key] = {
                    "id": kh_id_val,
                    "ten_kh": kh_ten_val,
                    "dien_thoai": sdt_val,
                    "dia_chi": dia_chi_val,
                    "tong_mua": 0.0,
                    "con_no": 0.0,
                    "so_phieu_list": []
                }
            kh_debts[key]["tong_mua"] += tt
            kh_debts[key]["con_no"] += no
            sp = str(r.get("so_phieu", ""))
            if sp and sp not in kh_debts[key]["so_phieu_list"]:
                kh_debts[key]["so_phieu_list"].append(sp)

    danh_sach_thu = list(kh_debts.values())
    danh_sach_thu.sort(key=lambda x: x["con_no"], reverse=True)

    # 2. Phải chi: từ bảng NhapHang có cong_no > 0
    all_nhap = db_manager.get_all("NhapHang")
    dt_records = db_manager.get_all("DoiTuong") or db_manager.get_all("NhaCungCap")

    ncc_map = {}
    for d in dt_records:
        did = str(d.get("id", "")).strip()
        dten = str(d.get("ten") or d.get("ten_ncc") or "").strip()
        sdt_clean = _clean_phone(d.get("dien_thoai"))
        info = {
            "id": did,
            "ten_ncc": dten,
            "dien_thoai": sdt_clean,
            "dia_chi": str(d.get("dia_chi", "") or "").replace("None", "").strip()
        }
        if did:
            ncc_map[did] = info
        if dten:
            ncc_map[dten.lower()] = info
        if sdt_clean:
            ncc_map[sdt_clean] = info

    ncc_debts = {}
    tong_phai_chi = 0.0

    for r in all_nhap:
        tt = float(r.get("thanh_tien", 0) or 0)
        no = float(r.get("cong_no") if r.get("cong_no") is not None else tt)
        if no > 0:
            tong_phai_chi += no
            ncc_ref = str(r.get("nha_cung_cap_id", "") or "Nhà cung cấp").strip()
            raw_sdt = _clean_phone(r.get("dien_thoai"))

            matched_ncc = ncc_map.get(ncc_ref) or ncc_map.get(ncc_ref.lower()) or (ncc_map.get(raw_sdt) if raw_sdt else None) or {}
            ncc_id_val = matched_ncc.get("id") or (ncc_ref if ncc_ref.startswith("DT") or ncc_ref.startswith("NCC") or (ncc_ref.isdigit() and len(ncc_ref) > 8) else "")
            ncc_ten_val = matched_ncc.get("ten_ncc") or (ncc_ref if not (ncc_ref.isdigit() and len(ncc_ref) > 8) and not ncc_ref.startswith("DT") and not ncc_ref.startswith("NCC") else "Đối tác " + ncc_ref)
            sdt_val = matched_ncc.get("dien_thoai") or raw_sdt
            dia_chi_val = matched_ncc.get("dia_chi") or str(r.get("dia_chi", "") or "").replace("None", "").strip()

            key = ncc_id_val or ncc_ten_val or ncc_ref
            if key not in ncc_debts:
                ncc_debts[key] = {
                    "id": ncc_id_val,
                    "ten_ncc": ncc_ten_val,
                    "dien_thoai": sdt_val,
                    "dia_chi": dia_chi_val,
                    "tong_nhap": 0.0,
                    "con_no": 0.0,
                    "so_phieu_list": []
                }
            ncc_debts[key]["tong_nhap"] += tt
            ncc_debts[key]["con_no"] += no
            sp = str(r.get("so_phieu", ""))
            if sp and sp not in ncc_debts[key]["so_phieu_list"]:
                ncc_debts[key]["so_phieu_list"].append(sp)

    danh_sach_chi = list(ncc_debts.values())
    danh_sach_chi.sort(key=lambda x: x["con_no"], reverse=True)

    return {
        "success": True,
        "phai_thu": tong_phai_thu,
        "phai_chi": tong_phai_chi,
        "danh_sach_thu": danh_sach_thu,
        "danh_sach_chi": danh_sach_chi
    }
