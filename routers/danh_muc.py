from fastapi import APIRouter, Request, Depends
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates
from routers.auth import get_current_user

router = APIRouter()
templates = Jinja2Templates(directory="static/templates")


@router.get("/danh-muc", response_class=HTMLResponse)
async def danh_muc_page(request: Request):
    import time
    user = get_current_user(request)
    if not user:
        from fastapi.responses import RedirectResponse
        return RedirectResponse(url="/login")
    return templates.TemplateResponse("danh_muc.html", {
        "request": request,
        "username": user,
        "v": int(time.time())
    })

