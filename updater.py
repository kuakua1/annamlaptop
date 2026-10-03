import sys
import os
import json
import time
import threading
import urllib.request
import subprocess
import ctypes

CURRENT_VERSION = "1.0.0"
VERSION_URL = "https://raw.githubusercontent.com/kuakua1/annamlaptop/main/version.json"

def parse_version(v_str):
    """Convert version string like '1.0.1' or 'v1.0.1' to tuple (1, 0, 1)"""
    try:
        clean = str(v_str).lower().lstrip("v").strip()
        parts = [int(p) for p in clean.split(".") if p.isdigit()]
        return tuple(parts) if parts else (0, 0, 0)
    except Exception:
        return (0, 0, 0)

def show_message_box(text, title="Kho Hàng An Nam", style=0):
    """
    Windows MessageBox helper:
    0x00: MB_OK
    0x24: MB_YESNO | MB_ICONQUESTION
    0x40: MB_OK | MB_ICONINFORMATION
    0x10: MB_OK | MB_ICONERROR
    Returns: 6 for IDYES, 7 for IDNO, 1 for IDOK
    """
    try:
        return ctypes.windll.user32.MessageBoxW(0, text, title, style)
    except Exception:
        return 0

def download_file(url, dest_path):
    """Download installer file with timeout and browser User-Agent"""
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) KhoHangAnNam-Updater/1.0"}
    )
    with urllib.request.urlopen(req, timeout=60) as response, open(dest_path, "wb") as out_file:
        block_size = 65536
        while True:
            chunk = response.read(block_size)
            if not chunk:
                break
            out_file.write(chunk)
    return True

def start_update_check():
    """Starts update check in a non-blocking background thread."""
    def _worker():
        # Chờ 3 giây sau khi app khởi động để đảm bảo cửa sổ chính đã hiện mượt mà
        time.sleep(3)
        try:
            req = urllib.request.Request(
                VERSION_URL,
                headers={
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) KhoHangAnNam-Updater/1.0",
                    "Cache-Control": "no-cache",
                    "Pragma": "no-cache"
                }
            )
            with urllib.request.urlopen(req, timeout=5) as response:
                if response.status != 200:
                    return
                data = json.loads(response.read().decode("utf-8"))
                
            remote_version = data.get("version", "")
            if not remote_version:
                return
                
            # So sánh phiên bản
            if parse_version(remote_version) <= parse_version(CURRENT_VERSION):
                return
                
            # Có phiên bản mới hơn trên GitHub!
            notes = data.get("release_notes", "Cải tiến hiệu năng và cập nhật tính năng mới.")
            download_url = data.get("download_url", "")
            if not download_url:
                return
                
            prompt = (
                f"Phát hiện bản cập nhật mới: v{remote_version} (Bản hiện tại: v{CURRENT_VERSION})\n\n"
                f"Nội dung thay đổi:\n{notes}\n\n"
                f"Bạn có muốn tải về và cài đặt bản cập nhật ngay bây giờ không?"
            )
            
            # Hỏi người dùng
            user_choice = show_message_box(prompt, "Cập nhật Kho Hàng An Nam", 0x24)
            if user_choice != 6:  # 6 = IDYES
                return
                
            # Người dùng đồng ý -> Thông báo đang tải
            temp_dir = os.environ.get("TEMP", "C:\\temp")
            installer_path = os.path.join(temp_dir, f"setupKhoHang_v{remote_version}.exe")
            
            show_message_box(
                "Đang tiến hành tải bản cập nhật ngầm về máy.\n\n"
                "Sau khi tải xong, ứng dụng sẽ tự động đóng và khởi chạy trình cài đặt để hoàn tất cập nhật.",
                "Đang tải cập nhật...",
                0x40
            )
            
            # Tải file setup mới
            download_file(download_url, installer_path)
            
            if os.path.exists(installer_path) and os.path.getsize(installer_path) > 1000000:
                # Khởi chạy bộ cài và thoát app hiện tại để ghi đè file
                subprocess.Popen([installer_path, "/CLOSEAPPLICATIONS", "/RESTARTAPPLICATIONS"])
                os._exit(0)
            else:
                show_message_box(
                    "Không thể tải tệp cập nhật hoặc tệp bị hỏng. Vui lòng kiểm tra lại kết nối mạng!",
                    "Lỗi cập nhật",
                    0x10
                )
                
        except Exception:
            # Tự động bỏ qua lỗi nếu không có mạng để không làm gián đoạn người dùng
            pass

    t = threading.Thread(target=_worker, daemon=True)
    t.start()
