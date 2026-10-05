from fastapi import APIRouter, Request, HTTPException, Depends
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates
from datetime import date, timedelta

from routers.auth import get_current_user, require_login
from services.db_service import db_manager

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
            from_date = to_date = today
        elif period == "week":
            from_date = _week_start()
            to_date = today
        elif period == "month":
            from_date = _month_start()
            to_date = today
        elif period == "year":
            from_date = _year_start()
            to_date = today
        elif period == "custom":
            pass
        else:
            from_date = to_date = today

        xuat_records = db_manager.get_all("XuatHang")
        nhap_records = db_manager.get_all("NhapHang")
        hang_records = db_manager.get_all("HangHoa")
        gia_nhap_map = {str(r.get("ma_hang", "")): _safe_float(r.get("gia_nhap", 0)) for r in hang_records}

        total_revenue = 0.0
        total_cost_of_goods = 0.0

        chi_tiet_ban_hang = []
        for rec in xuat_records:
            ngay = str(rec.get("ngay_xuat", ""))
            if from_date and ngay < from_date:
                continue
            if to_date and ngay > to_date:
                continue
            rev = _safe_float(rec.get("thanh_tien", 0))
            sl = _safe_int(rec.get("so_luong", 0))
            ma = str(rec.get("ma_hang", ""))
            gia_ban = _safe_float(rec.get("gia_ban", 0))

            stored_cogs = rec.get("gia_von")
            if stored_cogs is not None and str(stored_cogs).strip() != "" and float(stored_cogs or 0) > 0:
                cost = float(stored_cogs)
            else:
                cost = gia_nhap_map.get(ma, 0.0) * sl

            total_revenue += rev
            total_cost_of_goods += cost

            chi_tiet_ban_hang.append({
                "so_phieu": str(rec.get("so_phieu", "")),
                "ngay_xuat": ngay,
                "ma_hang": ma,
                "ten_hang": str(rec.get("ten_hang", "")),
                "so_luong": sl,
                "don_gia": gia_ban,
                "thanh_tien": rev,
                "gia_von": cost,
                "loi_nhuan": rev - cost,
                "tk_du": "131"
            })

        # Sắp xếp theo ngày xuất và số phiếu tăng dần
        chi_tiet_ban_hang.sort(key=lambda x: (x["ngay_xuat"], x["so_phieu"]))

        total_nhap = 0.0
        for rec in nhap_records:
            ngay = str(rec.get("ngay_nhap", ""))
            if from_date and ngay < from_date:
                continue
            if to_date and ngay > to_date:
                continue
            total_nhap += _safe_float(rec.get("thanh_tien", 0))

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
                "chi_tiet_ban_hang": chi_tiet_ban_hang,
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/bao-cao/doanh-thu")
async def doanh_thu_chart(request: Request, month: str = "", user: str = Depends(require_login)):
    try:
        today = date.today()
        hang_records = db_manager.get_all("HangHoa")
        gia_nhap_map = {str(r.get("ma_hang", "")): _safe_float(r.get("gia_nhap", 0)) for r in hang_records}

        if month and len(month) == 7:
            import calendar
            year, m = map(int, month.split("-"))
            num_days = calendar.monthrange(year, m)[1]
            dates = [f"{year:04d}-{m:02d}-{day:02d}" for day in range(1, num_days + 1)]
        else:
            dates = [(today - timedelta(days=29 - i)).isoformat() for i in range(30)]

        date_set = set(dates)
        xuat_records = db_manager.get_all("XuatHang")

        revenue_by_date: dict[str, float] = {d: 0.0 for d in dates}
        cost_by_date: dict[str, float] = {d: 0.0 for d in dates}

        for rec in xuat_records:
            ngay = str(rec.get("ngay_xuat", ""))
            if ngay in date_set:
                rev = _safe_float(rec.get("thanh_tien", 0))
                sl = _safe_int(rec.get("so_luong", 0))
                ma = str(rec.get("ma_hang", ""))

                stored_cogs = rec.get("gia_von")
                if stored_cogs is not None and str(stored_cogs).strip() != "" and float(stored_cogs or 0) > 0:
                    cost = float(stored_cogs)
                else:
                    cost = gia_nhap_map.get(ma, 0.0) * sl

                revenue_by_date[ngay] += rev
                cost_by_date[ngay] += cost

        revenues = [revenue_by_date[d] for d in dates]
        costs = [cost_by_date[d] for d in dates]
        profits = [revenue_by_date[d] - cost_by_date[d] for d in dates]

        return {
            "success": True,
            "data": {
                "dates": dates,
                "revenue": revenues,
                "cost": costs,
                "profit": profits,
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/bao-cao/hang-ban-chay")
async def hang_ban_chay(request: Request, user: str = Depends(require_login)):
    try:
        xuat_records = db_manager.get_all("XuatHang")
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
        records = db_manager.get_all("HangHoa")
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


@router.get("/api/bao-cao/nhap-xuat-ton")
async def nhap_xuat_ton_report(
    request: Request,
    from_date: str = "",
    to_date: str = "",
    danh_muc: str = "",
    search: str = "",
    user: str = Depends(require_login)
):
    try:
        today = date.today().isoformat()
        if not from_date:
            from_date = _month_start()
        if not to_date:
            to_date = today

        hang_records = db_manager.get_all("HangHoa")
        nhap_records = db_manager.get_all("NhapHang")
        xuat_records = db_manager.get_all("XuatHang")

        nhap_by_ma = {}
        for r in nhap_records:
            ma = str(r.get("ma_hang", "")).strip()
            if not ma:
                continue
            if ma not in nhap_by_ma:
                nhap_by_ma[ma] = []
            nhap_by_ma[ma].append({
                "ngay": str(r.get("ngay_nhap", "")).strip(),
                "sl": _safe_int(r.get("so_luong", 0)),
                "thanh_tien": _safe_float(r.get("thanh_tien", 0)),
                "gia_nhap": _safe_float(r.get("gia_nhap", 0)),
            })

        xuat_by_ma = {}
        for r in xuat_records:
            ma = str(r.get("ma_hang", "")).strip()
            if not ma:
                continue
            if ma not in xuat_by_ma:
                xuat_by_ma[ma] = []
            xuat_by_ma[ma].append({
                "ngay": str(r.get("ngay_xuat", "")).strip(),
                "sl": _safe_int(r.get("so_luong", 0)),
                "gia_von": _safe_float(r.get("gia_von", 0)),
                "gia_ban": _safe_float(r.get("gia_ban", 0)),
                "thanh_tien": _safe_float(r.get("thanh_tien", 0)),
            })

        result_items = []
        tot_luong_dau = 0
        tot_tien_dau = 0.0
        tot_luong_nhap = 0
        tot_tien_nhap = 0.0
        tot_luong_xuat = 0
        tot_tien_xuat = 0.0
        tot_luong_ton = 0
        tot_tien_ton = 0.0

        for h in hang_records:
            ma = str(h.get("ma_hang", "")).strip()
            ten = str(h.get("ten_hang", "")).strip()
            dm = str(h.get("danh_muc", "")).strip()
            dvt = str(h.get("don_vi_tinh", "Cái")).strip() or "Cái"
            current_ton = _safe_int(h.get("ton_kho", 0))
            gia_nhap = _safe_float(h.get("gia_nhap", 0))

            if danh_muc and dm != danh_muc:
                continue
            if search:
                s_lower = search.lower()
                if s_lower not in ma.lower() and s_lower not in ten.lower():
                    continue

            nhaps = nhap_by_ma.get(ma, [])
            xuats = xuat_by_ma.get(ma, [])

            sl_nhap_after = sum(item["sl"] for item in nhaps if to_date and item["ngay"] > to_date)
            sl_xuat_after = sum(item["sl"] for item in xuats if to_date and item["ngay"] > to_date)

            luong_ton = current_ton + sl_xuat_after - sl_nhap_after

            nhap_in = [item for item in nhaps if (not from_date or item["ngay"] >= from_date) and (not to_date or item["ngay"] <= to_date)]
            xuat_in = [item for item in xuats if (not from_date or item["ngay"] >= from_date) and (not to_date or item["ngay"] <= to_date)]

            luong_nhap = sum(item["sl"] for item in nhap_in)
            tien_nhap = sum(item["thanh_tien"] for item in nhap_in)
            if tien_nhap == 0 and luong_nhap > 0:
                tien_nhap = luong_nhap * gia_nhap

            luong_xuat = sum(item["sl"] for item in xuat_in)
            tien_xuat = 0.0
            for item in xuat_in:
                if item["gia_von"] > 0:
                    tien_xuat += item["gia_von"]
                else:
                    tien_xuat += item["sl"] * gia_nhap
            if tien_xuat == 0 and luong_xuat > 0:
                tien_xuat = luong_xuat * gia_nhap

            luong_dau = luong_ton - luong_nhap + luong_xuat
            if luong_dau < 0:
                luong_dau = 0

            don_gia = gia_nhap
            if don_gia <= 0 and luong_nhap > 0 and tien_nhap > 0:
                don_gia = round(tien_nhap / luong_nhap)

            tien_dau = luong_dau * don_gia
            tien_ton = luong_ton * don_gia

            tot_luong_dau += luong_dau
            tot_tien_dau += tien_dau
            tot_luong_nhap += luong_nhap
            tot_tien_nhap += tien_nhap
            tot_luong_xuat += luong_xuat
            tot_tien_xuat += tien_xuat
            tot_luong_ton += luong_ton
            tot_tien_ton += tien_ton

            result_items.append({
                "ma_hang": ma,
                "ten_hang": ten,
                "danh_muc": dm,
                "don_vi_tinh": dvt,
                "luong_dau": luong_dau,
                "tien_dau": tien_dau,
                "luong_nhap": luong_nhap,
                "tien_nhap": tien_nhap,
                "luong_xuat": luong_xuat,
                "tien_xuat": tien_xuat,
                "don_gia": don_gia,
                "luong_ton": luong_ton,
                "tien_ton": tien_ton,
            })

        result_items.sort(key=lambda x: x["ma_hang"])

        return {
            "success": True,
            "from_date": from_date,
            "to_date": to_date,
            "data": result_items,
            "summary": {
                "tong_luong_dau": tot_luong_dau,
                "tong_tien_dau": tot_tien_dau,
                "tong_luong_nhap": tot_luong_nhap,
                "tong_tien_nhap": tot_tien_nhap,
                "tong_luong_xuat": tot_luong_xuat,
                "tong_tien_xuat": tot_tien_xuat,
                "tong_luong_ton": tot_luong_ton,
                "tong_tien_ton": tot_tien_ton,
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/dashboard/stats")
async def dashboard_stats(request: Request, month: str = "", user: str = Depends(require_login)):
    try:
        if not month or len(month) != 7:
            month = date.today().strftime("%Y-%m")

        hang_records = db_manager.get_all("HangHoa")
        nhap_records = db_manager.get_all("NhapHang")
        xuat_records = db_manager.get_all("XuatHang")

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
                "doi_tac": str(r.get("nha_cung_cap_id", "")),
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
                "doi_tac": str(r.get("khach_hang_id", "")),
            })

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
