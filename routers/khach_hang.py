from fastapi import APIRouter, Request, HTTPException, Depends
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates

from routers.auth import get_current_user, require_login
from models.schemas import KhachHangCreate, KhachHangUpdate
from services.sheets_service import sheets_service
from config import SHEET_KHACH_HANG

router = APIRouter()
templates = Jinja2Templates(directory="static/templates")


def _parse_record(rec: dict, row_num: int) -> dict:
    return {
        "id": str(rec.get("id", "")),
        "ten_kh": str(rec.get("ten_kh", "")),
        "dia_chi": str(rec.get("dia_chi", "")),
        "dien_thoai": str(rec.get("dien_thoai", "")),
        "email": str(rec.get("email", "")),
        "ghi_chu": str(rec.get("ghi_chu", "")),
        "row_num": row_num,
    }


@router.get("/api/khach-hang")
async def get_khach_hang(request: Request, user: str = Depends(require_login)):
    try:
        from config import SHEET_XUAT_HANG
        records = sheets_service.get_all_records(SHEET_KHACH_HANG)
        xuat_records = sheets_service.get_all_records(SHEET_XUAT_HANG)

        # Đếm số lượng khách hàng trùng tên để tránh gộp nhầm
        name_counts = {}
        for r in records:
            name = str(r.get("ten_kh", "")).strip().lower()
            if name:
                name_counts[name] = name_counts.get(name, 0) + 1

        # Tổng hợp thống kê theo ID (chuẩn) và theo Tên (cho các dòng dữ liệu cũ)
        kh_stats_by_id = {}
        kh_stats_by_name = {}
        for x in xuat_records:
            kh_ref = str(x.get("khach_hang_id", "")).strip()
            if not kh_ref:
                continue
            so_phieu = str(x.get("so_phieu", "")).strip()
            sl = int(x.get("so_luong", 0) or 0)
            tien = float(x.get("thanh_tien", 0) or 0)
            ngay = str(x.get("ngay_xuat", "")).strip()

            target_dict = kh_stats_by_id if kh_ref.isdigit() else kh_stats_by_name
            target_key = kh_ref if kh_ref.isdigit() else kh_ref.lower()

            if target_key not in target_dict:
                target_dict[target_key] = {
                    "so_phieu_set": set(),
                    "tong_so_luong": 0,
                    "tong_tien": 0.0,
                    "lan_cuoi": "",
                }
            if so_phieu:
                target_dict[target_key]["so_phieu_set"].add(so_phieu)
            target_dict[target_key]["tong_so_luong"] += sl
            target_dict[target_key]["tong_tien"] += tien
            if not target_dict[target_key]["lan_cuoi"] or ngay > target_dict[target_key]["lan_cuoi"]:
                target_dict[target_key]["lan_cuoi"] = ngay

        result = []
        for i, rec in enumerate(records):
            item = _parse_record(rec, i + 2)
            c_id = item["id"]
            c_name = item["ten_kh"].strip().lower()

            # Ưu tiên lấy thống kê theo ID tuyệt đối
            stat = kh_stats_by_id.get(c_id)
            # Nếu chưa có theo ID và tên này là duy nhất (không có 2 khách trùng tên) thì mới lấy theo tên cũ
            if not stat and name_counts.get(c_name, 0) == 1:
                stat = kh_stats_by_name.get(c_name)
            stat = stat or {}

            so_phieu_set = stat.get("so_phieu_set", set())
            item["so_don_hang"] = len(so_phieu_set)
            item["tong_so_luong"] = stat.get("tong_so_luong", 0)
            item["tong_tien_mua"] = stat.get("tong_tien", 0.0)
            item["lan_cuoi_mua"] = stat.get("lan_cuoi", "")
            result.append(item)

        return {"success": True, "data": result, "total": len(result)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/khach-hang/{record_id}/lich-su")
async def get_khach_hang_lich_su(record_id: str, request: Request, user: str = Depends(require_login)):
    try:
        from config import SHEET_XUAT_HANG, SHEET_HANG_HOA
        records = sheets_service.get_all_records(SHEET_KHACH_HANG)
        kh_data = None
        for r in records:
            if str(r.get("id", "")).strip() == record_id:
                kh_data = r
                break
        if not kh_data:
            raise HTTPException(status_code=404, detail="Không tìm thấy thông tin khách hàng")

        ten_kh = str(kh_data.get("ten_kh", "")).strip()
        dien_thoai = str(kh_data.get("dien_thoai", "")).strip()

        # Đếm số khách hàng có cùng tên trong database
        same_name_count = sum(1 for r in records if str(r.get("ten_kh", "")).strip().lower() == ten_kh.lower())

        # Get DVT map
        hang_records = sheets_service.get_all_records(SHEET_HANG_HOA)
        dvt_map = {str(h.get("ma_hang", "")): str(h.get("don_vi_tinh", "Cái")) for h in hang_records}

        # Get export records matching this customer strictly
        xuat_records = sheets_service.get_all_records(SHEET_XUAT_HANG)
        matched_items = []
        for x in xuat_records:
            kh_ref = str(x.get("khach_hang_id", "")).strip()
            # 1. Khớp chính xác theo ID (tuyệt đối không nhầm lẫn dù trùng tên)
            if kh_ref == record_id:
                is_match = True
            # 2. Với dữ liệu cũ chưa có ID: chỉ khớp theo tên nếu hệ thống CHỈ CÓ DUY NHẤT 1 khách tên này
            elif same_name_count == 1 and ten_kh and kh_ref.lower() == ten_kh.lower():
                is_match = True
            else:
                is_match = False

            if is_match:
                ma_hang = str(x.get("ma_hang", "")).strip()
                sl = int(x.get("so_luong", 0) or 0)
                gia_ban = float(x.get("gia_ban", 0) or 0)
                thanh_tien = float(x.get("thanh_tien", 0) or 0)
                matched_items.append({
                    "id": str(x.get("id", "")),
                    "so_phieu": str(x.get("so_phieu", "")),
                    "ngay_xuat": str(x.get("ngay_xuat", "")),
                    "ma_hang": ma_hang,
                    "ten_hang": str(x.get("ten_hang", "")),
                    "don_vi_tinh": dvt_map.get(ma_hang, "Cái"),
                    "so_luong": sl,
                    "gia_ban": gia_ban,
                    "thanh_tien": thanh_tien,
                    "ghi_chu": str(x.get("ghi_chu", "")),
                })

        # Group by so_phieu
        receipts_map = {}
        for item in matched_items:
            sp = item["so_phieu"]
            if sp not in receipts_map:
                receipts_map[sp] = {
                    "so_phieu": sp,
                    "ngay_xuat": item["ngay_xuat"],
                    "so_mat_hang": 0,
                    "tong_so_luong": 0,
                    "tong_tien": 0.0,
                    "ghi_chu": item["ghi_chu"],
                    "items": []
                }
            receipts_map[sp]["items"].append(item)
            receipts_map[sp]["so_mat_hang"] += 1
            receipts_map[sp]["tong_so_luong"] += item["so_luong"]
            receipts_map[sp]["tong_tien"] += item["thanh_tien"]
            if item["ghi_chu"] and not receipts_map[sp]["ghi_chu"]:
                receipts_map[sp]["ghi_chu"] = item["ghi_chu"]

        receipt_list = list(receipts_map.values())
        receipt_list.sort(key=lambda r: (r["ngay_xuat"], r["so_phieu"]), reverse=True)

        matched_items.sort(key=lambda i: (i["ngay_xuat"], i["so_phieu"]), reverse=True)

        summary = {
            "tong_so_phieu": len(receipt_list),
            "tong_so_luong": sum(r["tong_so_luong"] for r in receipt_list),
            "tong_tien_mua": sum(r["tong_tien"] for r in receipt_list),
            "lan_cuoi_mua": receipt_list[0]["ngay_xuat"] if receipt_list else "",
        }

        return {
            "success": True,
            "khach_hang": {
                "id": record_id,
                "ten_kh": ten_kh,
                "dia_chi": str(kh_data.get("dia_chi", "")),
                "dien_thoai": dien_thoai,
                "email": str(kh_data.get("email", "")),
                "ghi_chu": str(kh_data.get("ghi_chu", "")),
            },
            "summary": summary,
            "danh_sach_phieu": receipt_list,
            "chi_tiet_hang": matched_items,
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/khach-hang")
async def create_khach_hang(data: KhachHangCreate, request: Request, user: str = Depends(require_login)):
    try:
        new_id = sheets_service.new_id()
        row = [new_id, data.ten_kh, data.dia_chi or "", data.dien_thoai or "", data.email or "", data.ghi_chu or ""]
        row_num = sheets_service.append_row(SHEET_KHACH_HANG, row)
        return {
            "success": True,
            "message": "Thêm khách hàng thành công",
            "data": {"id": new_id, "ten_kh": data.ten_kh, "dia_chi": data.dia_chi,
                     "dien_thoai": data.dien_thoai, "email": data.email, "ghi_chu": data.ghi_chu, "row_num": row_num}
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/api/khach-hang/{record_id}")
async def update_khach_hang(record_id: str, data: KhachHangUpdate, request: Request, user: str = Depends(require_login)):
    try:
        records = sheets_service.get_all_records(SHEET_KHACH_HANG)
        row_num = -1
        rec = None
        for i, r in enumerate(records):
            if str(r.get("id", "")) == record_id:
                row_num = i + 2
                rec = r
                break
        if row_num == -1:
            raise HTTPException(status_code=404, detail="Không tìm thấy khách hàng")

        updated = {
            "id": record_id,
            "ten_kh": data.ten_kh if data.ten_kh is not None else str(rec.get("ten_kh", "")),
            "dia_chi": data.dia_chi if data.dia_chi is not None else str(rec.get("dia_chi", "")),
            "dien_thoai": data.dien_thoai if data.dien_thoai is not None else str(rec.get("dien_thoai", "")),
            "email": data.email if data.email is not None else str(rec.get("email", "")),
            "ghi_chu": data.ghi_chu if data.ghi_chu is not None else str(rec.get("ghi_chu", "")),
        }
        row = [updated["id"], updated["ten_kh"], updated["dia_chi"], updated["dien_thoai"], updated["email"], updated["ghi_chu"]]
        sheets_service.update_row(SHEET_KHACH_HANG, row_num, row)
        return {"success": True, "message": "Cập nhật khách hàng thành công", "data": updated}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/api/khach-hang/{record_id}")
async def delete_khach_hang(record_id: str, request: Request, user: str = Depends(require_login)):
    try:
        records = sheets_service.get_all_records(SHEET_KHACH_HANG)
        row_num = -1
        for i, rec in enumerate(records):
            if str(rec.get("id", "")) == record_id:
                row_num = i + 2
                break
        if row_num == -1:
            raise HTTPException(status_code=404, detail="Không tìm thấy khách hàng")
        sheets_service.delete_row(SHEET_KHACH_HANG, row_num)
        return {"success": True, "message": "Xóa khách hàng thành công"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
