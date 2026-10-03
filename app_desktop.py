import sys
import os
import socket
import threading
import time
from pathlib import Path

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

def find_available_port(start_port=8000):
    for port in range(start_port, start_port + 50):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
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
    port = find_available_port(8000)
    
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
    
    # Wait until server is listening
    wait_for_server(port)
    
    # Locate icon
    icon_path = None
    candidates = [BASE_DIR / "static" / "favicon.ico"]
    if getattr(sys, "frozen", False):
        candidates.append(Path(sys.executable).parent / "static" / "favicon.ico")
        
    for candidate in candidates:
        if candidate and candidate.exists():
            icon_path = str(candidate)
            break

    # Create native WebView2 desktop window
    window = webview.create_window(
        title="Kho Hàng An Nam",
        url=f"http://127.0.0.1:{port}",
        width=1366,
        height=850,
        min_size=(1024, 700),
        text_select=True,
        confirm_close=False
    )
    
    # Start webview GUI loop (blocks until window is closed)
    webview.start(icon=icon_path)
    
    # Clean shutdown
    server.should_exit = True
    sys.exit(0)

if __name__ == "__main__":
    import multiprocessing
    multiprocessing.freeze_support()
    main_desktop()
