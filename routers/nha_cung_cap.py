from fastapi import APIRouter, Request, HTTPException, Depends
from routers.auth import require_login
from models.schemas import NhaCungCapCreate, NhaCungCapUpdate
from services.db_service import db_manager
from routers.doi_tuong import get_doi_tuong

router = APIRouter()


@router.get("/api/nha-cung-cap")
async def get_nha_cung_cap(request: Request, user: str = Depends(require_login)):
    """Lấy danh sách nhà cung cấp từ bảng DoiTuong tập trung (tương thích ngược 100%)."""
    res = await get_doi_tuong(request, user)
    all_items = res.get("data", [])
    # Lọc các đối tượng là nhà cung cấp hoặc cả hai
    filtered = [
        it for it in all_items
        if str(it.get("phan_loai", "CA_HAI")).upper() in ("NHA_CUNG_CAP", "CA_HAI")
    ]
    for it in filtered:
        it["ten_ncc"] = it.get("ten", "")
        it["tong_tien_nhap"] = it.get("tong_tien_nhap", 0.0)
        it["so_don_hang"] = it.get("so_don_nhap", 0)
        it["lan_cuoi_nhap"] = it.get("lan_cuoi_nhap", "")
    return {"success": True, "data": filtered, "total": len(filtered)}


@router.get("/api/nha-cung-cap/unpaid-invoices")
async def get_supplier_unpaid_invoices_ncc_route(
    ten_ncc: str = "",
    ncc_id: str = "",
    sdt: str = "",
    user: str = Depends(require_login)
):
    query_name = ncc_id or ten_ncc
    if not query_name and not sdt:
        return {"success": True, "has_debt": False, "invoices": []}
    invoices = db_manager.get_supplier_unpaid_invoices(query_name, sdt)
    return {
        "success": True,
        "has_debt": len(invoices) > 0,
        "count": len(invoices),
        "invoices": invoices
    }


@router.get("/api/nha-cung-cap/{record_id}")
@router.get("/api/nha-cung-cap/{record_id}/lich-su")
async def get_nha_cung_cap_detail(record_id: str, request: Request, user: str = Depends(require_login)):
    history = db_manager.get_doi_tuong_history(record_id)
    if not history:
        raise HTTPException(status_code=404, detail="Không tìm thấy nhà cung cấp")
    doi_tuong = history.get("doi_tuong", {})
    return {
        "success": True,
        "nha_cung_cap": {
            "id": doi_tuong.get("id", record_id),
            "ten_ncc": doi_tuong.get("ten", ""),
            "dia_chi": doi_tuong.get("dia_chi", ""),
            "dien_thoai": doi_tuong.get("dien_thoai", ""),
            "email": doi_tuong.get("email", ""),
            "ghi_chu": doi_tuong.get("ghi_chu", ""),
        },
        "summary": history.get("summary", {}),
        "danh_sach_phieu": history.get("danh_sach_phieu", []),
        "chi_tiet_hang": history.get("chi_tiet_hang", []),
    }


@router.post("/api/nha-cung-cap")
async def create_nha_cung_cap(data: NhaCungCapCreate, request: Request, user: str = Depends(require_login)):
    new_id = db_manager.generate_ma_doi_tuong()
    item = {
        "id": new_id,
        "ten": data.ten_ncc,
        "phan_loai": "NHA_CUNG_CAP",
        "dia_chi": data.dia_chi or "",
        "dien_thoai": data.dien_thoai or "",
        "email": data.email or "",
        "ghi_chu": data.ghi_chu or "",
    }
    db_manager.insert_doi_tuong(item)
    item["ten_ncc"] = data.ten_ncc
    return {"success": True, "message": "Thêm nhà cung cấp thành công", "data": item}


@router.put("/api/nha-cung-cap/{record_id}")
async def update_nha_cung_cap(record_id: str, data: NhaCungCapUpdate, request: Request, user: str = Depends(require_login)):
    update_dict = {}
    if data.ten_ncc is not None:
        update_dict["ten"] = data.ten_ncc
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
        raise HTTPException(status_code=404, detail="Không tìm thấy nhà cung cấp")
    updated["ten_ncc"] = updated.get("ten", "")
    return {"success": True, "message": "Cập nhật nhà cung cấp thành công", "data": updated}


@router.delete("/api/nha-cung-cap/{record_id}")
async def delete_nha_cung_cap(record_id: str, request: Request, user: str = Depends(require_login)):
    deleted = db_manager.delete_doi_tuong(record_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Không tìm thấy nhà cung cấp")
    return {"success": True, "message": "Xóa nhà cung cấp thành công"}
