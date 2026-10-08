from fastapi import APIRouter, Request, HTTPException, Depends
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates
from datetime import date

from routers.auth import get_current_user, require_login
from models.schemas import PhieuThuCreate, PhieuThuUpdate, PhieuChiCreate, PhieuChiUpdate, QuyConfigUpdate
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
    # Nhận diện thông minh loai_chi
    phieu_lq = str(data.phieu_lien_quan or "").strip()
    loai_chi = str(data.loai_chi or "").strip().upper()

    if phieu_lq.startswith("NH") or phieu_lq == "ALL" or data.nha_cung_cap_id or data.doi_tuong_id:
        loai_chi = "NHA_CUNG_CAP"
    elif not loai_chi:
        if data.hang_muc_chi and data.hang_muc_chi != "Chi trả nhà cung cấp":
            loai_chi = "CUA_HANG"
        else:
            loai_chi = "NHA_CUNG_CAP"

    data.loai_chi = loai_chi

    if not data.doi_tuong or not str(data.doi_tuong).strip():
        if loai_chi == "CUA_HANG":
            data.doi_tuong = "Nội bộ Cửa Hàng An Nam"
        else:
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


@router.get("/api/so-quy/{record_id}")
async def get_so_quy_detail(record_id: str, user: str = Depends(require_login)):
    """Lấy chi tiết một phiếu trong sổ quỹ."""
    all_rows = db_manager.get_all("SoQuy")
    for r in all_rows:
        if str(r.get("id", "")).strip() == record_id.strip() or str(r.get("ma_phieu", "")).strip() == record_id.strip():
            return {"success": True, "data": r}
    raise HTTPException(status_code=404, detail="Không tìm thấy phiếu thu/chi")


