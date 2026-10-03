from fastapi import APIRouter, Request, Response, HTTPException, Depends
from fastapi.responses import HTMLResponse, RedirectResponse, JSONResponse
from fastapi.templating import Jinja2Templates
import bcrypt
from itsdangerous import URLSafeTimedSerializer, BadSignature, SignatureExpired

from config import SECRET_KEY, SESSION_COOKIE_NAME, SESSION_MAX_AGE
from models.schemas import LoginRequest
from services.sheets_service import sheets_service

router = APIRouter()
templates = Jinja2Templates(directory="static/templates")
serializer = URLSafeTimedSerializer(SECRET_KEY)


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
async def login(data: LoginRequest, response: Response):
    try:
        stored_username = sheets_service.get_config("admin_username")
        stored_hash = sheets_service.get_config("admin_password_hash")

        if not stored_username or not stored_hash:
            raise HTTPException(status_code=500, detail="Cấu hình tài khoản chưa được thiết lập")

        if data.username != stored_username:
            raise HTTPException(status_code=401, detail="Tên đăng nhập hoặc mật khẩu không đúng")

        password_bytes = data.password.encode("utf-8")
        hash_bytes = stored_hash.encode("utf-8")

        if not bcrypt.checkpw(password_bytes, hash_bytes):
            raise HTTPException(status_code=401, detail="Tên đăng nhập hoặc mật khẩu không đúng")

        token = create_session_token(data.username)
        response.set_cookie(
            key=SESSION_COOKIE_NAME,
            value=token,
            max_age=SESSION_MAX_AGE,
            httponly=True,
            samesite="lax",
        )
        return {"success": True, "message": "Đăng nhập thành công", "username": data.username}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lỗi đăng nhập: {str(e)}")


@router.post("/api/auth/logout")
async def logout(response: Response):
    response.delete_cookie(SESSION_COOKIE_NAME)
    return {"success": True, "message": "Đăng xuất thành công"}


@router.get("/dashboard", response_class=HTMLResponse)
async def dashboard_page(request: Request):
    user = get_current_user(request)
    if not user:
        return RedirectResponse(url="/login")
    return templates.TemplateResponse("dashboard.html", {"request": request, "username": user})
