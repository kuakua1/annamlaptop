from fastapi import APIRouter, Request, HTTPException, Depends
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates

from routers.auth import get_current_user, require_login
from services.db_service import db_manager

router = APIRouter()
templates = Jinja2Templates(directory="static/templates")

PAGE_SIZE = 50


@router.get("/lich-su", response_class=HTMLResponse)
async def lich_su_page(request: Request):
    user = get_current_user(request)
    if not user:
        from fastapi.responses import RedirectResponse
        return RedirectResponse(url="/login")
    return templates.TemplateResponse("lich_su.html", {"request": request, "username": user})


@router.get("/api/lich-su")
async def get_lich_su(
    request: Request,
    loai: str = "all",
    from_date: str = "",
    to_date: str = "",
    search: str = "",
    page: int = 1,
    user: str = Depends(require_login)
):
    try:
        combined = []

        ncc_records = db_manager.get_all("NhaCungCap")
        kh_records = db_manager.get_all("KhachHang")

        ncc_map = {str(n.get("id", "")).strip(): str(n.get("ten_ncc", "")).strip() for n in ncc_records}
        kh_map = {str(k.get("id", "")).strip(): str(k.get("ten_kh", "")).strip() for k in kh_records}

        if loai in ("all", "nhap"):
            nhap_records = db_manager.get_all("NhapHang")
            for rec in nhap_records:
                ngay = str(rec.get("ngay_nhap", ""))
                if from_date and ngay < from_date:
                    continue
                if to_date and ngay > to_date:
                    continue
                ma = str(rec.get("ma_hang", ""))
                ten = str(rec.get("ten_hang", ""))
                if search and search.lower() not in ma.lower() and search.lower() not in ten.lower():
                    continue
                raw_ncc = str(rec.get("nha_cung_cap_id", "")).strip()
                combined.append({
                    "loai": "Nhập",
                    "so_phieu": str(rec.get("so_phieu", "")),
                    "ngay": ngay,
                    "ma_hang": ma,
                    "ten_hang": ten,
                    "so_luong": int(rec.get("so_luong", 0) or 0),
                    "don_gia": float(rec.get("gia_nhap", 0) or 0),
                    "thanh_tien": float(rec.get("thanh_tien", 0) or 0),
                    "doi_tac": ncc_map.get(raw_ncc, raw_ncc),
                    "ghi_chu": str(rec.get("ghi_chu", "")),
                })

        if loai in ("all", "xuat"):
            xuat_records = db_manager.get_all("XuatHang")
            for rec in xuat_records:
                ngay = str(rec.get("ngay_xuat", ""))
                if from_date and ngay < from_date:
                    continue
                if to_date and ngay > to_date:
                    continue
                ma = str(rec.get("ma_hang", ""))
                ten = str(rec.get("ten_hang", ""))
                if search and search.lower() not in ma.lower() and search.lower() not in ten.lower():
                    continue
                raw_kh = str(rec.get("khach_hang_id", "")).strip()
                combined.append({
                    "loai": "Xuất",
                    "so_phieu": str(rec.get("so_phieu", "")),
                    "ngay": ngay,
                    "ma_hang": ma,
                    "ten_hang": ten,
                    "so_luong": int(rec.get("so_luong", 0) or 0),
                    "don_gia": float(rec.get("gia_ban", 0) or 0),
                    "thanh_tien": float(rec.get("thanh_tien", 0) or 0),
                    "doi_tac": kh_map.get(raw_kh, raw_kh),
                    "ghi_chu": str(rec.get("ghi_chu", "")),
                })

        combined.sort(key=lambda x: x["ngay"], reverse=True)
        total = len(combined)
        start = (page - 1) * PAGE_SIZE
        end = start + PAGE_SIZE
        paged = combined[start:end]

        return {
            "success": True,
            "data": paged,
            "total": total,
            "page": page,
            "page_size": PAGE_SIZE,
            "total_pages": (total + PAGE_SIZE - 1) // PAGE_SIZE if total > 0 else 1,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
