import sys
import csv
import sqlite3
from pathlib import Path

# Đảm bảo UTF-8
if sys.stdout.encoding != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8')

from services.sheets_service import sheets_service
from services.db_service import db_manager, DB_PATH

def run_update():
    print("1. Khởi tạo kết nối Google Sheets...")
    sheets_service.initialize()
    ws = sheets_service._sheet('HangHoa')
    all_vals = ws.get_all_values()

    headers = all_vals[0]
    existing_rows = all_vals[1:]
    existing_by_ma = {r[1].strip(): r for r in existing_rows if len(r) >= 2}

    csv_file = Path('import_stock_thang9.csv')
    with open(csv_file, mode='r', encoding='utf-8') as f:
        csv_rows = list(csv.DictReader(f))

    print(f"Tổng số mặt hàng từ báo cáo CSV: {len(csv_rows)}")

    sheet_update_data = []
    sqlite_items = []

    for i, r in enumerate(csv_rows, 1):
        ma_hang = f"HH{i:03d}"
        ten_hang = r['Tên vật tư, hàng hóa'].strip()
        dvt = r['ĐVT'].strip() or 'Cái'
        sl = int(r['Số lượng'] or 0)
        gn_raw = r['Đơn giá'].strip()
        gn = float(gn_raw) if gn_raw else 0.0

        # Lấy thông tin hiện tại nếu có để giữ nguyên Danh Mục, Giá Bán, Ghi Chú, ID
        cur = existing_by_ma.get(ma_hang)
        row_id = cur[0] if (cur and len(cur) > 0 and cur[0]) else str(1790999153450 + i)
        danh_muc = cur[3] if (cur and len(cur) > 3 and cur[3]) else 'Khác'
        gia_ban_str = cur[6] if (cur and len(cur) > 6 and cur[6]) else '0'
        ghi_chu = cur[9] if (cur and len(cur) > 9 and cur[9]) else ''

        # Định dạng giá nhập
        if gn > 0:
            gn_str = f"{int(round(gn)):,} đ".replace(',', '.')
        else:
            gn_str = "0 đ"

        # Chi tiết lô
        if sl > 0:
            lo_str = f"{sl} x {gn_str}"
        else:
            lo_str = ""

        # Chuẩn bị bản ghi cho SQLite
        clean_gb = float(str(gia_ban_str).replace('đ', '').replace('Đ', '').replace(',', '').replace('.', '').strip() or 0)
        gn_num = int(gn) if gn.is_integer() else gn
        gb_num = int(clean_gb) if clean_gb.is_integer() else clean_gb

        # Chuẩn bị dòng cho Google Sheets (10 cột: ID, Mã Hàng, Tên Hàng Hóa, Danh Mục, ĐVT, Giá Nhập (đ), Giá Bán (đ), SL, Chi Tiết Lô Giá, Ghi Chú)
        sheet_row = [
            row_id,
            ma_hang,
            ten_hang,
            danh_muc,
            dvt,
            gn_num,
            gb_num,
            sl,
            lo_str,
            ghi_chu
        ]
        sheet_update_data.append(sheet_row)

        sqlite_items.append({
            'id': row_id,
            'ma_hang': ma_hang,
            'ten_hang': ten_hang,
            'danh_muc': danh_muc,
            'don_vi_tinh': dvt,
            'gia_nhap': gn,
            'gia_ban': clean_gb,
            'ton_kho': sl,
            'chi_tiet_lo': lo_str,
            'ghi_chu': ghi_chu
        })

    print(f"Chuẩn bị xong {len(sheet_update_data)} dòng dữ liệu.")

    # 1. Cập nhật Google Sheets
    print("2. Đang ghi đè dữ liệu chuẩn vào Google Sheets (A2:J243)...")
    ws.update("A2:J243", sheet_update_data)

    # Nếu có dòng 244 trở đi (hàng test HH245), xóa dòng thừa
    if len(existing_rows) > 242:
        print(f"Xóa các dòng thừa từ dòng 244 đến {len(existing_rows)+1}...")
        for r_idx in range(len(existing_rows) + 1, 243, -1):
            ws.delete_rows(r_idx)

    print("✓ Đã cập nhật xong Google Sheets!")

    # 2. Cập nhật SQLite
    print("3. Đang ghi vào Database SQLite...")
    with sqlite3.connect(str(DB_PATH)) as conn:
        c = conn.cursor()
        c.execute("DELETE FROM HangHoa")
        for it in sqlite_items:
            c.execute("""
                INSERT INTO HangHoa (id, ma_hang, ten_hang, danh_muc, don_vi_tinh, gia_nhap, gia_ban, ton_kho, chi_tiet_lo, ghi_chu)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                it['id'], it['ma_hang'], it['ten_hang'], it['danh_muc'], it['don_vi_tinh'],
                it['gia_nhap'], it['gia_ban'], it['ton_kho'], it['chi_tiet_lo'], it['ghi_chu']
            ))
        conn.commit()

    # Xóa bộ đệm RAM của sheets_service
    sheets_service.invalidate_records_cache()

    print("✓ Đã cập nhật xong SQLite!")

    # Kiểm tra lại tổng tồn kho trong SQLite
    with sqlite3.connect(str(DB_PATH)) as conn:
        c = conn.cursor()
        c.execute("SELECT COUNT(*), SUM(ton_kho), SUM(ton_kho * gia_nhap) FROM HangHoa")
        cnt, total_qty, total_val = c.fetchone()
        print("\n================ KẾT QUẢ SAU CẬP NHẬT ================")
        print(f"- Tổng số mặt hàng: {cnt}")
        print(f"- Tổng số lượng tồn kho: {total_qty}")
        print(f"- Tổng giá trị tồn kho: {total_val:,.0f} đ")
        print("=======================================================")

    # Kiểm tra riêng mẫu Dell 7440 (HH081)
    hh81 = db_manager.get_hang_hoa_by_ma("HH081")
    print(f"Mẫu HH081 (Dell 7440): Tồn kho = {hh81['ton_kho']} | Lô: {hh81['chi_tiet_lo']}")

if __name__ == '__main__':
    run_update()
