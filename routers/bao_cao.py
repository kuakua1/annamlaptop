from fastapi import APIRouter, Request, HTTPException, Depends
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates
from datetime import date, timedelta

from routers.auth import get_current_user, require_login
from services.sheets_service import sheets_service
from config import SHEET_HANG_HOA, SHEET_NHAP_HANG, SHEET_XUAT_HANG

router = APIRouter()
templates = Jinja2Templates(directory="static/templates")


def _today_str() -> str:
    return date.today().isoformat()


def _week_start() -> str:
    today = date.today()
    return (today - timedelta(days=today.weekday())).isoformat()


def _month_start() -> str:
    today = date.today()
    return today.replace(day=1).isoformat()


def _year_start() -> str:
    return date.today().replace(month=1, day=1).isoformat()


def _safe_float(val) -> float:
    if val is None or val == "":
        return 0.0
    if isinstance(val, (int, float)):
        return float(val)
    s = str(val).replace("đ", "").replace("Đ", "").replace(",", "").replace(".", "").strip()
    try:
        return float(s)
    except Exception:
        return 0.0


def _safe_int(val) -> int:
    if val is None or val == "":
        return 0
    if isinstance(val, (int, float)):
        return int(val)
    s = str(val).replace(",", "").replace(".", "").strip()
    try:
        return int(float(s))
    except Exception:
        return 0



@router.get("/bao-cao", response_class=HTMLResponse)
async def bao_cao_page(request: Request):
    user = get_current_user(request)
    if not user:
        from fastapi.responses import RedirectResponse
        return RedirectResponse(url="/login")
    return templates.TemplateResponse("bao_cao.html", {"request": request, "username": user})


