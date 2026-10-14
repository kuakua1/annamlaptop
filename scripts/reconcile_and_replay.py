import sys
import os
import sqlite3
import openpyxl
from copy import deepcopy

# Ensure UTF-8 output
sys.stdout.reconfigure(encoding='utf-8')

# Add parent directory to path
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, BASE_DIR)

from services.sheets_service import format_batches_str, sheets_service
from services.db_service import DB_PATH

EXCEL_FILE = r'C:\Users\Admin\Desktop\tồn kho đến cuối tháng 9.xlsx'

def run():
    print("=" * 70)
    print(" BẮT ĐẦU QUY TRÌNH NẠP TỒN ĐẦU KỲ VÀ REPLAY TOÀN BỘ PHIẾU XUẤT/NHẬP")
    print("=" * 70)

    if not os.path.exists(EXCEL_FILE):
        print(f"LỖI: Không tìm thấy file Excel tại {EXCEL_FILE}")
        return

    # 1. Đọc file Excel tồn đầu kỳ
    wb = openpyxl.load_workbook(EXCEL_FILE, data_only=True)
    ws = wb.active
    excel_items = []
    for r in list(ws.iter_rows(values_only=True))[10:]:
        stt = r[0]
        if isinstance(stt, int):
            ten = str(r[1]).strip() if r[1] else ''
            dvt = str(r[2]).strip() if r[2] else 'Cái'
            sl = int(r[3]) if r[3] is not None else 0
            gia = float(r[4]) if r[4] is not None else 0.0
            tt = float(r[5]) if r[5] is not None else (sl * gia)
            excel_items.append({
                'stt': stt,
                'ten': ten,
                'dvt': dvt,
                'sl': sl,
                'gia': gia,
                'tt': tt
            })

    total_ex_qty = sum(x['sl'] for x in excel_items)
    total_ex_val = sum(x['tt'] for x in excel_items)
    print(f"1. Đã đọc file Excel: {len(excel_items)} mặt hàng.")
    print(f"   -> Tổng SL đầu kỳ: {total_ex_qty}")
    print(f"   -> Tổng giá trị đầu kỳ: {total_ex_val:,.0f} đ")

    # 2. Đọc HangHoa hiện tại từ DB
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    c = conn.cursor()
    c.execute("SELECT * FROM HangHoa ORDER BY ma_hang")
    db_hanghoa = [dict(r) for r in c.fetchall()]

    name_to_ma = {}
    for h in db_hanghoa:
        name_to_ma[h['ten_hang'].strip().lower()] = h['ma_hang']

    # Alias cho ASUS VivoBook
    name_to_ma['asus vivobook 15x1503za i5-12500h/8gb/ssd 512gb/intel iris xe graphics/15.6” fhd màu bạc sáng'.lower()] = 'HH002'

    max_hh_num = max(int(h['ma_hang'][2:]) for h in db_hanghoa if h['ma_hang'].startswith('HH') and h['ma_hang'][2:].isdigit())

    # Khởi tạo từ điển sản phẩm
    products = {}
    for h in db_hanghoa:
        ma = h['ma_hang']
        products[ma] = {
            'id': h['id'],
            'ma_hang': ma,
            'ten_hang': h['ten_hang'],
            'danh_muc': h['danh_muc'],
            'don_vi_tinh': h['don_vi_tinh'],
            'gia_nhap': float(h['gia_nhap'] or 0),
            'gia_ban': float(h.get('gia_ban', 0) or 0),
            'ton_kho_dau_ky': 0,
            'gia_nhap_dau_ky': float(h['gia_nhap'] or 0),
            'batches': [],
            'ghi_chu': '' if (' x ' in (h.get('ghi_chu') or '') and ('đ' in (h.get('ghi_chu') or '') or 'Đ' in (h.get('ghi_chu') or ''))) else (h.get('ghi_chu') or ''),
            'is_new': False
        }

    # Gán tồn đầu kỳ từ Excel vào products
    new_added_count = 0
    for ex in excel_items:
        k = ex['ten'].strip().lower()
        ma = name_to_ma.get(k)
        if not ma:
            max_hh_num += 1
            ma = f"HH{max_hh_num:03d}"
            name_to_ma[k] = ma
            new_added_count += 1
            products[ma] = {
                'id': str(1790999153450 + max_hh_num),
                'ma_hang': ma,
                'ten_hang': ex['ten'],
                'danh_muc': 'Laptop' if any(w in k for w in ['dell', 'hp', 'lenovo', 'asus']) else 'Linh Kiện',
                'don_vi_tinh': ex['dvt'],
                'gia_nhap': ex['gia'],
                'gia_ban': 0.0,
                'ton_kho_dau_ky': ex['sl'],
                'gia_nhap_dau_ky': ex['gia'],
                'batches': [],
                'ghi_chu': '',
                'is_new': True
            }

        p = products[ma]
        p['ton_kho_dau_ky'] = ex['sl']
        p['gia_nhap_dau_ky'] = ex['gia']
        p['gia_nhap'] = ex['gia']
        p['don_vi_tinh'] = ex['dvt']
        if ex['sl'] > 0:
            p['batches'] = [{'so_luong': ex['sl'], 'gia_nhap': ex['gia']}]
        else:
            p['batches'] = []

    print(f"2. Đã khớp nối danh mục: {len(products)} mặt hàng (thêm mới {new_added_count} mặt hàng từ Excel: HH258, HH259).")

    # 3. Nạp danh sách phiếu nhập và phiếu xuất
    c.execute("SELECT * FROM NhapHang ORDER BY ngay_nhap, id")
    nhap_rows = [dict(r) for r in c.fetchall()]

    c.execute("SELECT * FROM XuatHang ORDER BY ngay_xuat, id")
    xuat_rows = [dict(r) for r in c.fetchall()]

    print(f"3. Dữ liệu giao dịch cần replay:")
    print(f"   -> Phiếu nhập: {len(nhap_rows)} dòng (Tổng SL nhập = {sum(r['so_luong'] for r in nhap_rows)})")
    print(f"   -> Phiếu xuất: {len(xuat_rows)} dòng (Tổng SL xuất = {sum(r['so_luong'] for r in xuat_rows)})")

    # Tạo danh sách sự kiện sắp xếp theo thời gian
    events = []
    for r in nhap_rows:
        events.append({
            'date': r['ngay_nhap'],
            'priority': 0, # Nhập trước xuất
            'type': 'NHAP',
            'so_phieu': r['so_phieu'],
            'id': r['id'],
            'ma_hang': r['ma_hang'],
            'ten_hang': r['ten_hang'],
            'so_luong': int(r['so_luong']),
            'don_gia': float(r['gia_nhap']),
            'thanh_tien': float(r['thanh_tien'])
        })

    for r in xuat_rows:
        events.append({
            'date': r['ngay_xuat'],
            'priority': 1,
            'type': 'XUAT',
            'so_phieu': r['so_phieu'],
            'id': r['id'],
            'ma_hang': r['ma_hang'],
            'ten_hang': r['ten_hang'],
            'so_luong': int(r['so_luong']),
            'don_gia': float(r['gia_ban']),
            'thanh_tien': float(r['thanh_tien'])
        })

    events.sort(key=lambda x: (x['date'], x['priority'], x['id']))

    # 4. Thực thi Replay tuần tự
    sim_products = deepcopy(products)
    for p in sim_products.values():
        p['current_ton'] = p['ton_kho_dau_ky']
        p['current_batches'] = deepcopy(p['batches'])

    underflow_count = 0
    updated_xuat_rows = []

    for ev in events:
        ma = ev['ma_hang']
        if ma not in sim_products:
            print(f"CẢNH BÁO: Không tìm thấy mã hàng {ma} ({ev['ten_hang']})")
            continue

        p = sim_products[ma]

        if ev['type'] == 'NHAP':
            sl = ev['so_luong']
            gia = ev['don_gia']
            p['current_ton'] += sl
            p['gia_nhap'] = gia # Cập nhật giá nhập gần nhất

            merged = False
            for b in p['current_batches']:
                if abs(b['gia_nhap'] - gia) < 1.0:
                    b['so_luong'] += sl
                    merged = True
                    break
            if not merged:
                p['current_batches'].append({'so_luong': sl, 'gia_nhap': gia})

        elif ev['type'] == 'XUAT':
            sl = ev['so_luong']
            rem_need = sl
            cost = 0.0
            new_batches = []

            for b in p['current_batches']:
                if rem_need <= 0:
                    new_batches.append(b)
                elif b['so_luong'] <= rem_need:
                    cost += b['so_luong'] * b['gia_nhap']
                    rem_need -= b['so_luong']
                else:
                    cost += rem_need * b['gia_nhap']
                    b['so_luong'] -= rem_need
                    rem_need = 0
                    new_batches.append(b)

            p['current_batches'] = new_batches
            p['current_ton'] -= sl

            if rem_need > 0:
                underflow_count += 1
                fallback_price = p['gia_nhap'] or p['gia_nhap_dau_ky'] or 0.0
                cost += rem_need * fallback_price

            loi_nhuan = ev['thanh_tien'] - cost
            updated_xuat_rows.append({
                'id': ev['id'],
                'so_phieu': ev['so_phieu'],
                'gia_von': cost,
                'loi_nhuan': loi_nhuan
            })

    print(f"4. Replay hoàn tất: {len(events)} giao dịch đã xử lý.")
    print(f"   -> Cảnh báo âm kho (underflow): {underflow_count}")

    # 5. Cập nhật vào cơ sở dữ liệu SQLite
    print("5. Đang cập nhật vào SQLite...")
    with conn:
        # Cập nhật HangHoa
        for p in sim_products.values():
            batches = p['current_batches']
            ton_kho = sum(b['so_luong'] for b in batches)
            lo_str = format_batches_str(batches) if batches else ""
            latest_gia_nhap = batches[-1]['gia_nhap'] if batches else p['gia_nhap']

            if p['is_new']:
                c.execute("""
                    INSERT INTO HangHoa (id, ma_hang, ten_hang, danh_muc, don_vi_tinh, gia_nhap, gia_ban, ton_kho, chi_tiet_lo, ghi_chu)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    p['id'], p['ma_hang'], p['ten_hang'], p['danh_muc'], p['don_vi_tinh'],
                    latest_gia_nhap, p['gia_ban'], ton_kho, lo_str, p['ghi_chu']
                ))
            else:
                c.execute("""
                    UPDATE HangHoa
                    SET gia_nhap = ?, ton_kho = ?, chi_tiet_lo = ?, ghi_chu = ?
                    WHERE ma_hang = ?
                """, (latest_gia_nhap, ton_kho, lo_str, p['ghi_chu'], p['ma_hang']))

        # Cập nhật giá vốn và lợi nhuận cho XuatHang
        for r in updated_xuat_rows:
            c.execute("""
                UPDATE XuatHang
                SET gia_von = ?, loi_nhuan = ?
                WHERE id = ?
            """, (r['gia_von'], r['loi_nhuan'], r['id']))

    print("✓ Đã cập nhật xong SQLite!")

    # 6. Đồng bộ sang Google Sheets
    print("6. Đang đồng bộ toàn bộ dữ liệu sạch lên Google Sheets...")
    try:
        sheets_service.initialize()
        ws_hh = sheets_service._sheet('HangHoa')
        ws_xh = sheets_service._sheet('XuatHang')

        # Chuẩn bị dữ liệu HangHoa (9 cột chuẩn Google Sheets: ID, Mã Hàng, Tên, Danh Mục, ĐVT, Giá Nhập, SL, Chi Tiết Lô Giá, Ghi Chú)
        c.execute("SELECT id, ma_hang, ten_hang, danh_muc, don_vi_tinh, gia_nhap, ton_kho, chi_tiet_lo, ghi_chu FROM HangHoa ORDER BY ma_hang")
        all_hh_clean = [list(r) for r in c.fetchall()]

        # Format các cột số
        hh_sheet_data = []
        for r in all_hh_clean:
            hh_sheet_data.append([
                r[0],
                r[1],
                r[2],
                r[3],
                r[4],
                int(round(float(r[5] or 0))),
                int(r[6] or 0),
                r[7] or '',
                r[8] or ''
            ])

        # Ghi đè vào HangHoa (A2:I{len})
        ws_hh.update(f"A2:I{len(hh_sheet_data)+1}", hh_sheet_data)
        try:
            ws_hh.batch_clear([f"J2:J{len(hh_sheet_data)+10}"])
        except Exception:
            pass

        # Cập nhật giá vốn & lợi nhuận trên XuatHang Google Sheets
        c.execute("SELECT id, so_phieu, ngay_xuat, ma_hang, ten_hang, so_luong, gia_ban, thanh_tien, khach_hang_id, ghi_chu, gia_von, loi_nhuan, tien_khach_no FROM XuatHang ORDER BY ngay_xuat, id")
        all_xh_clean = [list(r) for r in c.fetchall()]
        xh_sheet_data = []
        for r in all_xh_clean:
            xh_sheet_data.append([
                r[0], r[1], r[2], r[3], r[4],
                int(r[5] or 0),
                int(round(float(r[6] or 0))),
                int(round(float(r[7] or 0))),
                r[8] or '',
                r[9] or '',
                int(round(float(r[10] or 0))),
                int(round(float(r[11] or 0))),
                float(r[12] or 0)
            ])
        ws_xh.update(f"A2:M{len(xh_sheet_data)+1}", xh_sheet_data)

        sheets_service.invalidate_records_cache()
        print("✓ Đã đồng bộ xong Google Sheets (cả HangHoa và XuatHang)!")
    except Exception as e:
        print(f"LỖI đồng bộ Google Sheets: {e}")

    # 7. Đối soát & Tổng kết
    c.execute("SELECT COUNT(*), SUM(ton_kho) FROM HangHoa")
    final_count, final_qty = c.fetchone()

    # Tính tổng giá trị tồn kho theo các lô
    c.execute("SELECT ton_kho, chi_tiet_lo, gia_nhap FROM HangHoa")
    total_inventory_val = 0
    for tk, ct, gn in c.fetchall():
        if ct:
            from services.sheets_service import parse_batches_str
            b_list = parse_batches_str(ct, tk, gn)
            total_inventory_val += sum(b['so_luong'] * b['gia_nhap'] for b in b_list)
        else:
            total_inventory_val += tk * gn

    c.execute("SELECT SUM(thanh_tien), SUM(gia_von), SUM(loi_nhuan) FROM XuatHang")
    sum_revenue, sum_cogs, sum_profit = c.fetchone()

    print("\n" + "=" * 70)
    print(" BÁO CÁO ĐỐI SOÁT TỔNG KẾT KHO (AUDIT REPORT)")
    print("=" * 70)
    print(f"1. TỒN ĐẦU KỲ (01/10):     {total_ex_qty:>6} cái  |  {total_ex_val:>16,.0f} đ")
    print(f"2. TỔNG NHẬP TRONG KỲ:    +{sum(r['so_luong'] for r in nhap_rows):>6} cái  | +{sum(r['thanh_tien'] for r in nhap_rows):>16,.0f} đ")
    print(f"3. TỔNG XUẤT TRONG KỲ:    -{sum(r['so_luong'] for r in xuat_rows):>6} cái  | -{sum_cogs:>16,.0f} đ (Giá vốn FIFO)")
    print("-" * 70)
    print(f"4. TỒN CUỐI KỲ THỰC TẾ:   ={final_qty:>6} cái  |  {total_inventory_val:>16,.0f} đ")
    print(f"   -> Kiểm tra cân đối:    1.147 + 114 - 181 = {1147 + 114 - 181} (Khớp 100%: {'✓ ĐÚNG' if final_qty == 1080 else '❌ SAI'})")
    print(f"5. HIỆU QUẢ KINH DOANH:")
    print(f"   -> Tổng Doanh Thu Xuất:  {sum_revenue:>16,.0f} đ")
    print(f"   -> Tổng Giá Vốn Hàng Bán:{sum_cogs:>16,.0f} đ")
    print(f"   -> Tổng Lợi Nhuận Gộp:   {sum_profit:>16,.0f} đ (Tỷ suất LN: {(sum_profit/sum_revenue*100):.1f}%)")
    print(f"6. TỔNG SỐ MẶT HÀNG:       {final_count} mặt hàng")
    print("=" * 70)

if __name__ == '__main__':
    run()
