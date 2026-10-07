from fastapi import APIRouter, Request, HTTPException, Depends
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates
import time

from routers.auth import get_current_user, require_login
from models.schemas import XuatHangCreate, XuatHangUpdate
from services.db_service import db_manager

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
        records = db_manager.get_all("XuatHang")
        kh_records = db_manager.get_all("DoiTuong") or db_manager.get_all("KhachHang")
        hang_records = db_manager.get_all("HangHoa")

        kh_map = {}
        for k in kh_records:
            ten = str(k.get("ten") or k.get("ten_kh") or k.get("ten_ncc") or "").strip()
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

        # Bảng phụ đối soát phiếu thu từ Sổ Quỹ để triệt tiêu công nợ ảo
        so_quy_records = db_manager.get_all("SoQuy")
        thu_by_sp = {}
        for sq in so_quy_records:
            loai = str(sq.get("loai_phieu") or sq.get("loai") or "").strip().upper()
            if loai == "THU":
                plq = str(sq.get("phieu_lien_quan") or sq.get("so_phieu_lien_quan") or "").strip().upper()
                st = float(sq.get("so_tien", 0) or 0)
                if plq and plq != "ALL" and st > 0:
                    thu_by_sp[plq] = thu_by_sp.get(plq, 0.0) + st

        tot_by_sp = {}
        for r in records:
            sp_key = str(r.get("so_phieu", "")).strip().upper()
            if sp_key:
                tot_by_sp[sp_key] = tot_by_sp.get(sp_key, 0.0) + float(r.get("thanh_tien", 0) or 0)

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
            raw_no = rec.get("tien_khach_no")
            tien_khach_no = float(raw_no) if (raw_no is not None and str(raw_no).strip() != "") else thanh_tien

            # Tự động triệt tiêu công nợ nếu phiếu xuất đã được lập phiếu thu
            sp_key = so_phieu.strip().upper()
            paid_amount = thu_by_sp.get(sp_key, 0.0)
            tot_invoice = tot_by_sp.get(sp_key, 0.0)
            if paid_amount >= tot_invoice and tot_invoice > 0:
                tien_khach_no = 0.0
            elif paid_amount > 0:
                rem_receipt_debt = max(0.0, tot_invoice - paid_amount)
                tien_khach_no = min(tien_khach_no, rem_receipt_debt)

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
                "tien_khach_no": tien_khach_no,
                "cong_no": tien_khach_no,
                "row_num": i + 2,
            }
            result.append(item)

        result.sort(key=lambda x: (x["ngay_xuat"], x["id"]), reverse=True)
        total_sl = sum(x["so_luong"] for x in result)
        total_tien = sum(x["thanh_tien"] for x in result)
        total_profit = sum(x["loi_nhuan"] for x in result)
        total_khach_no = sum(x["tien_khach_no"] for x in result)
        return {
            "success": True,
            "data": result,
            "total": len(result),
            "tong_so_luong": total_sl,
            "tong_tien": total_tien,
            "tong_loi_nhuan": total_profit,
            "tong_khach_no": total_khach_no,
            "tong_cong_no": total_khach_no,
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
    kh_id = (data.khach_hang_id or "").strip()
    kh_dia_chi = (data.khach_hang_dia_chi or data.dia_chi or "").strip()
    kh_sdt = (data.khach_hang_sdt or data.dien_thoai or "").strip()

    if not kh_ten and not kh_id:
        raise HTTPException(status_code=400, detail="Vui lòng nhập Tên Khách Hàng")

    for item in data.items:
        if item.gia_ban is None or item.gia_ban < 0:
            raise HTTPException(
                status_code=400,
                detail=f"Giá bán của mặt hàng {item.ten_hang or item.ma_hang} không được để trống hoặc âm"
            )

    try:
        # 1. Kiểm tra tồn kho trước từ SQLite
        for item in data.items:
            rec = db_manager.get_hang_hoa_by_ma(item.ma_hang)
            if not rec:
                raise HTTPException(status_code=404, detail=f"Không tìm thấy hàng hóa mã {item.ma_hang}")
            ton_kho = int(rec.get("ton_kho", 0) or 0)
            if ton_kho < item.so_luong:
                raise HTTPException(
                    status_code=400,
                    detail=f"Hàng {item.ten_hang} chỉ còn {ton_kho} {rec.get('don_vi_tinh','')}, không đủ {item.so_luong}"
                )

        so_phieu = db_manager.generate_so_phieu_xuat(data.ngay_xuat)

        # 2. Tự động lưu/khớp Đối Tượng / Khách Hàng
        if kh_ten or kh_id or kh_sdt:
            dt_list = db_manager.get_all("DoiTuong")
            matched = None
            if kh_id:
                for d in dt_list:
                    if str(d.get("id", "")).strip() == kh_id:
                        matched = d
                        break
            if not matched and kh_sdt:
                for d in dt_list:
                    d_sdt = str(d.get("dien_thoai", "")).strip()
                    if d_sdt and d_sdt == kh_sdt:
                        matched = d
                        break
            if not matched and kh_ten:
                for d in dt_list:
                    d_ten = str(d.get("ten", "")).strip().lower()
                    if d_ten == kh_ten.lower():
                        matched = d
                        break

            if not matched:
                new_kh_id = str(int(time.time() * 1000))
                db_manager.insert_doi_tuong({
                    "id": new_kh_id,
                    "ten": kh_ten,
                    "phan_loai": "CA_HAI",
                    "dia_chi": kh_dia_chi,
                    "dien_thoai": kh_sdt,
                    "email": "",
                    "ghi_chu": "Tự động lưu từ phiếu xuất",
                })
                # Lưu đồng thời vào KhachHang để tương thích
                try:
                    db_manager.insert_khach_hang({
                        "id": new_kh_id,
                        "ten_kh": kh_ten,
                        "dia_chi": kh_dia_chi,
                        "dien_thoai": kh_sdt,
                        "email": "",
                        "ghi_chu": "Tự động lưu từ phiếu xuất",
                    })
                except Exception:
                    pass
                kh_id = new_kh_id
            else:
                kh_id = str(matched.get("id", "")).strip()
                if (not matched.get("dien_thoai") and kh_sdt) or (not matched.get("dia_chi") and kh_dia_chi):
                    db_manager.update_doi_tuong(kh_id, {
                        "dia_chi": kh_dia_chi or matched.get("dia_chi", ""),
                        "dien_thoai": kh_sdt or matched.get("dien_thoai", "")
                    })

        kh_save_ref = kh_id if kh_id else kh_ten
        items_payload = []
        for item in data.items:
            items_payload.append({
                "ma_hang": item.ma_hang,
                "ten_hang": item.ten_hang,
                "so_luong": item.so_luong,
                "gia_ban": float(item.gia_ban)
            })

        # 3. Tạo phiếu xuất và cập nhật tồn kho FIFO trong SQLite
        created_rows = db_manager.create_xuat_hang_transaction(
            so_phieu=so_phieu,
            ngay_xuat=data.ngay_xuat,
            kh_save_ref=kh_save_ref,
            ghi_chu=data.ghi_chu or "",
            items=items_payload
        )

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


@router.get("/api/xuat-hang/{so_phieu:path}")
async def get_xuat_hang_detail(
    so_phieu: str,
    request: Request,
    user: str = Depends(require_login)
):
    try:
        records = db_manager.get_all("XuatHang")
        all_partners = db_manager.get_all("DoiTuong") + db_manager.get_all("KhachHang")
        hang_records = db_manager.get_all("HangHoa")
        dvt_map = {str(h.get("ma_hang", "")): str(h.get("don_vi_tinh", "Cái")) for h in hang_records}

        items = []
        total = 0.0
        total_sl = 0
        ngay_xuat = ""
        kh_name = ""
        ghi_chu = ""
        rec_phone = ""
        rec_addr = ""

        total_no = 0.0
        for rec in records:
            if str(rec.get("so_phieu", "")) == so_phieu:
                thanh_tien = float(rec.get("thanh_tien", 0) or 0)
                sl = int(rec.get("so_luong", 0) or 0)
                raw_no = rec.get("tien_khach_no")
                line_no = float(raw_no) if (raw_no is not None and str(raw_no).strip() != "") else thanh_tien
                total_no += line_no
                total += thanh_tien
                total_sl += sl
                if not ngay_xuat:
                    ngay_xuat = str(rec.get("ngay_xuat", ""))
                if not kh_name:
                    kh_name = str(rec.get("khach_hang_id", ""))
                if not ghi_chu:
                    ghi_chu = str(rec.get("ghi_chu", ""))
                if not rec_phone and rec.get("dien_thoai"):
                    rec_phone = str(rec.get("dien_thoai")).replace("None", "").strip()
                if not rec_addr and rec.get("dia_chi"):
                    rec_addr = str(rec.get("dia_chi")).replace("None", "").strip()
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
                    "tien_khach_no": line_no,
                    "khach_hang_id": kh_name,
                    "ghi_chu": str(rec.get("ghi_chu", "")),
                })
        if not items:
            raise HTTPException(status_code=404, detail=f"Không tìm thấy phiếu {so_phieu}")

        # Kiểm tra phiếu thu liên quan trong Sổ Quỹ
        so_quy_records = db_manager.get_all("SoQuy")
        sp_clean = so_phieu.strip().upper()
        phieu_thu_list = [
            sq for sq in so_quy_records
            if str(sq.get("loai_phieu", "")).upper() == "THU" and str(sq.get("phieu_lien_quan", "") or sq.get("so_phieu_lien_quan", "")).strip().upper() == sp_clean
        ]
        so_tien_da_thu = sum(float(sq.get("so_tien", 0) or 0) for sq in phieu_thu_list)
        ma_phieu_thu = phieu_thu_list[0].get("ma_phieu") if phieu_thu_list else None
        da_thanh_toan = (total_no <= 0) or (len(phieu_thu_list) > 0 and (so_tien_da_thu >= total or total_no <= 0))
        if so_tien_da_thu >= total and total > 0:
            total_no = 0.0
            da_thanh_toan = True
            for it in items:
                it["tien_khach_no"] = 0.0

        kh_info = {
            "id": kh_name,
            "ten_kh": kh_name,
            "dien_thoai": rec_phone,
            "dia_chi": rec_addr
        }
        if kh_name:
            matched_partner = None
            for k in all_partners:
                kid = str(k.get("id") or "").strip()
                kma = str(k.get("ma") or k.get("ma_doi_tuong") or "").strip()
                if kh_name.lower() in (kid.lower(), kma.lower()):
                    matched_partner = k
                    break
            if not matched_partner:
                for k in all_partners:
                    kname = str(k.get("ten") or k.get("ten_kh") or "").strip()
                    if kname and kh_name.lower() == kname.lower():
                        matched_partner = k
                        break
            if matched_partner:
                real_name = str(matched_partner.get("ten") or matched_partner.get("ten_kh") or "").strip()
                p_phone = str(matched_partner.get("dien_thoai") or "").replace("None", "").strip()
                p_addr = str(matched_partner.get("dia_chi") or "").replace("None", "").strip()
                kh_info["ten_kh"] = real_name or kh_name
                kh_info["dien_thoai"] = p_phone or rec_phone
                kh_info["dia_chi"] = p_addr or rec_addr

        return {
            "success": True,
            "so_phieu": so_phieu,
            "ngay_xuat": ngay_xuat,
            "khach_hang": kh_info,
            "khach_hang_id": kh_info.get("id") or kh_name,
            "khach_hang_ten": kh_info.get("ten_kh") or kh_name,
            "dien_thoai": kh_info.get("dien_thoai", ""),
            "dia_chi": kh_info.get("dia_chi", ""),
            "ghi_chu": ghi_chu,
            "tong_so_luong": total_sl,
            "so_mat_hang": len(items),
            "items": items,
            "total": total,
            "total_no": total_no,
            "da_thanh_toan": da_thanh_toan,
            "ma_phieu_thu": ma_phieu_thu,
            "so_tien_da_thu": so_tien_da_thu,
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/api/xuat-hang/{so_phieu:path}")
async def delete_xuat_hang(
    so_phieu: str,
    request: Request,
    user: str = Depends(require_login)
):
    try:
        ok = db_manager.delete_xuat_hang_receipt(so_phieu)
        if not ok:
            raise HTTPException(status_code=404, detail=f"Không tìm thấy phiếu xuất {so_phieu}")
        return {"success": True, "message": f"Đã xóa thành công phiếu xuất {so_phieu} và hoàn trả hàng về kho"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/api/xuat-hang/{so_phieu:path}")
async def update_xuat_hang(
    so_phieu: str,
    data: XuatHangUpdate,
    request: Request,
    user: str = Depends(require_login)
):
    if not data.items:
        raise HTTPException(status_code=400, detail="Phiếu xuất phải có ít nhất 1 mặt hàng")

    for item in data.items:
        if item.gia_ban is None or item.gia_ban < 0:
            raise HTTPException(
                status_code=400,
                detail=f"Giá bán của mặt hàng {item.ten_hang or item.ma_hang} không được để trống hoặc âm"
            )

    try:
        old_records = [r for r in db_manager.get_all("XuatHang") if str(r.get("so_phieu", "")) == so_phieu]
        if not old_records:
            raise HTTPException(status_code=404, detail=f"Không tìm thấy phiếu xuất {so_phieu}")

        old_rec = old_records[0]
        ngay_xuat = data.ngay_xuat or str(old_rec.get("ngay_xuat", ""))
        kh_ten = (data.khach_hang_ten or "").strip()
        kh_id = (data.khach_hang_id or str(old_rec.get("khach_hang_id", ""))).strip()
        kh_dia_chi = (data.khach_hang_dia_chi or data.dia_chi or "").strip()
        kh_sdt = (data.khach_hang_sdt or data.dien_thoai or "").strip()

        if kh_ten or kh_sdt or kh_id:
            kh_list = db_manager.get_all("DoiTuong") + db_manager.get_all("KhachHang")
            matched = None
            if kh_id:
                for k in kh_list:
                    kid = str(k.get("id", "")).strip()
                    kma = str(k.get("ma") or k.get("ma_doi_tuong") or "").strip()
                    if kh_id.lower() in (kid.lower(), kma.lower()):
                        matched = k
                        break
            if not matched and kh_sdt:
                for k in kh_list:
                    if str(k.get("dien_thoai", "")).replace("None", "").strip() == kh_sdt:
                        matched = k
                        break
            if not matched and kh_ten:
                for k in kh_list:
                    kname = str(k.get("ten") or k.get("ten_kh") or "").strip()
                    if kname.lower() == kh_ten.lower():
                        matched = k
                        break

            if not matched and (kh_ten or kh_sdt):
                new_kh_id = str(int(time.time() * 1000))
                db_manager.insert_khach_hang({
                    "id": new_kh_id,
                    "ten_kh": kh_ten or "Khách lẻ",
                    "dia_chi": kh_dia_chi,
                    "dien_thoai": kh_sdt,
                    "email": "",
                    "ghi_chu": f"Tự động lưu từ cập nhật phiếu {so_phieu}",
                })
                kh_id = new_kh_id
            elif matched:
                kh_id = str(matched.get("id", "")).strip()

        kh_save_ref = kh_id if kh_id else (kh_ten or str(old_rec.get("khach_hang_id", "")))
        items_payload = []
        for it in data.items:
            items_payload.append({
                "ma_hang": it.ma_hang,
                "ten_hang": it.ten_hang,
                "so_luong": int(it.so_luong),
                "gia_ban": float(it.gia_ban)
            })

        updated_rows = db_manager.update_xuat_hang_receipt(
            so_phieu=so_phieu,
            ngay_xuat=ngay_xuat,
            kh_save_ref=kh_save_ref,
            ghi_chu=data.ghi_chu or "",
            items=items_payload
        )

        return {
            "success": True,
            "message": f"Cập nhật phiếu xuất {so_phieu} thành công",
            "so_phieu": so_phieu,
            "data": updated_rows
        }
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

