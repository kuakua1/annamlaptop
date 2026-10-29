import unittest
from services.db_service import db_manager
from services.sheets_service import parse_batches_str, format_batches_str


class TestMultiBatchReceipt(unittest.TestCase):

    def setUp(self):
        self.db = db_manager
        with self.db._get_connection() as conn:
            c = conn.cursor()
            c.execute("DELETE FROM HangHoa WHERE ma_hang = 'HH088'")
            c.execute("DELETE FROM NhapHang WHERE so_phieu = 'NH1018/10'")
            c.execute("DELETE FROM XuatHang WHERE ma_hang = 'HH088'")
            conn.commit()

    def tearDown(self):
        with self.db._get_connection() as conn:
            c = conn.cursor()
            c.execute("DELETE FROM HangHoa WHERE ma_hang = 'HH088'")
            c.execute("DELETE FROM NhapHang WHERE so_phieu = 'NH1018/10'")
            c.execute("DELETE FROM XuatHang WHERE ma_hang = 'HH088'")
            conn.commit()

    def test_multi_batch_import_receipt_update(self):
        # 1. Tạo hàng hóa ban đầu
        item = {
            "id": "item1",
            "ma_hang": "HH088",
            "ten_hang": "Dell Precision 5560",
            "danh_muc": "Laptop",
            "don_vi_tinh": "Cái",
            "gia_nhap": 14000000.0,
            "gia_ban": 18000000.0,
            "ton_kho": 0,
            "chi_tiet_lo": "",
            "ghi_chu": ""
        }
        self.db.insert_hang_hoa(item)

        # 2. Tạo phiếu nhập 3 con với giá 14tr
        receipt_items = [
            {"ma_hang": "HH088", "ten_hang": "Dell Precision 5560", "so_luong": 3, "gia_nhap": 14000000.0}
        ]
        so_phieu = "NH1018/10"
        self.db.create_nhap_hang_transaction(
            so_phieu=so_phieu,
            ngay_nhap="2026-10-20",
            ncc_save_ref="NCC001",
            ghi_chu="Phiếu nhập test",
            items=receipt_items
        )

        # Kiểm tra tồn kho sau khi nhập
        hh = self.db.get_hang_hoa_by_ma("HH088")
        self.assertEqual(hh["ton_kho"], 3)
        self.assertEqual(hh["gia_nhap"], 14000000.0)
        self.assertEqual(hh["chi_tiet_lo"], "3 x 14.000.000 đ")

        # 3. SỬA PHIẾU: Tách thành 2 lô giá khác nhau trong cùng 1 phiếu
        # 2 chiếc giá 14tr và 1 chiếc giá 14.5tr
        updated_items = [
            {"ma_hang": "HH088", "ten_hang": "Dell Precision 5560", "so_luong": 2, "gia_nhap": 14000000.0},
            {"ma_hang": "HH088", "ten_hang": "Dell Precision 5560", "so_luong": 1, "gia_nhap": 14500000.0}
        ]
        self.db.update_nhap_hang_receipt(
            so_phieu=so_phieu,
            ngay_nhap="2026-10-20",
            ncc_save_ref="NCC001",
            ghi_chu="Sửa thành 2 lô",
            items=updated_items
        )

        # Kiểm tra lại tồn kho và chi tiết lô sau khi sửa
        hh_after = self.db.get_hang_hoa_by_ma("HH088")
        self.assertEqual(hh_after["ton_kho"], 3)
        self.assertEqual(hh_after["gia_nhap"], 14500000.0)
        # Cả 2 lô giá 14tr và 14.5tr phải xuất hiện đầy đủ trong chi_tiet_lo
        self.assertIn("2 x 14.000.000 đ", hh_after["chi_tiet_lo"])
        self.assertIn("1 x 14.500.000 đ", hh_after["chi_tiet_lo"])

        # Kiểm tra bảng NhapHang lưu đúng 2 dòng riêng biệt
        with self.db._get_connection() as conn:
            c = conn.cursor()
            c.execute("SELECT * FROM NhapHang WHERE so_phieu = ?", (so_phieu,))
            rows = c.fetchall()
            self.assertEqual(len(rows), 2)
            prices = sorted([r["gia_nhap"] for r in rows])
            self.assertEqual(prices, [14000000.0, 14500000.0])

        # 4. SỬA PHIẾU TIẾP: Thay đổi số lượng của lô 14.5tr lên 2 con (tổng 4 con)
        updated_items_2 = [
            {"ma_hang": "HH088", "ten_hang": "Dell Precision 5560", "so_luong": 2, "gia_nhap": 14000000.0},
            {"ma_hang": "HH088", "ten_hang": "Dell Precision 5560", "so_luong": 2, "gia_nhap": 14500000.0}
        ]
        self.db.update_nhap_hang_receipt(
            so_phieu=so_phieu,
            ngay_nhap="2026-10-20",
            ncc_save_ref="NCC001",
            ghi_chu="Tăng lô 14.5tr",
            items=updated_items_2
        )
        hh_after_2 = self.db.get_hang_hoa_by_ma("HH088")
        self.assertEqual(hh_after_2["ton_kho"], 4)
        self.assertIn("2 x 14.000.000 đ", hh_after_2["chi_tiet_lo"])
        self.assertIn("2 x 14.500.000 đ", hh_after_2["chi_tiet_lo"])

        # 5. Xuất bán 3 con (FIFO sẽ trừ 2 con 14tr và 1 con 14.5tr)
        # Kho còn lại 1 con 14.5tr
        self.db.xuat_hang_batch_local("HH088", 3)
        hh_after_sold = self.db.get_hang_hoa_by_ma("HH088")
        self.assertEqual(hh_after_sold["ton_kho"], 1)
        self.assertEqual(hh_after_sold["chi_tiet_lo"], "1 x 14.500.000 đ")

        # 6. Kiểm tra an toàn: Thử sửa phiếu giảm số lượng về 0 (thu hồi 4 con trong khi kho chỉ còn 1)
        # Phải raise ValueError!
        with self.assertRaises(ValueError):
            self.db.update_nhap_hang_receipt(
                so_phieu=so_phieu,
                ngay_nhap="2026-10-20",
                ncc_save_ref="NCC001",
                ghi_chu="Hạ về 0",
                items=[]
            )

        # 7. Kiểm tra xóa phiếu khi hàng đã xuất bán -> Phải raise ValueError!
        with self.assertRaises(ValueError):
            self.db.delete_nhap_hang_receipt(so_phieu)

        # Kho vẫn an toàn còn nguyên 1 con
        hh_final = self.db.get_hang_hoa_by_ma("HH088")
        self.assertEqual(hh_final["ton_kho"], 1)
        self.assertEqual(hh_final["chi_tiet_lo"], "1 x 14.500.000 đ")


if __name__ == "__main__":
    unittest.main()
