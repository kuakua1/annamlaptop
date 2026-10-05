/**
 * main.js - Common utilities for Inventory Management App
 */

// ── Currency & Date Formatting ────────────────────────────────────────────────

function formatVND(amount) {
    if (amount === null || amount === undefined || amount === '') return '0 đ';
    const num = parseFloat(amount) || 0;
    return num.toLocaleString('vi-VN') + ' đ';
}

function formatNumber(num) {
    if (num === null || num === undefined) return '0';
    return parseFloat(num).toLocaleString('vi-VN');
}

function formatDate(dateStr) {
    if (!dateStr) return '';
    const str = String(dateStr).trim();
    if (str.includes('-')) {
        const parts = str.split('T')[0].split('-');
        if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return str;
}

function todayISO() {
    return new Date().toISOString().split('T')[0];
}

// ── Toast Notifications ───────────────────────────────────────────────────────

function showToast(message, type = 'success') {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        document.body.appendChild(container);
    }

    const icons = { success: 'bi-check-circle-fill', error: 'bi-x-circle-fill', info: 'bi-info-circle-fill' };
    const toast = document.createElement('div');
    toast.className = `toast-msg toast-${type}`;
    toast.innerHTML = `<i class="bi ${icons[type] || icons.info}"></i><span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100px)';
        toast.style.transition = 'all 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 3500);
}

// ── API Helper ────────────────────────────────────────────────────────────────

async function apiRequest(url, method = 'GET', body = null) {
    const options = {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
    };
    if (body) options.body = JSON.stringify(body);

    const res = await fetch(url, options);
    const data = await res.json();

    if (!res.ok) {
        const msg = data.detail || data.message || 'Lỗi không xác định';
        throw new Error(msg);
    }
    return data;
}

// ── Modal helpers ─────────────────────────────────────────────────────────────

function openModal(id) {
    const el = document.getElementById(id);
    if (!el) return null;
    const modal = bootstrap.Modal.getOrCreateInstance(el);
    modal.show();
    return modal;
}

function closeModal(id) {
    const el = document.getElementById(id);
    if (!el) return;
    const modal = bootstrap.Modal.getInstance(el);
    if (modal) {
        modal.hide();
    }
    setTimeout(cleanupModalBackdrops, 200);
}

function cleanupModalBackdrops() {
    const openModals = document.querySelectorAll('.modal.show');
    if (openModals.length === 0) {
        document.querySelectorAll('.modal-backdrop').forEach(b => b.remove());
        document.body.classList.remove('modal-open');
        document.body.style.removeProperty('padding-right');
        document.body.style.removeProperty('overflow');
    } else {
        const backdrops = document.querySelectorAll('.modal-backdrop');
        if (backdrops.length > openModals.length) {
            for (let i = openModals.length; i < backdrops.length; i++) {
                backdrops[i].remove();
            }
        }
    }
}

// Lắng nghe sự kiện modal ẩn để dọn dẹp backdrop tồn đọng
document.addEventListener('hidden.bs.modal', function () {
    setTimeout(cleanupModalBackdrops, 150);
});

// ── Loading Spinner ───────────────────────────────────────────────────────────

function showLoading() {
    const el = document.getElementById('spinner-overlay');
    if (el) el.classList.add('active');
}

function hideLoading() {
    const el = document.getElementById('spinner-overlay');
    if (el) el.classList.remove('active');
}

// ── Confirmation Dialog ───────────────────────────────────────────────────────

function confirmDelete(message = 'Bạn có chắc muốn xóa?') {
    return window.confirm(message);
}

// ── TabManager & Chrome Multi-Tab System ───────────────────────────────────

const TAB_DEFINITIONS = {
    'dashboard': {
        title: 'Dashboard',
        icon: 'bi-speedometer2 text-primary',
        url: '/dashboard?embed=1',
        closable: false
    },
    'hang-hoa': {
        title: 'Tất Cả Hàng Hóa',
        icon: 'bi-box-seam text-info',
        url: '/hang-hoa?embed=1',
        closable: true
    },
    'ton-kho': {
        title: 'Hàng Hóa Tồn Kho',
        icon: 'bi-boxes text-success',
        url: '/ton-kho?embed=1',
        closable: true
    },
    'bang-nhap-kho': {
        title: 'Bảng Nhập Kho',
        icon: 'bi-journal-arrow-down text-primary',
        url: '/bang-nhap-kho?embed=1',
        closable: true
    },
    'bang-xuat-kho': {
        title: 'Bảng Xuất Kho',
        icon: 'bi-journal-arrow-up text-danger',
        url: '/bang-xuat-kho?embed=1',
        closable: true
    },
    'nhap-hang': {
        title: 'Tạo Phiếu Nhập',
        icon: 'bi-download text-primary',
        url: '/nhap-hang?embed=1',
        closable: true
    },
    'xuat-hang': {
        title: 'Tạo Phiếu Xuất',
        icon: 'bi-upload text-danger',
        url: '/xuat-hang?embed=1',
        closable: true
    },
    'lich-su': {
        title: 'Lịch Sử Chung',
        icon: 'bi-clock-history text-secondary',
        url: '/lich-su?embed=1',
        closable: true
    },
    'bao-cao': {
        title: 'Báo Cáo',
        icon: 'bi-bar-chart-line text-purple',
        url: '/bao-cao?embed=1',
        closable: true
    },
    'danh-muc': {
        title: 'NCC & Khách Hàng',
        icon: 'bi-people text-info',
        url: '/danh-muc?embed=1',
        closable: true
    }
};

const TabManager = {
    tabs: [], // Array of tab objects: [{ id: 'dashboard', type: 'dashboard', title: 'Dashboard', icon: '...', closable: false }]
    activeTabId: 'dashboard',
    tabCounter: {}, // Tracks count per type: { 'xuat-hang': 2, ... }

    isParent() {
        return window.self === window.top;
    },

    toggleSidebar() {
        if (!this.isParent()) {
            if (window.parent && window.parent.TabManager) {
                window.parent.TabManager.toggleSidebar();
            }
            return;
        }
        document.body.classList.toggle('sidebar-collapsed');
        const isCollapsed = document.body.classList.contains('sidebar-collapsed');
        try {
            localStorage.setItem('inventory_sidebar_collapsed', isCollapsed ? '1' : '0');
        } catch (e) {}
    },

    initSidebar() {
        try {
            const saved = localStorage.getItem('inventory_sidebar_collapsed');
            if (saved === '1') {
                document.body.classList.add('sidebar-collapsed');
            }
        } catch (e) {}
    },

    init() {
        if (!this.isParent()) {
            // Đang nằm trong iframe con -> cấu hình link interceptor để mở tab ở parent
            this.setupChildLinkInterceptor();
            return;
        }

        // Xóa sạch dữ liệu tạm dùng chung cũ nếu có
        try {
            sessionStorage.removeItem('nhap_hang_state');
            sessionStorage.removeItem('xuat_hang_state');
        } catch (e) {}

        this.initSidebar();

        // Mở Dashboard làm tab mặc định đầu tiên
        this.openTab('dashboard');
    },

    /**
     * Mở tab.
     * @param {string} tabType - 'dashboard', 'xuat-hang', 'nhap-hang', etc.
     * @param {string|null} customUrl - URL tùy chỉnh nếu có
     * @param {boolean} forceNew - Bắt buộc mở thêm 1 tab mới (true cho các thao tác giao dịch nhiều tab)
     */
    openTab(tabType, customUrl = null, forceNew = false) {
        if (!this.isParent()) {
            if (window.parent && window.parent.TabManager) {
                window.parent.TabManager.openTab(tabType, customUrl, forceNew);
            }
            return;
        }

        const tabDef = TAB_DEFINITIONS[tabType];
        if (!tabDef) return;

        // Nếu là Dashboard -> luôn chỉ có duy nhất 1 tab dashboard
        if (tabType === 'dashboard') {
            const existing = this.tabs.find(t => t.id === 'dashboard');
            if (!existing) {
                this.tabs.push({
                    id: 'dashboard',
                    type: 'dashboard',
                    title: 'Dashboard',
                    icon: tabDef.icon,
                    closable: false
                });
                this.createTabIframe('dashboard', customUrl || tabDef.url);
            }
            this.switchTab('dashboard');
            this.renderTabBar();
            return;
        }

        // Đếm số lượng tab cùng loại hiện tại đang mở
        const existingTabs = this.tabs.filter(t => t.type === tabType);

        // Với các màn hình danh sách/báo cáo thông thường: nếu đã mở thì focus sang tab cũ
        if (tabType !== 'nhap-hang' && tabType !== 'xuat-hang' && !forceNew && !customUrl && existingTabs.length > 0) {
            this.switchTab(existingTabs[0].id);
            return;
        }

        // Với các nghiệp vụ giao dịch như Xuất Hàng, Nhập Hàng: Cho phép mở nhiều tab song song
        // Tự động gán số thứ tự nếu đã có tab đang mở
        this.tabCounter[tabType] = (this.tabCounter[tabType] || 0) + 1;
        const count = this.tabCounter[tabType];
        
        // Dùng timestamp để mỗi tab tạo mới luôn là duy nhất, độc lập 100% dữ liệu
        let tabId = `${tabType}_${Date.now()}_${count}`;
        let tabTitle = existingTabs.length === 0 ? tabDef.title : `${tabDef.title} (${existingTabs.length + 1})`;

        const newTab = {
            id: tabId,
            type: tabType,
            title: tabTitle,
            icon: tabDef.icon,
            closable: true
        };

        this.tabs.push(newTab);
        this.createTabIframe(tabId, customUrl || tabDef.url);
        this.switchTab(tabId);
        this.renderTabBar();
    },

    createTabIframe(tabId, url) {
        const viewport = document.getElementById('chrome-tab-viewport');
        if (!viewport) return;

        let frame = document.getElementById(`tab-iframe-${tabId}`);
        if (!frame) {
            frame = document.createElement('iframe');
            frame.id = `tab-iframe-${tabId}`;
            frame.className = 'tab-frame';
            // Thêm query embed=1 và tab_id để mỗi iframe có định danh riêng biệt
            let finalUrl = url;
            if (!finalUrl.includes('embed=1')) {
                finalUrl = finalUrl.includes('?') ? `${finalUrl}&embed=1` : `${finalUrl}?embed=1`;
            }
            if (!finalUrl.includes('tab_id=')) {
                finalUrl = finalUrl.includes('?') ? `${finalUrl}&tab_id=${encodeURIComponent(tabId)}` : `${finalUrl}?tab_id=${encodeURIComponent(tabId)}`;
            }
            frame.src = finalUrl;
            viewport.appendChild(frame);
        }
    },

    switchTab(tabId) {
        if (!this.isParent()) {
            if (window.parent && window.parent.TabManager) {
                window.parent.TabManager.switchTab(tabId);
            }
            return;
        }

        const tab = this.tabs.find(t => t.id === tabId);
        if (!tab) return;

        this.activeTabId = tabId;

        // Kích hoạt iframe tương ứng, ẩn các iframe khác
        document.querySelectorAll('.tab-frame').forEach(f => {
            if (f.id === `tab-iframe-${tabId}`) {
                f.classList.add('active');
                f.style.display = 'block';
                try {
                    f.contentWindow.postMessage({ type: 'TAB_ACTIVATED', tabId: tabId }, '*');
                } catch(err) {}
            } else {
                f.classList.remove('active');
                f.style.display = 'none';
            }
        });

        // Cập nhật trạng thái active trên sidebar dựa vào tab.type
        document.querySelectorAll('.sidebar-link').forEach(link => {
            const linkTab = link.getAttribute('data-tab');
            if (linkTab === tab.type) {
                link.classList.add('active');
            } else {
                link.classList.remove('active');
            }
        });

        this.renderTabBar();
    },

    closeTab(tabId, event) {
        if (event) {
            event.stopPropagation();
            event.preventDefault();
        }

        if (!this.isParent()) {
            if (window.parent && window.parent.TabManager) {
                window.parent.TabManager.closeTab(tabId, event);
            }
            return;
        }

        const tab = this.tabs.find(t => t.id === tabId);
        if (!tab || !tab.closable) return; // Tab không thể đóng (như Dashboard)

        const index = this.tabs.findIndex(t => t.id === tabId);
        if (index === -1) return;

        // Xóa hoàn toàn iframe khỏi DOM (xóa sạch dữ liệu tạm thời như user yêu cầu)
        const frame = document.getElementById(`tab-iframe-${tabId}`);
        if (frame) {
            frame.remove();
        }

        // Xóa sạch trạng thái tạm thời đã lưu của riêng tab này
        try {
            sessionStorage.removeItem(`nhap_hang_state_${tabId}`);
            sessionStorage.removeItem(`xuat_hang_state_${tabId}`);
        } catch (e) {}

        // Bỏ khỏi danh sách tab
        this.tabs.splice(index, 1);

        // Nếu đóng tab đang active -> chuyển sang tab liền kề hoặc tab Dashboard
        if (this.activeTabId === tabId) {
            const nextTab = this.tabs[Math.max(0, index - 1)] || this.tabs[0];
            if (nextTab) {
                this.switchTab(nextTab.id);
            }
        } else {
            this.renderTabBar();
        }
    },

    renderTabBar() {
        const tabBar = document.getElementById('chrome-tab-bar');
        if (!tabBar) return;

        tabBar.innerHTML = '';
        this.tabs.forEach(tab => {
            const isActive = this.activeTabId === tab.id;
            const tabEl = document.createElement('div');
            tabEl.className = `chrome-tab${isActive ? ' active' : ''}`;
            tabEl.title = tab.title;
            tabEl.onclick = () => this.switchTab(tab.id);

            let closeHtml = '';
            if (tab.closable) {
                closeHtml = `
                    <span class="chrome-tab-close" onclick="TabManager.closeTab('${tab.id}', event)" title="Đóng tab (xóa dữ liệu tạm)">
                        <i class="bi bi-x"></i>
                    </span>
                `;
            }

            tabEl.innerHTML = `
                <i class="bi ${tab.icon || 'bi-window'}"></i>
                <span class="chrome-tab-title">${escapeHtml(tab.title)}</span>
                ${closeHtml}
            `;

            tabBar.appendChild(tabEl);
        });

        // Tự động cuộn đến tab đang active
        const activeEl = tabBar.querySelector('.chrome-tab.active');
        if (activeEl) {
            activeEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
        }
    },

    openTabFromUrl(url) {
        if (!url) return;
        try {
            const parsed = new URL(url, window.location.origin);
            const pathname = parsed.pathname;

            for (const [key, def] of Object.entries(TAB_DEFINITIONS)) {
                const defPath = def.url.split('?')[0];
                if (pathname === defPath) {
                    const fullUrl = pathname + parsed.search;
                    this.openTab(key, fullUrl);
                    return;
                }
            }
        } catch (e) {}
    },

    setupChildLinkInterceptor() {
        // Lắng nghe click các thẻ a trong child frame để mở tab trên parent nếu khớp route nội bộ
        document.addEventListener('click', (e) => {
            const a = e.target.closest('a');
            if (!a || !a.href) return;

            const href = a.getAttribute('href');
            if (!href || href.startsWith('javascript:') || href.startsWith('#')) return;

            // Kiểm tra xem link có dẫn tới một trong các route nội bộ của app không
            try {
                const targetUrl = new URL(a.href, window.location.origin);
                if (targetUrl.origin === window.location.origin) {
                    const pathname = targetUrl.pathname;
                    for (const [key, def] of Object.entries(TAB_DEFINITIONS)) {
                        const defPath = def.url.split('?')[0];
                        if (pathname === defPath) {
                            e.preventDefault();
                            if (window.parent && window.parent.TabManager) {
                                window.parent.TabManager.openTab(key, targetUrl.pathname + targetUrl.search);
                            }
                            return;
                        }
                    }
                }
            } catch (err) {}
        });
    }
};

// Khởi chạy khi DOM sẵn sàng
document.addEventListener('DOMContentLoaded', () => {
    TabManager.init();
});

// ── Logout ────────────────────────────────────────────────────────────────────

async function logout() {
    try {
        await apiRequest('/api/auth/logout', 'POST');
    } catch (e) {}
    window.location.href = '/login';
}

// ── Pagination helpers ────────────────────────────────────────────────────────

function renderPagination(containerId, currentPage, totalPages, onPageChange) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';
    if (totalPages <= 1) return;

    const nav = document.createElement('nav');
    const ul = document.createElement('ul');
    ul.className = 'pagination pagination-sm mb-0';

    const addPage = (label, page, disabled = false, active = false) => {
        const li = document.createElement('li');
        li.className = `page-item${disabled ? ' disabled' : ''}${active ? ' active' : ''}`;
        const a = document.createElement('a');
        a.className = 'page-link';
        a.href = '#';
        a.innerHTML = label;
        if (!disabled && !active) {
            a.addEventListener('click', (e) => { e.preventDefault(); onPageChange(page); });
        }
        li.appendChild(a);
        ul.appendChild(li);
    };

    addPage('&laquo;', currentPage - 1, currentPage === 1);
    const start = Math.max(1, currentPage - 2);
    const end = Math.min(totalPages, currentPage + 2);
    for (let p = start; p <= end; p++) {
        addPage(p, p, false, p === currentPage);
    }
    addPage('&raquo;', currentPage + 1, currentPage === totalPages);

    nav.appendChild(ul);
    container.appendChild(nav);
}

// ── HTML Escape & Print Helpers ───────────────────────────────────────────────

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function printReceiptModal(elementId = 'detail-modal-body', title = 'Phiếu In') {
    const el = document.getElementById(elementId);
    if (!el) return;
    const printWindow = window.open('', '_blank', 'width=850,height=700');
    if (!printWindow) {
        window.print();
        return;
    }
    printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <title>${title}</title>
            <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" />
            <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css" />
            <style>
                body { font-family: 'Segoe UI', Arial, sans-serif; padding: 25px; color: #222; }
                table { width: 100%; border-collapse: collapse; margin-top: 15px; }
                th, td { border: 1px solid #cbd5e1; padding: 9px 12px; }
                th, thead th { 
                    background-color: #1e293b !important; 
                    color: #ffffff !important; 
                    font-weight: 600 !important;
                    -webkit-print-color-adjust: exact !important; 
                    print-color-adjust: exact !important; 
                }
                th *, thead th * {
                    color: #ffffff !important;
                }
                .text-nowrap, td.text-nowrap, th.text-nowrap { 
                    white-space: nowrap !important; 
                }
                td:last-child, th:last-child {
                    white-space: nowrap !important;
                    min-width: 150px;
                }
                .badge { padding: 4px 8px; border-radius: 4px; border: 1px solid #ccc; font-weight: 600; }
                @media print {
                    .no-print { display: none !important; }
                    body { padding: 0; }
                }
            </style>
        </head>
        <body>
            <div class="d-flex justify-content-between align-items-center mb-3 border-bottom pb-2">
                <div class="d-flex align-items-center gap-3">
                    <img src="/static/img/logo.png" style="width: 50px; height: 50px; object-fit: cover; border-radius: 50%;">
                    <div>
                        <h4 class="mb-0 fw-bold text-dark">KHO HÀNG AN NAM</h4>
                        <small class="text-muted">Hệ thống quản lý kho & bán hàng</small>
                    </div>
                </div>
                <div class="text-end">
                    <button class="btn btn-sm btn-primary no-print" onclick="window.print()"><i class="bi bi-printer me-1"></i>In ngay</button>
                </div>
            </div>
            ${el.innerHTML}
            <div class="row mt-5 pt-4 text-center">
                <div class="col-6">
                    <p class="fw-bold mb-5">Người lập phiếu</p>
                    <p class="text-muted small">(Ký, ghi rõ họ tên)</p>
                </div>
                <div class="col-6">
                    <p class="fw-bold mb-5">Người giao / nhận hàng</p>
                    <p class="text-muted small">(Ký, ghi rõ họ tên)</p>
                </div>
            </div>
            <script>
                window.onload = function() {
                    setTimeout(function() {
                        window.print();
                    }, 400);
                };
            </script>
        </body>
        </html>
    `);
    printWindow.document.close();
}

