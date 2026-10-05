from fastapi import APIRouter, Request, Response, HTTPException, Depends
from fastapi.responses import HTMLResponse, RedirectResponse, JSONResponse
from fastapi.templating import Jinja2Templates
import time
import hmac
from collections import defaultdict
import bcrypt
from itsdangerous import URLSafeTimedSerializer, BadSignature, SignatureExpired

from config import SECRET_KEY, SESSION_COOKIE_NAME, SESSION_MAX_AGE
from models.schemas import LoginRequest
from services.sheets_service import sheets_service

router = APIRouter()
templates = Jinja2Templates(directory="static/templates")
serializer = URLSafeTimedSerializer(SECRET_KEY)

# ── Rate limiting chống Brute-Force đăng nhập ─────────────────────────────
_login_failures: dict[str, list[float]] = defaultdict(list)
_MAX_LOGIN_FAILURES = 5
_LOGIN_BLOCK_WINDOW = 300  # 5 phút (300 giây)


def get_client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "127.0.0.1"


def _check_login_rate_limit(ip: str):
    now = time.time()
    # Loại bỏ các lần thất bại quá thời gian cửa sổ
    _login_failures[ip] = [t for t in _login_failures[ip] if now - t < _LOGIN_BLOCK_WINDOW]
    if len(_login_failures[ip]) >= _MAX_LOGIN_FAILURES:
        wait_seconds = int(_LOGIN_BLOCK_WINDOW - (now - _login_failures[ip][0]))
        raise HTTPException(
            status_code=429,
            detail=f"Quá nhiều lần đăng nhập sai. Vui lòng thử lại sau {max(wait_seconds, 1)} giây."
        )


def _record_login_failure(ip: str):
    _login_failures[ip].append(time.time())


def _record_login_success(ip: str):
    if ip in _login_failures:
        del _login_failures[ip]


def create_session_token(username: str) -> str:
    return serializer.dumps({"username": username})


def decode_session_token(token: str) -> dict | None:
    try:
        return serializer.loads(token, max_age=SESSION_MAX_AGE)
    except (BadSignature, SignatureExpired):
        return None


def get_current_user(request: Request) -> str | None:
    token = request.cookies.get(SESSION_COOKIE_NAME)
    if not token:
        return None
    data = decode_session_token(token)
    if not data:
        return None
    return data.get("username")


def require_login(request: Request) -> str:
    user = get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Chưa đăng nhập")
    return user


@router.get("/", response_class=HTMLResponse)
async def root(request: Request):
    user = get_current_user(request)
    if user:
        return RedirectResponse(url="/dashboard")
    return RedirectResponse(url="/login")


@router.get("/login", response_class=HTMLResponse)
async def login_page(request: Request):
    user = get_current_user(request)
    if user:
        return RedirectResponse(url="/dashboard")
    return templates.TemplateResponse("login.html", {"request": request})


@router.post("/api/auth/login")
async def login(data: LoginRequest, request: Request, response: Response):
    client_ip = get_client_ip(request)
    _check_login_rate_limit(client_ip)

    try:
        stored_username = sheets_service.get_config("admin_username")
        stored_hash = sheets_service.get_config("admin_password_hash")

        if not stored_username or not stored_hash:
            raise HTTPException(status_code=500, detail="Cấu hình tài khoản chưa được thiết lập")

        # So sánh username chuẩn thời gian tránh timing attack
        username_match = hmac.compare_digest(data.username.strip(), str(stored_username).strip())

        password_bytes = data.password.encode("utf-8")
        hash_bytes = str(stored_hash).strip().encode("utf-8")

        # Kiểm tra mật khẩu bằng bcrypt (bcrypt tự so sánh constant-time)
        password_match = False
        try:
            password_match = bcrypt.checkpw(password_bytes, hash_bytes)
        except Exception:
            password_match = False

        if not username_match or not password_match:
            _record_login_failure(client_ip)
            raise HTTPException(status_code=401, detail="Tên đăng nhập hoặc mật khẩu không đúng")

        # Đăng nhập thành công -> Xóa bộ đếm lỗi
        _record_login_success(client_ip)

        is_secure = request.url.scheme == "https" or request.headers.get("x-forwarded-proto") == "https"
        token = create_session_token(data.username.strip())
        response.set_cookie(
            key=SESSION_COOKIE_NAME,
            value=token,
            max_age=SESSION_MAX_AGE,
            httponly=True,
            samesite="lax",
            secure=is_secure,
        )
        return {"success": True, "message": "Đăng nhập thành công", "username": data.username.strip()}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lỗi đăng nhập: {str(e)}")


@router.post("/api/auth/logout")
async def logout(response: Response):
    response.delete_cookie(SESSION_COOKIE_NAME, httponly=True, samesite="lax")
    return {"success": True, "message": "Đăng xuất thành công"}


@router.get("/dashboard", response_class=HTMLResponse)
async def dashboard_page(request: Request):
    user = get_current_user(request)
    if not user:
        return RedirectResponse(url="/login")
    return templates.TemplateResponse("dashboard.html", {"request": request, "username": user})
