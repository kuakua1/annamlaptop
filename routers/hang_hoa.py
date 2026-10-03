from fastapi import APIRouter, Request, HTTPException, Depends
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.templating import Jinja2Templates

from routers.auth import get_current_user, require_login
from models.schemas import HangHoaCreate, HangHoaUpdate
from services.sheets_service import sheets_service, parse_batches_str
from config import SHEET_HANG_HOA

router = APIRouter()
templates = Jinja2Templates(directory="static/templates")

HEADERS = ["id", "ma_hang", "ten_hang", "danh_muc", "don_vi_tinh", "gia_nhap", "gia_ban", "ton_kho", "chi_tiet_lo", "ghi_chu"]


def _col_index(col_name: str) -> int:
    return HEADERS.index(col_name) + 1


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
    user: str = Depends(require_login)
):
    try:
        records = sheets_service.get_all_records(SHEET_HANG_HOA)
        result = []
        for i, rec in enumerate(records):
            ton_kho = _safe_num(rec.get("ton_kho", 0), as_int=True)
            gia_nhap = _safe_num(rec.get("gia_nhap", 0))
            gia_ban = _safe_num(rec.get("gia_ban", 0))
            chi_tiet_lo = str(rec.get("chi_tiet_lo", "") or "")
            batches = parse_batches_str(chi_tiet_lo, ton_kho, gia_nhap)
            if len(batches) <= 1:
                batches = [{"so_luong": ton_kho, "gia_nhap": gia_nhap}]
                thanh_tien_ton = round(ton_kho * gia_nhap)
            else:
                thanh_tien_ton = round(sum(b["so_luong"] * b["gia_nhap"] for b in batches))

            item = {
                "id": str(rec.get("id", "")),
                "ma_hang": str(rec.get("ma_hang", "")),
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
        total_val = sum(
            sum(b["so_luong"] * b["gia_nhap"] for b in x["batches"]) if x.get("batches")
            else (x["ton_kho"] * x["gia_nhap"])
            for x in result
        )
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
        new_id = sheets_service.new_id()
        ma_hang = sheets_service.generate_ma_hang()
        chi_tiet_lo = f"{data.ton_kho} x {int(data.gia_nhap):,} đ".replace(",", ".") if data.ton_kho > 0 else ""
        row = [
            new_id,
            ma_hang,
            data.ten_hang,
            data.danh_muc or "",
            data.don_vi_tinh or "Cái",
            float(data.gia_nhap),
            float(data.gia_ban),
            int(data.ton_kho),
            chi_tiet_lo,
            data.ghi_chu or "",
        ]
        row_num = sheets_service.append_row(SHEET_HANG_HOA, row)
        return {
            "success": True,
            "message": "Thêm hàng hóa thành công",
            "data": {
                "id": new_id,
                "ma_hang": ma_hang,
                "ten_hang": data.ten_hang,
                "danh_muc": data.danh_muc,
                "don_vi_tinh": data.don_vi_tinh,
                "gia_nhap": data.gia_nhap,
                "gia_ban": data.gia_ban,
                "ton_kho": data.ton_kho,
                "chi_tiet_lo": chi_tiet_lo,
                "ghi_chu": data.ghi_chu,
                "row_num": row_num,
            }
        }
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
        row_num, rec = sheets_service.find_hang_hoa_by_id(record_id)
        if row_num == -1:
            raise HTTPException(status_code=404, detail="Không tìm thấy hàng hóa")

        updated = {
            "id": str(rec.get("id", "")),
            "ma_hang": str(rec.get("ma_hang", "")),
            "ten_hang": data.ten_hang if data.ten_hang is not None else str(rec.get("ten_hang", "")),
            "danh_muc": data.danh_muc if data.danh_muc is not None else str(rec.get("danh_muc", "")),
            "don_vi_tinh": data.don_vi_tinh if data.don_vi_tinh is not None else str(rec.get("don_vi_tinh", "")),
            "gia_nhap": float(data.gia_nhap) if data.gia_nhap is not None else float(rec.get("gia_nhap", 0) or 0),
            "gia_ban": float(data.gia_ban) if data.gia_ban is not None else float(rec.get("gia_ban", 0) or 0),
            "ton_kho": int(data.ton_kho) if data.ton_kho is not None else int(rec.get("ton_kho", 0) or 0),
            "chi_tiet_lo": str(rec.get("chi_tiet_lo", "") or ""),
            "ghi_chu": data.ghi_chu if data.ghi_chu is not None else str(rec.get("ghi_chu", "")),
        }

        row = [
            updated["id"], updated["ma_hang"], updated["ten_hang"],
            updated["danh_muc"], updated["don_vi_tinh"],
            updated["gia_nhap"], updated["gia_ban"],
            updated["ton_kho"], updated["chi_tiet_lo"], updated["ghi_chu"],
        ]
        sheets_service.update_row(SHEET_HANG_HOA, row_num, row)
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
        row_num, rec = sheets_service.find_hang_hoa_by_id(record_id)
        if row_num == -1:
            raise HTTPException(status_code=404, detail="Không tìm thấy hàng hóa")
        sheets_service.delete_row(SHEET_HANG_HOA, row_num)
        return {"success": True, "message": "Xóa hàng hóa thành công"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/hang-hoa/danh-muc")
async def get_danh_muc(request: Request, user: str = Depends(require_login)):
    """Return unique danh_muc values."""
    try:
        records = sheets_service.get_all_records(SHEET_HANG_HOA)
        danh_muc_set = sorted({str(r.get("danh_muc", "")) for r in records if r.get("danh_muc")})
        return {"success": True, "data": danh_muc_set}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
