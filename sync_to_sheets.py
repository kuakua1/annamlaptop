import sys
import json
from pathlib import Path

# Đảm bảo in tiếng Việt chuẩn trên Windows Command Prompt
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

# Đảm bảo đường dẫn import
BASE_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(BASE_DIR))

from services.db_service import db_manager

def main():
    print("=" * 60)
    print(" ĐỒNG BỘ: ĐẨY DỮ LIỆU TỪ SQLITE LÊN GOOGLE SHEETS")
    print("=" * 60)
    print("\nĐang đọc dữ liệu từ inventory.db và ghi lên Google Sheets...")
    
    try:
        res = db_manager.sync_to_google_sheets()
        print("\n[THÀNH CÔNG] Đã đẩy toàn bộ dữ liệu lên Google Sheets!")
        print("-" * 60)
        for table, count in res.items():
            if table.endswith("_err"):
                print(f"  ❌ Lỗi tại bảng {table.replace('_err', '')}: {count}")
            else:
                print(f"  ✅ Bảng {table:<12}: Đã tải lên {count} dòng")
        print("-" * 60)
    except Exception as e:
        print(f"\n[LỖI] Không thể đồng bộ: {e}")

if __name__ == "__main__":
    main()
