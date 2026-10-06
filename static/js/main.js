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

// ── Sidebar Group Collapse / Expand ──────────────────────────────────────────

function toggleSidebarGroup(labelEl, targetGroupId) {
    if (!labelEl) return;
    const contentEl = document.getElementById(targetGroupId);
    if (!contentEl) return;

    labelEl.classList.toggle('collapsed');
    contentEl.classList.toggle('collapsed');

    // Lưu trạng thái vào localStorage để khi reload trang giữ nguyên
    try {
        const isCollapsed = contentEl.classList.contains('collapsed');
        localStorage.setItem('sidebar_group_' + targetGroupId, isCollapsed ? 'collapsed' : 'expanded');
    } catch (e) {}
}

function restoreSidebarGroupStates() {
    ['group-hang-hoa', 'group-dong-tien', 'group-cong-no'].forEach(groupId => {
        try {
            const savedState = localStorage.getItem('sidebar_group_' + groupId);
            const contentEl = document.getElementById(groupId);
            if (contentEl && savedState === 'collapsed') {
                contentEl.classList.add('collapsed');
                const labelEl = contentEl.previousElementSibling;
                if (labelEl && labelEl.classList.contains('collapsible')) {
                    labelEl.classList.add('collapsed');
                }
            }
        } catch (e) {}
    });
}

document.addEventListener('DOMContentLoaded', function() {
    restoreSidebarGroupStates();
});

// ── Toast Notifications ───────────────────────────────────────────────────────

