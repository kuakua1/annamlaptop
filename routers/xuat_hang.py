from fastapi import APIRouter, Request, HTTPException, Depends
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates

from routers.auth import get_current_user, require_login
from models.schemas import XuatHangCreate
from services.sheets_service import sheets_service
from config import SHEET_XUAT_HANG, SHEET_HANG_HOA, SHEET_KHACH_HANG

router = APIRouter()
templates = Jinja2Templates(directory="static/templates")


@router.get("/xuat-hang", response_class=HTMLResponse)
async def xuat_hang_page(request: Request):
    user = get_current_user(request)
    if not user:
        from fastapi.responses import RedirectResponse
        return RedirectResponse(url="/login")
    return templates.TemplateResponse("xuat_hang.html", {"request": request, "username": user})


@router.get("/bang-xuat-kho", response_class=HTMLResponse)
async def bang_xuat_kho_page(request: Request):
    user = get_current_user(request)
    if not user:
        from fastapi.responses import RedirectResponse
        return RedirectResponse(url="/login")
    return templates.TemplateResponse("bang_xuat_kho.html", {"request": request, "username": user})


@router.get("/api/xuat-hang")
async def get_xuat_hang(
    request: Request,
    from_date: str = "",
    to_date: str = "",
    month: str = "",
    search: str = "",
    user: str = Depends(require_login)
):
    try:
        records = sheets_service.get_all_records(SHEET_XUAT_HANG)
        kh_records = sheets_service.get_all_records(SHEET_KHACH_HANG)
        hang_records = sheets_service.get_all_records(SHEET_HANG_HOA)

        kh_map = {}
        for k in kh_records:
            ten = str(k.get("ten_kh", "")).strip()
            kid = str(k.get("id", "")).strip()
            kh_data = {
                "ten_kh": ten,
                "dien_thoai": str(k.get("dien_thoai", "")),
                "dia_chi": str(k.get("dia_chi", "")),
            }
            if ten:
                kh_map[ten.lower()] = kh_data
            if kid:
                kh_map[kid] = kh_data

        dvt_map = {str(h.get("ma_hang", "")): str(h.get("don_vi_tinh", "Cái")) for h in hang_records}

        result = []
        for i, rec in enumerate(records):
            ngay = str(rec.get("ngay_xuat", ""))
            if month and not ngay.startswith(month):
                continue
            if from_date and ngay < from_date:
                continue
            if to_date and ngay > to_date:
                continue

            kh_key = str(rec.get("khach_hang_id", "")).strip()
            matched_kh = kh_map.get(kh_key.lower()) or kh_map.get(kh_key) or {}
            kh_ten = matched_kh.get("ten_kh") or kh_key
            kh_sdt = matched_kh.get("dien_thoai", "")
            kh_dia_chi = matched_kh.get("dia_chi", "")

            ma = str(rec.get("ma_hang", ""))
            ten = str(rec.get("ten_hang", ""))
            so_phieu = str(rec.get("so_phieu", ""))
            ghi_chu = str(rec.get("ghi_chu", ""))

            if search:
                s_lower = search.lower().strip()
                searchable_text = f"{ma} {ten} {so_phieu} {kh_ten} {kh_sdt} {kh_dia_chi} {ghi_chu}".lower()
                if s_lower not in searchable_text:
                    continue

            thanh_tien = float(rec.get("thanh_tien", 0) or 0)
            gia_von = float(rec.get("gia_von", 0) or 0)
            loi_nhuan = float(rec.get("loi_nhuan", 0) or 0)

            item = {
                "id": str(rec.get("id", "")),
                "so_phieu": so_phieu,
                "ngay_xuat": ngay,
                "ma_hang": ma,
                "ten_hang": ten,
                "don_vi_tinh": dvt_map.get(ma, "Cái"),
                "so_luong": int(rec.get("so_luong", 0) or 0),
                "gia_ban": float(rec.get("gia_ban", 0) or 0),
                "thanh_tien": thanh_tien,
                "khach_hang_id": kh_key,
                "kh_ten": kh_ten,
                "kh_sdt": kh_sdt,
                "kh_dia_chi": kh_dia_chi,
                "ghi_chu": ghi_chu,
                "gia_von": gia_von,
                "loi_nhuan": loi_nhuan,
                "row_num": i + 2,
            }
            result.append(item)

        result.sort(key=lambda x: (x["ngay_xuat"], x["id"]), reverse=True)
        total_sl = sum(x["so_luong"] for x in result)
        total_tien = sum(x["thanh_tien"] for x in result)
        total_von = sum(x["gia_von"] for x in result)
        total_lai = sum(x["loi_nhuan"] for x in result)

        return {
            "success": True,
            "data": result,
            "total": len(result),
            "tong_so_luong": total_sl,
            "tong_thanh_tien": total_tien,
            "tong_gia_von": total_von,
            "tong_loi_nhuan": total_lai
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/xuat-hang")
async def create_xuat_hang(
    data: XuatHangCreate,
    request: Request,
    user: str = Depends(require_login)
):
    if not data.items:
        raise HTTPException(status_code=400, detail="Phiếu xuất phải có ít nhất 1 mặt hàng")

    kh_ten = (data.khach_hang_ten or "").strip()
    kh_dia_chi = (data.khach_hang_dia_chi or "").strip()
    kh_sdt = (data.khach_hang_sdt or "").strip()
    kh_id = (data.khach_hang_id or "").strip()

    if not kh_ten:
        raise HTTPException(status_code=400, detail="Vui lòng nhập Tên Khách Hàng")
    if not kh_dia_chi:
        raise HTTPException(status_code=400, detail="Vui lòng nhập Địa Chỉ Khách Hàng")
    if not kh_sdt:
        raise HTTPException(status_code=400, detail="Vui lòng nhập Số Điện Thoại Khách Hàng")

    for item in data.items:
        if item.gia_ban is None or item.gia_ban < 0:
            raise HTTPException(
                status_code=400,
                detail=f"Giá bán của mặt hàng {item.ten_hang or item.ma_hang} không được để trống hoặc âm"
            )

    try:
        # Check stock availability first
        for item in data.items:
            _, rec = sheets_service.find_hang_hoa_by_ma(item.ma_hang)
            if rec is None:
                raise HTTPException(status_code=404, detail=f"Không tìm thấy hàng hóa mã {item.ma_hang}")
            ton_kho = int(rec.get("ton_kho", 0) or 0)
            if ton_kho < item.so_luong:
                raise HTTPException(
                    status_code=400,
                    detail=f"Hàng {item.ten_hang} chỉ còn {ton_kho} {rec.get('don_vi_tinh','')}, không đủ {item.so_luong}"
                )

        so_phieu = sheets_service.generate_so_phieu_xuat(data.ngay_xuat)

        # ── Tự động lưu khách hàng vào database nếu chưa có ──────────────
        if kh_ten or kh_id or kh_sdt:
            kh_list = sheets_service.get_all_records(SHEET_KHACH_HANG)
            matched = None

            # 1. Khớp theo ID nếu chọn từ gợi ý khách hàng
            if kh_id:
                for k in kh_list:
                    if str(k.get("id", "")).strip() == kh_id:
                        matched = k
                        break

            # 2. Khớp theo Số Điện Thoại (SĐT là duy nhất, phân biệt khách trùng tên)
            if not matched and kh_sdt:
                for k in kh_list:
                    k_sdt = str(k.get("dien_thoai", "")).strip()
                    if k_sdt and k_sdt == kh_sdt:
                        matched = k
                        break

            # 3. Khớp theo Tên chỉ khi khách cũ chưa có SĐT hoặc trùng SĐT
            if not matched and kh_ten:
                for k in kh_list:
                    k_ten = str(k.get("ten_kh", "")).strip().lower()
                    k_sdt = str(k.get("dien_thoai", "")).strip()
                    if k_ten == kh_ten.lower():
                        if not k_sdt or not kh_sdt or k_sdt == kh_sdt:
                            matched = k
                            break

            # Nếu chưa có -> Tạo khách hàng mới với ID duy nhất
            if not matched:
                new_kh_id = sheets_service.new_id()
                kh_row = [
                    new_kh_id,
                    kh_ten,
                    kh_dia_chi,
                    kh_sdt,
                    "",
                    "Tự động lưu từ phiếu xuất",
                ]
                sheets_service.append_row(SHEET_KHACH_HANG, kh_row)
                kh_id = new_kh_id
            else:
                kh_id = str(matched.get("id", "")).strip()
                # Cập nhật SĐT hoặc Địa chỉ nếu khách cũ chưa có
                if (not matched.get("dien_thoai") and kh_sdt) or (not matched.get("dia_chi") and kh_dia_chi):
                    row_idx = None
                    for idx, k in enumerate(kh_list):
                        if str(k.get("id", "")).strip() == kh_id:
                            row_idx = idx + 2
                            break
                    if row_idx:
                        updated_row = [
                            kh_id,
                            str(matched.get("ten_kh", "")) or kh_ten,
                            kh_dia_chi or str(matched.get("dia_chi", "")),
                            kh_sdt or str(matched.get("dien_thoai", "")),
                            str(matched.get("email", "")),
                            str(matched.get("ghi_chu", "")),
                        ]
                        sheets_service.update_row(SHEET_KHACH_HANG, row_idx, updated_row)

        # Luôn lưu ID khách hàng vào phiếu xuất để định danh chuẩn xác 100%
        kh_save_ref = kh_id if kh_id else kh_ten
        created_rows = []

        for item in data.items:
            new_id = sheets_service.new_id()
            thanh_tien = item.so_luong * item.gia_ban
            # Deduct stock using FIFO from price batches and get exact COGS
            _, _, gia_von = sheets_service.xuat_hang_batch(item.ma_hang, item.so_luong)
            loi_nhuan = float(thanh_tien) - float(gia_von)
            row = [
                new_id,
                so_phieu,
                data.ngay_xuat,
                item.ma_hang,
                item.ten_hang,
                item.so_luong,
                float(item.gia_ban),
                float(thanh_tien),
                kh_save_ref,
                data.ghi_chu or "",
                float(gia_von),
                float(loi_nhuan),
            ]
            row_num = sheets_service.append_row(SHEET_XUAT_HANG, row)
            created_rows.append({
                "id": new_id,
                "so_phieu": so_phieu,
                "ngay_xuat": data.ngay_xuat,
                "ma_hang": item.ma_hang,
                "ten_hang": item.ten_hang,
                "so_luong": item.so_luong,
                "gia_ban": item.gia_ban,
                "thanh_tien": thanh_tien,
                "khach_hang_id": kh_id,
                "khach_hang_ten": kh_ten,
                "ghi_chu": data.ghi_chu,
                "gia_von": gia_von,
                "loi_nhuan": loi_nhuan,
                "row_num": row_num,
            })

        return {
            "success": True,
            "message": f"Tạo phiếu xuất {so_phieu} thành công",
            "so_phieu": so_phieu,
            "data": created_rows
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/xuat-hang/{so_phieu}")
async def get_xuat_hang_detail(
    so_phieu: str,
    request: Request,
    user: str = Depends(require_login)
):
    try:
        records = sheets_service.get_all_records(SHEET_XUAT_HANG)
        kh_records = sheets_service.get_all_records(SHEET_KHACH_HANG)
        hang_records = sheets_service.get_all_records(SHEET_HANG_HOA)
        dvt_map = {str(h.get("ma_hang", "")): str(h.get("don_vi_tinh", "Cái")) for h in hang_records}

        items = []
        total = 0.0
        total_sl = 0
        ngay_xuat = ""
        kh_name = ""
        ghi_chu = ""

        for rec in records:
            if str(rec.get("so_phieu", "")) == so_phieu:
                thanh_tien = float(rec.get("thanh_tien", 0) or 0)
                sl = int(rec.get("so_luong", 0) or 0)
                total += thanh_tien
                total_sl += sl
                if not ngay_xuat:
                    ngay_xuat = str(rec.get("ngay_xuat", ""))
                if not kh_name:
                    kh_name = str(rec.get("khach_hang_id", ""))
                if not ghi_chu:
                    ghi_chu = str(rec.get("ghi_chu", ""))
                ma_hang = str(rec.get("ma_hang", ""))
                items.append({
                    "id": str(rec.get("id", "")),
                    "so_phieu": so_phieu,
                    "ngay_xuat": ngay_xuat,
                    "ma_hang": ma_hang,
                    "ten_hang": str(rec.get("ten_hang", "")),
                    "don_vi_tinh": dvt_map.get(ma_hang, "Cái"),
                    "so_luong": sl,
                    "gia_ban": float(rec.get("gia_ban", 0) or 0),
                    "thanh_tien": thanh_tien,
                    "khach_hang_id": kh_name,
                    "ghi_chu": str(rec.get("ghi_chu", "")),
                })
        if not items:
            raise HTTPException(status_code=404, detail=f"Không tìm thấy phiếu {so_phieu}")

        kh_info = {"ten_kh": kh_name, "dien_thoai": "", "dia_chi": ""}
        if kh_name:
            for k in kh_records:
                if str(k.get("ten_kh", "")).strip().lower() == kh_name.lower() or str(k.get("id", "")) == kh_name:
                    kh_info["ten_kh"] = str(k.get("ten_kh", "")) or kh_name
                    kh_info["dien_thoai"] = str(k.get("dien_thoai", ""))
                    kh_info["dia_chi"] = str(k.get("dia_chi", ""))
                    break

        return {
            "success": True,
            "so_phieu": so_phieu,
            "ngay_xuat": ngay_xuat,
            "khach_hang": kh_info,
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
