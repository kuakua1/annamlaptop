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
    month: str = "",
    from_date: str = "",
    to_date: str = "",
    search: str = "",
    page: int = 1,
    page_size: int = 100,
    user: str = Depends(require_login)
):
    try:
        combined = []

        dt_records = db_manager.get_all("DoiTuong")
        ncc_records = db_manager.get_all("NhaCungCap")
        kh_records = db_manager.get_all("KhachHang")
        hang_records = db_manager.get_all("HangHoa")
        dvt_map = {str(h.get("ma_hang", "")).strip(): str(h.get("don_vi_tinh", "Cái")) for h in hang_records}

        dt_lookup = {}
        for d in (dt_records + ncc_records + kh_records):
            did = str(d.get("id", "")).strip()
            name = str(d.get("ten") or d.get("ten_ncc") or d.get("ten_kh") or "").strip()
            phone = str(d.get("dien_thoai", "")).strip()
            if did and did not in dt_lookup:
                dt_lookup[did] = name
            if did and did.lower() not in dt_lookup:
                dt_lookup[did.lower()] = name

        s_lower = search.lower().strip() if search else ""

        if loai in ("all", "nhap"):
            nhap_records = db_manager.get_all("NhapHang")
            for rec in nhap_records:
                ngay = str(rec.get("ngay_nhap", "") or rec.get("ngay", ""))
                if month and not ngay.startswith(month):
                    continue
                if from_date and ngay < from_date:
                    continue
                if to_date and ngay > to_date:
                    continue

                ma = str(rec.get("ma_hang", ""))
                ten = str(rec.get("ten_hang", ""))
                so_phieu = str(rec.get("so_phieu", ""))
                raw_ncc = str(rec.get("nha_cung_cap_id", "") or rec.get("ten_ncc", "")).strip()
                doi_tac = dt_lookup.get(raw_ncc, dt_lookup.get(raw_ncc.lower(), raw_ncc)) or "Nhà cung cấp lẻ"
                sdt = str(rec.get("dien_thoai", "")).strip()
                dia_chi = str(rec.get("dia_chi", "")).strip()
                ghi_chu = str(rec.get("ghi_chu", "")).strip()

                if s_lower:
                    full_text = f"{ma} {ten} {so_phieu} {doi_tac} {sdt} {dia_chi} {ghi_chu}".lower()
                    if s_lower not in full_text:
                        continue

                thanh_tien = float(rec.get("thanh_tien", 0) or 0)
                raw_no = rec.get("cong_no")
                cong_no = float(raw_no) if (raw_no is not None and str(raw_no).strip() != "") else thanh_tien

                combined.append({
                    "id": str(rec.get("id", "")),
                    "loai": "Nhập",
                    "loai_code": "nhap",
                    "so_phieu": so_phieu,
                    "ngay": ngay,
                    "ma_hang": ma,
                    "ten_hang": ten,
                    "don_vi_tinh": dvt_map.get(ma, "Cái"),
                    "so_luong": int(rec.get("so_luong", 0) or 0),
                    "don_gia": float(rec.get("gia_nhap", 0) or 0),
                    "thanh_tien": thanh_tien,
                    "cong_no": cong_no,
                    "tien_no": cong_no,
                    "doi_tac": doi_tac,
                    "dien_thoai": sdt,
                    "dia_chi": dia_chi,
                    "ghi_chu": ghi_chu,
                })

        if loai in ("all", "xuat"):
            xuat_records = db_manager.get_all("XuatHang")
            for rec in xuat_records:
                ngay = str(rec.get("ngay_xuat", "") or rec.get("ngay", ""))
                if month and not ngay.startswith(month):
                    continue
                if from_date and ngay < from_date:
                    continue
                if to_date and ngay > to_date:
                    continue

                ma = str(rec.get("ma_hang", ""))
                ten = str(rec.get("ten_hang", ""))
                so_phieu = str(rec.get("so_phieu", ""))
                raw_kh = str(rec.get("khach_hang_id", "") or rec.get("ten_kh", "")).strip()
                doi_tac = dt_lookup.get(raw_kh, dt_lookup.get(raw_kh.lower(), raw_kh)) or "Khách lẻ"
                sdt = str(rec.get("dien_thoai", "")).strip()
                dia_chi = str(rec.get("dia_chi", "")).strip()
                ghi_chu = str(rec.get("ghi_chu", "")).strip()

                if s_lower:
                    full_text = f"{ma} {ten} {so_phieu} {doi_tac} {sdt} {dia_chi} {ghi_chu}".lower()
                    if s_lower not in full_text:
                        continue

                thanh_tien = float(rec.get("thanh_tien", 0) or 0)
                raw_no = rec.get("tien_khach_no") if rec.get("tien_khach_no") is not None else rec.get("cong_no")
                tien_no = float(raw_no) if (raw_no is not None and str(raw_no).strip() != "") else thanh_tien

                combined.append({
                    "id": str(rec.get("id", "")),
                    "loai": "Xuất",
                    "loai_code": "xuat",
                    "so_phieu": so_phieu,
                    "ngay": ngay,
                    "ma_hang": ma,
                    "ten_hang": ten,
                    "don_vi_tinh": dvt_map.get(ma, "Cái"),
                    "so_luong": int(rec.get("so_luong", 0) or 0),
                    "don_gia": float(rec.get("gia_ban", 0) or 0),
                    "thanh_tien": thanh_tien,
                    "cong_no": tien_no,
                    "tien_no": tien_no,
                    "doi_tac": doi_tac,
                    "dien_thoai": sdt,
                    "dia_chi": dia_chi,
                    "ghi_chu": ghi_chu,
                })

        combined.sort(key=lambda x: (x["ngay"], x["id"]), reverse=True)
        total = len(combined)
        total_sl = sum(x["so_luong"] for x in combined)
        total_tien = sum(x["thanh_tien"] for x in combined)
        total_no = sum(x["tien_no"] for x in combined)

        eff_page_size = page_size if page_size > 0 else PAGE_SIZE
        start = (page - 1) * eff_page_size
        end = start + eff_page_size
        paged = combined[start:end]

        return {
            "success": True,
            "data": paged,
            "all_data": combined,
            "total": total,
            "tong_so_luong": total_sl,
            "tong_thanh_tien": total_tien,
            "tong_tien_no": total_no,
            "tong_cong_no": total_no,
            "page": page,
            "page_size": eff_page_size,
            "total_pages": (total + eff_page_size - 1) // eff_page_size if total > 0 else 1,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
