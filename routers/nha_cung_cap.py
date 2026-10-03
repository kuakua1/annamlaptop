from fastapi import APIRouter, Request, HTTPException, Depends
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates

from routers.auth import get_current_user, require_login
from models.schemas import NhaCungCapCreate, NhaCungCapUpdate
from services.sheets_service import sheets_service
from config import SHEET_NHA_CUNG_CAP

router = APIRouter()
templates = Jinja2Templates(directory="static/templates")


def _parse_record(rec: dict, row_num: int) -> dict:
    return {
        "id": str(rec.get("id", "")),
        "ten_ncc": str(rec.get("ten_ncc", "")),
        "dia_chi": str(rec.get("dia_chi", "")),
        "dien_thoai": str(rec.get("dien_thoai", "")),
        "email": str(rec.get("email", "")),
        "ghi_chu": str(rec.get("ghi_chu", "")),
        "row_num": row_num,
    }


@router.get("/api/nha-cung-cap")
async def get_nha_cung_cap(request: Request, user: str = Depends(require_login)):
    try:
        from config import SHEET_NHAP_HANG
        records = sheets_service.get_all_records(SHEET_NHA_CUNG_CAP)
        nhap_records = sheets_service.get_all_records(SHEET_NHAP_HANG)

        # Đếm số lượng NCC trùng tên để tránh gộp nhầm
        name_counts = {}
        for r in records:
            name = str(r.get("ten_ncc", "")).strip().lower()
            if name:
                name_counts[name] = name_counts.get(name, 0) + 1

        # Tổng hợp thống kê theo ID (chuẩn) và theo Tên (cho các dòng dữ liệu cũ)
        ncc_stats_by_id = {}
        ncc_stats_by_name = {}
        for n in nhap_records:
            ncc_ref = str(n.get("nha_cung_cap_id", "")).strip()
            if not ncc_ref:
                continue
            so_phieu = str(n.get("so_phieu", "")).strip()
            sl = int(n.get("so_luong", 0) or 0)
            tien = float(n.get("thanh_tien", 0) or 0)
            ngay = str(n.get("ngay_nhap", "")).strip()

            target_dict = ncc_stats_by_id if ncc_ref.isdigit() else ncc_stats_by_name
            target_key = ncc_ref if ncc_ref.isdigit() else ncc_ref.lower()

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
            s_id = item["id"]
            s_name = item["ten_ncc"].strip().lower()

            # Ưu tiên lấy thống kê theo ID tuyệt đối
            stat = ncc_stats_by_id.get(s_id)
            if not stat and name_counts.get(s_name, 0) == 1:
                stat = ncc_stats_by_name.get(s_name)
            stat = stat or {}

            so_phieu_set = stat.get("so_phieu_set", set())
            item["so_don_nhap"] = len(so_phieu_set)
            item["tong_so_luong"] = stat.get("tong_so_luong", 0)
            item["tong_tien_nhap"] = stat.get("tong_tien", 0.0)
            item["lan_cuoi_nhap"] = stat.get("lan_cuoi", "")
            result.append(item)

        return {"success": True, "data": result, "total": len(result)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/nha-cung-cap/{record_id}/lich-su")
async def get_nha_cung_cap_lich_su(record_id: str, request: Request, user: str = Depends(require_login)):
    try:
        from config import SHEET_NHAP_HANG, SHEET_HANG_HOA
        records = sheets_service.get_all_records(SHEET_NHA_CUNG_CAP)
        ncc_data = None
        for r in records:
            if str(r.get("id", "")).strip() == record_id:
                ncc_data = r
                break
        if not ncc_data:
            raise HTTPException(status_code=404, detail="Không tìm thấy thông tin nhà cung cấp")

        ten_ncc = str(ncc_data.get("ten_ncc", "")).strip()
        dien_thoai = str(ncc_data.get("dien_thoai", "")).strip()

        # Đếm số NCC có cùng tên
        same_name_count = sum(1 for r in records if str(r.get("ten_ncc", "")).strip().lower() == ten_ncc.lower())

        # Get DVT map
        hang_records = sheets_service.get_all_records(SHEET_HANG_HOA)
        dvt_map = {str(h.get("ma_hang", "")): str(h.get("don_vi_tinh", "Cái")) for h in hang_records}

        # Get import records matching this supplier strictly
        nhap_records = sheets_service.get_all_records(SHEET_NHAP_HANG)
        matched_items = []
        for n in nhap_records:
            ncc_ref = str(n.get("nha_cung_cap_id", "")).strip()
            # 1. Khớp chính xác theo ID
            if ncc_ref == record_id:
                is_match = True
            # 2. Với dữ liệu cũ chưa có ID: chỉ khớp theo tên nếu hệ thống CHỈ CÓ DUY NHẤT 1 NCC tên này
            elif same_name_count == 1 and ten_ncc and ncc_ref.lower() == ten_ncc.lower():
                is_match = True
            else:
                is_match = False

            if is_match:
                ma_hang = str(n.get("ma_hang", "")).strip()
                sl = int(n.get("so_luong", 0) or 0)
                gia_nhap = float(n.get("gia_nhap", 0) or 0)
                thanh_tien = float(n.get("thanh_tien", 0) or 0)
                matched_items.append({
                    "id": str(n.get("id", "")),
                    "so_phieu": str(n.get("so_phieu", "")),
                    "ngay_nhap": str(n.get("ngay_nhap", "")),
                    "ma_hang": ma_hang,
                    "ten_hang": str(n.get("ten_hang", "")),
                    "don_vi_tinh": dvt_map.get(ma_hang, "Cái"),
                    "so_luong": sl,
                    "gia_nhap": gia_nhap,
                    "thanh_tien": thanh_tien,
                    "ghi_chu": str(n.get("ghi_chu", "")),
                })

        # Group by so_phieu
        receipts_map = {}
        for item in matched_items:
            sp = item["so_phieu"]
            if sp not in receipts_map:
                receipts_map[sp] = {
                    "so_phieu": sp,
                    "ngay_nhap": item["ngay_nhap"],
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
        receipt_list.sort(key=lambda r: (r["ngay_nhap"], r["so_phieu"]), reverse=True)

        matched_items.sort(key=lambda i: (i["ngay_nhap"], i["so_phieu"]), reverse=True)

        summary = {
            "tong_so_phieu": len(receipt_list),
            "tong_so_luong": sum(r["tong_so_luong"] for r in receipt_list),
            "tong_tien_nhap": sum(r["tong_tien"] for r in receipt_list),
            "lan_cuoi_nhap": receipt_list[0]["ngay_nhap"] if receipt_list else "",
        }

        return {
            "success": True,
            "nha_cung_cap": {
                "id": record_id,
                "ten_ncc": ten_ncc,
                "dia_chi": str(ncc_data.get("dia_chi", "")),
                "dien_thoai": dien_thoai,
                "email": str(ncc_data.get("email", "")),
                "ghi_chu": str(ncc_data.get("ghi_chu", "")),
            },
            "summary": summary,
            "danh_sach_phieu": receipt_list,
            "chi_tiet_hang": matched_items,
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/nha-cung-cap")
async def create_nha_cung_cap(data: NhaCungCapCreate, request: Request, user: str = Depends(require_login)):
    try:
        new_id = sheets_service.new_id()
        row = [new_id, data.ten_ncc, data.dia_chi or "", data.dien_thoai or "", data.email or "", data.ghi_chu or ""]
        row_num = sheets_service.append_row(SHEET_NHA_CUNG_CAP, row)
        return {
            "success": True,
            "message": "Thêm nhà cung cấp thành công",
            "data": {"id": new_id, "ten_ncc": data.ten_ncc, "dia_chi": data.dia_chi,
                     "dien_thoai": data.dien_thoai, "email": data.email, "ghi_chu": data.ghi_chu, "row_num": row_num}
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/api/nha-cung-cap/{record_id}")
async def update_nha_cung_cap(record_id: str, data: NhaCungCapUpdate, request: Request, user: str = Depends(require_login)):
    try:
        records = sheets_service.get_all_records(SHEET_NHA_CUNG_CAP)
        row_num = -1
        rec = None
        for i, r in enumerate(records):
            if str(r.get("id", "")) == record_id:
                row_num = i + 2
                rec = r
                break
        if row_num == -1:
            raise HTTPException(status_code=404, detail="Không tìm thấy nhà cung cấp")

        updated = {
            "id": record_id,
            "ten_ncc": data.ten_ncc if data.ten_ncc is not None else str(rec.get("ten_ncc", "")),
            "dia_chi": data.dia_chi if data.dia_chi is not None else str(rec.get("dia_chi", "")),
            "dien_thoai": data.dien_thoai if data.dien_thoai is not None else str(rec.get("dien_thoai", "")),
            "email": data.email if data.email is not None else str(rec.get("email", "")),
            "ghi_chu": data.ghi_chu if data.ghi_chu is not None else str(rec.get("ghi_chu", "")),
        }
        row = [updated["id"], updated["ten_ncc"], updated["dia_chi"], updated["dien_thoai"], updated["email"], updated["ghi_chu"]]
        sheets_service.update_row(SHEET_NHA_CUNG_CAP, row_num, row)
        return {"success": True, "message": "Cập nhật nhà cung cấp thành công", "data": updated}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/api/nha-cung-cap/{record_id}")
async def delete_nha_cung_cap(record_id: str, request: Request, user: str = Depends(require_login)):
    try:
        records = sheets_service.get_all_records(SHEET_NHA_CUNG_CAP)
        row_num = -1
        for i, rec in enumerate(records):
            if str(rec.get("id", "")) == record_id:
                row_num = i + 2
                break
        if row_num == -1:
            raise HTTPException(status_code=404, detail="Không tìm thấy nhà cung cấp")
        sheets_service.delete_row(SHEET_NHA_CUNG_CAP, row_num)
        return {"success": True, "message": "Xóa nhà cung cấp thành công"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
