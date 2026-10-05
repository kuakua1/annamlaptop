from fastapi import APIRouter, Request, HTTPException, Depends
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates
import time

from routers.auth import get_current_user, require_login
from models.schemas import NhapHangCreate
from services.db_service import db_manager

router = APIRouter()
templates = Jinja2Templates(directory="static/templates")


@router.get("/nhap-hang", response_class=HTMLResponse)
async def nhap_hang_page(request: Request):
    user = get_current_user(request)
    if not user:
        from fastapi.responses import RedirectResponse
        return RedirectResponse(url="/login")
    return templates.TemplateResponse("nhap_hang.html", {"request": request, "username": user})


@router.get("/bang-nhap-kho", response_class=HTMLResponse)
async def bang_nhap_kho_page(request: Request):
    user = get_current_user(request)
    if not user:
        from fastapi.responses import RedirectResponse
        return RedirectResponse(url="/login")
    return templates.TemplateResponse("bang_nhap_kho.html", {"request": request, "username": user})


@router.get("/api/nhap-hang")
async def get_nhap_hang(
    request: Request,
    from_date: str = "",
    to_date: str = "",
    month: str = "",
    search: str = "",
    user: str = Depends(require_login)
):
    try:
        records = db_manager.get_all("NhapHang")
        ncc_records = db_manager.get_all("NhaCungCap")
        hang_records = db_manager.get_all("HangHoa")

        ncc_map = {}
        for n in ncc_records:
            ten = str(n.get("ten_ncc", "")).strip()
            nid = str(n.get("id", "")).strip()
            ncc_data = {
                "ten_ncc": ten,
                "dien_thoai": str(n.get("dien_thoai", "")),
                "dia_chi": str(n.get("dia_chi", "")),
            }
            if ten:
                ncc_map[ten.lower()] = ncc_data
            if nid:
                ncc_map[nid] = ncc_data

        dvt_map = {str(h.get("ma_hang", "")): str(h.get("don_vi_tinh", "Cái")) for h in hang_records}

        result = []
        for i, rec in enumerate(records):
            ngay = str(rec.get("ngay_nhap", ""))
            if month and not ngay.startswith(month):
                continue
            if from_date and ngay < from_date:
                continue
            if to_date and ngay > to_date:
                continue

            ncc_key = str(rec.get("nha_cung_cap_id", "")).strip()
            matched_ncc = ncc_map.get(ncc_key.lower()) or ncc_map.get(ncc_key) or {}
            ncc_ten = matched_ncc.get("ten_ncc") or ncc_key
            ncc_sdt = matched_ncc.get("dien_thoai", "")
            ncc_dia_chi = matched_ncc.get("dia_chi", "")

            ma = str(rec.get("ma_hang", ""))
            ten = str(rec.get("ten_hang", ""))
            so_phieu = str(rec.get("so_phieu", ""))
            ghi_chu = str(rec.get("ghi_chu", ""))

            if search:
                s_lower = search.lower().strip()
                searchable_text = f"{ma} {ten} {so_phieu} {ncc_ten} {ncc_sdt} {ncc_dia_chi} {ghi_chu}".lower()
                if s_lower not in searchable_text:
                    continue

            item = {
                "id": str(rec.get("id", "")),
                "so_phieu": so_phieu,
                "ngay_nhap": ngay,
                "ma_hang": ma,
                "ten_hang": ten,
                "don_vi_tinh": dvt_map.get(ma, "Cái"),
                "so_luong": int(rec.get("so_luong", 0) or 0),
                "gia_nhap": float(rec.get("gia_nhap", 0) or 0),
                "thanh_tien": float(rec.get("thanh_tien", 0) or 0),
                "nha_cung_cap_id": ncc_key,
                "ncc_ten": ncc_ten,
                "ncc_sdt": ncc_sdt,
                "ncc_dia_chi": ncc_dia_chi,
                "ghi_chu": ghi_chu,
                "row_num": i + 2,
            }
            result.append(item)

        result.sort(key=lambda x: (x["ngay_nhap"], x["id"]), reverse=True)
        total_sl = sum(x["so_luong"] for x in result)
        total_tien = sum(x["thanh_tien"] for x in result)
        return {
            "success": True,
            "data": result,
            "total": len(result),
            "tong_so_luong": total_sl,
            "tong_tien": total_tien,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/nhap-hang")
async def create_nhap_hang(
    data: NhapHangCreate,
    request: Request,
    user: str = Depends(require_login)
):
    if not data.items:
        raise HTTPException(status_code=400, detail="Phiếu nhập phải có ít nhất 1 mặt hàng")

    ncc_ten = (data.nha_cung_cap_ten or "").strip()
    ncc_id = (data.nha_cung_cap_id or "").strip()
    ncc_dia_chi = (data.nha_cung_cap_dia_chi or data.dia_chi or "").strip()
    ncc_sdt = (data.nha_cung_cap_sdt or data.dien_thoai or "").strip()

    if not ncc_ten and not ncc_id:
        raise HTTPException(status_code=400, detail="Vui lòng nhập Tên Nhà Cung Cấp")
    if not ncc_dia_chi:
        raise HTTPException(status_code=400, detail="Vui lòng nhập Địa Chỉ Nhà Cung Cấp")
    if not ncc_sdt:
        raise HTTPException(status_code=400, detail="Vui lòng nhập Số Điện Thoại Nhà Cung Cấp")

    try:
        # Tự động lưu/khớp Nhà Cung Cấp
        if ncc_ten or ncc_id or ncc_sdt:
            ncc_list = db_manager.get_all("NhaCungCap")
            matched = None
            if ncc_id:
                for n in ncc_list:
                    if str(n.get("id", "")).strip() == ncc_id:
                        matched = n
                        break
            if not matched and ncc_sdt:
                for n in ncc_list:
                    if str(n.get("dien_thoai", "")).strip() == ncc_sdt:
                        matched = n
                        break
            if not matched and ncc_ten:
                for n in ncc_list:
                    if str(n.get("ten_ncc", "")).strip().lower() == ncc_ten.lower():
                        matched = n
                        break

            if not matched:
                new_ncc_id = str(int(time.time() * 1000))
                db_manager.insert_nha_cung_cap({
                    "id": new_ncc_id,
                    "ten_ncc": ncc_ten,
                    "dia_chi": ncc_dia_chi,
                    "dien_thoai": ncc_sdt,
                    "email": "",
                    "ghi_chu": "Tự động lưu từ phiếu nhập",
                })
                ncc_id = new_ncc_id
            else:
                ncc_id = str(matched.get("id", "")).strip()

        ncc_save_ref = ncc_id if ncc_id else ncc_ten
        so_phieu = db_manager.generate_so_phieu_nhap(data.ngay_nhap)

        items_payload = []
        for it in data.items:
            items_payload.append({
                "ma_hang": it.ma_hang,
                "ten_hang": it.ten_hang,
                "so_luong": it.so_luong,
                "gia_nhap": float(it.gia_nhap)
            })

        created_rows = db_manager.create_nhap_hang_transaction(
            so_phieu=so_phieu,
            ngay_nhap=data.ngay_nhap,
            ncc_save_ref=ncc_save_ref,
            ghi_chu=data.ghi_chu or "",
            items=items_payload
        )

        return {
            "success": True,
            "message": f"Tạo phiếu nhập {so_phieu} thành công",
            "so_phieu": so_phieu,
            "data": created_rows
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/nhap-hang/{so_phieu:path}")
async def get_nhap_hang_detail(
    so_phieu: str,
    request: Request,
    user: str = Depends(require_login)
):
    try:
        records = db_manager.get_all("NhapHang")
        ncc_records = db_manager.get_all("NhaCungCap")
        hang_records = db_manager.get_all("HangHoa")
        dvt_map = {str(h.get("ma_hang", "")): str(h.get("don_vi_tinh", "Cái")) for h in hang_records}

        items = []
        total = 0.0
        total_sl = 0
        ngay_nhap = ""
        ncc_name = ""
        ghi_chu = ""

        for rec in records:
            if str(rec.get("so_phieu", "")) == so_phieu:
                thanh_tien = float(rec.get("thanh_tien", 0) or 0)
                sl = int(rec.get("so_luong", 0) or 0)
                total += thanh_tien
                total_sl += sl
                if not ngay_nhap:
                    ngay_nhap = str(rec.get("ngay_nhap", ""))
                if not ncc_name:
                    ncc_name = str(rec.get("nha_cung_cap_id", ""))
                if not ghi_chu:
                    ghi_chu = str(rec.get("ghi_chu", ""))
                ma_hang = str(rec.get("ma_hang", ""))
                items.append({
                    "id": str(rec.get("id", "")),
                    "so_phieu": so_phieu,
                    "ngay_nhap": ngay_nhap,
                    "ma_hang": ma_hang,
                    "ten_hang": str(rec.get("ten_hang", "")),
                    "don_vi_tinh": dvt_map.get(ma_hang, "Cái"),
                    "so_luong": sl,
                    "gia_nhap": float(rec.get("gia_nhap", 0) or 0),
                    "thanh_tien": thanh_tien,
                    "nha_cung_cap_id": ncc_name,
                    "ghi_chu": str(rec.get("ghi_chu", "")),
                })
        if not items:
            raise HTTPException(status_code=404, detail=f"Không tìm thấy phiếu {so_phieu}")

        ncc_info = {"ten_ncc": ncc_name, "dien_thoai": "", "dia_chi": ""}
        if ncc_name:
            for n in ncc_records:
                if str(n.get("ten_ncc", "")).strip().lower() == ncc_name.lower() or str(n.get("id", "")) == ncc_name:
                    ncc_info["ten_ncc"] = str(n.get("ten_ncc", "")) or ncc_name
                    ncc_info["dien_thoai"] = str(n.get("dien_thoai", ""))
                    ncc_info["dia_chi"] = str(n.get("dia_chi", ""))
                    break

        return {
            "success": True,
            "so_phieu": so_phieu,
            "ngay_nhap": ngay_nhap,
            "nha_cung_cap": ncc_info,
            "ghi_chu": ghi_chu,
            "tong_so_luong": total_sl,
            "so_mat_hang": len(items),
            "items": items,
            "total": total
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
