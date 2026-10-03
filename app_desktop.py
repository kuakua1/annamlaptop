import sys
import os
import io
import socket
import threading
import time
from pathlib import Path

# Safe stdout/stderr for PyInstaller GUI mode
class SafeStream(io.StringIO):
    def write(self, s):
        pass
    def flush(self):
        pass

if sys.stdout is None:
    sys.stdout = SafeStream()
else:
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

if sys.stderr is None:
    sys.stderr = SafeStream()
else:
    try:
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

# Setup paths
if getattr(sys, "frozen", False):
    BASE_DIR = Path(getattr(sys, "_MEIPASS", Path(sys.executable).parent)).resolve()
    EXE_DIR = Path(sys.executable).parent.resolve()
    os.chdir(BASE_DIR)
else:
    BASE_DIR = Path(__file__).parent.resolve()
    os.chdir(BASE_DIR)

sys.path.insert(0, str(BASE_DIR))

import webview
import uvicorn
from main import app

# Enable file downloads in webview (for exporting Excel, reports)
webview.settings['ALLOW_DOWNLOADS'] = True
webview.settings['ALLOW_FILE_URLS'] = True
webview.settings['OPEN_EXTERNAL_LINKS_IN_BROWSER'] = True

LOG_FILE = os.path.join(os.environ.get("TEMP", "C:\\temp"), "kho_hang_app.log")

def debug_log(msg):
    try:
        with open(LOG_FILE, "a", encoding="utf-8") as f:
            f.write(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] {msg}\n")
    except Exception:
        pass

def find_available_port(start_port=8000):
    for port in range(start_port, start_port + 50):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            try:
                s.bind(('127.0.0.1', port))
                return port
            except OSError:
                continue
    return 8000

def wait_for_server(port, timeout=15):
    start = time.time()
    while time.time() - start < timeout:
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                s.settimeout(0.5)
                if s.connect_ex(('127.0.0.1', port)) == 0:
                    return True
        except Exception:
            pass
        time.sleep(0.2)
    return False

def main_desktop():
    debug_log("=== main_desktop started ===")
    port = find_available_port(8000)
    debug_log(f"Selected port: {port}")
    
    server_config = uvicorn.Config(
        app=app,
        host="127.0.0.1",
        port=port,
        log_level="warning",
        access_log=False
    )
    server = uvicorn.Server(server_config)
    
    server_thread = threading.Thread(target=server.run, daemon=True)
    server_thread.start()
    debug_log("Uvicorn server thread started")
    
    # Wait until server is listening
    if wait_for_server(port):
        debug_log(f"Server is listening on 127.0.0.1:{port}")
    else:
        debug_log(f"Server wait timeout on 127.0.0.1:{port}")
    
    # Create native WebView2 desktop window
    debug_log("Creating webview window...")
    window = webview.create_window(
        title="Kho Hàng An Nam",
        url=f"http://127.0.0.1:{port}",
        width=1366,
        height=850,
        min_size=(1024, 700),
        text_select=True,
        confirm_close=False
    )
    
    icon_path = str(BASE_DIR / "static" / "favicon.ico")
    if not os.path.exists(icon_path):
        icon_path = None
        
    debug_log(f"Starting webview GUI loop with icon: {icon_path}...")
    webview.start(icon=icon_path)
    debug_log("Webview GUI loop ended by user")
    
    # Clean shutdown
    server.should_exit = True
    sys.exit(0)

if __name__ == "__main__":
    import multiprocessing
    multiprocessing.freeze_support()
    try:
        main_desktop()
    except Exception as e:
        import traceback
        err_msg = f"CRASH: {e}\n{traceback.format_exc()}"
        debug_log(err_msg)
        try:
            import ctypes
            ctypes.windll.user32.MessageBoxW(0, f"Lỗi khởi động ứng dụng:\n{e}", "Kho Hàng An Nam - Lỗi", 0x10)
        except Exception:
            pass
        sys.exit(1)
