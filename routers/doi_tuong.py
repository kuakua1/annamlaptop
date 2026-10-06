from fastapi import APIRouter, Request, HTTPException, Depends
from fastapi.responses import HTMLResponse
import time

from routers.auth import get_current_user, require_login
from models.schemas import DoiTuongCreate, DoiTuongUpdate
from services.db_service import db_manager

router = APIRouter()


def _parse_doi_tuong_record(rec: dict, row_num: int) -> dict:
    return {
        "id": str(rec.get("id", "")),
        "ten": str(rec.get("ten", "")),
        "phan_loai": str(rec.get("phan_loai", "CA_HAI")),
        "ma_so_thue": str(rec.get("ma_so_thue", "") or ""),
        "dia_chi": str(rec.get("dia_chi", "")),
        "dien_thoai": str(rec.get("dien_thoai", "")),
        "email": str(rec.get("email", "")),
        "ghi_chu": str(rec.get("ghi_chu", "")),
        "row_num": row_num,
    }


@router.get("/api/doi-tuong")
async def get_doi_tuong(request: Request, user: str = Depends(require_login)):
    """Lấy danh sách tất cả đối tượng (Khách hàng & NCC) kèm thống kê 2 chiều."""
    try:
        records = db_manager.get_all("DoiTuong")
        nhap_records = db_manager.get_all("NhapHang")
        xuat_records = db_manager.get_all("XuatHang")

        # 1. Thống kê Nhập Hàng theo ID / Tên / SĐT
        nhap_stats_by_id = {}
        nhap_stats_by_name = {}
        for n in nhap_records:
            ref = str(n.get("nha_cung_cap_id", "")).strip()
            if not ref:
                continue
            so_phieu = str(n.get("so_phieu", "")).strip()
            sl = int(n.get("so_luong", 0) or 0)
            tien = float(n.get("thanh_tien", 0) or 0)
            ngay = str(n.get("ngay_nhap", "")).strip()

            target_dict = nhap_stats_by_id if ref.isdigit() else nhap_stats_by_name
            target_key = ref if ref.isdigit() else ref.lower()

            if target_key not in target_dict:
                target_dict[target_key] = {"so_phieu_set": set(), "tong_sl": 0, "tong_tien": 0.0, "lan_cuoi": ""}
            if so_phieu:
                target_dict[target_key]["so_phieu_set"].add(so_phieu)
            target_dict[target_key]["tong_sl"] += sl
            target_dict[target_key]["tong_tien"] += tien
            if not target_dict[target_key]["lan_cuoi"] or ngay > target_dict[target_key]["lan_cuoi"]:
                target_dict[target_key]["lan_cuoi"] = ngay

        # 2. Thống kê Xuất Hàng theo ID / Tên / SĐT
        xuat_stats_by_id = {}
        xuat_stats_by_name = {}
        for x in xuat_records:
            ref = str(x.get("khach_hang_id", "")).strip()
            if not ref:
                continue
            so_phieu = str(x.get("so_phieu", "")).strip()
            sl = int(x.get("so_luong", 0) or 0)
            tien = float(x.get("thanh_tien", 0) or 0)
            ngay = str(x.get("ngay_xuat", "")).strip()

            target_dict = xuat_stats_by_id if ref.isdigit() else xuat_stats_by_name
            target_key = ref if ref.isdigit() else ref.lower()

            if target_key not in target_dict:
                target_dict[target_key] = {"so_phieu_set": set(), "tong_sl": 0, "tong_tien": 0.0, "lan_cuoi": ""}
            if so_phieu:
                target_dict[target_key]["so_phieu_set"].add(so_phieu)
            target_dict[target_key]["tong_sl"] += sl
            target_dict[target_key]["tong_tien"] += tien
            if not target_dict[target_key]["lan_cuoi"] or ngay > target_dict[target_key]["lan_cuoi"]:
                target_dict[target_key]["lan_cuoi"] = ngay

        result = []
        for i, rec in enumerate(records):
            parsed = _parse_doi_tuong_record(rec, i + 2)
            did = parsed["id"]
            name_lower = parsed["ten"].strip().lower()

            # Nhập stats
            n_stat = nhap_stats_by_id.get(did) or nhap_stats_by_name.get(name_lower)
            parsed["so_don_nhap"] = len(n_stat["so_phieu_set"]) if n_stat else 0
            parsed["tong_sl_nhap"] = n_stat["tong_sl"] if n_stat else 0
            parsed["tong_tien_nhap"] = n_stat["tong_tien"] if n_stat else 0.0
            parsed["lan_cuoi_nhap"] = n_stat["lan_cuoi"] if n_stat else ""

            # Xuất stats
            x_stat = xuat_stats_by_id.get(did) or xuat_stats_by_name.get(name_lower)
            parsed["so_don_xuat"] = len(x_stat["so_phieu_set"]) if x_stat else 0
            parsed["tong_sl_xuat"] = x_stat["tong_sl"] if x_stat else 0
            parsed["tong_tien_xuat"] = x_stat["tong_tien"] if x_stat else 0.0
            parsed["lan_cuoi_xuat"] = x_stat["lan_cuoi"] if x_stat else ""

            parsed["tong_giao_dich"] = parsed["tong_tien_nhap"] + parsed["tong_tien_xuat"]
            parsed["tong_don"] = parsed["so_don_nhap"] + parsed["so_don_xuat"]

            # Cung cấp alias để code cũ dùng ten_ncc / ten_kh không bị undefined
            parsed["ten_ncc"] = parsed["ten"]
            parsed["ten_kh"] = parsed["ten"]
            result.append(parsed)

        return {"success": True, "data": result, "total": len(result)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/doi-tuong")
async def create_doi_tuong(
    data: DoiTuongCreate,
    request: Request,
    user: str = Depends(require_login)
):
    if not data.ten.strip():
        raise HTTPException(status_code=400, detail="Tên đối tượng không được để trống")

    try:
        new_id = str(int(time.time() * 1000))
        item = {
            "id": new_id,
            "ten": data.ten.strip(),
            "phan_loai": data.phan_loai or "CA_HAI",
            "ma_so_thue": (data.ma_so_thue or "").strip(),
            "dia_chi": (data.dia_chi or "").strip(),
            "dien_thoai": (data.dien_thoai or "").strip(),
            "email": (data.email or "").strip(),
            "ghi_chu": (data.ghi_chu or "").strip(),
        }
        db_manager.insert_doi_tuong(item)

        # Tương thích đồng bộ vào 2 bảng cũ
        try:
            if item["phan_loai"] in ("CA_HAI", "NHA_CUNG_CAP"):
                db_manager.insert_nha_cung_cap({
                    "id": new_id, "ten_ncc": item["ten"], "dia_chi": item["dia_chi"],
                    "dien_thoai": item["dien_thoai"], "email": item["email"], "ghi_chu": item["ghi_chu"]
                })
            if item["phan_loai"] in ("CA_HAI", "KHACH_HANG"):
                db_manager.insert_khach_hang({
                    "id": new_id, "ten_kh": item["ten"], "dia_chi": item["dia_chi"],
                    "dien_thoai": item["dien_thoai"], "email": item["email"], "ghi_chu": item["ghi_chu"]
                })
        except Exception:
            pass

        return {"success": True, "message": "Thêm đối tượng thành công", "data": item}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/api/doi-tuong/{record_id}")
async def update_doi_tuong(
    record_id: str,
    data: DoiTuongUpdate,
    request: Request,
    user: str = Depends(require_login)
):
    try:
        updated = db_manager.update_doi_tuong(record_id, data.model_dump(exclude_unset=True))
        if not updated:
            raise HTTPException(status_code=404, detail="Không tìm thấy đối tượng")
        return {"success": True, "message": "Cập nhật đối tượng thành công", "data": updated}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/api/doi-tuong/{record_id}")
async def delete_doi_tuong(
    record_id: str,
    request: Request,
    user: str = Depends(require_login)
):
    try:
        success = db_manager.delete_doi_tuong(record_id)
        if not success:
            raise HTTPException(status_code=404, detail="Không tìm thấy đối tượng")
        return {"success": True, "message": "Xóa đối tượng thành công"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/doi-tuong/{record_id}/lich-su")
async def get_doi_tuong_lich_su(
    record_id: str,
    request: Request,
    user: str = Depends(require_login)
):
    """Xem toàn bộ lịch sử 2 chiều (Cả mua và bán) của đối tượng."""
    try:
        hist = db_manager.get_doi_tuong_history(record_id)
        if not hist:
            raise HTTPException(status_code=404, detail="Không tìm thấy đối tượng")
        return {"success": True, **hist}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
