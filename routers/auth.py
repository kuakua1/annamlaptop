from fastapi import APIRouter, Request, Response, HTTPException, Depends
from fastapi.responses import HTMLResponse, RedirectResponse, JSONResponse
from fastapi.templating import Jinja2Templates
import time
import hmac
from collections import defaultdict
import bcrypt
from itsdangerous import URLSafeTimedSerializer, BadSignature, SignatureExpired

from config import SECRET_KEY, SESSION_COOKIE_NAME, SESSION_MAX_AGE
from models.schemas import (
    LoginRequest,
    ChangePasswordRequest,
    CreateUserRequest,
    AdminResetPasswordRequest,
)
from services.sheets_service import sheets_service
from services.db_service import db_manager
from services.logger_service import log_activity

router = APIRouter()
templates = Jinja2Templates(directory="static/templates")
serializer = URLSafeTimedSerializer(SECRET_KEY)

# ── Rate limiting chống Brute-Force đăng nhập ─────────────────────────────
_login_failures: dict[str, list[float]] = defaultdict(list)
_MAX_LOGIN_FAILURES = 5
_LOGIN_BLOCK_WINDOW = 300  # 5 phút (300 giây)


def get_client_ip(request: Request) -> str:
    # Lấy IP kết nối trực tiếp để chống giả mạo header bypass rate limit
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


def create_session_token(username: str, role: str = "kho") -> str:
    return serializer.dumps({"username": username, "role": role})


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
    username = data.get("username")
    if not username:
        return None
    # Xác thực tài khoản vẫn tồn tại trong CSDL (thu hồi phiên tức thì nếu tài khoản bị xóa)
    user_rec = db_manager.get_user_by_username(username)
    if not user_rec:
        return None
    return username


def get_current_user_role(request: Request) -> str:
    username = get_current_user(request)
    if not username:
        return "kho"
    user_rec = db_manager.get_user_by_username(username) or {}
    return user_rec.get("role") or ("admin" if username.lower() == "admin" else "kho")


def require_login(request: Request) -> str:
    user = get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Chưa đăng nhập")
    return user


def require_admin(request: Request) -> str:
    user = require_login(request)
    user_rec = db_manager.get_user_by_username(user) or {}
    role = user_rec.get("role") or ("admin" if user.lower() == "admin" else "kho")
    if role != "admin" and user.lower() != "admin":
        raise HTTPException(
            status_code=403,
            detail="Chỉ tài khoản Quản trị viên (Admin) mới có quyền xem và thao tác trên phần này"
        )
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
        uname = data.username.strip()
        pwd = data.password

        user_rec = db_manager.get_user_by_username(uname)
        if not user_rec:
            _record_login_failure(client_ip)
            log_activity("ĐĂNG_NHẬP_THẤT_BẠI", f"Tài khoản không tồn tại: '{uname}'", username=uname, ip=client_ip, level="WARNING")
            raise HTTPException(status_code=401, detail="Tên đăng nhập hoặc mật khẩu không đúng")

        stored_hash = str(user_rec.get("password_hash") or "").strip()
        password_bytes = pwd.encode("utf-8")
        hash_bytes = stored_hash.encode("utf-8")

        password_match = False
        try:
            password_match = bcrypt.checkpw(password_bytes, hash_bytes)
        except Exception:
            password_match = False

        if not password_match:
            _record_login_failure(client_ip)
            log_activity("ĐĂNG_NHẬP_THẤT_BẠI", f"Mật khẩu không đúng cho tài khoản '{uname}'", username=uname, ip=client_ip, level="WARNING")
            raise HTTPException(status_code=401, detail="Tên đăng nhập hoặc mật khẩu không đúng")

        # Đăng nhập thành công -> Xóa bộ đếm lỗi
        _record_login_success(client_ip)

        role = user_rec.get("role", "admin" if uname.lower() == "admin" else "kho")
        is_secure = request.url.scheme == "https" or request.headers.get("x-forwarded-proto") == "https"
        token = create_session_token(user_rec["username"], role)
        response.set_cookie(
            key=SESSION_COOKIE_NAME,
            value=token,
            max_age=SESSION_MAX_AGE,
            httponly=True,
            samesite="lax",
            secure=is_secure,
        )
        log_activity("ĐĂNG_NHẬP", f"Đăng nhập thành công tài khoản '{user_rec['username']}' (Vai trò: {role})", username=user_rec["username"], ip=client_ip, level="INFO")
        return {
            "success": True,
            "message": "Đăng nhập thành công",
            "username": user_rec["username"],
            "full_name": user_rec.get("full_name", user_rec["username"]),
            "role": role
        }

    except HTTPException:
        raise
    except Exception as e:
        log_activity("LỖI_ĐĂNG_NHẬP", f"Lỗi xử lý đăng nhập cho '{uname}': {str(e)}", username=uname, ip=client_ip, level="ERROR")
        raise HTTPException(status_code=500, detail=f"Lỗi đăng nhập: {str(e)}")