@router.put("/api/phieu-thu/{record_id}")
async def update_phieu_thu_endpoint(record_id: str, data: PhieuThuUpdate, user: str = Depends(require_login)):
    """Cập nhật phiếu thu tiền."""
    try:
        updated = db_manager.update_phieu_thu(record_id, data.model_dump(exclude_unset=True))
        if not updated:
            raise HTTPException(status_code=404, detail="Không tìm thấy phiếu thu cần cập nhật")
        return {
            "success": True,
            "message": f"Cập nhật phiếu thu {updated.get('ma_phieu')} thành công",
            "data": updated
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/api/phieu-chi/{record_id}")
async def update_phieu_chi_endpoint(record_id: str, data: PhieuChiUpdate, user: str = Depends(require_login)):
    """Cập nhật phiếu chi tiền."""
    try:
        updated = db_manager.update_phieu_chi(record_id, data.model_dump(exclude_unset=True))
        if not updated:
            raise HTTPException(status_code=404, detail="Không tìm thấy phiếu chi cần cập nhật")
        return {
            "success": True,
            "message": f"Cập nhật phiếu chi {updated.get('ma_phieu')} thành công",
            "data": updated
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/api/so-quy/{record_id}")
async def update_so_quy_record(record_id: str, data: dict, user: str = Depends(require_login)):
    """Cập nhật một phiếu trong sổ quỹ (tự nhận diện thu/chi)."""
    try:
        updated = db_manager.update_phieu_so_quy(record_id, data)
        if not updated:
            raise HTTPException(status_code=404, detail="Không tìm thấy phiếu cần cập nhật")
        return {
            "success": True,
            "message": f"Cập nhật phiếu {updated.get('ma_phieu')} thành công",
            "data": updated
        }
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
async def get_tong_quan_dong_tien(
    month: str = "",
    from_date: str = "",
    to_date: str = "",
    user: str = Depends(require_login)
):
    """Thống kê quỹ tiền hiện tại và danh sách giao dịch gần nhất."""
    balances = db_manager.get_so_quy_balances()
    all_rows = db_manager.get_all("SoQuy")
    all_rows.sort(key=lambda x: (str(x.get("ngay", "")), str(x.get("id", ""))), reverse=True)

    filtered_rows = []
    for r in all_rows:
        ngay = str(r.get("ngay", "")).strip()
        if month and not ngay.startswith(month):
            continue
        if from_date and ngay < from_date:
            continue
        if to_date and ngay > to_date:
            continue
        filtered_rows.append(r)

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
        "transactions": filtered_rows
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
    """Thống kê tổng công nợ phải thu (khách nợ) và công nợ phải trả (nợ NCC) có đối soát thực tế với Sổ Quỹ."""
    all_xuat = db_manager.get_all("XuatHang")
    kh_records = db_manager.get_all("DoiTuong") or db_manager.get_all("KhachHang")
    all_nhap = db_manager.get_all("NhapHang")
    dt_records = db_manager.get_all("DoiTuong") or db_manager.get_all("NhaCungCap")
    so_quy = db_manager.get_all("SoQuy")

    # Map số tiền thực tế đã thu và đã chi từ Sổ Quỹ
    thu_map = {}
    chi_map = {}
    general_thu = []
    general_chi = []
    for sq in so_quy:
        lp = str(sq.get("loai_phieu", "")).strip().upper()
        plq = str(sq.get("phieu_lien_quan", "")).strip().upper()
        amt = float(sq.get("so_tien", 0) or 0)
        dt = str(sq.get("doi_tuong", "")).strip().lower()
        p = _clean_phone(sq.get("dien_thoai"))
        if not plq or plq == "ALL":
            if lp == "THU":
                general_thu.append({"doi_tuong": dt, "dien_thoai": p, "so_tien": amt})
            elif lp == "CHI":
                general_chi.append({"doi_tuong": dt, "dien_thoai": p, "so_tien": amt})
        else:
            split_plqs = [x.strip() for x in plq.replace(";", ",").split(",") if x.strip()]
            for x in split_plqs:
                if lp == "THU":
                    thu_map[x] = thu_map.get(x, 0.0) + (amt / len(split_plqs))
                elif lp == "CHI":
                    chi_map[x] = chi_map.get(x, 0.0) + (amt / len(split_plqs))

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

    # 1. Phải thu: Gom theo số phiếu xuất và đối soát với Sổ Quỹ
    xuat_by_sp = {}
    for r in all_xuat:
        sp = str(r.get("so_phieu", "")).strip()
        if not sp:
            continue
        sp_key = sp.upper()
        if sp_key not in xuat_by_sp:
            xuat_by_sp[sp_key] = []
        xuat_by_sp[sp_key].append(r)

    kh_debts = {}
    tong_phai_thu = 0.0

    for sp_key, items in xuat_by_sp.items():
        tot_invoice = sum(float(r.get("thanh_tien", 0) or 0) for r in items)
        paid = thu_map.get(sp_key, 0.0)
        rem_debt = max(0.0, tot_invoice - paid)

        first_r = items[0]
        kh_ref = str(first_r.get("khach_hang_id", "") or "Khách lẻ").strip()
        raw_sdt = _clean_phone(first_r.get("dien_thoai"))

        matched_kh = kh_map.get(kh_ref) or kh_map.get(kh_ref.lower()) or (kh_map.get(raw_sdt) if raw_sdt else None) or {}
        kh_id_val = matched_kh.get("id") or (kh_ref if kh_ref.startswith("KH") or (kh_ref.isdigit() and len(kh_ref) > 8) else "")
        kh_ten_val = matched_kh.get("ten_kh") or (kh_ref if not (kh_ref.isdigit() and len(kh_ref) > 8) and not kh_ref.startswith("KH") else "Khách hàng " + kh_ref)
        sdt_val = matched_kh.get("dien_thoai") or raw_sdt
        dia_chi_val = matched_kh.get("dia_chi") or str(first_r.get("dia_chi", "") or "").replace("None", "").strip()

        # Cấn trừ tiếp nếu khách có phiếu thu gộp 'ALL'
        if rem_debt > 0.01 and general_thu:
            target_names = {kh_ref.lower(), kh_ten_val.lower()}
            for g in general_thu:
                if g["so_tien"] <= 0:
                    continue
                match_kh = g["doi_tuong"] and (g["doi_tuong"] in target_names or any(g["doi_tuong"] in tn for tn in target_names))
                match_p = (sdt_val and g["dien_thoai"] and (g["dien_thoai"] == sdt_val or g["dien_thoai"].endswith(sdt_val) or sdt_val.endswith(g["dien_thoai"])))
                if match_kh or match_p:
                    deduct_g = min(rem_debt, g["so_tien"])
                    rem_debt -= deduct_g
                    g["so_tien"] -= deduct_g
                    if rem_debt <= 0.01:
                        break

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
        kh_debts[key]["tong_mua"] += tot_invoice

        if rem_debt > 0.01:
            tong_phai_thu += rem_debt
            kh_debts[key]["con_no"] += rem_debt
            orig_sp = str(first_r.get("so_phieu", "")).strip()
            if orig_sp and orig_sp not in kh_debts[key]["so_phieu_list"]:
                kh_debts[key]["so_phieu_list"].append(orig_sp)

    # Lọc chỉ giữ các khách hàng thực sự còn nợ
    danh_sach_thu = [v for v in kh_debts.values() if v["con_no"] > 0.01]
    danh_sach_thu.sort(key=lambda x: x["con_no"], reverse=True)

    # 2. Phải chi: Gom theo số phiếu nhập và đối soát với Sổ Quỹ
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

    nhap_by_sp = {}
    for r in all_nhap:
        sp = str(r.get("so_phieu", "")).strip()
        if not sp:
            continue
        sp_key = sp.upper()
        if sp_key not in nhap_by_sp:
            nhap_by_sp[sp_key] = []
        nhap_by_sp[sp_key].append(r)

    ncc_debts = {}
    tong_phai_chi = 0.0

    for sp_key, items in nhap_by_sp.items():
        tot_invoice = sum(float(r.get("thanh_tien", 0) or 0) for r in items)
        paid = chi_map.get(sp_key, 0.0)
        rem_debt = max(0.0, tot_invoice - paid)

        first_r = items[0]
        ncc_ref = str(first_r.get("nha_cung_cap_id", "") or "Nhà cung cấp").strip()
        raw_sdt = _clean_phone(first_r.get("dien_thoai"))

        matched_ncc = ncc_map.get(ncc_ref) or ncc_map.get(ncc_ref.lower()) or (ncc_map.get(raw_sdt) if raw_sdt else None) or {}
        ncc_id_val = matched_ncc.get("id") or (ncc_ref if ncc_ref.startswith("DT") or ncc_ref.startswith("NCC") or (ncc_ref.isdigit() and len(ncc_ref) > 8) else "")
        ncc_ten_val = matched_ncc.get("ten_ncc") or (ncc_ref if not (ncc_ref.isdigit() and len(ncc_ref) > 8) and not ncc_ref.startswith("DT") and not ncc_ref.startswith("NCC") else "Đối tác " + ncc_ref)
        sdt_val = matched_ncc.get("dien_thoai") or raw_sdt
        dia_chi_val = matched_ncc.get("dia_chi") or str(first_r.get("dia_chi", "") or "").replace("None", "").strip()

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
        ncc_debts[key]["tong_nhap"] += tot_invoice

        # Cấn trừ tiếp nếu NCC có phiếu chi gộp 'ALL'
        if rem_debt > 0.01 and general_chi:
            target_names = {ncc_ref.lower(), ncc_ten_val.lower()}
            for g in general_chi:
                if g["so_tien"] <= 0:
                    continue
                match_ncc = g["doi_tuong"] and (g["doi_tuong"] in target_names or any(g["doi_tuong"] in tn for tn in target_names))
                match_p = (sdt_val and g["dien_thoai"] and (g["dien_thoai"] == sdt_val or g["dien_thoai"].endswith(sdt_val) or sdt_val.endswith(g["dien_thoai"])))
                if match_ncc or match_p:
                    deduct_g = min(rem_debt, g["so_tien"])
                    rem_debt -= deduct_g
                    g["so_tien"] -= deduct_g
                    if rem_debt <= 0.01:
                        break

        if rem_debt > 0.01:
            tong_phai_chi += rem_debt
            ncc_debts[key]["con_no"] += rem_debt
            orig_sp = str(first_r.get("so_phieu", "")).strip()
            if orig_sp and orig_sp not in ncc_debts[key]["so_phieu_list"]:
                ncc_debts[key]["so_phieu_list"].append(orig_sp)

    danh_sach_chi = [v for v in ncc_debts.values() if v["con_no"] > 0.01]
    danh_sach_chi.sort(key=lambda x: x["con_no"], reverse=True)

    return {
        "success": True,
        "phai_thu": tong_phai_thu,
        "phai_chi": tong_phai_chi,
        "danh_sach_thu": danh_sach_thu,
        "danh_sach_chi": danh_sach_chi,
    }


@router.post("/api/cong-no/reconcile")
async def reconcile_all_debts_endpoint(user: str = Depends(require_login)):
    """API đối soát và tự động cấn trừ toàn bộ công nợ giữa Sổ Quỹ và Bảng Xuất/Nhập."""
    try:
        stats = db_manager.reconcile_all_debts()
        return {
            "success": True,
            "message": "Đối soát và cấn trừ công nợ thành công",
            "stats": stats
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lỗi đối soát công nợ: {str(e)}")
