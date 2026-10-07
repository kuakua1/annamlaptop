from fastapi import APIRouter, Request, HTTPException, Depends
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.templating import Jinja2Templates

from routers.auth import get_current_user, require_login
from models.schemas import HangHoaCreate, HangHoaUpdate
from services.db_service import db_manager
from services.sheets_service import parse_batches_str

router = APIRouter()
templates = Jinja2Templates(directory="static/templates")


@router.get("/hang-hoa", response_class=HTMLResponse)
async def hang_hoa_page(request: Request):
    user = get_current_user(request)
    if not user:
        from fastapi.responses import RedirectResponse
        return RedirectResponse(url="/login")
    return templates.TemplateResponse("hang_hoa.html", {"request": request, "username": user})


@router.get("/ton-kho", response_class=HTMLResponse)
async def ton_kho_page(request: Request):
    user = get_current_user(request)
    if not user:
        from fastapi.responses import RedirectResponse
        return RedirectResponse(url="/login")
    return templates.TemplateResponse("ton_kho.html", {"request": request, "username": user})


@router.get("/bang-nhap-xuat-ton", response_class=HTMLResponse)
async def bang_nhap_xuat_ton_page(request: Request):
    user = get_current_user(request)
    if not user:
        from fastapi.responses import RedirectResponse
        return RedirectResponse(url="/login")
    return templates.TemplateResponse("bang_nhap_xuat_ton.html", {"request": request, "username": user})


@router.get("/nhap-xuat-ton", response_class=HTMLResponse)
async def nhap_xuat_ton_page_alias(request: Request):
    user = get_current_user(request)
    if not user:
        from fastapi.responses import RedirectResponse
        return RedirectResponse(url="/login")
    return templates.TemplateResponse("bang_nhap_xuat_ton.html", {"request": request, "username": user})


def _safe_num(val, as_int=False):
    if val is None or val == "":
        return 0 if as_int else 0.0
    if isinstance(val, (int, float)):
        return int(val) if as_int else float(val)
    s = str(val).replace("đ", "").replace("Đ", "").replace(",", "").replace(".", "").strip()
    try:
        return int(float(s)) if as_int else float(s)
    except Exception:
        return 0 if as_int else 0.0