@router.post("/api/auth/logout")
async def logout(request: Request, response: Response):
    user = get_current_user(request) or "Người dùng"
    client_ip = get_client_ip(request)
    log_activity("ĐĂNG_XUẤT", f"Người dùng '{user}' đã đăng xuất", username=user, ip=client_ip, level="INFO")
    response.delete_cookie(SESSION_COOKIE_NAME, httponly=True, samesite="lax")
    return {"success": True, "message": "Đăng xuất thành công"}


# ── API Quản Lý Tài Khoản & Mật Khẩu ──────────────────────────────────────

@router.get("/api/auth/me")
async def get_current_user_profile(user: str = Depends(require_login), request: Request = None):
    """Lấy thông tin tài khoản đang đăng nhập."""
    user_rec = db_manager.get_user_by_username(user) or {}
    role = user_rec.get("role") or ("admin" if user.lower() == "admin" else "kho")
    return {
        "success": True,
        "username": user_rec.get("username", user),
        "full_name": user_rec.get("full_name", user),
        "role": role,
        "is_admin": (role == "admin" or user.lower() == "admin")
    }


@router.post("/api/auth/change-password")
async def change_password(data: ChangePasswordRequest, request: Request, user: str = Depends(require_login)):
    """Đổi mật khẩu cho tài khoản hiện tại."""
    user_rec = db_manager.get_user_by_username(user)
    if not user_rec:
        raise HTTPException(status_code=404, detail="Không tìm thấy tài khoản người dùng")

    stored_hash = str(user_rec.get("password_hash") or "").strip()
    try:
        if not bcrypt.checkpw(data.current_password.encode("utf-8"), stored_hash.encode("utf-8")):
            log_activity("ĐỔI_MẬT_KHẨU_THẤT_BẠI", f"Tài khoản '{user}' nhập sai mật khẩu cũ", username=user, request=request, level="WARNING")
            raise HTTPException(status_code=400, detail="Mật khẩu hiện tại không chính xác")
    except Exception:
        raise HTTPException(status_code=400, detail="Mật khẩu hiện tại không chính xác")

    new_pwd = data.new_password.strip()
    if len(new_pwd) < 4:
        raise HTTPException(status_code=400, detail="Mật khẩu mới phải có ít nhất 4 ký tự")

    new_hash = bcrypt.hashpw(new_pwd.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
    db_manager.update_user_password(user, new_hash)
    log_activity("ĐỔI_MẬT_KHẨU", f"Tài khoản '{user}' đã đổi mật khẩu thành công", username=user, request=request, level="INFO")
    return {"success": True, "message": "Đổi mật khẩu thành công!"}


@router.get("/api/auth/users")
async def list_users(user: str = Depends(require_login)):
    """Lấy danh sách tài khoản (chỉ dành cho Admin kiểm soát & Tester)."""
    user_rec = db_manager.get_user_by_username(user) or {}
    role = user_rec.get("role") or ("admin" if user.lower() == "admin" else "kho")
    if role != "admin" and user.lower() != "admin":
        raise HTTPException(status_code=403, detail="Chỉ tài khoản Admin mới có quyền xem danh sách người dùng")
    users = db_manager.get_all_users()
    return {"success": True, "data": users}


@router.post("/api/auth/users")
async def create_new_user(data: CreateUserRequest, request: Request, user: str = Depends(require_login)):
    """Tạo tài khoản mới để kết nối kho hoặc nhân viên (chỉ dành cho Admin)."""
    user_rec = db_manager.get_user_by_username(user) or {}
    role = user_rec.get("role") or ("admin" if user.lower() == "admin" else "kho")
    if role != "admin" and user.lower() != "admin":
        raise HTTPException(status_code=403, detail="Chỉ tài khoản Admin mới có quyền tạo tài khoản")

    uname = data.username.strip()
    if len(uname) < 3:
        raise HTTPException(status_code=400, detail="Tên đăng nhập phải có ít nhất 3 ký tự")
    if len(data.password.strip()) < 4:
        raise HTTPException(status_code=400, detail="Mật khẩu phải có ít nhất 4 ký tự")

    pwd_hash = bcrypt.hashpw(data.password.strip().encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
    try:
        new_u = db_manager.create_user(
            username=uname,
            password_hash=pwd_hash,
            full_name=data.full_name or uname,
            role=data.role or "kho"
        )
        log_activity("TẠO_TÀI_KHOẢN", f"Admin '{user}' tạo tài khoản '{uname}' (Vai trò: {data.role or 'kho'})", username=user, request=request, level="INFO")
        return {"success": True, "message": f"Tạo tài khoản '{uname}' thành công!", "data": new_u}
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/auth/users/{target_username}/reset-password")
async def admin_reset_password(target_username: str, data: AdminResetPasswordRequest, request: Request, user: str = Depends(require_login)):
    """Admin đặt lại mật khẩu cho tài khoản khác mà không cần mật khẩu cũ."""
    user_rec = db_manager.get_user_by_username(user) or {}
    role = user_rec.get("role") or ("admin" if user.lower() == "admin" else "kho")
    if role != "admin" and user.lower() != "admin":
        raise HTTPException(status_code=403, detail="Chỉ tài khoản Admin mới có quyền đặt lại mật khẩu")

    target = db_manager.get_user_by_username(target_username)
    if not target:
        raise HTTPException(status_code=404, detail="Không tìm thấy tài khoản người dùng")

    new_pwd = data.new_password.strip()
    if len(new_pwd) < 4:
        raise HTTPException(status_code=400, detail="Mật khẩu mới phải có ít nhất 4 ký tự")

    new_hash = bcrypt.hashpw(new_pwd.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
    db_manager.update_user_password(target["username"], new_hash)
    log_activity("RESET_MẬT_KHẨU", f"Admin '{user}' đặt lại mật khẩu cho tài khoản '{target['username']}'", username=user, request=request, level="WARNING")
    return {"success": True, "message": f"Đặt lại mật khẩu cho tài khoản '{target['username']}' thành công!"}


@router.delete("/api/auth/users/{target_username}")
async def delete_user(target_username: str, request: Request, user: str = Depends(require_login)):
    """Admin xóa tài khoản người dùng."""
    user_rec = db_manager.get_user_by_username(user) or {}
    role = user_rec.get("role") or ("admin" if user.lower() == "admin" else "kho")
    if role != "admin" and user.lower() != "admin":
        raise HTTPException(status_code=403, detail="Chỉ tài khoản Admin mới có quyền xóa tài khoản")

    if target_username.strip().lower() == "admin":
        raise HTTPException(status_code=400, detail="Không được phép xóa tài khoản Admin kiểm soát hệ thống")

    try:
        deleted = db_manager.delete_user(target_username)
        if not deleted:
            raise HTTPException(status_code=404, detail="Không tìm thấy tài khoản để xóa")
        log_activity("XÓA_TÀI_KHOẢN", f"Admin '{user}' đã xóa tài khoản '{target_username}'", username=user, request=request, level="WARNING")
        return {"success": True, "message": f"Đã xóa tài khoản '{target_username}' thành công"}
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))



@router.get("/dashboard", response_class=HTMLResponse)
async def dashboard_page(request: Request):
    user = get_current_user(request)
    if not user:
        return RedirectResponse(url="/login")
    return templates.TemplateResponse("dashboard.html", {"request": request, "username": user})