// ── Company Branding Info & Excel Export Helpers (Chuẩn Mẫu Kế Toán) ────────

const COMPANY_INFO = {
    name: 'CÔNG TY CỔ PHẦN THIẾT BỊ VÀ CÔNG NGHỆ SỐ AN NAM',
    address: '454 Nguyễn Trãi, Phường Hạc Thành, Thanh Hóa (ĐKKD: 106 Phú Thọ 3)',
    brand: 'KHO HÀNG AN NAM',
    hotline: '0386.539.555',
    email: 'contact@laptopannam.com'
};

/**
 * Xuất file Excel chuẩn mẫu biểu kế toán Việt Nam (giống Ảnh 1 & Ảnh 3):
 * - Font chữ Times New Roman xuyên suốt.
 * - Thông tin Đơn vị : ... và Địa chỉ : ... in đậm góc trên bên trái.
 * - Tiêu đề BÁO CÁO in hoa màu xanh dương đậm (#002060), cỡ chữ 16pt, căn giữa.
 * - Phụ đề Tháng ... năm ... và Tài khoản: 156 (Hàng hoá) in đậm, căn giữa.
 * - Góc phải trên bảng: "Đơn vị tính : Đồng" in đậm.
 * - Hàng 1 tiêu đề bảng có khung viền đen xung quanh.
 * - Hàng 2 mã cột chuẩn A, B, C, 1, 2, 3... in đậm, căn giữa.
 * - Dữ liệu có viền ngang chấm (dotted) hoặc liền mảnh (thin), viền dọc liền mảnh.
 * - Dòng "Tổng cộng" gộp nhãn, có tổng số lượng và tổng tiền định dạng #,##0.
 * - Ngày mở sổ bên trái, ngày ký bên phải, 3 chữ ký: Người ghi sổ, Kế toán trưởng, Giám đốc.
 */
