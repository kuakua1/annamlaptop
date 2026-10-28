import sqlite3
import os

db_path = "/root/kho-hang/inventory.db" if os.path.exists("/root/kho-hang/inventory.db") else "inventory.db"

conn = sqlite3.connect(db_path, timeout=30.0)
conn.execute("PRAGMA journal_mode = WAL;")
conn.execute("PRAGMA busy_timeout = 5000;")
conn.execute("PRAGMA synchronous = NORMAL;")
c = conn.cursor()

# 1. Chuẩn hóa giá vốn các phiếu xuất trước 20/10 (3 con đầu kỳ giá 15.1tr)
c.execute("""
    UPDATE XuatHang 
    SET gia_von = 15100000.0, loi_nhuan = gia_ban - 15100000.0 
    WHERE so_phieu IN ('XH1001/10', 'XH1012/10', 'XH1048/10') AND ma_hang = 'HH088'
""")
affected_15m = c.rowcount

# 2. Chuẩn hóa giá vốn các phiếu xuất sau 20/10 (lấy từ lô nhập 20/10 giá 14tr)
c.execute("""
    UPDATE XuatHang 
    SET gia_von = 14000000.0, loi_nhuan = gia_ban - 14000000.0 
    WHERE so_phieu IN ('XH1082/10', 'XH1084/10') AND ma_hang = 'HH088'
""")
affected_14m = c.rowcount

# 3. Cập nhật tồn kho Dell 5560 về đúng 1 chiếc giá 14 triệu
c.execute("""
    UPDATE HangHoa 
    SET ton_kho = 1, gia_nhap = 14000000.0, chi_tiet_lo = '1 x 14.000.000 đ' 
    WHERE ma_hang = 'HH088'
""")
affected_hh = c.rowcount

conn.commit()
conn.close()

print(f"=== ĐÃ XỬ LÝ THÀNH CÔNG ===")
print(f"- Cập nhật phiếu xuất lô 15.1tr (XH1001, XH1012, XH1048): {affected_15m} dòng")
print(f"- Cập nhật phiếu xuất lô 14.0tr (XH1082, XH1084):         {affected_14m} dòng")
print(f"- Cập nhật tồn kho HH088: 1 chiếc x 14.000.000 đ:         {affected_hh} dòng")