@router.get("/api/bao-cao/tong-quan")
async def tong_quan(
    request: Request,
    period: str = "today",
    from_date: str = "",
    to_date: str = "",
    user: str = Depends(require_login)
):
    try:
        today = _today_str()
        if period == "today":
            from_date = today
            to_date = today
        elif period == "week":
            from_date = _week_start()
            to_date = today
        elif period == "month":
            from_date = _month_start()
            to_date = today
        elif period == "year":
            from_date = _year_start()
            to_date = today
        # else custom: use provided from_date, to_date

        # Revenue & cost from XuatHang
        xuat_records = sheets_service.get_all_records(SHEET_XUAT_HANG)
        nhap_records = sheets_service.get_all_records(SHEET_NHAP_HANG)
        hang_records = sheets_service.get_all_records(SHEET_HANG_HOA)

        total_revenue = 0.0
        total_cost_of_goods = 0.0

        # Build gia_nhap lookup by ma_hang
        gia_nhap_map = {str(r.get("ma_hang", "")): _safe_float(r.get("gia_nhap", 0)) for r in hang_records}

        for rec in xuat_records:
            ngay = str(rec.get("ngay_xuat", ""))
            if from_date and ngay < from_date:
                continue
            if to_date and ngay > to_date:
                continue
            total_revenue += _safe_float(rec.get("thanh_tien", 0))
            gv = rec.get("gia_von")
            if gv is not None and str(gv).strip() != "":
                total_cost_of_goods += _safe_float(gv)
            else:
                ma_hang = str(rec.get("ma_hang", ""))
                so_luong = _safe_int(rec.get("so_luong", 0))
                total_cost_of_goods += gia_nhap_map.get(ma_hang, 0) * so_luong

        total_nhap = 0.0
        for rec in nhap_records:
            ngay = str(rec.get("ngay_nhap", ""))
            if from_date and ngay < from_date:
                continue
            if to_date and ngay > to_date:
                continue
            total_nhap += float(rec.get("thanh_tien", 0) or 0)

        gross_profit = total_revenue - total_cost_of_goods
        margin = (gross_profit / total_revenue * 100) if total_revenue > 0 else 0

        return {
            "success": True,
            "period": period,
            "from_date": from_date,
            "to_date": to_date,
            "data": {
                "doanh_thu": total_revenue,
                "gia_von": total_cost_of_goods,
                "loi_nhuan": gross_profit,
                "bien_loi_nhuan": round(margin, 2),
                "tong_nhap_hang": total_nhap,
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/bao-cao/doanh-thu")
async def doanh_thu_chart(request: Request, month: str = "", user: str = Depends(require_login)):
    try:
        today = date.today()
        hang_records = sheets_service.get_all_records(SHEET_HANG_HOA)
        gia_nhap_map = {str(r.get("ma_hang", "")): float(r.get("gia_nhap", 0) or 0) for r in hang_records}

        if month and len(month) == 7:
            import calendar
            year, m = map(int, month.split("-"))
            num_days = calendar.monthrange(year, m)[1]
            dates = [f"{year:04d}-{m:02d}-{day:02d}" for day in range(1, num_days + 1)]
        else:
            # 30 ngày gần nhất
            dates = [(today - timedelta(days=29 - i)).isoformat() for i in range(30)]

        revenue_map = {d: 0.0 for d in dates}
        cost_map = {d: 0.0 for d in dates}

        xuat_records = sheets_service.get_all_records(SHEET_XUAT_HANG)
        for rec in xuat_records:
            ngay = str(rec.get("ngay_xuat", ""))
            if ngay in revenue_map:
                revenue_map[ngay] += float(rec.get("thanh_tien", 0) or 0)
                gv = rec.get("gia_von")
                if gv is not None and str(gv).strip() != "":
                    cost_map[ngay] += float(gv or 0)
                else:
                    ma_hang = str(rec.get("ma_hang", ""))
                    so_luong = int(rec.get("so_luong", 0) or 0)
                    cost_map[ngay] += gia_nhap_map.get(ma_hang, 0) * so_luong

        revenues = [revenue_map[d] for d in dates]
        costs = [cost_map[d] for d in dates]
        profits = [revenues[i] - costs[i] for i in range(len(dates))]
        display_dates = [d[8:] + "/" + d[5:7] for d in dates]  # DD/MM

        return {
            "success": True,
            "data": {
                "dates": display_dates,
                "revenue": revenues,
                "cost": costs,
                "profit": profits
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/bao-cao/hang-ban-chay")
async def hang_ban_chay(request: Request, user: str = Depends(require_login)):
    try:
        xuat_records = sheets_service.get_all_records(SHEET_XUAT_HANG)
        qty_map: dict[str, dict] = {}
        for rec in xuat_records:
            ma = str(rec.get("ma_hang", ""))
            ten = str(rec.get("ten_hang", ""))
            sl = int(rec.get("so_luong", 0) or 0)
            tt = float(rec.get("thanh_tien", 0) or 0)
            if ma not in qty_map:
                qty_map[ma] = {"ma_hang": ma, "ten_hang": ten, "so_luong": 0, "doanh_thu": 0.0}
            qty_map[ma]["so_luong"] += sl
            qty_map[ma]["doanh_thu"] += tt

        items = list(qty_map.values())
        top_qty = sorted(items, key=lambda x: x["so_luong"], reverse=True)[:10]
        top_revenue = sorted(items, key=lambda x: x["doanh_thu"], reverse=True)[:10]

        return {"success": True, "data": {"theo_so_luong": top_qty, "theo_doanh_thu": top_revenue}}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/bao-cao/ton-kho")
async def ton_kho_report(request: Request, user: str = Depends(require_login)):
    try:
        records = sheets_service.get_all_records(SHEET_HANG_HOA)
        items = []
        for rec in records:
            ton_kho = _safe_int(rec.get("ton_kho", 0))
            gia_nhap = _safe_float(rec.get("gia_nhap", 0))
            gia_tri = round(ton_kho * gia_nhap)
            items.append({
                "ma_hang": str(rec.get("ma_hang", "")),
                "ten_hang": str(rec.get("ten_hang", "")),
                "danh_muc": str(rec.get("danh_muc", "")),
                "don_vi_tinh": str(rec.get("don_vi_tinh", "")),
                "ton_kho": ton_kho,
                "gia_nhap": gia_nhap,
                "gia_tri": gia_tri,
            })
        items = [i for i in items if i["ton_kho"] > 0]
        items.sort(key=lambda x: x["gia_tri"], reverse=True)
        total_value = sum(i["gia_tri"] for i in items)
        return {"success": True, "data": items, "total_value": total_value}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/dashboard/stats")
async def dashboard_stats(request: Request, month: str = "", user: str = Depends(require_login)):
    try:
        if not month or len(month) != 7:
            month = date.today().strftime("%Y-%m")

        hang_records = sheets_service.get_all_records(SHEET_HANG_HOA)
        nhap_records = sheets_service.get_all_records(SHEET_NHAP_HANG)
        xuat_records = sheets_service.get_all_records(SHEET_XUAT_HANG)

        total_products = len(hang_records)
        gia_nhap_map = {str(r.get("ma_hang", "")): _safe_float(r.get("gia_nhap", 0)) for r in hang_records}
        total_stock_value = sum(
            round(_safe_int(r.get("ton_kho", 0)) * _safe_float(r.get("gia_nhap", 0)))
            for r in hang_records
        )

        month_nhap = sum(
            _safe_float(r.get("thanh_tien", 0))
            for r in nhap_records if str(r.get("ngay_nhap", "")).startswith(month)
        )
        month_xuat = sum(
            _safe_float(r.get("thanh_tien", 0))
            for r in xuat_records if str(r.get("ngay_xuat", "")).startswith(month)
        )
        month_cost = sum(
            _safe_float(r.get("gia_von", 0)) if (r.get("gia_von") is not None and str(r.get("gia_von")).strip() != "")
            else gia_nhap_map.get(str(r.get("ma_hang", "")), 0) * _safe_int(r.get("so_luong", 0))
            for r in xuat_records if str(r.get("ngay_xuat", "")).startswith(month)
        )
        month_profit = month_xuat - month_cost

        # Giao dịch gần nhất: Mới nhất trên đầu, cũ hơn ở bên dưới
        recent = []
        for r in nhap_records:
            recent.append({
                "id": str(r.get("id", "")),
                "loai": "Nhập",
                "so_phieu": str(r.get("so_phieu", "")),
                "ngay": str(r.get("ngay_nhap", "")),
                "ma_hang": str(r.get("ma_hang", "")),
                "ten_hang": str(r.get("ten_hang", "")),
                "so_luong": int(r.get("so_luong", 0) or 0),
                "thanh_tien": float(r.get("thanh_tien", 0) or 0),
                "doi_tac": str(r.get("ten_ncc", "") or r.get("nha_cung_cap_id", "")),
            })
        for r in xuat_records:
            recent.append({
                "id": str(r.get("id", "")),
                "loai": "Xuất",
                "so_phieu": str(r.get("so_phieu", "")),
                "ngay": str(r.get("ngay_xuat", "")),
                "ma_hang": str(r.get("ma_hang", "")),
                "ten_hang": str(r.get("ten_hang", "")),
                "so_luong": int(r.get("so_luong", 0) or 0),
                "thanh_tien": float(r.get("thanh_tien", 0) or 0),
                "doi_tac": str(r.get("ten_kh", "") or r.get("khach_hang_id", "")),
            })

        # Sắp xếp: Giao dịch mới nhất ở trên đầu, cũ hơn ở bên dưới
        recent.sort(key=lambda x: (x["ngay"], x["id"]), reverse=True)
        recent = recent[:15]

        low_stock_count = sum(1 for r in hang_records if 0 < int(r.get("ton_kho", 0) or 0) <= 2)
        out_of_stock_count = sum(1 for r in hang_records if int(r.get("ton_kho", 0) or 0) <= 0)

        return {
            "success": True,
            "data": {
                "month": month,
                "tong_san_pham": total_products,
                "gia_tri_ton_kho": total_stock_value,
                "nhap_hang_thang": month_nhap,
                "xuat_hang_thang": month_xuat,
                "doanh_thu_thang": month_xuat,
                "loi_nhuan_thang": month_profit,
                "low_stock_count": low_stock_count,
                "out_of_stock_count": out_of_stock_count,
                "giao_dich_gan_nhat": recent,
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