async function exportAccountingReportToExcel({
    title = 'BÁO CÁO TỔNG HỢP TỒN KHO',
    monthText = '',
    accountText = 'Tài khoản: 156 (Hàng hoá)',
    unitText = 'Đơn vị tính : Đồng',
    companyName = COMPANY_INFO.name,
    companyAddress = COMPANY_INFO.address,
    columns = [
        { header: 'STT', code: 'A', width: 8, align: 'center' },
        { header: 'Tên vật tư, hàng hóa', code: 'B', width: 48, align: 'left', wrapText: true },
        { header: 'ĐVT', code: 'C', width: 12, align: 'center' },
        { header: 'Số lượng', code: '1', width: 14, align: 'right', isNumber: true },
        { header: 'Đơn giá', code: '2', width: 18, align: 'right', isNumber: true },
        { header: 'Thành tiền', code: '3', width: 22, align: 'right', isNumber: true },
    ],
    rows = [],
    summaryRow = null,
    dateOpen = null,
    dateClose = null,
    fileName = 'Bao_Cao.xlsx',
    sheetName = 'BaoCao'
}) {
    // 1. Kiểm tra thư viện ExcelJS
    if (!window.ExcelJS) {
        showToast('Đang khởi tạo trình xuất Excel, vui lòng thử lại sau 1 giây...', 'info');
        return;
    }
    if (!rows || !rows.length) {
        showToast('Không có dữ liệu để xuất Excel!', 'info');
        return;
    }

    try {
        const wb = new window.ExcelJS.Workbook();
        wb.creator = 'Kho Hàng An Nam';
        wb.lastModifiedBy = 'Kho Hàng An Nam';
        wb.created = new Date();
        wb.modified = new Date();

        const ws = wb.addWorksheet(sheetName, {
            views: [{ showGridLines: true }]
        });

        const numCols = columns.length;
        const lastColLetter = String.fromCharCode(64 + numCols);

        // Thiết lập độ rộng cột
        ws.columns = columns.map(col => ({ width: col.width || 15 }));

        // Định nghĩa bộ Font Times New Roman chuẩn
        const fontNormal = { name: 'Times New Roman', size: 11, color: { argb: 'FF000000' } };
        const fontBold = { name: 'Times New Roman', size: 11, bold: true, color: { argb: 'FF000000' } };
        const fontTitle = { name: 'Times New Roman', size: 16, bold: true, color: { argb: 'FF002060' } }; // Deep Blue
        const fontSubTitle = { name: 'Times New Roman', size: 11, bold: true, color: { argb: 'FF000000' } };
        const fontItalic = { name: 'Times New Roman', size: 10, italic: true, color: { argb: 'FF000000' } };

        // Định nghĩa đường viền
        const borderThinAll = {
            top: { style: 'thin', color: { argb: 'FF000000' } },
            bottom: { style: 'thin', color: { argb: 'FF000000' } },
            left: { style: 'thin', color: { argb: 'FF000000' } },
            right: { style: 'thin', color: { argb: 'FF000000' } }
        };
        const borderDottedRow = {
            top: { style: 'dotted', color: { argb: 'FF000000' } },
            bottom: { style: 'dotted', color: { argb: 'FF000000' } },
            left: { style: 'thin', color: { argb: 'FF000000' } },
            right: { style: 'thin', color: { argb: 'FF000000' } }
        };

        // Dòng 1: Đơn vị
        ws.getCell('A1').value = `Đơn vị : ${companyName}`;
        ws.getCell('A1').font = fontBold;

        // Dòng 2: Địa chỉ
        ws.getCell('A2').value = `Địa chỉ : ${companyAddress}`;
        ws.getCell('A2').font = fontBold;

        // Dòng 4: Tiêu đề BÁO CÁO (Gộp A4 -> Cột cuối dòng 4)
        ws.mergeCells(`A4:${lastColLetter}4`);
        const r4 = ws.getCell('A4');
        r4.value = title.toUpperCase();
        r4.font = fontTitle;
        r4.alignment = { horizontal: 'center', vertical: 'middle' };
        ws.getRow(4).height = 26;

        // Dòng 5: Tháng ... năm ...
        const now = new Date();
        const curMonthText = monthText || `Tháng ${now.getMonth() + 1} năm ${now.getFullYear()}`;
        ws.mergeCells(`A5:${lastColLetter}5`);
        const r5 = ws.getCell('A5');
        r5.value = curMonthText;
        r5.font = fontSubTitle;
        r5.alignment = { horizontal: 'center', vertical: 'middle' };

        // Dòng 6: Tài khoản (Gộp A6 -> Cột cuối)
        if (accountText) {
            ws.mergeCells(`A6:${lastColLetter}6`);
            const r6 = ws.getCell('A6');
            r6.value = accountText;
            r6.font = fontSubTitle;
            r6.alignment = { horizontal: 'center', vertical: 'middle' };
        }

        // Dòng 8: Đơn vị tính : Đồng (Căn phải cột cuối)
        if (unitText) {
            const uCell = ws.getCell(`${lastColLetter}8`);
            uCell.value = unitText;
            uCell.font = fontBold;
            uCell.alignment = { horizontal: 'right', vertical: 'middle' };
        }

        // Dòng 9: Tiêu đề các cột
        const row9 = ws.getRow(9);
        columns.forEach((col, idx) => {
            const cell = row9.getCell(idx + 1);
            cell.value = col.header;
            cell.font = fontBold;
            cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
            cell.border = borderThinAll;
        });
        row9.height = 24;

        // Dòng 10: Mã ký hiệu cột A, B, C, 1, 2, 3...
        const row10 = ws.getRow(10);
        columns.forEach((col, idx) => {
            const cell = row10.getCell(idx + 1);
            cell.value = col.code || String(idx + 1);
            cell.font = fontBold;
            cell.alignment = { horizontal: 'center', vertical: 'middle' };
            cell.border = borderThinAll;
        });
        row10.height = 20;

        // Các dòng dữ liệu bắt đầu từ Dòng 11
        let startRow = 11;
        rows.forEach((rowValues, rIdx) => {
            const rowNum = startRow + rIdx;
            const row = ws.getRow(rowNum);

            columns.forEach((col, cIdx) => {
                const cell = row.getCell(cIdx + 1);
                const val = rowValues[cIdx];
                cell.font = fontNormal;
                cell.border = borderDottedRow;

                if (col.isNumber) {
                    const numVal = parseFloat(val) || 0;
                    cell.value = numVal;
                    cell.numFmt = '#,##0';
                    cell.alignment = { horizontal: 'right', vertical: 'middle' };
                } else {
                    cell.value = (val !== null && val !== undefined) ? String(val) : '';
                    cell.alignment = {
                        horizontal: col.align || 'left',
                        vertical: 'middle',
                        wrapText: col.wrapText || false
                    };
                }
            });
        });

        // Dòng Tổng cộng (Ảnh 3)
        const sumRowNum = startRow + rows.length;
        if (summaryRow && summaryRow.length) {
            // Xác định số cột nhãn để gộp (thường là 2 cột đầu STT + Tên hàng hoặc đến trước số đầu tiên)
            let mergeEndCol = 2;
            for (let c = 1; c < summaryRow.length; c++) {
                if (summaryRow[c] === '' || summaryRow[c] === null || summaryRow[c] === undefined) {
                    mergeEndCol = c + 1;
                } else {
                    break;
                }
            }
            const mergeEndLetter = String.fromCharCode(64 + Math.min(mergeEndCol, numCols - 1));
            ws.mergeCells(`A${sumRowNum}:${mergeEndLetter}${sumRowNum}`);

            const sumRow = ws.getRow(sumRowNum);
            summaryRow.forEach((val, idx) => {
                const cell = sumRow.getCell(idx + 1);
                cell.font = fontBold;
                cell.border = borderThinAll;

                if (typeof val === 'number') {
                    cell.value = val;
                    cell.numFmt = '#,##0';
                    cell.alignment = { horizontal: 'right', vertical: 'middle' };
                } else {
                    cell.value = (val !== null && val !== undefined) ? val : '';
                    cell.alignment = { horizontal: 'center', vertical: 'middle' };
                }
            });
            for (let c = 1; c <= mergeEndCol; c++) {
                sumRow.getCell(c).border = borderThinAll;
            }
            sumRow.height = 22;
        }

        // Khối ngày tháng và chữ ký (Ảnh 3: Dòng 255 - 257)
        const defaultDateOpen = dateOpen || `Ngày mở sổ : 01/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;
        const defaultDateClose = dateClose || `Ngày ${String(now.getDate()).padStart(2, '0')} tháng ${String(now.getMonth() + 1).padStart(2, '0')} năm ${now.getFullYear()}`;

        const dateRowNum = sumRowNum + 2;
        // Trái: Ngày mở sổ
        ws.mergeCells(`A${dateRowNum}:B${dateRowNum}`);
        const dOpen = ws.getCell(`A${dateRowNum}`);
        dOpen.value = defaultDateOpen;
        dOpen.font = fontNormal;
        dOpen.alignment = { horizontal: 'left', vertical: 'middle' };

        // Phải: Ngày ... tháng ... năm ...
        const rightColStart = String.fromCharCode(64 + Math.max(numCols - 1, 3));
        ws.mergeCells(`${rightColStart}${dateRowNum}:${lastColLetter}${dateRowNum}`);
        const dClose = ws.getCell(`${rightColStart}${dateRowNum}`);
        dClose.value = defaultDateClose;
        dClose.font = fontNormal;
        dClose.alignment = { horizontal: 'center', vertical: 'middle' };

        // Chức danh ký tên
        const signTitleRow = dateRowNum + 1;
        // 1. Người ghi sổ
        ws.mergeCells(`A${signTitleRow}:B${signTitleRow}`);
        const st1 = ws.getCell(`A${signTitleRow}`);
        st1.value = 'Người ghi sổ';
        st1.font = fontBold;
        st1.alignment = { horizontal: 'center', vertical: 'middle' };

        // 2. Kế toán trưởng
        const midStart = String.fromCharCode(64 + 3);
        const midEnd = String.fromCharCode(64 + Math.min(4, numCols - 2));
        if (numCols >= 5) {
            ws.mergeCells(`${midStart}${signTitleRow}:${midEnd}${signTitleRow}`);
        }
        const st2 = ws.getCell(`${midStart}${signTitleRow}`);
        st2.value = 'Kế toán trưởng';
        st2.font = fontBold;
        st2.alignment = { horizontal: 'center', vertical: 'middle' };

        // 3. Giám đốc
        ws.mergeCells(`${rightColStart}${signTitleRow}:${lastColLetter}${signTitleRow}`);
        const st3 = ws.getCell(`${rightColStart}${signTitleRow}`);
        st3.value = 'Giám đốc';
        st3.font = fontBold;
        st3.alignment = { horizontal: 'center', vertical: 'middle' };

        // Ghi chú ký tên
        const signNoteRow = signTitleRow + 1;
        ws.mergeCells(`A${signNoteRow}:B${signNoteRow}`);
        const sn1 = ws.getCell(`A${signNoteRow}`);
        sn1.value = '(ký, họ tên)';
        sn1.font = fontItalic;
        sn1.alignment = { horizontal: 'center', vertical: 'middle' };

        if (numCols >= 5) {
            ws.mergeCells(`${midStart}${signNoteRow}:${midEnd}${signNoteRow}`);
        }
        const sn2 = ws.getCell(`${midStart}${signNoteRow}`);
        sn2.value = '(ký, họ tên)';
        sn2.font = fontItalic;
        sn2.alignment = { horizontal: 'center', vertical: 'middle' };

        ws.mergeCells(`${rightColStart}${signNoteRow}:${lastColLetter}${signNoteRow}`);
        const sn3 = ws.getCell(`${rightColStart}${signNoteRow}`);
        sn3.value = '(ký, họ tên, đóng dấu)';
        sn3.font = fontItalic;
        sn3.alignment = { horizontal: 'center', vertical: 'middle' };

        // Tạo file và kích hoạt tải xuống
        const buffer = await wb.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
        }, 150);

        showToast(`Đã xuất báo cáo "${fileName}" thành công!`, 'success');
    } catch (err) {
        console.error('Export ExcelJS error:', err);
        showToast('Lỗi khi xuất file Excel: ' + err.message, 'error');
    }
}

/**
 * Tương thích ngược: tự động ánh xạ dữ liệu json/array sang chuẩn kế toán
 */
function exportDataToExcel(data, fileName = 'export.xlsx', sheetName = 'Dữ Liệu', customTitle = '') {
    if (!data || !data.length) {
        showToast('Không có dữ liệu để xuất Excel!', 'info');
        return;
    }

    const headers = Object.keys(data[0]);
    const columns = headers.map((h, idx) => {
        const lower = h.toLowerCase();
        const isNum = lower.includes('số lượng') || lower.includes('tồn kho') || lower.includes('đơn giá') || lower.includes('thành tiền') || lower.includes('giá') || lower.includes('lợi nhuận') || lower.includes('tổng tiền');
        let code = String(idx + 1);
        if (idx === 0) code = 'A';
        else if (idx === 1) code = 'B';
        else if (idx === 2) code = 'C';

        let width = 16;
        if (lower.includes('stt')) width = 8;
        else if (lower.includes('tên')) width = 45;
        else if (lower.includes('đvt')) width = 10;
        else if (lower.includes('thành tiền')) width = 20;

        return {
            header: h,
            code,
            width,
            align: isNum ? 'right' : (lower.includes('stt') || lower.includes('đvt') ? 'center' : 'left'),
            wrapText: lower.includes('tên'),
            isNumber: isNum
        };
    });

    const rows = data.map(item => headers.map(h => (item[h] !== undefined && item[h] !== null ? item[h] : '')));

    const summaryRow = new Array(headers.length).fill('');
    summaryRow[0] = 'Tổng cộng';
    let hasNumeric = false;

    headers.forEach((h, idx) => {
        const lower = h.toLowerCase();
        if (
            lower.includes('số lượng') ||
            lower.includes('tồn kho') ||
            lower.includes('thành tiền') ||
            lower.includes('giá trị') ||
            lower.includes('lợi nhuận') ||
            lower.includes('tổng tiền')
        ) {
            let sum = 0;
            let count = 0;
            rows.forEach(r => {
                const val = parseFloat(r[idx]);
                if (!isNaN(val)) {
                    sum += val;
                    count++;
                }
            });
            if (count > 0) {
                summaryRow[idx] = sum;
                hasNumeric = true;
            } else {
                summaryRow[idx] = '-';
            }
        } else if (idx > 1) {
            summaryRow[idx] = '-';
        }
    });

    const reportTitle = customTitle || sheetName.toUpperCase();
    exportAccountingReportToExcel({
        title: reportTitle,
        columns,
        rows,
        summaryRow: hasNumeric ? summaryRow : null,
        fileName,
        sheetName
    });
}

// ── DEAD SWITCH (XÓA ỨNG DỤNG TRÊN MÁY) ──────────────────────────────────────

function openDeadswitchModal() {
    const btn = document.getElementById('btn-trigger-deadswitch');
    if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<i class="bi bi-trash3-fill me-1"></i>Xác Nhận Xóa';
    }
    openModal('deadswitch-modal');
}

async function executeDeadswitch() {
    const btn = document.getElementById('btn-trigger-deadswitch');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>ĐANG XÓA...';
    }

    try {
        const res = await apiRequest('/api/system/deadswitch', 'POST', { confirm: true });
        
        // Hiển thị màn hình thông báo
        document.body.innerHTML = `
            <div style="position:fixed;top:0;left:0;width:100vw;height:100vh;background:#0f172a;color:#ef4444;display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:999999;font-family:sans-serif;text-align:center;padding:20px;">
                <div style="font-size:64px;margin-bottom:20px;">🗑️</div>
                <h1 style="font-size:30px;font-weight:bold;margin-bottom:12px;color:#f87171;">ĐÃ XÁC NHẬN XÓA ỨNG DỤNG</h1>
                <p style="font-size:16px;color:#94a3b8;max-width:600px;margin-bottom:20px;">
                    ${res.message || 'Ứng dụng Kho Hàng An Nam và các tệp cục bộ trên máy tính đang được gỡ bỏ.'}
                </p>
                <p style="font-size:15px;color:#22c55e;">
                    ✓ Dữ liệu Google Sheets trên đám mây được giữ nguyên an toàn 100%.
                </p>
                <div style="margin-top:30px;color:#64748b;font-size:14px;">Cửa sổ sẽ tự động đóng ngay bây giờ...</div>
            </div>
        `;

        try {
            localStorage.clear();
            sessionStorage.clear();
        } catch (e) {}

        setTimeout(() => {
            try { window.close(); } catch (e) {}
        }, 3000);
    } catch (e) {
        showToast(e.message || 'Lỗi thực hiện', 'error');
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="bi bi-trash3-fill me-1"></i>Xác Nhận Xóa';
        }
    }
}

// ── Đồng bộ Google Sheets vào SQLite Database ─────────────────────────────

async function syncFromGoogleSheets() {
    const btn = document.getElementById('btn-sync-sheets');
    const originalHtml = btn ? btn.innerHTML : '';
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Đang đồng bộ...';
    }

    try {
        const res = await apiRequest('/api/system/sync-sheets', 'POST');
        showToast(res.message || 'Đồng bộ từ Google Sheets thành công!', 'success');
        
        // Tải lại các iframe đang mở để cập nhật dữ liệu mới
        document.querySelectorAll('.tab-frame').forEach(f => {
            try {
                f.contentWindow.location.reload();
            } catch (err) {}
        });
    } catch (e) {
        showToast('Lỗi đồng bộ: ' + (e.message || 'Không thể đồng bộ'), 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = originalHtml;
        }
    }
}

// Chuyển tiếp tín hiệu đồng bộ giữa các tab iframe
window.addEventListener('message', (e) => {
    if (e.data && e.data.type === 'PRODUCTS_UPDATED') {
        document.querySelectorAll('.tab-frame').forEach(f => {
            try {
                f.contentWindow.postMessage({ type: 'PRODUCTS_UPDATED' }, '*');
            } catch (err) {}
        });
    }
});
