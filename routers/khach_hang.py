from fastapi import APIRouter, Request, HTTPException, Depends
from routers.auth import require_login
from models.schemas import KhachHangCreate, KhachHangUpdate
from services.db_service import db_manager
from routers.doi_tuong import get_doi_tuong

router = APIRouter()


@router.get("/api/khach-hang")
async def get_khach_hang(request: Request, user: str = Depends(require_login)):
    """Lấy danh sách khách hàng từ bảng DoiTuong tập trung (tương thích ngược 100%)."""
    res = await get_doi_tuong(request, user)
    all_items = res.get("data", [])
    # Lọc các đối tượng là khách hàng hoặc cả hai
    filtered = [
        it for it in all_items
        if str(it.get("phan_loai", "CA_HAI")).upper() in ("KHACH_HANG", "CA_HAI")
    ]
    for it in filtered:
        it["ten_kh"] = it.get("ten", "")
        it["tong_tien_mua"] = it.get("tong_tien_xuat", 0.0)
        it["so_don_hang"] = it.get("so_don_xuat", 0)
        it["lan_cuoi_mua"] = it.get("lan_cuoi_xuat", "")
    return {"success": True, "data": filtered, "total": len(filtered)}


@router.get("/api/khach-hang/unpaid-invoices")
async def get_customer_unpaid_invoices_kh_route(
    ten_kh: str = "",
    kh_id: str = "",
    sdt: str = "",
    user: str = Depends(require_login)
):
    query_name = kh_id or ten_kh
    if not query_name and not sdt:
        return {"success": True, "has_debt": False, "invoices": []}
    invoices = db_manager.get_customer_unpaid_invoices(query_name, sdt)
    return {
        "success": True,
        "has_debt": len(invoices) > 0,
        "count": len(invoices),
        "invoices": invoices
    }


@router.get("/api/khach-hang/{record_id}")
@router.get("/api/khach-hang/{record_id}/lich-su")
async def get_khach_hang_detail(record_id: str, request: Request, user: str = Depends(require_login)):
    history = db_manager.get_doi_tuong_history(record_id)
    if not history:
        raise HTTPException(status_code=404, detail="Không tìm thấy khách hàng")
    doi_tuong = history.get("doi_tuong", {})
    return {
        "success": True,
        "khach_hang": {
            "id": doi_tuong.get("id", record_id),
            "ten_kh": doi_tuong.get("ten", ""),
            "dia_chi": doi_tuong.get("dia_chi", ""),
            "dien_thoai": doi_tuong.get("dien_thoai", ""),
            "email": doi_tuong.get("email", ""),
            "ghi_chu": doi_tuong.get("ghi_chu", ""),
        },
        "summary": history.get("summary", {}),
        "danh_sach_phieu": history.get("danh_sach_phieu", []),
        "chi_tiet_hang": history.get("chi_tiet_hang", []),
    }


@router.post("/api/khach-hang")
async def create_khach_hang(data: KhachHangCreate, request: Request, user: str = Depends(require_login)):
    new_id = db_manager.generate_ma_doi_tuong()
    item = {
        "id": new_id,
        "ten": data.ten_kh,
        "phan_loai": "KHACH_HANG",
        "dia_chi": data.dia_chi or "",
        "dien_thoai": data.dien_thoai or "",
        "email": data.email or "",
        "ghi_chu": data.ghi_chu or "",
    }
    db_manager.insert_doi_tuong(item)
    item["ten_kh"] = data.ten_kh
    return {"success": True, "message": "Thêm khách hàng thành công", "data": item}


@router.put("/api/khach-hang/{record_id}")
async def update_khach_hang(record_id: str, data: KhachHangUpdate, request: Request, user: str = Depends(require_login)):
    update_dict = {}
    if data.ten_kh is not None:
        update_dict["ten"] = data.ten_kh
    if data.dia_chi is not None:
        update_dict["dia_chi"] = data.dia_chi
    if data.dien_thoai is not None:
        update_dict["dien_thoai"] = data.dien_thoai
    if data.email is not None:
        update_dict["email"] = data.email
    if data.ghi_chu is not None:
        update_dict["ghi_chu"] = data.ghi_chu

    updated = db_manager.update_doi_tuong(record_id, update_dict)
    if not updated:
        raise HTTPException(status_code=404, detail="Không tìm thấy khách hàng")
    updated["ten_kh"] = updated.get("ten", "")
    return {"success": True, "message": "Cập nhật khách hàng thành công", "data": updated}


@router.delete("/api/khach-hang/{record_id}")
async def delete_khach_hang(record_id: str, request: Request, user: str = Depends(require_login)):
    deleted = db_manager.delete_doi_tuong(record_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Không tìm thấy khách hàng")
    return {"success": True, "message": "Xóa khách hàng thành công"}
