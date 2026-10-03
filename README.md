# 📦 Quản Lý Kho Hàng Pro

Hệ thống quản lý kho hàng sử dụng FastAPI + Google Sheets làm cơ sở dữ liệu.

---

## 🚀 Cài Đặt & Khởi Động

### 1. Yêu cầu hệ thống
- Python 3.11+
- Tài khoản Google Cloud với Google Sheets API được bật

### 2. Cài đặt thư viện

```bash
pip install -r requirements.txt
```

### 3. Cấu hình Google Sheets API

#### Bước 1: Tạo Service Account
1. Truy cập [Google Cloud Console](https://console.cloud.google.com/)
2. Tạo project mới hoặc chọn project sẵn có
3. Bật **Google Sheets API** và **Google Drive API**
4. Vào **IAM & Admin → Service Accounts → Create Service Account**
5. Tải file `credentials.json` (JSON key) về máy

#### Bước 2: Tạo Google Spreadsheet
1. Tạo một Google Spreadsheet mới tại [sheets.google.com](https://sheets.google.com)
2. Chia sẻ spreadsheet với email của service account (quyền Editor)
3. Sao chép **Spreadsheet ID** từ URL:  
   `https://docs.google.com/spreadsheets/d/**SPREADSHEET_ID**/edit`

### 4. Tạo file .env

```bash
cp .env.example .env
```

Chỉnh sửa file `.env`:

```env
# Dùng 1 trong 2 cách sau:
GOOGLE_SERVICE_ACCOUNT_FILE=./credentials.json
# HOẶC dán nội dung JSON vào biến:
# GOOGLE_SERVICE_ACCOUNT_JSON={"type":"service_account",...}

SPREADSHEET_ID=your_spreadsheet_id_here

SECRET_KEY=your-random-secret-key-at-least-32-chars
ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin123
```

### 5. Khởi tạo cấu trúc Google Sheets

```bash
python setup_sheets.py
```

Lệnh này sẽ:
- Tạo 6 sheet (HangHoa, NhapHang, XuatHang, NhaCungCap, KhachHang, Config)
- Thêm header row cho mỗi sheet
- Tạo tài khoản admin với mật khẩu đã hash

### 6. Chạy ứng dụng

```bash
python main.py
```

Hoặc:

```bash
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

Truy cập: **http://localhost:8000**

---

## 🔑 Đăng Nhập

| Trường | Giá trị mặc định |
|--------|-----------------|
| Tên đăng nhập | `admin` |
| Mật khẩu | `admin123` |

> ⚠️ **Khuyến nghị**: Đổi mật khẩu ngay sau lần đăng nhập đầu tiên bằng cách chạy lại `setup_sheets.py` sau khi sửa `ADMIN_PASSWORD` trong `.env`.

---

## 📋 Cấu Trúc Dữ Liệu Google Sheets

| Sheet | Mô tả |
|-------|-------|
| `HangHoa` | Danh mục hàng hóa |
| `NhapHang` | Phiếu nhập hàng (1 dòng = 1 mặt hàng) |
| `XuatHang` | Phiếu xuất hàng (1 dòng = 1 mặt hàng) |
| `NhaCungCap` | Danh sách nhà cung cấp |
| `KhachHang` | Danh sách khách hàng |
| `Config` | Cấu hình hệ thống (username, password hash) |

---

## 🗂️ Cấu Trúc Project

```
inventory-app/
├── main.py              # Điểm khởi động FastAPI
├── config.py            # Cấu hình từ biến môi trường
├── setup_sheets.py      # Script khởi tạo Google Sheets
├── requirements.txt     # Thư viện Python
├── .env                 # Biến môi trường (tự tạo)
├── routers/             # Các API endpoint
│   ├── auth.py          # Đăng nhập/đăng xuất
│   ├── hang_hoa.py      # CRUD hàng hóa
│   ├── nhap_hang.py     # Nhập hàng
│   ├── xuat_hang.py     # Xuất hàng
│   ├── nha_cung_cap.py  # Nhà cung cấp
│   ├── khach_hang.py    # Khách hàng
│   ├── bao_cao.py       # Báo cáo & thống kê
│   ├── lich_su.py       # Lịch sử giao dịch
│   └── danh_muc.py      # Trang danh mục
├── services/
│   └── sheets_service.py # Google Sheets CRUD
├── models/
│   └── schemas.py       # Pydantic models
└── static/
    ├── css/style.css    # Style tùy chỉnh
    ├── js/              # JavaScript cho mỗi trang
    └── templates/       # HTML templates (Jinja2)
```

---

## 🌐 API Endpoints

### Authentication
| Method | URL | Mô tả |
|--------|-----|-------|
| `GET` | `/` | Redirect đến dashboard hoặc login |
| `GET` | `/login` | Trang đăng nhập |
| `POST` | `/api/auth/login` | Đăng nhập |
| `POST` | `/api/auth/logout` | Đăng xuất |

### Hàng Hóa
| Method | URL | Mô tả |
|--------|-----|-------|
| `GET` | `/api/hang-hoa` | Danh sách hàng hóa |
| `POST` | `/api/hang-hoa` | Thêm hàng hóa |
| `PUT` | `/api/hang-hoa/{id}` | Cập nhật hàng hóa |
| `DELETE` | `/api/hang-hoa/{id}` | Xóa hàng hóa |

### Nhập/Xuất Hàng
| Method | URL | Mô tả |
|--------|-----|-------|
| `GET` | `/api/nhap-hang` | Danh sách phiếu nhập |
| `POST` | `/api/nhap-hang` | Tạo phiếu nhập |
| `GET` | `/api/nhap-hang/{so_phieu}` | Chi tiết phiếu nhập |
| `GET` | `/api/xuat-hang` | Danh sách phiếu xuất |
| `POST` | `/api/xuat-hang` | Tạo phiếu xuất |
| `GET` | `/api/xuat-hang/{so_phieu}` | Chi tiết phiếu xuất |

### Báo Cáo
| Method | URL | Mô tả |
|--------|-----|-------|
| `GET` | `/api/bao-cao/tong-quan` | Tổng quan theo kỳ |
| `GET` | `/api/bao-cao/doanh-thu` | Dữ liệu biểu đồ 30 ngày |
| `GET` | `/api/bao-cao/hang-ban-chay` | Top 10 hàng bán chạy |
| `GET` | `/api/bao-cao/ton-kho` | Báo cáo tồn kho |
| `GET` | `/api/dashboard/stats` | Thống kê dashboard |

---

## 🛠️ Xử Lý Sự Cố

**Lỗi kết nối Google Sheets:**
- Kiểm tra file `credentials.json` có đúng không
- Kiểm tra service account email đã được share spreadsheet chưa
- Đảm bảo Google Sheets API đã được bật trong project

**Lỗi đăng nhập:**
- Chạy lại `python setup_sheets.py` để reset mật khẩu admin
- Kiểm tra sheet `Config` có 3 dòng: `admin_username`, `admin_password_hash`, `secret_key`

**Tồn kho không cập nhật:**
- Mỗi lần tạo phiếu nhập/xuất, hệ thống tự động cập nhật cột `ton_kho` trong sheet `HangHoa`
- Kiểm tra mã hàng (`ma_hang`) phải khớp chính xác

---

## 📝 Ghi Chú Kỹ Thuật

- **ID**: Sử dụng timestamp milliseconds (`int(time.time() * 1000)`) thay vì row number
- **Session**: Cookie `inventory_session` ký bằng `itsdangerous` + `SECRET_KEY`
- **Password**: Lưu hash bcrypt trong sheet Config
- **Định dạng ngày**: Lưu `YYYY-MM-DD`, hiển thị `DD/MM/YYYY`
- **Định dạng tiền**: `1,234,567 đ` (theo locale Việt Nam)
