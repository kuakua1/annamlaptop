import sqlite3
import os

db_path = "/root/kho-hang/inventory.db" if os.path.exists("/root/kho-hang/inventory.db") else "inventory.db"

conn = sqlite3.connect(db_path, timeout=30.0)
conn.execute("PRAGMA journal_mode = WAL;")
conn.execute("PRAGMA busy_timeout = 5000;")
conn.execute("PRAGMA synchronous = NORMAL;")
c = conn.cursor()

# 1. Cập nhật phiếu xuất XH1084/10 ngày 22/10 về đúng giá vốn 14 triệu
c.execute("""
    UPDATE XuatHang 
    SET gia_von = 14000000.0, loi_nhuan = gia_ban - 14000000.0 
    WHERE so_phieu = 'XH1084/10' AND ma_hang = 'HH088'
""")
affected_xuat = c.rowcount

# 2. Cập nhật tồn kho Dell 5560 về đúng 1 chiếc giá 14 triệu
c.execute("""
    UPDATE HangHoa 
    SET ton_kho = 1, gia_nhap = 14000000.0, chi_tiet_lo = '1 x 14.000.000 đ' 
    WHERE ma_hang = 'HH088'
""")
affected_hh = c.rowcount

conn.commit()
conn.close()

print(f"=== ĐÃ XỬ LÝ THÀNH CÔNG ===")
print(f"- Cập nhật phiếu XH1084/10: {affected_xuat} dòng (Giá vốn: 14.000.000 đ | Lợi nhuận: 6.100.000 đ)")
print(f"- Cập nhật tồn kho HH088:   {affected_hh} dòng (Tồn: 1 chiếc | Giá: 14.000.000 đ)")