function showToast(message, type = 'success') {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        document.body.appendChild(container);
    }

    // Chống trùng lặp: Nếu thông báo cùng nội dung đang hiển thị thì không tạo thêm
    const activeSpans = container.querySelectorAll('.toast-msg span');
    for (let s of activeSpans) {
        if (s.textContent === message) return;
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
    'bang-nhap-xuat-ton': {
        title: 'Bảng Nhập Xuất Tồn',
        icon: 'bi-table text-primary',
        url: '/bang-nhap-xuat-ton?embed=1',
        closable: true
    },
    'nhap-xuat-ton': {
        title: 'Bảng Nhập Xuất Tồn',
        icon: 'bi-table text-primary',
        url: '/bang-nhap-xuat-ton?embed=1',
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
        title: 'Danh Mục Đối Tượng',
        icon: 'bi-people-fill text-primary',
        url: '/danh-muc?embed=1',
        closable: true
    },
    'dong-tien': {
        title: 'Quản Lý Dòng Tiền',
        icon: 'bi-cash-coin',
        url: '/dong-tien?embed=1',
        closable: true
    },
    'phieu-thu': {
        title: 'Tạo Phiếu Thu',
        icon: 'bi-box-arrow-in-down-right',
        url: '/phieu-thu?embed=1',
        closable: true
    },
    'phieu-chi': {
        title: 'Tạo Phiếu Chi',
        icon: 'bi-box-arrow-up-right',
        url: '/phieu-chi?embed=1',
        closable: true
    },
    'cong-no': {
        title: 'Quản Lý Công Nợ',
        icon: 'bi-credit-card-2-front',
        url: '/cong-no?embed=1',
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

window.TabManager = TabManager;

/**
 * Hàm tiện ích mở tab an toàn từ bất kỳ đâu (parent hoặc bên trong iframe con)
 */
function openAppTab(tabType, customUrl = null, forceNew = false) {
    if (window.parent && window.parent.TabManager) {
        window.parent.TabManager.openTab(tabType, customUrl, forceNew);
    } else if (window.TabManager) {
        window.TabManager.openTab(tabType, customUrl, forceNew);
    } else {
        window.location.href = customUrl || (tabType === 'xuat-hang' ? '/xuat-hang' : tabType === 'nhap-hang' ? '/nhap-hang' : `/${tabType}`);
    }
}
window.openAppTab = openAppTab;

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
    if (window.currentReceiptDetail) {
        printOfficialReceipt(window.currentReceiptDetail);
        return;
    }
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

// ── Hàm đọc số thành chữ chuẩn kế toán Việt Nam ───────────────────────────────

function docSoThanhChu(so) {
    if (!so || isNaN(so) || Number(so) === 0) return 'Không đồng y.';
    so = Math.round(Math.abs(Number(so)));
    const chuSo = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín'];
    const donVi = ['', 'nghìn', 'triệu', 'tỷ', 'nghìn tỷ', 'triệu tỷ'];

    function docBlock(n, showFull) {
        let tram = Math.floor(n / 100);
        let chuc = Math.floor((n % 100) / 10);
        let dv = n % 10;
        let res = '';
        if (showFull || tram > 0) {
            res += chuSo[tram] + ' trăm ';
        }
        if (chuc > 1) {
            res += chuSo[chuc] + ' mươi ';
            if (dv === 1) res += 'mốt ';
            else if (dv === 5) res += 'lăm ';
            else if (dv > 0) res += chuSo[dv] + ' ';
        } else if (chuc === 1) {
            res += 'mười ';
            if (dv === 5) res += 'lăm ';
            else if (dv > 0) res += chuSo[dv] + ' ';
        } else if (showFull && chuc === 0 && dv > 0) {
            res += 'lẻ ' + chuSo[dv] + ' ';
        } else if (dv > 0) {
            res += chuSo[dv] + ' ';
        }
        return res.trim();
    }

    let str = String(so);
    let blocks = [];
    while (str.length > 0) {
        blocks.unshift(parseInt(str.slice(-3)));
        str = str.slice(0, -3);
    }

    let words = [];
    for (let i = 0; i < blocks.length; i++) {
        let b = blocks[i];
        if (b > 0) {
            let bText = docBlock(b, i > 0);
            let dvText = donVi[blocks.length - 1 - i];
            words.push(bText + (dvText ? ' ' + dvText : ''));
        }
    }

    let ketQua = words.join(', ').trim();
    return ketQua.charAt(0).toUpperCase() + ketQua.slice(1) + ' đồng y.';
}

// ── In Phiếu Xuất Kho / Phiếu Nhập Kho Chuẩn Mẫu TT 133/2016/TT-BTC ───────────

function printOfficialReceipt(receiptData = null, receiptType = null) {
    const data = receiptData || window.currentReceiptDetail;
    if (!data) {
        printReceiptModal();
        return;
    }

    const type = receiptType || data.type || (data.so_phieu && data.so_phieu.startsWith('XH') ? 'xuat' : 'nhap');
    const isXuat = type === 'xuat';

    const so_phieu = data.so_phieu || '';
    const rawDate = data.ngay || data.ngay_xuat || data.ngay_nhap || new Date().toISOString().slice(0, 10);
    
    // Parse ngày tháng
    const parts = String(rawDate).split('-');
    const year = parts[0] || '2026';
    const month = parts[1] || '10';
    const day = parts[2] || '01';
    const ngayText = `Ngày ${day} tháng ${month} năm ${year}`;

    // Đối tác
    const doiTac = isXuat ? (data.khach_hang || {}) : (data.nha_cung_cap || {});
    const tenDoiTac = doiTac.ten_kh || doiTac.ten_ncc || data.nha_cung_cap_id || data.khach_hang_id || (isXuat ? 'Khách lẻ' : 'Nhà cung cấp lẻ');
    const diaChiDoiTac = doiTac.dia_chi || data.dia_chi || '';
    const sdtDoiTac = doiTac.dien_thoai || data.dien_thoai || '';
    const ghiChu = data.ghi_chu || '';

    const items = data.items || [];
    const total = data.total || 0;

    const formatVNDClean = (v) => {
        if (!v || isNaN(v)) return '0';
        return Math.round(Number(v)).toLocaleString('vi-VN');
    };

    const formatQty = (q) => {
        if (!q || isNaN(q)) return '0,00';
        return Number(q).toLocaleString('vi-VN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };

    const itemRowsHtml = items.map((it, idx) => `
        <tr>
            <td style="border: 1px solid #000; padding: 5px 4px; text-align: center;">${idx + 1}</td>
            <td style="border: 1px solid #000; padding: 5px 6px; text-align: left;">${escapeHtml(it.ten_hang)}</td>
            <td style="border: 1px solid #000; padding: 5px 4px; text-align: center;">${escapeHtml(it.don_vi_tinh || 'Cái')}</td>
            <td style="border: 1px solid #000; padding: 5px 4px; text-align: center;">${formatQty(it.so_luong)}</td>
            <td style="border: 1px solid #000; padding: 5px 6px; text-align: right;">${formatVNDClean(isXuat ? (it.gia_ban !== undefined ? it.gia_ban : it.don_gia) : (it.gia_nhap !== undefined ? it.gia_nhap : it.don_gia))}</td>
            <td style="border: 1px solid #000; padding: 5px 6px; text-align: right;">${formatVNDClean(it.thanh_tien)}</td>
        </tr>
    `).join('');

    const printWindow = window.open('', '_blank', 'width=850,height=750');
    if (!printWindow) {
        window.print();
        return;
    }

    printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <title>${isXuat ? 'Phiếu Xuất Kho' : 'Phiếu Nhập Kho'} - ${so_phieu}</title>
            <style>
                @page {
                    size: A4 portrait;
                    margin: 15mm 15mm 15mm 15mm;
                }
                body {
                    font-family: 'Times New Roman', Times, serif;
                    font-size: 11pt;
                    line-height: 1.4;
                    color: #000;
                    margin: 0;
                    padding: 20px;
                }
                .no-print-bar {
                    display: flex;
                    justify-content: flex-end;
                    margin-bottom: 15px;
                }
                .btn-print {
                    background: #0284c7;
                    color: #fff;
                    border: none;
                    padding: 8px 16px;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 13px;
                }
                @media print {
                    .no-print-bar { display: none !important; }
                    body { padding: 0; }
                }
                table {
                    width: 100%;
                    border-collapse: collapse;
                }
                th, td {
                    border: 1px solid #000;
                }
            </style>
        </head>
        <body>
            <div class="no-print-bar">
                <button class="btn-print" onclick="window.print()">🖨️ In Phiếu (A4)</button>
            </div>

            <!-- Top Header -->
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 15px;">
                <div style="width: 58%; font-size: 11pt; line-height: 1.45;">
                    <div><strong>Đơn vị:</strong> CÔNG TY CỔ PHẦN THIẾT BỊ VÀ CÔNG NGHỆ SỐ AN NAM</div>
                    <div style="border-bottom: 1px dotted #000; padding-bottom: 2px; margin-top: 2px;">
                        <strong>Địa chỉ:</strong> 454 Nguyễn Trãi, Hạc Thành, Thanh Hóa, Việt Nam
                    </div>
                    <div style="border-bottom: 1px dotted #000; padding-bottom: 2px; margin-top: 2px;">
                        <strong>ĐT:</strong> 0000000000 - Fax: 0000000000
                    </div>
                </div>

                <div style="width: 40%; text-align: center; font-size: 11pt; line-height: 1.35;">
                    <div style="font-weight: bold;">Mẫu số ${isXuat ? '02-VT' : '01-VT'}</div>
                    <div style="font-style: italic; font-size: 9pt;">(Ban hành theo TT 133/2016/TT-BTC<br>ngày 26/08/2016 của Bộ Trưởng BTC)</div>
                    <div style="margin-top: 6px; text-align: left; padding-left: 30px;">
                        <div style="border-bottom: 1px dotted #000; padding-bottom: 1px;">
                            <strong>Số :</strong> <span style="font-weight: bold;">${so_phieu}</span>
                        </div>
                        <div style="border-bottom: 1px dotted #000; padding-bottom: 1px;">
                            <strong>Nợ :</strong> ${isXuat ? '131' : '156'}
                        </div>
                        <div style="border-bottom: 1px dotted #000; padding-bottom: 1px;">
                            <strong>Có :</strong> ${isXuat ? '5111' : '331'}
                        </div>
                    </div>
                </div>
            </div>

            <!-- Title -->
            <div style="text-align: center; margin-bottom: 15px;">
                <h2 style="font-weight: bold; margin: 0; font-size: 18pt; text-transform: uppercase;">
                    ${isXuat ? 'PHIẾU XUẤT KHO' : 'PHIẾU NHẬP KHO'}
                </h2>
                <div style="font-style: italic; font-size: 11pt; margin-top: 4px;">
                    ${ngayText}
                </div>
            </div>

            <!-- Details -->
            <div style="font-size: 11pt; line-height: 1.8; margin-bottom: 15px;">
                <div style="border-bottom: 1px dotted #000; display: flex;">
                    <span style="white-space: nowrap;">${isXuat ? 'Họ, tên người nhận hàng :' : 'Họ, tên người giao hàng :'}</span>
                    <span style="flex-grow: 1; padding-left: 8px; font-weight: bold;">${escapeHtml(tenDoiTac)}</span>
                </div>
                <div style="border-bottom: 1px dotted #000; display: flex;">
                    <span style="white-space: nowrap;">Địa chỉ :</span>
                    <span style="flex-grow: 1; padding-left: 8px;">${escapeHtml(diaChiDoiTac)}${sdtDoiTac ? ' ' + escapeHtml(sdtDoiTac) : ''}</span>
                </div>
                <div style="border-bottom: 1px dotted #000; display: flex;">
                    <span style="white-space: nowrap;">Lý do :</span>
                    <span style="flex-grow: 1; padding-left: 8px;">${escapeHtml(ghiChu || (isXuat ? 'Xuất bán hàng hóa' : 'Nhập hàng vào kho'))}</span>
                </div>
                <div style="border-bottom: 1px dotted #000; display: flex; justify-content: space-between;">
                    <div>
                        <span>${isXuat ? 'Kho xuất :' : 'Kho nhập :'}</span>
                        <span style="padding-left: 8px; font-weight: bold;">Kho An Nam</span>
                    </div>
                    <div>
                        <span>Địa điểm:</span>
                        <span style="padding-left: 8px;">454 Nguyễn Trãi, Hạc Thành, Thanh Hóa</span>
                    </div>
                </div>
            </div>

            <!-- Table -->
            <table style="width: 100%; border-collapse: collapse; font-size: 11pt; margin-bottom: 10px;">
                <thead>
                    <tr style="text-align: center; font-weight: bold;">
                        <th style="padding: 5px 4px; width: 45px;">STT</th>
                        <th style="padding: 5px 6px;">Tên hàng hóa, dịch vụ</th>
                        <th style="padding: 5px 4px; width: 55px;">ĐVT</th>
                        <th style="padding: 5px 4px; width: 75px;">Số lượng</th>
                        <th style="padding: 5px 6px; width: 110px;">Đơn giá</th>
                        <th style="padding: 5px 6px; width: 125px;">Thành tiền</th>
                    </tr>
                    <tr style="text-align: center; font-weight: bold; background-color: #fafafa;">
                        <th style="padding: 2px;">A</th>
                        <th style="padding: 2px;">B</th>
                        <th style="padding: 2px;">C</th>
                        <th style="padding: 2px;">1</th>
                        <th style="padding: 2px;">2</th>
                        <th style="padding: 2px;">3</th>
                    </tr>
                </thead>
                <tbody>
                    ${itemRowsHtml}
                    <!-- Dòng Tổng cộng -->
                    <tr style="font-weight: bold;">
                        <td colspan="2" style="padding: 5px 8px; text-align: center;">Tổng cộng</td>
                        <td style="padding: 5px; text-align: center;">-</td>
                        <td style="padding: 5px; text-align: center;">-</td>
                        <td style="padding: 5px; text-align: center;">-</td>
                        <td style="padding: 5px 8px; text-align: right;">${formatVNDClean(total)}</td>
                    </tr>
                </tbody>
            </table>

            <!-- Dưới bảng -->
            <div style="font-size: 11pt; line-height: 1.8; margin-bottom: 20px;">
                <div style="border-bottom: 1px dotted #000; display: flex;">
                    <span style="white-space: nowrap;">Số tiền phải thanh toán :</span>
                    <span style="flex-grow: 1; padding-left: 8px; font-style: italic;">${docSoThanhChu(total)}</span>
                </div>
                <div style="font-size: 9.5pt; font-style: italic; color: #333; margin-top: -3px; margin-bottom: 3px;">
                    (Viết bằng chữ)
                </div>
                <div style="border-bottom: 1px dotted #000; display: flex;">
                    <span style="white-space: nowrap;">Số chứng từ gốc kèm theo :</span>
                    <span style="flex-grow: 1; padding-left: 8px;"></span>
                </div>
            </div>

            <!-- Chữ ký -->
            <div style="margin-top: 15px; font-size: 11pt;">
                <div style="text-align: right; font-style: italic; margin-bottom: 10px; padding-right: 25px;">
                    ${ngayText}
                </div>
                <div style="display: flex; justify-content: space-around; text-align: center;">
                    ${isXuat ? `
                        <div style="flex: 1;">
                            <strong>Người lập phiếu</strong><br>
                            <span style="font-size: 9.5pt; font-style: italic;">(Ký, họ tên)</span>
                        </div>
                        <div style="flex: 1;">
                            <strong>Người nhận hàng</strong><br>
                            <span style="font-size: 9.5pt; font-style: italic;">(Ký, họ tên)</span>
                        </div>
                        <div style="flex: 1;">
                            <strong>Thủ kho</strong><br>
                            <span style="font-size: 9.5pt; font-style: italic;">(Ký, họ tên)</span>
                        </div>
                        <div style="flex: 1;">
                            <strong>Kế toán trưởng</strong><br>
                            <span style="font-size: 9.5pt; font-style: italic;">(Ký, họ tên)</span>
                        </div>
                        <div style="flex: 1;">
                            <strong>Giám đốc</strong><br>
                            <span style="font-size: 9.5pt; font-style: italic;">(Ký, họ tên)</span>
                        </div>
                    ` : `
                        <div style="flex: 1;">
                            <strong>Người lập phiếu</strong><br>
                            <span style="font-size: 9.5pt; font-style: italic;">(Ký, họ tên)</span>
                        </div>
                        <div style="flex: 1;">
                            <strong>Người giao hàng</strong><br>
                            <span style="font-size: 9.5pt; font-style: italic;">(Ký, họ tên)</span>
                        </div>
                        <div style="flex: 1;">
                            <strong>Thủ kho</strong><br>
                            <span style="font-size: 9.5pt; font-style: italic;">(Ký, họ tên)</span>
                        </div>
                        <div style="flex: 1;">
                            <strong>Kế toán trưởng</strong><br>
                            <span style="font-size: 9.5pt; font-style: italic;">(Ký, họ tên)</span>
                        </div>
                    `}
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

// ── Hệ Thống Quản Lý, Chỉnh Sửa & Xóa Phiếu Nhập/Xuất ───────────────────────

window.isReceiptDetailDirty = false;
window.currentReceiptDetail = null;
window.receiptDetailOnUpdated = null;
window.allReceiptProductsCache = null;

/**
 * Hiển thị chi tiết phiếu nhập / xuất kho với đầy đủ tính năng:
 * - Giao diện thanh lịch, rõ ràng, tinh giản icon
 * - Cho phép chỉnh sửa số lượng, đơn giá trực tiếp trên từng dòng
 * - Thêm sản phẩm mới vào phiếu từ dropdown danh mục hàng
 * - Xóa sản phẩm khỏi phiếu
 * - Nút "Lưu thay đổi" động (sáng màu xanh khi có thay đổi)
 * - Tự động tính toán tổng số lượng và tổng tiền
 */
async function renderEditableReceiptDetail(res, type, targetModalBodyId = 'detail-modal-body', onUpdated = null) {
    if (!res) return;
    const isXuat = (type === 'xuat') || (res.so_phieu && res.so_phieu.startsWith('XH'));
    const items = res.items || [];
    window.currentReceiptDetail = { ...res, type: isXuat ? 'xuat' : 'nhap' };
    window.receiptDetailOnUpdated = onUpdated;
    window.isReceiptDetailDirty = false;

    const modalBody = document.getElementById(targetModalBodyId);
    if (!modalBody) return;

    const partner = isXuat ? (res.khach_hang || {}) : (res.nha_cung_cap || {});
    const partnerName = isXuat ? (partner.ten_kh || 'Khách lẻ') : (partner.ten_ncc || 'Không xác định');
    const partnerPhone = partner.dien_thoai || '';
    const partnerAddress = partner.dia_chi || '';
    const ngay = isXuat ? res.ngay_xuat : res.ngay_nhap;

    // Tải danh sách tất cả sản phẩm cho dropdown "Thêm hàng"
    const allProducts = await fetchAllProductsForReceipt();

    const isPaid = !!res.da_thanh_toan || (typeof res.total_no === 'number' && res.total_no <= 0);
    const paymentBadge = isPaid
        ? `<span class="badge bg-success-subtle text-success border border-success ms-1"><i class="bi bi-check2-circle me-1"></i>Đã thanh toán</span>`
        : `<span class="badge bg-danger-subtle text-danger border border-danger ms-1"><i class="bi bi-clock-history me-1"></i>Còn nợ: ${formatVND(res.total_no !== undefined ? res.total_no : res.total)}</span>`;

    // Render HTML
    modalBody.innerHTML = `
        <div class="card bg-light border-0 mb-3 shadow-none">
            <div class="card-body p-3">
                <div class="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-2 pb-2 border-bottom">
                    <div class="d-flex align-items-center gap-2 flex-wrap">
                        <span class="badge ${isXuat ? 'bg-danger' : 'bg-primary'} fs-6 px-3 py-1 font-monospace">${escapeHtml(res.so_phieu)}</span>
                        ${paymentBadge}
                        <div class="d-inline-flex align-items-center gap-1 ms-2">
                            <span class="text-secondary small">Ngày:</span>
                            <input type="date" id="receipt-edit-ngay" class="form-control form-control-sm py-0 px-2 fw-semibold border-secondary-subtle" style="width: 140px;" value="${ngay || ''}" onchange="markReceiptDetailDirty()">
                        </div>
                    </div>
                    <div class="text-end">
                        <span class="text-muted small me-2">Tổng tiền:</span>
                        <span class="fs-4 fw-bold ${isXuat ? 'text-danger' : 'text-primary'} font-monospace" id="receipt-detail-grand-total">${formatVND(res.total)}</span>
                    </div>
                </div>
                <div class="row g-2 small">
                    <div class="col-md-7">
                        <div class="fw-bold text-dark fs-6">${escapeHtml(partnerName)}</div>
                        ${partnerPhone ? `<div class="text-muted">SĐT: <strong class="text-dark font-monospace">${escapeHtml(partnerPhone)}</strong></div>` : ''}
                        ${partnerAddress ? `<div class="text-muted">Địa chỉ: <span class="text-dark">${escapeHtml(partnerAddress)}</span></div>` : ''}
                    </div>
                    <div class="col-md-5">
                        <div class="mb-1">
                            <span class="text-muted small">Ghi chú:</span>
                            <input type="text" id="receipt-edit-ghi-chu" class="form-control form-control-sm py-0 px-2 border-secondary-subtle mt-1" value="${escapeHtml(res.ghi_chu || '')}" placeholder="Ghi chú phiếu..." oninput="markReceiptDetailDirty()">
                        </div>
                        <div class="text-muted small mt-1">
                            Quy mô: <strong id="receipt-detail-item-count">${items.length}</strong> mặt hàng &middot; Tổng SL: <strong class="${isXuat ? 'text-danger' : 'text-primary'} font-monospace" id="receipt-detail-grand-qty">${formatNumber(res.tong_so_luong)}</strong>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Bảng danh sách mặt hàng có thể chỉnh sửa -->
        <div class="table-responsive border rounded mb-3">
            <table class="table table-hover align-middle mb-0">
                <thead style="background-color: #1e293b !important; color: #ffffff !important;">
                    <tr style="background-color: #1e293b !important;">
                        <th class="text-center" style="width: 40px; background-color: #1e293b !important; color: #ffffff !important;">#</th>
                        <th style="width: 110px; background-color: #1e293b !important; color: #ffffff !important;">Mã hàng</th>
                        <th style="background-color: #1e293b !important; color: #ffffff !important;">Tên hàng hóa</th>
                        <th class="text-center" style="width: 65px; background-color: #1e293b !important; color: #ffffff !important;">ĐVT</th>
                        <th class="text-center" style="width: 90px; background-color: #1e293b !important; color: #ffffff !important;">Số lượng</th>
                        <th class="text-end" style="width: 145px; background-color: #1e293b !important; color: #ffffff !important;">${isXuat ? 'Đơn giá xuất' : 'Đơn giá nhập'}</th>
                        <th class="text-end" style="min-width: 140px; width: 155px; background-color: #1e293b !important; color: #ffffff !important;">Thành tiền</th>
                        <th class="text-center" style="width: 50px; background-color: #1e293b !important; color: #ffffff !important;">Xóa</th>
                    </tr>
                </thead>
                <tbody id="receipt-detail-tbody">
                    ${items.map((it, idx) => {
                        const gia = isXuat ? (it.gia_ban || 0) : (it.gia_nhap || 0);
                        const thanhTien = it.thanh_tien || (it.so_luong * gia);
                        return `
                            <tr data-ma="${escapeHtml(it.ma_hang)}" data-ten="${escapeHtml(it.ten_hang)}" data-dvt="${escapeHtml(it.don_vi_tinh || 'Cái')}">
                                <td class="text-center text-muted small row-stt">${idx + 1}</td>
                                <td><span class="badge bg-secondary font-monospace">${escapeHtml(it.ma_hang)}</span></td>
                                <td class="fw-semibold">${escapeHtml(it.ten_hang)}</td>
                                <td class="text-center text-muted small">${escapeHtml(it.don_vi_tinh || 'Cái')}</td>
                                <td class="text-center">
                                    <input type="number" min="1" class="form-control form-control-sm text-center fw-bold receipt-row-sl ${isXuat ? 'text-danger' : 'text-primary'}" value="${it.so_luong}" oninput="onReceiptDetailRowInput(this)">
                                </td>
                                <td class="text-end">
                                    <input type="number" min="0" step="1000" class="form-control form-control-sm text-end receipt-row-gia" value="${gia}" oninput="onReceiptDetailRowInput(this)">
                                </td>
                                <td class="text-end fw-bold text-dark font-monospace text-nowrap receipt-row-total">${formatVND(thanhTien)}</td>
                                <td class="text-center">
                                    <button type="button" class="btn btn-outline-danger btn-xs p-1" onclick="removeReceiptDetailRow(this)" title="Xóa mặt hàng này">
                                        <i class="bi bi-trash"></i>
                                    </button>
                                </td>
                            </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
        </div>

        <!-- Thanh thêm mặt hàng mới vào phiếu -->
        <div class="card border border-dashed bg-white mb-2">
            <div class="card-body p-2">
                <div class="d-flex align-items-center gap-2 flex-wrap">
                    <span class="small fw-bold text-secondary text-nowrap"><i class="bi bi-plus-circle me-1"></i>Thêm hàng:</span>
                    <select id="detail-add-prod-select" class="form-select form-select-sm" style="flex: 2; min-width: 220px;" onchange="onDetailSelectProduct(this)">
                        <option value="">-- Chọn mặt hàng muốn thêm --</option>
                        ${allProducts.map(p => `
                            <option value="${escapeHtml(p.ma_hang)}" data-ten="${escapeHtml(p.ten_hang)}" data-dvt="${escapeHtml(p.don_vi_tinh || 'Cái')}" data-gianhap="${p.gia_nhap || 0}" data-giaban="${p.gia_ban || 0}" data-ton="${p.ton_kho || 0}">
                                [${escapeHtml(p.ma_hang)}] ${escapeHtml(p.ten_hang)} (Tồn: ${p.ton_kho || 0})
                            </option>
                        `).join('')}
                    </select>
                    <div style="width: 90px;">
                        <input type="number" id="detail-add-sl" min="1" value="1" class="form-control form-control-sm text-center" placeholder="SL">
                    </div>
                    <div style="width: 140px;">
                        <input type="number" id="detail-add-gia" min="0" step="1000" value="0" class="form-control form-control-sm text-end" placeholder="Đơn giá">
                    </div>
                    <button type="button" class="btn btn-primary btn-sm px-3" onclick="submitAddProductToReceiptDetail()">
                        <i class="bi bi-plus-lg me-1"></i>Thêm
                    </button>
                </div>
            </div>
        </div>
    `;

    // Cài đặt các nút footer và xử lý cảnh báo thay đổi chưa lưu
    setupReceiptDetailModalFooter(targetModalBodyId, res, isXuat);

    const parentModal = modalBody.closest('.modal');
    if (parentModal) {
        setupModalUnsavedWarning(parentModal.id);
        openModal(parentModal.id);
    }
}
window.renderEditableReceiptDetail = renderEditableReceiptDetail;

async function fetchAllProductsForReceipt() {
    if (window.allReceiptProductsCache && window.allReceiptProductsCache.length) {
        return window.allReceiptProductsCache;
    }
    try {
        const res = await apiRequest('/api/hang-hoa');
        window.allReceiptProductsCache = res.data || [];
        return window.allReceiptProductsCache;
    } catch (e) {
        console.error('Lỗi tải danh sách sản phẩm:', e);
        return [];
    }
}

/**
 * Mở hộp thoại xác nhận xóa phiếu lần 2 (Đồng ý hoặc Không)
 */
function confirmDeleteReceipt(so_phieu, type, onDone) {
    if (!so_phieu) return;
    const isXuat = (type === 'xuat') || so_phieu.startsWith('XH');
    const typeLabel = isXuat ? 'phiếu xuất kho' : 'phiếu nhập kho';

    const modalEl = document.getElementById('confirm-delete-receipt-modal');
    if (!modalEl) {
        if (confirm(`Bạn có chắc chắn muốn xóa ${typeLabel} "${so_phieu}"? Thao tác này sẽ tự động hoàn trả tồn kho.`)) {
            executeDeleteReceiptApi(so_phieu, isXuat ? 'xuat' : 'nhap', onDone);
        }
        return;
    }

    const titleEl = document.getElementById('del-receipt-title');
    const descEl = document.getElementById('del-receipt-desc');
    if (titleEl) titleEl.textContent = `Xác nhận xóa ${typeLabel} "${so_phieu}"?`;
    if (descEl) descEl.textContent = `Hành động này sẽ xóa vĩnh viễn phiếu ${so_phieu} và tự động hoàn trả số lượng hàng tồn kho tương ứng vào hệ thống. Không thể hoàn tác.`;

    const confirmBtn = document.getElementById('btn-confirm-delete-receipt');
    if (confirmBtn) {
        confirmBtn.onclick = async () => {
            confirmBtn.disabled = true;
            confirmBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Đang xóa...';
            try {
                await executeDeleteReceiptApi(so_phieu, isXuat ? 'xuat' : 'nhap', onDone);
                closeModal('confirm-delete-receipt-modal');
                window.isReceiptDetailDirty = false;
                closeModal('detail-modal');
                closeModal('history-detail-modal');
            } catch (err) {
                // Lỗi đã được toast trong executeDeleteReceiptApi
            } finally {
                confirmBtn.disabled = false;
                confirmBtn.innerHTML = '<i class="bi bi-check-lg me-1"></i>Đồng ý xóa';
            }
        };
    }

    openModal('confirm-delete-receipt-modal');
}

function confirmDeleteCurrentReceipt() {
    if (!window.currentReceiptDetail || !window.currentReceiptDetail.so_phieu) return;
    confirmDeleteReceipt(
        window.currentReceiptDetail.so_phieu,
        window.currentReceiptDetail.type,
        window.receiptDetailOnUpdated
    );
}

async function executeDeleteReceiptApi(so_phieu, type, onDone) {
    const isXuat = type === 'xuat' || so_phieu.startsWith('XH');
    const apiUrl = isXuat ? `/api/xuat-hang/${encodeURIComponent(so_phieu)}` : `/api/nhap-hang/${encodeURIComponent(so_phieu)}`;
    try {
        showLoading();
        const res = await apiRequest(apiUrl, 'DELETE');
        showToast(res.message || `Đã xóa phiếu ${so_phieu} thành công!`, 'success');

        // Báo cho các tab iframe khác cập nhật kho & công nợ tức thì
        broadcastDataUpdate('DEBT_UPDATED');

        if (typeof onDone === 'function') {
            await onDone();
        }
    } catch (e) {
        showToast('Lỗi khi xóa phiếu: ' + (e.message || 'Không thể xóa'), 'error');
        throw e;
    } finally {
        hideLoading();
    }
}

/**
 * Đánh dấu phiếu đã bị sửa đổi -> nút Lưu sáng màu lên
 */
function markReceiptDetailDirty() {
    window.isReceiptDetailDirty = true;
    const saveBtn = document.getElementById('btn-save-receipt-detail');
    if (saveBtn) {
        saveBtn.className = 'btn btn-success btn-sm fw-bold shadow px-3';
        saveBtn.disabled = false;
        saveBtn.innerHTML = '<i class="bi bi-floppy2-fill me-1"></i>Lưu thay đổi';
    }
}

/**
 * Đặt lại trạng thái phiếu chưa bị sửa đổi -> nút Lưu mờ/tối
 */
function resetReceiptDetailClean() {
    window.isReceiptDetailDirty = false;
    const saveBtn = document.getElementById('btn-save-receipt-detail');
    if (saveBtn) {
        saveBtn.className = 'btn btn-secondary btn-sm opacity-50 px-3';
        saveBtn.disabled = true;
        saveBtn.innerHTML = '<i class="bi bi-floppy2 me-1"></i>Lưu thay đổi';
    }
}

/**
 * Xử lý khi thay đổi số lượng hoặc đơn giá của 1 dòng
 */
function onReceiptDetailRowInput(inputEl) {
    const tr = inputEl.closest('tr');
    if (!tr) return;
    const slInput = tr.querySelector('.receipt-row-sl');
    const giaInput = tr.querySelector('.receipt-row-gia');
    const totalEl = tr.querySelector('.receipt-row-total');

    const sl = parseInt(slInput?.value || 0) || 0;
    const gia = parseFloat(giaInput?.value || 0) || 0;
    const lineTotal = sl * gia;

    if (totalEl) {
        totalEl.textContent = formatVND(lineTotal);
    }

    recalcReceiptDetailTotals();
    markReceiptDetailDirty();
}

/**
 * Tính lại tổng số lượng & tổng thành tiền
 */
function recalcReceiptDetailTotals() {
    const tbody = document.getElementById('receipt-detail-tbody');
    if (!tbody) return;
    let totalQty = 0;
    let grandTotal = 0;
    const rows = tbody.querySelectorAll('tr');

    rows.forEach((tr, idx) => {
        const sttEl = tr.querySelector('.row-stt');
        if (sttEl) sttEl.textContent = idx + 1;

        const sl = parseInt(tr.querySelector('.receipt-row-sl')?.value || 0) || 0;
        const gia = parseFloat(tr.querySelector('.receipt-row-gia')?.value || 0) || 0;
        totalQty += sl;
        grandTotal += (sl * gia);
    });

    const qtyEl = document.getElementById('receipt-detail-grand-qty');
    const totalEl = document.getElementById('receipt-detail-grand-total');
    const countEl = document.getElementById('receipt-detail-item-count');

    if (qtyEl) qtyEl.textContent = formatNumber(totalQty);
    if (totalEl) totalEl.textContent = formatVND(grandTotal);
    if (countEl) countEl.textContent = rows.length;

    // Cập nhật lại vào window.currentReceiptDetail để in phiếu đúng số mới
    if (window.currentReceiptDetail) {
        window.currentReceiptDetail.total = grandTotal;
        window.currentReceiptDetail.tong_so_luong = totalQty;
    }
}

/**
 * Xóa 1 mặt hàng khỏi bảng chi tiết
 */
function removeReceiptDetailRow(btn) {
    const tbody = document.getElementById('receipt-detail-tbody');
    if (!tbody) return;
    const rows = tbody.querySelectorAll('tr');
    if (rows.length <= 1) {
        showToast('Phiếu phải có ít nhất 1 mặt hàng, không thể xóa hết!', 'warning');
        return;
    }
    const tr = btn.closest('tr');
    if (tr) {
        tr.remove();
        recalcReceiptDetailTotals();
        markReceiptDetailDirty();
    }
}

/**
 * Khi người dùng chọn mặt hàng trong dropdown "Thêm hàng"
 */
function onDetailSelectProduct(selectEl) {
    const opt = selectEl.options[selectEl.selectedIndex];
    if (!opt || !opt.value) return;
    const isXuat = window.currentReceiptDetail?.type === 'xuat';
    const gia = isXuat ? (parseFloat(opt.dataset.giaban) || 0) : (parseFloat(opt.dataset.gianhap) || 0);

    const slInput = document.getElementById('detail-add-sl');
    const giaInput = document.getElementById('detail-add-gia');
    if (slInput) slInput.value = 1;
    if (giaInput) giaInput.value = gia;
}

/**
 * Thêm mặt hàng được chọn vào bảng chi tiết
 */
function submitAddProductToReceiptDetail() {
    const selectEl = document.getElementById('detail-add-prod-select');
    if (!selectEl || !selectEl.value) {
        showToast('Vui lòng chọn một mặt hàng để thêm', 'warning');
        return;
    }

    const opt = selectEl.options[selectEl.selectedIndex];
    const ma = opt.value;
    const ten = opt.dataset.ten || ma;
    const dvt = opt.dataset.dvt || 'Cái';

    const slInput = document.getElementById('detail-add-sl');
    const giaInput = document.getElementById('detail-add-gia');
    const sl = parseInt(slInput?.value || 0) || 0;
    const gia = parseFloat(giaInput?.value || 0) || 0;

    if (sl <= 0) {
        showToast('Số lượng phải lớn hơn 0', 'warning');
        return;
    }

    const tbody = document.getElementById('receipt-detail-tbody');
    if (!tbody) return;

    // Kiểm tra xem mã hàng đã có trong bảng chưa
    const existingTr = Array.from(tbody.querySelectorAll('tr')).find(tr => tr.dataset.ma === ma);
    if (existingTr) {
        const curSlInput = existingTr.querySelector('.receipt-row-sl');
        if (curSlInput) {
            curSlInput.value = (parseInt(curSlInput.value) || 0) + sl;
            onReceiptDetailRowInput(curSlInput);
            showToast(`Đã cộng thêm ${sl} ${dvt} vào mã ${ma}`, 'info');
        }
    } else {
        const isXuat = window.currentReceiptDetail?.type === 'xuat';
        const lineTotal = sl * gia;
        const newIdx = tbody.querySelectorAll('tr').length + 1;
        const newTr = document.createElement('tr');
        newTr.dataset.ma = ma;
        newTr.dataset.ten = ten;
        newTr.dataset.dvt = dvt;
        newTr.innerHTML = `
            <td class="text-center text-muted small row-stt">${newIdx}</td>
            <td><span class="badge bg-secondary font-monospace">${escapeHtml(ma)}</span></td>
            <td class="fw-semibold">${escapeHtml(ten)}</td>
            <td class="text-center text-muted small">${escapeHtml(dvt)}</td>
            <td class="text-center">
                <input type="number" min="1" class="form-control form-control-sm text-center fw-bold receipt-row-sl ${isXuat ? 'text-danger' : 'text-primary'}" value="${sl}" oninput="onReceiptDetailRowInput(this)">
            </td>
            <td class="text-end">
                <input type="number" min="0" step="1000" class="form-control form-control-sm text-end receipt-row-gia" value="${gia}" oninput="onReceiptDetailRowInput(this)">
            </td>
            <td class="text-end fw-bold font-monospace text-nowrap receipt-row-total">${formatVND(lineTotal)}</td>
            <td class="text-center">
                <button type="button" class="btn btn-outline-danger btn-xs p-1" onclick="removeReceiptDetailRow(this)" title="Xóa mặt hàng này">
                    <i class="bi bi-trash"></i>
                </button>
            </td>
        `;
        tbody.appendChild(newTr);
        recalcReceiptDetailTotals();
        markReceiptDetailDirty();
        showToast(`Đã thêm ${ten} vào phiếu!`, 'success');
    }

    // Reset form thêm hàng
    selectEl.value = '';
    if (slInput) slInput.value = 1;
    if (giaInput) giaInput.value = 0;
}

/**
 * Lưu các thay đổi của phiếu lên server
 */
async function saveCurrentReceiptDetail(shouldCloseAfterSave = false) {
    if (!window.currentReceiptDetail) return;
    const r = window.currentReceiptDetail;
    const so_phieu = r.so_phieu;
    const isXuat = r.type === 'xuat';

    const tbody = document.getElementById('receipt-detail-tbody');
    if (!tbody) return;

    const rows = tbody.querySelectorAll('tr');
    if (!rows.length) {
        showToast('Phiếu phải có ít nhất 1 mặt hàng!', 'warning');
        return;
    }

    const items = [];
    for (const tr of rows) {
        const ma = tr.dataset.ma;
        const ten = tr.dataset.ten;
        const sl = parseInt(tr.querySelector('.receipt-row-sl')?.value || 0) || 0;
        const gia = parseFloat(tr.querySelector('.receipt-row-gia')?.value || 0) || 0;

        if (sl <= 0) {
            showToast(`Mặt hàng ${ten} có số lượng không hợp lệ!`, 'warning');
            return;
        }
        if (gia < 0) {
            showToast(`Mặt hàng ${ten} có đơn giá không hợp lệ!`, 'warning');
            return;
        }

        const itemObj = {
            ma_hang: ma,
            ten_hang: ten,
            so_luong: sl
        };
        if (isXuat) {
            itemObj.gia_ban = gia;
        } else {
            itemObj.gia_nhap = gia;
        }
        items.push(itemObj);
    }

    const ngay = document.getElementById('receipt-edit-ngay')?.value || (isXuat ? r.ngay_xuat : r.ngay_nhap);
    const ghiChu = document.getElementById('receipt-edit-ghi-chu')?.value ?? r.ghi_chu ?? '';

    const payload = isXuat ? {
        ngay_xuat: ngay,
        ghi_chu: ghiChu,
        items: items
    } : {
        ngay_nhap: ngay,
        ghi_chu: ghiChu,
        items: items
    };

    const apiUrl = isXuat ? `/api/xuat-hang/${encodeURIComponent(so_phieu)}` : `/api/nhap-hang/${encodeURIComponent(so_phieu)}`;

    const saveBtn = document.getElementById('btn-save-receipt-detail');
    const origHtml = saveBtn ? saveBtn.innerHTML : '';
    if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Đang lưu...';
    }

    try {
        showLoading();
        const res = await apiRequest(apiUrl, 'PUT', payload);
        showToast(res.message || `Đã lưu cập nhật phiếu ${so_phieu} thành công!`, 'success');

        resetReceiptDetailClean();

        // Cập nhật lại window.currentReceiptDetail
        window.currentReceiptDetail.items = items.map(it => ({
            ...it,
            don_vi_tinh: rows[0]?.dataset.dvt || 'Cái',
            thanh_tien: it.so_luong * (isXuat ? it.gia_ban : it.gia_nhap)
        }));
        if (isXuat) window.currentReceiptDetail.ngay_xuat = ngay;
        else window.currentReceiptDetail.ngay_nhap = ngay;
        window.currentReceiptDetail.ghi_chu = ghiChu;

        // Báo cho các tab khác cập nhật kho
        try {
            window.top.postMessage({ type: 'PRODUCTS_UPDATED' }, '*');
        } catch (e) {}

        if (typeof window.receiptDetailOnUpdated === 'function') {
            await window.receiptDetailOnUpdated();
        }

        if (shouldCloseAfterSave) {
            closeModal('confirm-unsaved-receipt-modal');
            closeModal('detail-modal');
            closeModal('history-detail-modal');
        }
    } catch (e) {
        showToast('Lỗi khi lưu phiếu: ' + (e.message || 'Không thể lưu'), 'error');
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.innerHTML = origHtml;
        }
    } finally {
        hideLoading();
    }
}

/**
 * Đóng an toàn: Nếu có thay đổi chưa lưu -> Bật cảnh báo lần 2
 */
function safeCloseReceiptDetailModal(modalId = 'detail-modal') {
    if (window.isReceiptDetailDirty) {
        const unsavedModalEl = document.getElementById('confirm-unsaved-receipt-modal');
        if (unsavedModalEl) {
            const btnSave = document.getElementById('btn-unsaved-save');
            const btnDiscard = document.getElementById('btn-unsaved-discard');
            const btnCancel = document.getElementById('btn-unsaved-cancel');

            if (btnSave) {
                btnSave.onclick = () => saveCurrentReceiptDetail(true);
            }
            if (btnDiscard) {
                btnDiscard.onclick = () => {
                    window.isReceiptDetailDirty = false;
                    closeModal('confirm-unsaved-receipt-modal');
                    closeModal(modalId);
                };
            }
            if (btnCancel) {
                btnCancel.onclick = () => {
                    closeModal('confirm-unsaved-receipt-modal');
                };
            }
            openModal('confirm-unsaved-receipt-modal');
            return;
        }
    }
    closeModal(modalId);
}

/**
 * Gán listener chống đóng modal khi có thay đổi chưa lưu
 */
function setupModalUnsavedWarning(modalId) {
    const el = document.getElementById(modalId);
    if (!el || el._unsavedHooked) return;
    el._unsavedHooked = true;

    el.addEventListener('hide.bs.modal', function(e) {
        if (window.isReceiptDetailDirty) {
            e.preventDefault();
            safeCloseReceiptDetailModal(modalId);
        }
    });
}

/**
 * Cập nhật các nút ở footer modal chi tiết phiếu
 */
function setupReceiptDetailModalFooter(targetModalBodyId, res, isXuat) {
    const modalBody = document.getElementById(targetModalBodyId);
    if (!modalBody) return;
    const parentModal = modalBody.closest('.modal');
    if (!parentModal) return;
    const footer = parentModal.querySelector('.modal-footer');
    if (!footer) return;

    const modalId = parentModal.id;
    const so_phieu = res.so_phieu;

    // Với phiếu xuất: thay nút sao chép thành nút Tạo Phiếu Thu Nhanh (hoặc đã thu tiền)
    // Với phiếu nhập: nút Tạo Phiếu Chi Nhanh (hoặc đã chi tiền) + nút Sao chép vào phiếu mới
    let actionBtnHtml = '';
    if (isXuat) {
        const isPaid = !!res.da_thanh_toan || (typeof res.total_no === 'number' && res.total_no <= 0);
        if (isPaid) {
            actionBtnHtml = `
                <button type="button" class="btn btn-secondary btn-sm opacity-50 text-nowrap" id="btn-quick-phieu-thu" disabled style="cursor: not-allowed;" title="Phiếu xuất này đã thanh toán / đã có phiếu thu">
                    <i class="bi bi-check2-all me-1"></i>Đã có phiếu thu ${res.ma_phieu_thu ? `(${escapeHtml(res.ma_phieu_thu)})` : ''}
                </button>
            `;
        } else {
            actionBtnHtml = `
                <button type="button" class="btn btn-outline-success btn-sm fw-semibold text-nowrap" id="btn-quick-phieu-thu" onclick="openQuickPhieuThuModal('${escapeHtml(res.so_phieu)}')">
                    <i class="bi bi-cash-coin me-1"></i>Tạo Phiếu Thu Nhanh
                </button>
            `;
        }
    } else {
        const isPaid = !!res.da_thanh_toan || (typeof res.total_no === 'number' && res.total_no <= 0);
        let chiBtn = '';
        if (isPaid) {
            chiBtn = `
                <button type="button" class="btn btn-secondary btn-sm opacity-50 text-nowrap" id="btn-quick-phieu-chi" disabled style="cursor: not-allowed;" title="Phiếu nhập này đã thanh toán / đã có phiếu chi">
                    <i class="bi bi-check2-all me-1"></i>Đã có phiếu chi ${res.ma_phieu_chi ? `(${escapeHtml(res.ma_phieu_chi)})` : ''}
                </button>
            `;
        } else {
            chiBtn = `
                <button type="button" class="btn btn-outline-danger btn-sm fw-semibold text-nowrap" id="btn-quick-phieu-chi" onclick="openQuickPhieuChiModal('${escapeHtml(res.so_phieu)}')">
                    <i class="bi bi-cash-stack me-1"></i>Tạo Phiếu Chi Nhanh
                </button>
            `;
        }
        let cloneBtn = '';
        if (typeof cloneCurrentReceiptToForm === 'function') {
            cloneBtn = `
                <button type="button" class="btn btn-outline-warning btn-sm" onclick="cloneCurrentReceiptToForm()">
                    <i class="bi bi-copy me-1"></i>Sao chép
                </button>
            `;
        }
        actionBtnHtml = `${chiBtn} ${cloneBtn}`;
    }

    footer.innerHTML = `
        <div class="d-flex align-items-center gap-2 flex-wrap">
            <button type="button" class="btn btn-outline-secondary btn-sm" onclick="printReceiptModal('${targetModalBodyId}', '${isXuat ? 'Phiếu Xuất Kho' : 'Phiếu Nhập Kho'}')">
                <i class="bi bi-printer me-1"></i>In Phiếu
            </button>
            <button type="button" class="btn btn-outline-danger btn-sm" onclick="confirmDeleteCurrentReceipt()">
                <i class="bi bi-trash3 me-1"></i>Xóa Phiếu
            </button>
            ${actionBtnHtml}
        </div>
        <div class="d-flex align-items-center gap-2">
            <button type="button" class="btn btn-secondary btn-sm" onclick="safeCloseReceiptDetailModal('${modalId}')">
                Đóng
            </button>
            <button type="button" class="btn btn-secondary btn-sm opacity-50 px-3" id="btn-save-receipt-detail" disabled onclick="saveCurrentReceiptDetail(false)">
                <i class="bi bi-floppy2 me-1"></i>Lưu thay đổi
            </button>
        </div>
    `;

    // Thay thế nút X trên header thành safeCloseReceiptDetailModal
    const closeBtn = parentModal.querySelector('.modal-header .btn-close');
    if (closeBtn) {
        closeBtn.removeAttribute('data-bs-dismiss');
        closeBtn.onclick = () => safeCloseReceiptDetailModal(modalId);
    }
}

/**
 * Mở modal tạo phiếu thu nhanh trực tiếp từ Chi Tiết Phiếu Xuất
 */
async function openQuickPhieuThuModal(so_phieu) {
    let r = window.currentReceiptDetail;
    if (!r || r.so_phieu !== so_phieu) {
        try {
            const data = await apiRequest(`/api/xuat-hang/${encodeURIComponent(so_phieu)}`);
            if (data && data.success) {
                r = data;
                window.currentReceiptDetail = data;
            }
        } catch (e) {
            showToast('Không thể tải chi tiết phiếu xuất: ' + e.message, 'error');
            return;
        }
    }

    if (!r) {
        showToast('Không tìm thấy thông tin phiếu xuất', 'error');
        return;
    }

    const ten_kh = r.khach_hang?.ten_kh || r.khach_hang_id || '';
    const dien_thoai = r.khach_hang?.dien_thoai || '';
    const dia_chi = r.khach_hang?.dia_chi || '';
    const ngay_xuat = r.ngay_xuat || '';
    const total = parseFloat(r.total || 0);
    const so_tien_no = (typeof r.total_no === 'number' && r.total_no > 0) ? r.total_no : total;

    let modalEl = document.getElementById('quick-phieu-thu-modal');
    if (!modalEl) {
        modalEl = document.createElement('div');
        modalEl.id = 'quick-phieu-thu-modal';
        modalEl.className = 'modal fade';
        modalEl.tabIndex = -1;
        modalEl.style.zIndex = '1085';
        document.body.appendChild(modalEl);

        modalEl.addEventListener('show.bs.modal', function () {
            setTimeout(() => {
                const backdrops = document.querySelectorAll('.modal-backdrop');
                if (backdrops.length > 1) {
                    backdrops[backdrops.length - 1].style.zIndex = '1080';
                }
            }, 10);
        });
    }

    const todayStr = (typeof todayISO === 'function') ? todayISO() : new Date().toISOString().split('T')[0];
    const defaultNote = `Thanh toán đơn hàng ${so_phieu}${ngay_xuat ? ' ngày ' + formatDate(ngay_xuat) : ''}`;

    modalEl.innerHTML = `
        <div class="modal-dialog modal-dialog-centered">
            <div class="modal-content border-success shadow-lg">
                <div class="modal-header bg-success text-white py-2 px-3">
                    <h6 class="modal-title fw-bold mb-0">
                        <i class="bi bi-cash-coin me-2"></i>Tạo Phiếu Thu Nhanh
                    </h6>
                    <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                </div>
                <div class="modal-body p-3">
                    <!-- Thẻ tóm tắt thông tin phiếu xuất -->
                    <div class="p-2 mb-3 rounded border border-success border-opacity-25 bg-success bg-opacity-10">
                        <div class="d-flex justify-content-between align-items-center mb-1">
                            <span class="badge bg-danger font-monospace fs-6">${escapeHtml(so_phieu)}</span>
                            <span class="small text-muted">Ngày xuất: <strong>${formatDate(ngay_xuat)}</strong></span>
                        </div>
                        <div class="fw-semibold text-dark fs-6 mt-1">
                            <i class="bi bi-person-fill text-success me-1"></i>${escapeHtml(ten_kh)}
                            ${dien_thoai ? `<span class="badge bg-white text-secondary border ms-2 font-monospace">📞 ${escapeHtml(dien_thoai)}</span>` : ''}
                        </div>
                        <div class="d-flex justify-content-between align-items-baseline mt-2 pt-2 border-top border-success border-opacity-25">
                            <span class="small text-muted fw-semibold">Số tiền cần thu:</span>
                            <span class="fs-5 fw-bold text-success font-monospace">${formatVND(so_tien_no)}</span>
                        </div>
                    </div>

                    <form id="quick-phieu-thu-form" onsubmit="submitQuickPhieuThu(event, '${escapeHtml(so_phieu)}')">
                        <div class="row g-2">
                            <div class="col-6">
                                <label class="form-label form-label-compact">Hình Thức Nhận Tiền <span class="text-danger">*</span></label>
                                <select class="form-select form-select-sm" id="qpt-loai-quy">
                                    <option value="TIEN_MAT" selected>Tiền mặt (Mã TMxxxx)</option>
                                    <option value="NGAN_HANG">Tiền gửi ngân hàng (Mã TGxxxx)</option>
                                </select>
                            </div>
                            <div class="col-6">
                                <label class="form-label form-label-compact">Ngày Thu <span class="text-danger">*</span></label>
                                <input type="date" class="form-control form-control-sm" id="qpt-ngay" value="${todayStr}" required>
                            </div>

                            <div class="col-12">
                                <label class="form-label form-label-compact">Số Tiền Thu Thực Tế (VNĐ) <span class="text-danger">*</span></label>
                                <input type="number" class="form-control form-control-sm fs-5 fw-bold text-success" id="qpt-so-tien" value="${so_tien_no}" min="1" step="1000" required>
                                <small class="text-muted" style="font-size: 0.75rem;">Mặc định điền toàn bộ số tiền còn nợ của phiếu xuất này.</small>
                            </div>

                            <div class="col-12">
                                <label class="form-label form-label-compact">Nội Dung / Lý Do Thu Tiền</label>
                                <input type="text" class="form-control form-control-sm" id="qpt-ghi-chu" value="${escapeHtml(defaultNote)}">
                            </div>
                        </div>

                        <div class="d-flex justify-content-between align-items-center mt-3 pt-2 border-top">
                            <button type="button" class="btn btn-secondary btn-sm" data-bs-dismiss="modal">Hủy</button>
                            <button type="submit" class="btn btn-success btn-sm px-4 fw-bold shadow-sm" id="btn-submit-quick-phieu-thu">
                                <i class="bi bi-check2-circle me-1"></i>Xác Nhận Tạo Phiếu Thu
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    `;

    const bsModal = new bootstrap.Modal(modalEl);
    bsModal.show();
}

/**
 * Xử lý lưu phiếu thu nhanh
 */
async function submitQuickPhieuThu(event, so_phieu) {
    if (event) event.preventDefault();
    const btn = document.getElementById('btn-submit-quick-phieu-thu');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Đang tạo phiếu thu...';
    }

    try {
        const r = window.currentReceiptDetail || {};
        const loai_quy = document.getElementById('qpt-loai-quy')?.value || 'TIEN_MAT';
        const ngay = document.getElementById('qpt-ngay')?.value || '';
        const so_tien = parseFloat(document.getElementById('qpt-so-tien')?.value || 0);
        const ghi_chu = document.getElementById('qpt-ghi-chu')?.value?.trim() || '';

        const ten_kh = r.khach_hang?.ten_kh || r.khach_hang_id || '';
        const dien_thoai = r.khach_hang?.dien_thoai || '';
        const dia_chi = r.khach_hang?.dia_chi || '';
        const kh_id = r.khach_hang?.id || '';

        if (!ten_kh) {
            showToast('Không có thông tin tên khách hàng!', 'error');
            return;
        }
        if (!so_tien || so_tien <= 0) {
            showToast('Số tiền thu phải lớn hơn 0!', 'warning');
            return;
        }

        const payload = {
            loai_quy: loai_quy,
            ngay: ngay,
            doi_tuong: ten_kh,
            dien_thoai: dien_thoai || '0000000000',
            dia_chi: dia_chi,
            khach_hang_id: kh_id,
            so_tien: so_tien,
            phieu_lien_quan: so_phieu,
            ghi_chu: ghi_chu
        };

        const res = await apiRequest('/api/phieu-thu', 'POST', payload);
        if (res && res.success) {
            const maPhieu = res.data?.ma_phieu || '';
            showToast(`Tạo phiếu thu ${maPhieu} thành công!`, 'success');

            // Đóng modal tạo nhanh
            const modalEl = document.getElementById('quick-phieu-thu-modal');
            if (modalEl) {
                const bsModal = bootstrap.Modal.getInstance(modalEl);
                if (bsModal) bsModal.hide();
            }

            // Cập nhật trạng thái phiếu xuất hiện tại
            if (window.currentReceiptDetail) {
                window.currentReceiptDetail.da_thanh_toan = true;
                window.currentReceiptDetail.ma_phieu_thu = maPhieu;
                const oldNo = window.currentReceiptDetail.total_no || window.currentReceiptDetail.total || 0;
                window.currentReceiptDetail.total_no = Math.max(0, oldNo - so_tien);
            }

            // Đổi nút Tạo Phiếu Thu Nhanh thành nút Đã có phiếu thu (tối màu, disabled)
            const qBtn = document.getElementById('btn-quick-phieu-thu');
            if (qBtn) {
                qBtn.className = "btn btn-secondary btn-sm opacity-50 text-nowrap";
                qBtn.disabled = true;
                qBtn.style.cursor = "not-allowed";
                qBtn.onclick = null;
                qBtn.title = `Phiếu xuất này đã có phiếu thu ${maPhieu}`;
                qBtn.innerHTML = `<i class="bi bi-check2-all me-1"></i>Đã có phiếu thu (${escapeHtml(maPhieu)})`;
            }

            // Gọi callback cập nhật danh sách nền (nếu có)
            if (typeof window.receiptDetailOnUpdated === 'function') {
                window.receiptDetailOnUpdated();
            }
            if (typeof loadReceipts === 'function') {
                loadReceipts();
            }
            broadcastDataUpdate('DEBT_UPDATED');
        }
    } catch (e) {
        showToast('Lỗi tạo phiếu thu: ' + e.message, 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="bi bi-check2-circle me-1"></i>Xác Nhận Tạo Phiếu Thu';
        }
    }
}

/**
 * Mở modal tạo phiếu chi nhanh trực tiếp từ Chi Tiết Phiếu Nhập
 */
async function openQuickPhieuChiModal(so_phieu) {
    let r = window.currentReceiptDetail;
    if (!r || r.so_phieu !== so_phieu) {
        try {
            const data = await apiRequest(`/api/nhap-hang/${encodeURIComponent(so_phieu)}`);
            if (data && data.success) {
                r = data;
                window.currentReceiptDetail = data;
            }
        } catch (e) {
            showToast('Không thể tải chi tiết phiếu nhập: ' + e.message, 'error');
            return;
        }
    }

    if (!r) {
        showToast('Không tìm thấy thông tin phiếu nhập', 'error');
        return;
    }

    const ten_ncc = r.nha_cung_cap?.ten_ncc || r.nha_cung_cap_id || '';
    const dien_thoai = r.nha_cung_cap?.dien_thoai || '';
    const dia_chi = r.nha_cung_cap?.dia_chi || '';
    const ngay_nhap = r.ngay_nhap || '';
    const total = parseFloat(r.total || 0);
    const so_tien_no = (typeof r.total_no === 'number' && r.total_no > 0) ? r.total_no : total;

    let modalEl = document.getElementById('quick-phieu-chi-modal');
    if (!modalEl) {
        modalEl = document.createElement('div');
        modalEl.id = 'quick-phieu-chi-modal';
        modalEl.className = 'modal fade';
        modalEl.tabIndex = -1;
        modalEl.style.zIndex = '1085';
        document.body.appendChild(modalEl);

        modalEl.addEventListener('show.bs.modal', function () {
            setTimeout(() => {
                const backdrops = document.querySelectorAll('.modal-backdrop');
                if (backdrops.length > 1) {
                    backdrops[backdrops.length - 1].style.zIndex = '1080';
                }
            }, 10);
        });
    }

    const todayStr = (typeof todayISO === 'function') ? todayISO() : new Date().toISOString().split('T')[0];
    const defaultNote = `Thanh toán tiền nhập hàng ${so_phieu}${ngay_nhap ? ' ngày ' + formatDate(ngay_nhap) : ''}`;

    modalEl.innerHTML = `
        <div class="modal-dialog modal-dialog-centered">
            <div class="modal-content border-danger shadow-lg">
                <div class="modal-header bg-danger text-white py-2 px-3">
                    <h6 class="modal-title fw-bold mb-0">
                        <i class="bi bi-cash-stack me-2"></i>Tạo Phiếu Chi Nhanh
                    </h6>
                    <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                </div>
                <div class="modal-body p-3">
                    <!-- Thẻ tóm tắt thông tin phiếu nhập -->
                    <div class="p-2 mb-3 rounded border border-danger border-opacity-25 bg-danger bg-opacity-10">
                        <div class="d-flex justify-content-between align-items-center mb-1">
                            <span class="badge bg-primary font-monospace fs-6">${escapeHtml(so_phieu)}</span>
                            <span class="small text-muted">Ngày nhập: <strong>${formatDate(ngay_nhap)}</strong></span>
                        </div>
                        <div class="fw-semibold text-dark fs-6 mt-1">
                            <i class="bi bi-truck text-danger me-1"></i>${escapeHtml(ten_ncc)}
                            ${dien_thoai ? `<span class="badge bg-white text-secondary border ms-2 font-monospace">📞 ${escapeHtml(dien_thoai)}</span>` : ''}
                        </div>
                        <div class="d-flex justify-content-between align-items-baseline mt-2 pt-2 border-top border-danger border-opacity-25">
                            <span class="small text-muted fw-semibold">Số tiền cần chi trả:</span>
                            <span class="fs-5 fw-bold text-danger font-monospace">${formatVND(so_tien_no)}</span>
                        </div>
                    </div>

                    <form id="quick-phieu-chi-form" onsubmit="submitQuickPhieuChi(event, '${escapeHtml(so_phieu)}')">
                        <div class="row g-2">
                            <div class="col-6">
                                <label class="form-label form-label-compact">Nguồn Tiền Chi <span class="text-danger">*</span></label>
                                <select class="form-select form-select-sm" id="qpc-loai-quy">
                                    <option value="TIEN_MAT" selected>Tiền mặt (Mã CMxxxx)</option>
                                    <option value="NGAN_HANG">Tiền gửi ngân hàng (Mã CGxxxx)</option>
                                </select>
                            </div>
                            <div class="col-6">
                                <label class="form-label form-label-compact">Ngày Chi <span class="text-danger">*</span></label>
                                <input type="date" class="form-control form-control-sm" id="qpc-ngay" value="${todayStr}" required>
                            </div>

                            <div class="col-12">
                                <label class="form-label form-label-compact">Số Tiền Chi Thực Tế (VNĐ) <span class="text-danger">*</span></label>
                                <input type="number" class="form-control form-control-sm fs-5 fw-bold text-danger" id="qpc-so-tien" value="${so_tien_no}" min="1" step="1000" required>
                                <small class="text-muted" style="font-size: 0.75rem;">Mặc định điền toàn bộ số tiền còn nợ của phiếu nhập này.</small>
                            </div>

                            <div class="col-12">
                                <label class="form-label form-label-compact">Nội Dung / Lý Do Chi Tiền</label>
                                <input type="text" class="form-control form-control-sm" id="qpc-ghi-chu" value="${escapeHtml(defaultNote)}">
                            </div>
                        </div>

                        <div class="d-flex justify-content-between align-items-center mt-3 pt-2 border-top">
                            <button type="button" class="btn btn-secondary btn-sm" data-bs-dismiss="modal">Hủy</button>
                            <button type="submit" class="btn btn-danger btn-sm px-4 fw-bold shadow-sm" id="btn-submit-quick-phieu-chi">
                                <i class="bi bi-check2-circle me-1"></i>Xác Nhận Tạo Phiếu Chi
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    `;

    const bsModal = new bootstrap.Modal(modalEl);
    bsModal.show();
}

/**
 * Xử lý lưu phiếu chi nhanh
 */
async function submitQuickPhieuChi(event, so_phieu) {
    if (event) event.preventDefault();
    const btn = document.getElementById('btn-submit-quick-phieu-chi');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Đang tạo phiếu chi...';
    }

    try {
        const r = window.currentReceiptDetail || {};
        const loai_quy = document.getElementById('qpc-loai-quy')?.value || 'TIEN_MAT';
        const ngay = document.getElementById('qpc-ngay')?.value || '';
        const so_tien = parseFloat(document.getElementById('qpc-so-tien')?.value || 0);
        const ghi_chu = document.getElementById('qpc-ghi-chu')?.value?.trim() || '';

        const ten_ncc = r.nha_cung_cap?.ten_ncc || r.nha_cung_cap_id || '';
        const dien_thoai = r.nha_cung_cap?.dien_thoai || '';
        const dia_chi = r.nha_cung_cap?.dia_chi || '';
        const ncc_id = r.nha_cung_cap?.id || '';

        if (!ten_ncc) {
            showToast('Không có thông tin tên nhà cung cấp!', 'error');
            return;
        }
        if (!so_tien || so_tien <= 0) {
            showToast('Số tiền chi phải lớn hơn 0!', 'warning');
            return;
        }

        const payload = {
            loai_quy: loai_quy,
            ngay: ngay,
            doi_tuong: ten_ncc,
            dien_thoai: dien_thoai,
            dia_chi: dia_chi,
            nha_cung_cap_id: ncc_id,
            so_tien: so_tien,
            phieu_lien_quan: so_phieu,
            ghi_chu: ghi_chu
        };

        const res = await apiRequest('/api/phieu-chi', 'POST', payload);
        if (res && res.success) {
            const maPhieu = res.data?.ma_phieu || '';
            showToast(`Tạo phiếu chi ${maPhieu} thành công!`, 'success');

            // Đóng modal tạo nhanh
            const modalEl = document.getElementById('quick-phieu-chi-modal');
            if (modalEl) {
                const bsModal = bootstrap.Modal.getInstance(modalEl);
                if (bsModal) bsModal.hide();
            }

            // Cập nhật trạng thái phiếu nhập hiện tại
            if (window.currentReceiptDetail) {
                window.currentReceiptDetail.da_thanh_toan = true;
                window.currentReceiptDetail.ma_phieu_chi = maPhieu;
                const oldNo = window.currentReceiptDetail.total_no || window.currentReceiptDetail.total || 0;
                window.currentReceiptDetail.total_no = Math.max(0, oldNo - so_tien);
            }

            // Đổi nút Tạo Phiếu Chi Nhanh thành nút Đã có phiếu chi
            const qBtn = document.getElementById('btn-quick-phieu-chi');
            if (qBtn) {
                qBtn.className = "btn btn-secondary btn-sm opacity-50 text-nowrap";
                qBtn.disabled = true;
                qBtn.style.cursor = "not-allowed";
                qBtn.onclick = null;
                qBtn.title = `Phiếu nhập này đã có phiếu chi ${maPhieu}`;
                qBtn.innerHTML = `<i class="bi bi-check2-all me-1"></i>Đã có phiếu chi (${escapeHtml(maPhieu)})`;
            }

            // Gọi callback cập nhật danh sách nền (nếu có)
            if (typeof window.receiptDetailOnUpdated === 'function') {
                window.receiptDetailOnUpdated();
            }
            if (typeof loadReceipts === 'function') {
                loadReceipts();
            }
            broadcastDataUpdate('DEBT_UPDATED');
        }
    } catch (e) {
        showToast('Lỗi tạo phiếu chi: ' + e.message, 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="bi bi-check2-circle me-1"></i>Xác Nhận Tạo Phiếu Chi';
        }
    }
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

// ── Đa Kênh Đồng Bộ Real-time (BroadcastChannel & Iframe Message) ──────────

function broadcastDataUpdate(type = 'DATA_UPDATED') {
    const payload = { type: type, timestamp: Date.now() };
    try {
        if (typeof BroadcastChannel !== 'undefined') {
            const bc = new BroadcastChannel('inventory_sync');
            bc.postMessage(payload);
            bc.postMessage({ type: 'PRODUCTS_UPDATED', timestamp: Date.now() });
            bc.postMessage({ type: 'DEBT_UPDATED', timestamp: Date.now() });
        }
    } catch (e) {}

    try {
        if (window.parent && window.parent !== window) {
            window.parent.postMessage(payload, '*');
            window.parent.postMessage({ type: 'PRODUCTS_UPDATED', timestamp: Date.now() }, '*');
            window.parent.postMessage({ type: 'DEBT_UPDATED', timestamp: Date.now() }, '*');
        }
    } catch (e) {}

    // Dispatch trực tiếp đến tất cả tab iframe trong window hiện tại nếu là parent
    try {
        document.querySelectorAll('.tab-frame').forEach(f => {
            try {
                f.contentWindow.postMessage(payload, '*');
                f.contentWindow.postMessage({ type: 'PRODUCTS_UPDATED', timestamp: Date.now() }, '*');
                f.contentWindow.postMessage({ type: 'DEBT_UPDATED', timestamp: Date.now() }, '*');
            } catch (err) {}
        });
    } catch (e) {}
}
window.broadcastDataUpdate = broadcastDataUpdate;

// Chuyển tiếp tín hiệu đồng bộ giữa các tab iframe
window.addEventListener('message', (e) => {
    if (e.data && (e.data.type === 'PRODUCTS_UPDATED' || e.data.type === 'DATA_UPDATED' || e.data.type === 'DEBT_UPDATED')) {
        document.querySelectorAll('.tab-frame').forEach(f => {
            try {
                f.contentWindow.postMessage(e.data, '*');
            } catch (err) {}
        });
    }
});

try {
    const syncChannel = new BroadcastChannel('inventory_sync');
    syncChannel.onmessage = (e) => {
        if (e.data && (e.data.type === 'PRODUCTS_UPDATED' || e.data.type === 'DATA_UPDATED' || e.data.type === 'DEBT_UPDATED')) {
            document.querySelectorAll('.tab-frame').forEach(f => {
                try {
                    f.contentWindow.postMessage(e.data, '*');
                } catch (err) {}
            });
        }
    };
} catch (err) {}