@router.get("/api/hang-hoa")
async def get_hang_hoa(
    request: Request,
    danh_muc: str = "",
    search: str = "",
    only_stock: bool = False,
    from_date: str = "",
    to_date: str = "",
    user: str = Depends(require_login)
):
    try:
        records = db_manager.get_all("HangHoa")

        # Nếu có to_date, tính tồn kho lùi lại đến mốc to_date dựa trên NhapHang và XuatHang
        sl_nhap_after_map = {}
        sl_xuat_after_map = {}
        if to_date:
            nhap_records = db_manager.get_all("NhapHang")
            xuat_records = db_manager.get_all("XuatHang")
            for r in nhap_records:
                ngay = str(r.get("ngay_nhap", "")).strip()
                if ngay > to_date:
                    m = str(r.get("ma_hang", "")).strip()
                    sl_nhap_after_map[m] = sl_nhap_after_map.get(m, 0) + _safe_num(r.get("so_luong", 0), as_int=True)
            for r in xuat_records:
                ngay = str(r.get("ngay_xuat", "")).strip()
                if ngay > to_date:
                    m = str(r.get("ma_hang", "")).strip()
                    sl_xuat_after_map[m] = sl_xuat_after_map.get(m, 0) + _safe_num(r.get("so_luong", 0), as_int=True)

        result = []
        for i, rec in enumerate(records):
            current_ton = _safe_num(rec.get("ton_kho", 0), as_int=True)
            gia_nhap = _safe_num(rec.get("gia_nhap", 0))
            gia_ban = _safe_num(rec.get("gia_ban", 0))
            chi_tiet_lo = str(rec.get("chi_tiet_lo", "") or "")
            ma_hang = str(rec.get("ma_hang", ""))

            if to_date:
                ton_kho = current_ton + sl_xuat_after_map.get(ma_hang, 0) - sl_nhap_after_map.get(ma_hang, 0)
                if ton_kho < 0:
                    ton_kho = 0
            else:
                ton_kho = current_ton

            batches = parse_batches_str(chi_tiet_lo, ton_kho, gia_nhap)
            if len(batches) <= 1 or to_date:
                batches = [{"so_luong": ton_kho, "gia_nhap": gia_nhap}]
                thanh_tien_ton = round(ton_kho * gia_nhap)
            else:
                thanh_tien_ton = round(sum(b["so_luong"] * b["gia_nhap"] for b in batches))

            item = {
                "id": str(rec.get("id", "")),
                "ma_hang": ma_hang,
                "ten_hang": str(rec.get("ten_hang", "")),
                "danh_muc": str(rec.get("danh_muc", "")),
                "don_vi_tinh": str(rec.get("don_vi_tinh", "")),
                "gia_nhap": gia_nhap,
                "gia_ban": gia_ban,
                "ton_kho": ton_kho,
                "chi_tiet_lo": chi_tiet_lo,
                "batches": batches,
                "thanh_tien_ton": thanh_tien_ton,
                "ghi_chu": str(rec.get("ghi_chu", "")),
                "row_num": i + 2,
            }
            if only_stock and ton_kho <= 0:
                continue
            if danh_muc and item["danh_muc"] != danh_muc:
                continue
            if search and search.lower() not in item["ten_hang"].lower() and search.lower() not in item["ma_hang"].lower():
                continue
            result.append(item)

        total_qty = sum(x["ton_kho"] for x in result)
        total_val = sum(x["thanh_tien_ton"] for x in result)
        return {
            "success": True,
            "data": result,
            "total": len(result),
            "total_stock_qty": total_qty,
            "total_stock_val": total_val
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/hang-hoa")
async def create_hang_hoa(
    data: HangHoaCreate,
    request: Request,
    user: str = Depends(require_login)
):
    try:
        import time
        new_id = str(int(time.time() * 1000))
        ma_hang = db_manager.generate_ma_hang()
        chi_tiet_lo = f"{data.ton_kho} x {int(data.gia_nhap):,} đ".replace(",", ".") if data.ton_kho > 0 else ""
        item = {
            "id": new_id,
            "ma_hang": ma_hang,
            "ten_hang": data.ten_hang,
            "danh_muc": data.danh_muc or "",
            "don_vi_tinh": data.don_vi_tinh or "Cái",
            "gia_nhap": float(data.gia_nhap),
            "ton_kho": int(data.ton_kho),
            "chi_tiet_lo": chi_tiet_lo,
            "ghi_chu": data.ghi_chu or "",
        }
        db_manager.insert_hang_hoa(item)
        return {
            "success": True,
            "message": "Thêm hàng hóa thành công",
            "data": item
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/hang-hoa/{record_id}")
async def get_hang_hoa_detail(
    record_id: str,
    request: Request,
    user: str = Depends(require_login)
):
    try:
        item = db_manager.get_by_id("HangHoa", record_id)
        if not item:
            raise HTTPException(status_code=404, detail="Không tìm thấy hàng hóa")
        return {"success": True, "data": item}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/api/hang-hoa/{record_id}")
async def update_hang_hoa(
    record_id: str,
    data: HangHoaUpdate,
    request: Request,
    user: str = Depends(require_login)
):
    try:
        rec = db_manager.get_by_id("HangHoa", record_id)
        if not rec:
            raise HTTPException(status_code=404, detail="Không tìm thấy hàng hóa")

        update_dict = {}
        if data.ten_hang is not None: update_dict["ten_hang"] = data.ten_hang
        if data.danh_muc is not None: update_dict["danh_muc"] = data.danh_muc
        if data.don_vi_tinh is not None: update_dict["don_vi_tinh"] = data.don_vi_tinh
        if data.gia_nhap is not None: update_dict["gia_nhap"] = float(data.gia_nhap)
        if data.ton_kho is not None: update_dict["ton_kho"] = int(data.ton_kho)
        if data.ghi_chu is not None: update_dict["ghi_chu"] = data.ghi_chu

        if data.chi_tiet_lo is not None:
            update_dict["chi_tiet_lo"] = data.chi_tiet_lo
        elif data.batches is not None:
            from services.sheets_service import format_batches_str
            update_dict["chi_tiet_lo"] = format_batches_str(data.batches)
            if data.ton_kho is None:
                update_dict["ton_kho"] = sum(int(b.get("so_luong", 0)) for b in data.batches)
            if data.gia_nhap is None and data.batches:
                update_dict["gia_nhap"] = float(data.batches[0].get("gia_nhap", 0))

        updated = db_manager.update_hang_hoa(record_id, update_dict)
        return {"success": True, "message": "Cập nhật hàng hóa thành công", "data": updated}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/api/hang-hoa/{record_id}")
async def delete_hang_hoa(
    record_id: str,
    request: Request,
    user: str = Depends(require_login)
):
    try:
        rec = db_manager.get_by_id("HangHoa", record_id)
        if not rec:
            raise HTTPException(status_code=404, detail="Không tìm thấy hàng hóa")
        db_manager.delete_hang_hoa(record_id)
        return {"success": True, "message": "Xóa hàng hóa thành công"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/hang-hoa/danh-muc")
async def get_danh_muc(request: Request, user: str = Depends(require_login)):
    """Return unique danh_muc values from SQLite."""
    try:
        records = db_manager.get_all("HangHoa")
        danh_muc_set = sorted({str(r.get("danh_muc", "")) for r in records if r.get("danh_muc")})
        return {"success": True, "data": danh_muc_set}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
