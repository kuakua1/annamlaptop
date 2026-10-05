from fastapi import APIRouter, Request, HTTPException, Depends
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates
import time

from routers.auth import get_current_user, require_login
from models.schemas import KhachHangCreate, KhachHangUpdate
from services.db_service import db_manager

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
        records = db_manager.get_all("KhachHang")
        xuat_records = db_manager.get_all("XuatHang")

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
            parsed = _parse_record(rec, i + 2)
            kid = parsed["id"]
            name_lower = parsed["ten_kh"].strip().lower()

            stats_id = kh_stats_by_id.get(kid)
            stats_name = kh_stats_by_name.get(name_lower) if name_counts.get(name_lower, 0) == 1 else None

            so_phieu_set = set()
            tong_sl = 0
            tong_tien = 0.0
            lan_cuoi = ""

            if stats_id:
                so_phieu_set.update(stats_id["so_phieu_set"])
                tong_sl += stats_id["tong_so_luong"]
                tong_tien += stats_id["tong_tien"]
                lan_cuoi = stats_id["lan_cuoi"]

            if stats_name:
                so_phieu_set.update(stats_name["so_phieu_set"])
                tong_sl += stats_name["tong_so_luong"]
                tong_tien += stats_name["tong_tien"]
                if not lan_cuoi or (stats_name["lan_cuoi"] and stats_name["lan_cuoi"] > lan_cuoi):
                    lan_cuoi = stats_name["lan_cuoi"]

            parsed["so_don_hang"] = len(so_phieu_set)
            parsed["tong_so_luong"] = tong_sl
            parsed["tong_tien_mua"] = tong_tien
            parsed["lan_cuoi_mua"] = lan_cuoi
            result.append(parsed)

        return {"success": True, "data": result, "total": len(result)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/khach-hang/{record_id}")
async def get_khach_hang_detail(record_id: str, request: Request, user: str = Depends(require_login)):
    try:
        kh_data = db_manager.get_by_id("KhachHang", record_id)
        if not kh_data:
            raise HTTPException(status_code=404, detail="Không tìm thấy khách hàng")

        ten_kh = str(kh_data.get("ten_kh", "")).strip()
        dien_thoai = str(kh_data.get("dien_thoai", "")).strip()

        xuat_records = db_manager.get_all("XuatHang")
        hang_records = db_manager.get_all("HangHoa")
        dvt_map = {str(h.get("ma_hang", "")).strip(): str(h.get("don_vi_tinh", "Cái")) for h in hang_records}

        matched_items = []
        for x in xuat_records:
            kh_ref = str(x.get("khach_hang_id", "")).strip()
            if not kh_ref:
                continue

            is_match = False
            if kh_ref == record_id:
                is_match = True
            elif kh_ref.lower() == ten_kh.lower():
                is_match = True
            elif dien_thoai and dien_thoai in str(x.get("dien_thoai", "")):
                is_match = True

            if is_match:
                so_phieu = str(x.get("so_phieu", ""))
                ma_hang = str(x.get("ma_hang", ""))
                sl = int(x.get("so_luong", 0) or 0)
                gia_ban = float(x.get("gia_ban", 0) or 0)
                thanh_tien = float(x.get("thanh_tien", 0) or 0)
                matched_items.append({
                    "id": str(x.get("id", "")),
                    "so_phieu": so_phieu,
                    "ngay_xuat": str(x.get("ngay_xuat", "")),
                    "ma_hang": ma_hang,
                    "ten_hang": str(x.get("ten_hang", "")),
                    "don_vi_tinh": dvt_map.get(ma_hang, "Cái"),
                    "so_luong": sl,
                    "gia_ban": gia_ban,
                    "thanh_tien": thanh_tien,
                    "ghi_chu": str(x.get("ghi_chu", "")),
                })

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
        new_id = str(int(time.time() * 1000))
        item = {
            "id": new_id,
            "ten_kh": data.ten_kh,
            "dia_chi": data.dia_chi or "",
            "dien_thoai": data.dien_thoai or "",
            "email": data.email or "",
            "ghi_chu": data.ghi_chu or "",
        }
        db_manager.insert_khach_hang(item)
        return {
            "success": True,
            "message": "Thêm khách hàng thành công",
            "data": item
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/api/khach-hang/{record_id}")
async def update_khach_hang(record_id: str, data: KhachHangUpdate, request: Request, user: str = Depends(require_login)):
    try:
        rec = db_manager.get_by_id("KhachHang", record_id)
        if not rec:
            raise HTTPException(status_code=404, detail="Không tìm thấy khách hàng")

        update_dict = {}
        if data.ten_kh is not None: update_dict["ten_kh"] = data.ten_kh
        if data.dia_chi is not None: update_dict["dia_chi"] = data.dia_chi
        if data.dien_thoai is not None: update_dict["dien_thoai"] = data.dien_thoai
        if data.email is not None: update_dict["email"] = data.email
        if data.ghi_chu is not None: update_dict["ghi_chu"] = data.ghi_chu

        updated = db_manager.update_khach_hang(record_id, update_dict)
        return {"success": True, "message": "Cập nhật khách hàng thành công", "data": updated}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/api/khach-hang/{record_id}")
async def delete_khach_hang(record_id: str, request: Request, user: str = Depends(require_login)):
    try:
        rec = db_manager.get_by_id("KhachHang", record_id)
        if not rec:
            raise HTTPException(status_code=404, detail="Không tìm thấy khách hàng")
        db_manager.delete_khach_hang(record_id)
        return {"success": True, "message": "Xóa khách hàng thành công"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
