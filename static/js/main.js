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

// ── Universal Currency Input Cleaner (Tự động bỏ dấu chấm / phẩy khi nhập tiền) ───

function parseCurrencyValue(val) {
    if (val === null || val === undefined || val === '') return 0;
    // Bỏ tất cả dấu chấm, phẩy, ký hiệu đ và khoảng trắng
    const cleanStr = String(val).replace(/\./g, '').replace(/,/g, '').replace(/[^\d.-]/g, '').trim();
    return parseFloat(cleanStr) || 0;
}
window.parseCurrencyValue = parseCurrencyValue;
window.parseMoney = parseCurrencyValue;

function isMoneyInputElement(el) {
    if (!el || el.tagName !== 'INPUT') return false;
    const type = (el.type || '').toLowerCase();
    if (type === 'button' || type === 'submit' || type === 'checkbox' || type === 'radio' || type === 'file' || type === 'date') return false;

    const id = (el.id || '').toLowerCase();
    const name = (el.name || '').toLowerCase();
    const cls = (el.className || '').toLowerCase();
    const placeholder = (el.placeholder || '').toLowerCase();

    // Bỏ qua các trường số lượng, ngày tháng, sđt, text khác
    if (id.includes('so_luong') || id.startsWith('sl-') || id.includes('ton_kho') || id.includes('ton-kho') || 
        id.includes('ngay') || id.includes('date') || id.includes('phone') || id.includes('sdt') || id.includes('user') || id.includes('pass')) {
        return false;
    }
    if (name.includes('so_luong') || name.includes('ton_kho') || name.includes('ngay') || name.includes('sdt')) {
        return false;
    }

    if (el.hasAttribute('data-money') || el.hasAttribute('data-currency') || cls.includes('input-money') || cls.includes('input-currency')) {
        return true;
    }

    const moneyKeywords = [
        'so-tien', 'so_tien', 'sotien',
        'gia', 'don_gia', 'don-gia', 'dongia',
        'tien_mat', 'tien-mat', 'tienmat',
        'tien_gui', 'tien-gui', 'tiengui',
        'gia_nhap', 'gia-nhap', 'gianhap',
        'gia_ban', 'gia-ban', 'giaban',
        'thanh_tien', 'thanh-tien', 'thanhtien',
        'khach_tra', 'khach-tra', 'khachtra',
        'receipt-row-gia', 'batch-gia', 'cfg-tien'
    ];

    for (let kw of moneyKeywords) {
        if (id.includes(kw) || name.includes(kw) || cls.includes(kw)) {
            return true;
        }
    }

    if (placeholder.includes('đơn giá') || placeholder.includes('giá') || placeholder.includes('số tiền') || placeholder.includes('tiền')) {
        return true;
    }

    return false;
}
window.isMoneyInputElement = isMoneyInputElement;

function stripDotsFromMoneyInput(input) {
    if (!input || typeof input.value !== 'string') return;
    const oldVal = input.value;
    if (oldVal.includes('.') || oldVal.includes(',') || /[^\d-]/.test(oldVal)) {
        // Tự động bỏ tất cả dấu chấm, phẩy, ký hiệu đ và khoảng trắng
        const newVal = oldVal.replace(/\./g, '').replace(/,/g, '').replace(/[^\d-]/g, '').trim();
        if (newVal !== oldVal) {
            input.value = newVal;
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
        }
    }
}
window.stripDotsFromMoneyInput = stripDotsFromMoneyInput;

// Cho phép người dùng gõ thoải mái dấu '.' và ',' (ví dụ: 50.000.000).
// Hệ thống sẽ tự động lọc bỏ dấu chấm/phẩy SAU ĐÓ: khi rời khỏi ô (blur), khi thay đổi (change), hoặc khi ấn Enter / submit.

// 1. Khi người dùng rời khỏi ô (blur): tự động lọc sạch dấu chấm, phẩy thành số nguyên thuần
document.addEventListener('blur', function (e) {
    const target = e.target;
    if (isMoneyInputElement(target)) {
        stripDotsFromMoneyInput(target);
    }
}, true);

// 2. Khi người dùng bấm Enter trong ô tiền
document.addEventListener('keydown', function (e) {
    const target = e.target;
    if (isMoneyInputElement(target) && e.key === 'Enter') {
        stripDotsFromMoneyInput(target);
    }
}, true);

// 3. Khi sự kiện change kích hoạt
document.addEventListener('change', function (e) {
    const target = e.target;
    if (isMoneyInputElement(target)) {
        stripDotsFromMoneyInput(target);
    }
}, true);

// 4. Khi paste chuỗi có kèm chữ (ví dụ 50.000.000 đ), lọc bỏ chữ nhưng vẫn giữ dấu chấm để người dùng thấy 50.000.000
document.addEventListener('paste', function (e) {
    const target = e.target;
    if (isMoneyInputElement(target)) {
        const clipboardData = e.clipboardData || window.clipboardData;
        if (clipboardData) {
            const pastedText = clipboardData.getData('text');
            if (pastedText && /[^\d.,\s-]/.test(pastedText)) {
                e.preventDefault();
                const clean = pastedText.replace(/[^\d.,-]/g, '').trim();
                const val = target.value || '';
                const start = target.selectionStart || 0;
                const end = target.selectionEnd || 0;
                target.value = val.slice(0, start) + clean + val.slice(end);
                const newPos = start + clean.length;
                try { target.setSelectionRange(newPos, newPos); } catch (err) {}
                target.dispatchEvent(new Event('input', { bubbles: true }));
            }
        }
    }
}, true);

// 5. Khi submit bất kỳ form nào: lọc sạch tất cả ô tiền trước khi gửi
document.addEventListener('submit', function (e) {
    try {
        const form = e.target;
        if (form && form.querySelectorAll) {
            form.querySelectorAll('input').forEach(inp => {
                if (isMoneyInputElement(inp)) {
                    stripDotsFromMoneyInput(inp);
                }
            });
        }
    } catch (err) {}
}, true);

// Chuyển đổi các ô type="number" là ô tiền sang type="text" inputmode="numeric" để trình duyệt không chặn gõ/paste
function normalizeMoneyInputTypes(root = document) {
    try {
        const inputs = (root || document).querySelectorAll('input');
        inputs.forEach(inp => {
            if (isMoneyInputElement(inp)) {
                if (inp.type === 'number') {
                    inp.type = 'text';
                    inp.setAttribute('inputmode', 'numeric');
                    inp.setAttribute('autocomplete', 'off');
                }
            }
        });
    } catch (err) {}
}

document.addEventListener('DOMContentLoaded', function () {
    normalizeMoneyInputTypes(document);
    // Observer theo dõi các input được render động sau này
    const observer = new MutationObserver(function (mutations) {
        mutations.forEach(m => {
            m.addedNodes.forEach(node => {
                if (node.nodeType === 1) {
                    normalizeMoneyInputTypes(node);
                }
            });
        });
    });
    if (document.body) {
        observer.observe(document.body, { childList: true, subtree: true });
    }
});

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

// ── Settigation V2 Sidebar Quick Search ──────────────────────────────────────

function focusSidebarSearch() {
    if (document.body.classList.contains('sidebar-collapsed')) {
        if (typeof TabManager !== 'undefined' && TabManager.toggleSidebar) {
            TabManager.toggleSidebar();
        }
    }
    setTimeout(() => {
        const searchInput = document.getElementById('sidebar-menu-search');
        if (searchInput) {
            searchInput.focus();
            searchInput.select();
        }
    }, 50);
}

function filterSidebarMenu(query) {
    const q = (query || '').trim().toLowerCase();
    const links = document.querySelectorAll('.sidebar-nav .sidebar-link');
    const labels = document.querySelectorAll('.sidebar-nav .sidebar-label');
    const groups = document.querySelectorAll('.sidebar-nav .sidebar-group-content');

    if (!q) {
        // Khôi phục hiển thị ban đầu
        links.forEach(el => el.style.display = '');
        labels.forEach(el => el.style.display = '');
        groups.forEach(el => el.style.display = '');
        restoreSidebarGroupStates();
        return;
    }

    // Lọc các liên kết trong menu
    links.forEach(link => {
        const text = (link.textContent || '').toLowerCase();
        if (text.includes(q)) {
            link.style.display = '';
        } else {
            link.style.display = 'none';
        }
    });

    // Xử lý các nhóm accordion: nếu có item con khớp thì tự bung mở
    groups.forEach(group => {
        const visibleLinks = Array.from(group.querySelectorAll('.sidebar-link')).filter(el => el.style.display !== 'none');
        const label = group.previousElementSibling;
        if (visibleLinks.length > 0) {
            group.style.display = 'block';
            group.classList.remove('collapsed');
            if (label && label.classList.contains('collapsible')) {
                label.style.display = '';
                label.classList.remove('collapsed');
            }
        } else {
            group.style.display = 'none';
            if (label && label.classList.contains('collapsible')) {
                label.style.display = 'none';
            }
        }
    });

    // Xử lý các label tiêu đề phân đoạn
    labels.forEach(label => {
        if (!label.classList.contains('collapsible')) {
            let next = label.nextElementSibling;
            let hasVisible = false;
            while (next && !next.classList.contains('sidebar-label')) {
                if (next.classList.contains('sidebar-link') && next.style.display !== 'none') {
                    hasVisible = true;
                    break;
                }
                next = next.nextElementSibling;
            }
            label.style.display = hasVisible ? '' : 'none';
        }
    });
}

// Phím tắt mở nhanh Settigation Quick Search ('/' hoặc 'Ctrl + K')
document.addEventListener('keydown', function(e) {
    const target = e.target;
    const tag = (target && target.tagName) ? target.tagName.toUpperCase() : '';
    const isEditing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (target && target.isContentEditable);

    // Thoát search và xóa filter khi nhấn Escape trong ô tìm kiếm
    if (e.key === 'Escape') {
        const searchInput = document.getElementById('sidebar-menu-search');
        if (searchInput && document.activeElement === searchInput) {
            searchInput.value = '';
            filterSidebarMenu('');
            searchInput.blur();
            return;
        }
    }

    if (isEditing) return;

    if (e.key === '/' || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k')) {
        const searchInput = document.getElementById('sidebar-menu-search');
        if (searchInput) {
            e.preventDefault();
            focusSidebarSearch();
        }
    }
});

// ── Toast Notifications ───────────────────────────────────────────────────────

function showToast(message, type = 'success', duration = 3200) {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        document.body.appendChild(container);
    }

    // Chống trùng lặp nội dung đang hiển thị
    const activeTexts = container.querySelectorAll('.toast-text');
    for (let s of activeTexts) {
        if (s.innerHTML === message || s.textContent.trim() === message) return;
    }

    // Giới hạn tối đa 3 toast cùng lúc để không choáng ngợp màn hình (nhỏ nhắn, gọn gàng)
    const existing = container.querySelectorAll('.toast-msg');
    if (existing.length >= 3) {
        existing[0].remove();
    }

    const icons = {
        success: 'bi-check-circle-fill',
        error: 'bi-x-circle-fill',
        warning: 'bi-exclamation-triangle-fill',
        info: 'bi-info-circle-fill'
    };

    const toast = document.createElement('div');
    toast.className = `toast-msg toast-${type}`;
    toast.innerHTML = `
        <i class="bi ${icons[type] || icons.info} toast-icon"></i>
        <div class="toast-text">${message}</div>
        <button type="button" class="toast-close-btn" aria-label="Đóng" onclick="this.closest('.toast-msg')?.remove()">&times;</button>
    `;
    container.appendChild(toast);

    let dismissed = false;
    const dismiss = () => {
        if (dismissed) return;
        dismissed = true;
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(-12px) scale(0.95)';
        setTimeout(() => toast.remove(), 220);
    };

    setTimeout(dismiss, duration);
}
window.showToast = showToast;

// ── Debounce & Throttle Helpers ──────────────────────────────────────────────

/**
 * Trì hoãn thực thi hàm cho đến khi người dùng ngừng thao tác trong khoảng delay (ms)
 */
function debounce(fn, delay = 250) {
    let timer = null;
    return function (...args) {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
            fn.apply(this, args);
            timer = null;
        }, delay);
    };
}
window.debounce = debounce;

/**
 * Giới hạn tần suất gọi hàm không quá 1 lần trong khoảng limit (ms)
 */
function throttle(fn, limit = 300) {
    let inThrottle = false;
    return function (...args) {
        if (!inThrottle) {
            fn.apply(this, args);
            inThrottle = true;
            setTimeout(() => { inThrottle = false; }, limit);
        }
    };
}
window.throttle = throttle;

/**
 * Chống double-click/spam click và hiển thị spinner cho nút khi đang chạy hàm async
 */
async function withButtonLoading(btn, asyncFn, loadingText = null) {
    if (!btn || btn.disabled) return;
    const originalHtml = btn.innerHTML;
    const originalDisabled = btn.disabled;
    btn.disabled = true;
    if (loadingText) {
        btn.innerHTML = `<span class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>${loadingText}`;
    } else {
        btn.innerHTML = `<span class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>${originalHtml}`;
    }
    try {
        return await asyncFn();
    } finally {
        btn.disabled = originalDisabled;
        btn.innerHTML = originalHtml;
    }
}
window.withButtonLoading = withButtonLoading;

// ── API Helper (Timeout & Safe Error Handling) ────────────────────────────────

async function apiRequest(url, method = 'GET', body = null, timeoutMs = 25000) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const options = {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        signal: controller.signal
    };
    if (body) options.body = JSON.stringify(body);

    try {
        const res = await fetch(url, options);
        clearTimeout(timeoutId);

        let data = null;
        const contentType = res.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
            try {
                data = await res.json();
            } catch (jsonErr) {
                data = null;
            }
        } else {
            const text = await res.text();
            data = { detail: text || `Phản hồi không hợp lệ (${res.status})` };
        }

        if (!res.ok) {
            let msg = 'Lỗi không xác định';
            if (data) {
                if (Array.isArray(data.detail)) {
                    msg = data.detail.map(d => (typeof d === 'object' ? (d.msg || JSON.stringify(d)) : d)).join('; ');
                } else if (typeof data.detail === 'string') {
                    msg = data.detail;
                } else if (data.message) {
                    msg = data.message;
                } else {
                    msg = `Lỗi máy chủ (${res.status})`;
                }
            }
            throw new Error(msg);
        }
        return data;
    } catch (err) {
        clearTimeout(timeoutId);
        if (err.name === 'AbortError') {
            throw new Error('Yêu cầu bị quá thời gian xử lý (Timeout). Vui lòng kiểm tra lại mạng hoặc thử lại!');
        }
        if (err.message && err.message.includes('Failed to fetch')) {
            throw new Error('Không thể kết nối đến máy chủ. Vui lòng kiểm tra lại đường truyền internet hoặc thử lại sau!');
        }
        throw err;
    }
}
window.apiRequest = apiRequest;

function removeVietnameseTones(str) {
    if (!str) return '';
    str = String(str).toLowerCase();
    str = str.replace(/à|á|ạ|ả|ã|â|ầ|ấ|ậ|ẩ|ẫ|ă|ằ|ắ|ặ|ẳ|ẵ/g, "a");
    str = str.replace(/è|é|ẹ|ẻ|ẽ|ê|ề|ế|ệ|ể|ễ/g, "e");
    str = str.replace(/ì|í|ị|ỉ|ĩ/g, "i");
    str = str.replace(/ò|ó|ọ|ỏ|õ|ô|ồ|ố|ộ|ổ|ỗ|ơ|ờ|ớ|ợ|ở|ỡ/g, "o");
    str = str.replace(/ù|ú|ụ|ủ|ũ|ư|ừ|ứ|ự|ử|ữ/g, "u");
    str = str.replace(/ỳ|ý|ỵ|ỷ|ỹ/g, "y");
    str = str.replace(/đ/g, "d");
    str = str.replace(/\u0300|\u0301|\u0303|\u0309|\u0323/g, "");
    str = str.replace(/\u02C6|\u0306|\u031B/g, "");
    return str.trim();
}
window.removeVietnameseTones = removeVietnameseTones;

function createSearchMatcher(query) {
    if (!query) return () => true;
    const qRaw = String(query).toLowerCase().trim();
    if (!qRaw) return () => true;
    const qNorm = removeVietnameseTones(qRaw);
    const rawTokens = qRaw.split(/\s+/).filter(Boolean);
    const normTokens = qNorm.split(/\s+/).filter(Boolean);
    if (!rawTokens.length) return () => true;

    return function (targetText) {
        if (!targetText) return false;
        const tRaw = String(targetText).toLowerCase();
        const tNorm = removeVietnameseTones(tRaw);
        return rawTokens.every((rTok, idx) => {
            const nTok = normTokens[idx] || rTok;
            return tRaw.includes(rTok) || tNorm.includes(nTok);
        });
    };
}
window.createSearchMatcher = createSearchMatcher;

function matchSearchKeywords(targetText, query) {
    if (!query) return true;
    const matcher = createSearchMatcher(query);
    return matcher(targetText);
}
window.matchSearchKeywords = matchSearchKeywords;

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
    try {
        const modal = bootstrap.Modal.getInstance(el) || bootstrap.Modal.getOrCreateInstance(el);
        if (modal) {
            modal.hide();
        }
    } catch (e) {
        console.warn('closeModal error:', e);
    }
    el.classList.remove('show');
    el.setAttribute('aria-hidden', 'true');
    el.removeAttribute('aria-modal');
    setTimeout(cleanupModalBackdrops, 150);
}

function syncModalScrollLock() {
    const openModals = document.querySelectorAll('.modal.show');
    if (openModals.length > 0) {
        document.documentElement.classList.add('modal-open');
        document.body.classList.add('modal-open');
        document.documentElement.style.overflow = 'hidden';
        document.body.style.overflow = 'hidden';
    } else {
        document.documentElement.classList.remove('modal-open');
        document.body.classList.remove('modal-open');
        document.documentElement.style.removeProperty('overflow');
        document.body.style.removeProperty('overflow');
        document.body.style.removeProperty('padding-right');
    }
}

function cleanupModalBackdrops() {
    const openModals = document.querySelectorAll('.modal.show');
    if (openModals.length === 0) {
        document.querySelectorAll('.modal-backdrop').forEach(b => b.remove());
        syncModalScrollLock();
    } else {
        const backdrops = document.querySelectorAll('.modal-backdrop');
        if (backdrops.length > openModals.length) {
            for (let i = openModals.length; i < backdrops.length; i++) {
                backdrops[i].remove();
            }
        }
    }
}

// 1. Khóa cuộn trang nền khi mở bất kỳ modal nào
document.addEventListener('show.bs.modal', function () {
    syncModalScrollLock();
});
document.addEventListener('shown.bs.modal', function () {
    syncModalScrollLock();
});

// 2. Khôi phục cuộn trang khi đóng modal
document.addEventListener('hidden.bs.modal', function () {
    setTimeout(cleanupModalBackdrops, 80);
});

// 3. Hỗ trợ lăn chuột mượt mà bên trong modal và chỉ chặn khi đã chạm kịch trần/kịch đáy
function canElementScrollY(el, deltaY) {
    if (!el || el === document || el === document.documentElement || el === document.body) return false;
    const style = window.getComputedStyle(el);
    const overflowY = style.overflowY;
    const isScrollable = (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay') ||
                         (el.classList && el.classList.contains('modal'));
    if (!isScrollable) return false;
    if (el.scrollHeight <= el.clientHeight + 1) return false;

    if (deltaY > 0) {
        return (el.scrollTop + el.clientHeight < el.scrollHeight - 1);
    } else if (deltaY < 0) {
        return (el.scrollTop > 1);
    }
    return false;
}

function canElementScrollX(el, deltaX) {
    if (!el || el === document || el === document.documentElement || el === document.body) return false;
    const style = window.getComputedStyle(el);
    const overflowX = style.overflowX;
    const isScrollable = (overflowX === 'auto' || overflowX === 'scroll' || overflowX === 'overlay');
    if (!isScrollable) return false;
    if (el.scrollWidth <= el.clientWidth + 1) return false;

    if (deltaX > 0) {
        return (el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
    } else if (deltaX < 0) {
        return (el.scrollLeft > 1);
    }
    return false;
}

document.addEventListener('wheel', function (e) {
    const openModals = document.querySelectorAll('.modal.show');
    if (openModals.length === 0) return;

    const topModal = openModals[openModals.length - 1];

    const isHorizontal = Math.abs(e.deltaX) > Math.abs(e.deltaY);

    if (isHorizontal) {
        let curr = e.target;
        while (curr) {
            if (canElementScrollX(curr, e.deltaX)) {
                return; // Cho phép cuộn ngang bảng
            }
            if (curr === topModal) break;
            curr = curr.parentElement;
        }
        e.preventDefault();
        return;
    }

    // Cuộn dọc: Duyệt từ e.target đi ngược lên topModal
    let curr = e.target;
    while (curr) {
        if (canElementScrollY(curr, e.deltaY)) {
            return; // Cho phép cuộn dọc mượt mà bên trong modal
        }
        if (curr === topModal) break;
        curr = curr.parentElement;
    }

    // Nếu con trỏ chuột nằm trên topModal (kể cả vùng viền hoặc backdrop) mà modal cuộn được
    if (canElementScrollY(topModal, e.deltaY)) {
        return; // Cho phép cuộn modal
    }

    // Đã chạm kịch trần / kịch đáy: chặn để không cuộn lan ra ngoài trang nền
    e.preventDefault();
}, { passive: false });

// 4. Click ra ngoài vùng hộp thoại (backdrop) thì đóng modal
document.addEventListener('click', function (e) {
    if (e.target && e.target.classList && e.target.classList.contains('modal') && e.target.classList.contains('show')) {
        const modalInstance = bootstrap.Modal.getInstance(e.target);
        if (modalInstance) {
            modalInstance.hide();
        } else {
            const closeBtn = e.target.querySelector('[data-bs-dismiss="modal"], .btn-close');
            if (closeBtn) closeBtn.click();
        }
    }
});

// 5. Phím tắt ESC (đóng modal) và ENTER (Lưu / OK / Xác nhận)
document.addEventListener('keydown', function (e) {
    const openModals = Array.from(document.querySelectorAll('.modal.show'));
    if (openModals.length === 0) return;

    const topModal = openModals[openModals.length - 1];

    // PHÍM ESC: Đóng modal đang mở trên cùng
    if (e.key === 'Escape' || e.keyCode === 27) {
        e.preventDefault();
        const modalInstance = bootstrap.Modal.getInstance(topModal);
        if (modalInstance) {
            modalInstance.hide();
        } else {
            const closeBtn = topModal.querySelector('[data-bs-dismiss="modal"], .btn-close');
            if (closeBtn) closeBtn.click();
        }
        return;
    }

    // PHÍM ENTER: Kích hoạt nút Lưu / OK / Xác nhận trong modal
    if (e.key === 'Enter' || e.keyCode === 13) {
        // Cho phép xuống dòng nếu đang gõ trong textarea
        if (e.target && e.target.tagName === 'TEXTAREA') {
            return;
        }

        // Cho phép kích hoạt nút đang được focus trực tiếp
        if (e.target && (e.target.tagName === 'BUTTON' || (e.target.tagName === 'A' && e.target.getAttribute('role') === 'button'))) {
            return;
        }

        // Tìm nút chính trong modal
        let primaryBtn = topModal.querySelector('button[type="submit"]:not([disabled])');

        // Tìm trong footer: ưu tiên các nút có chữ Lưu, Xác nhận, Đồng ý, OK
        if (!primaryBtn) {
            const footerBtns = Array.from(topModal.querySelectorAll('.modal-footer button:not([disabled]):not([data-bs-dismiss="modal"]):not(.btn-secondary)'));
            if (footerBtns.length > 0) {
                primaryBtn = footerBtns.find(b => {
                    const txt = (b.textContent || '').toLowerCase().trim();
                    return txt.includes('lưu') || txt.includes('xác nhận') || txt.includes('đồng ý') || txt.includes('ok') || txt.includes('thêm') || txt.includes('hoàn tất');
                }) || footerBtns[footerBtns.length - 1];
            }
        }

        // Tìm các nút btn-primary / btn-success trong modal nếu footer không có
        if (!primaryBtn) {
            const actionBtns = Array.from(topModal.querySelectorAll('button.btn-primary:not([disabled]):not([data-bs-dismiss="modal"]), button.btn-success:not([disabled]):not([data-bs-dismiss="modal"])'));
            if (actionBtns.length > 0) {
                primaryBtn = actionBtns[actionBtns.length - 1];
            }
        }

        if (primaryBtn) {
            e.preventDefault();
            primaryBtn.click();
        }
    }
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
        title: 'Lịch Sử',
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

    saveTabsState() {
        if (!this.isParent()) return;
        try {
            const state = {
                tabs: this.tabs.map(t => {
                    let currentUrl = t.url;
                    const frame = document.getElementById(`tab-iframe-${t.id}`);
                    if (frame) {
                        try {
                            if (frame.contentWindow && frame.contentWindow.location && frame.contentWindow.location.pathname) {
                                currentUrl = frame.contentWindow.location.pathname + frame.contentWindow.location.search;
                            }
                        } catch (e) {}
                    }
                    return {
                        id: t.id,
                        type: t.type,
                        title: t.title,
                        icon: t.icon,
                        closable: t.closable,
                        url: currentUrl || (TAB_DEFINITIONS[t.type] ? TAB_DEFINITIONS[t.type].url : null)
                    };
                }),
                activeTabId: this.activeTabId,
                tabCounter: this.tabCounter
            };
            localStorage.setItem('inventory_tabs_state_v1', JSON.stringify(state));
        } catch (e) {
            console.warn('Không thể lưu trạng thái tab:', e);
        }
    },

    restoreTabsState() {
        if (!this.isParent()) return false;
        try {
            const raw = localStorage.getItem('inventory_tabs_state_v1');
            if (!raw) return false;
            const state = JSON.parse(raw);
            if (!state || !Array.isArray(state.tabs) || state.tabs.length === 0) return false;

            // Lọc các tab hợp lệ
            let validTabs = state.tabs.filter(t => t && t.id && (t.id === 'dashboard' || TAB_DEFINITIONS[t.type]));
            if (validTabs.length === 0) return false;

            // Đảm bảo tab Dashboard luôn tồn tại ở vị trí đầu tiên
            const hasDashboard = validTabs.some(t => t.id === 'dashboard');
            if (!hasDashboard) {
                const dashDef = TAB_DEFINITIONS['dashboard'] || { title: 'Dashboard', icon: 'bi-speedometer2 text-primary', url: '/dashboard?embed=1' };
                validTabs.unshift({
                    id: 'dashboard',
                    type: 'dashboard',
                    title: 'Dashboard',
                    icon: dashDef.icon,
                    closable: false,
                    url: dashDef.url
                });
            }

            this.tabs = [];
            this.tabCounter = (state.tabCounter && typeof state.tabCounter === 'object') ? state.tabCounter : {};

            validTabs.forEach(tab => {
                const tabDef = TAB_DEFINITIONS[tab.type] || {};
                const restoredTab = {
                    id: String(tab.id),
                    type: tab.type || 'dashboard',
                    title: tab.title || tabDef.title || 'Tab',
                    icon: tab.icon || tabDef.icon || 'bi-window',
                    closable: tab.id !== 'dashboard' && (tab.closable !== false),
                    url: tab.url || tabDef.url || '/dashboard?embed=1'
                };
                this.tabs.push(restoredTab);
                this.createTabIframe(restoredTab.id, restoredTab.url);
            });

            const targetActive = this.tabs.find(t => t.id === state.activeTabId) ? state.activeTabId : this.tabs[0].id;
            this.switchTab(targetActive);
            this.renderTabBar();
            return true;
        } catch (e) {
            console.warn('Lỗi phục hồi tab cũ:', e);
            try {
                localStorage.removeItem('inventory_tabs_state_v1');
            } catch (err) {}
            return false;
        }
    },

    init() {
        if (!this.isParent()) {
            // Đang nằm trong iframe con -> cấu hình link interceptor để mở tab ở parent
            this.setupChildLinkInterceptor();
            return;
        }

        // Tự động lưu trạng thái tab trước khi F5 hoặc đóng trang
        window.addEventListener('beforeunload', () => {
            this.saveTabsState();
        });

        // Xóa sạch dữ liệu tạm dùng chung cũ nếu có
        try {
            sessionStorage.removeItem('nhap_hang_state');
            sessionStorage.removeItem('xuat_hang_state');
        } catch (e) {}

        this.initSidebar();

        // Thử phục hồi danh sách các tab đang mở trước khi reload/F5
        if (this.restoreTabsState()) {
            return;
        }

        // Mở Dashboard làm tab mặc định đầu tiên nếu chưa có dữ liệu lưu
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
                    closable: false,
                    url: customUrl || tabDef.url
                });
                this.createTabIframe('dashboard', customUrl || tabDef.url);
            }
            this.switchTab('dashboard');
            this.renderTabBar();
            this.saveTabsState();
            return;
        }

        // Đếm số lượng tab cùng loại hiện tại đang mở
        const existingTabs = this.tabs.filter(t => t.type === tabType);

        // Với các màn hình danh sách/báo cáo thông thường: nếu đã mở thì focus sang tab cũ
        if (tabType !== 'nhap-hang' && tabType !== 'xuat-hang' && !forceNew && !customUrl && existingTabs.length > 0) {
            this.switchTab(existingTabs[0].id);
            this.saveTabsState();
            return;
        }

        // Nếu tab Phiếu Chi hoặc Phiếu Thu đã mở sẵn và có customUrl truyền tham số, cập nhật iframe cũ và focus sang
        if ((tabType === 'phieu-chi' || tabType === 'phieu-thu') && existingTabs.length > 0 && customUrl) {
            const targetTab = existingTabs[existingTabs.length - 1];
            const frame = document.getElementById(`tab-iframe-${targetTab.id}`);
            if (frame) {
                let finalUrl = customUrl;
                if (!finalUrl.includes('embed=1')) {
                    finalUrl = finalUrl.includes('?') ? `${finalUrl}&embed=1` : `${finalUrl}?embed=1`;
                }
                frame.src = finalUrl;
            }
            this.switchTab(targetTab.id);
            this.saveTabsState();
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
            closable: true,
            url: customUrl || tabDef.url
        };

        this.tabs.push(newTab);
        this.createTabIframe(tabId, customUrl || tabDef.url);
        this.switchTab(tabId);
        this.renderTabBar();
        this.saveTabsState();
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
        this.saveTabsState();
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
        this.saveTabsState();
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
    initUserRoleUI();
});

async function initUserRoleUI() {
    try {
        const res = await fetch('/api/auth/me');
        if (res.ok) {
            const data = await res.json();
            window.currentUserInfo = data;
            const isAdmin = !!data.is_admin;
            document.querySelectorAll('.admin-only-ui').forEach(el => {
                if (isAdmin) {
                    el.classList.remove('d-none');
                    if (el.id === 'topbar-activity-log-btn') {
                        el.classList.add('d-lg-inline-flex');
                    }
                } else {
                    el.classList.add('d-none');
                    el.classList.remove('d-flex', 'd-lg-inline-flex', 'd-inline-flex');
                }
            });
        }
    } catch (e) {}
}
window.initUserRoleUI = initUserRoleUI;

// ── Logout ────────────────────────────────────────────────────────────────────

async function logout() {
    try {
        localStorage.removeItem('inventory_tabs_state_v1');
    } catch (e) {}
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
    let tenDoiTac = isXuat 
        ? (doiTac.ten_kh || doiTac.ten || data.khach_hang_ten || data.kh_ten || '')
        : (doiTac.ten_ncc || doiTac.ten || data.nha_cung_cap_ten || data.ncc_ten || '');
    let diaChiDoiTac = doiTac.dia_chi || data.dia_chi || '';
    let sdtDoiTac = doiTac.dien_thoai || data.dien_thoai || data.sdt || '';

    tenDoiTac = String(tenDoiTac || '').trim();
    diaChiDoiTac = String(diaChiDoiTac || '').replace(/^None$/i, '').trim();
    sdtDoiTac = String(sdtDoiTac || '').replace(/^None$/i, '').trim();

    // Fallback nếu tenDoiTac là ID hoặc rỗng
    if (!tenDoiTac || /^(DT|KH|NCC)\d+/i.test(tenDoiTac) || /^\d{10,}$/.test(tenDoiTac)) {
        if (window.allPartnersCache && window.allPartnersCache.length) {
            const refKey = (data.khach_hang_id || data.nha_cung_cap_id || doiTac.id || tenDoiTac || '').trim().toLowerCase();
            const found = window.allPartnersCache.find(p => {
                const pid = String(p.id || '').trim().toLowerCase();
                const pma = String(p.ma || p.ma_doi_tuong || '').trim().toLowerCase();
                const pten = String(p.ten || p.ten_kh || p.ten_ncc || '').trim().toLowerCase();
                return (refKey && (refKey === pid || refKey === pma || refKey === pten));
            });
            if (found) {
                tenDoiTac = found.ten || found.ten_kh || found.ten_ncc || tenDoiTac;
                if (!sdtDoiTac) sdtDoiTac = String(found.dien_thoai || '').replace(/^None$/i, '').trim();
                if (!diaChiDoiTac) diaChiDoiTac = String(found.dia_chi || '').replace(/^None$/i, '').trim();
            }
        }
    }
    if (!tenDoiTac || /^(DT|KH|NCC)\d+/i.test(tenDoiTac) || /^\d{10,}$/.test(tenDoiTac)) {
        tenDoiTac = isXuat ? 'Khách lẻ' : 'Nhà cung cấp lẻ';
    }
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
                    <span style="flex-grow: 1; padding-left: 8px;">${escapeHtml(diaChiDoiTac)}</span>
                </div>
                <div style="border-bottom: 1px dotted #000; display: flex;">
                    <span style="white-space: nowrap;">Số điện thoại :</span>
                    <span style="flex-grow: 1; padding-left: 8px; font-weight: bold; font-family: 'Times New Roman', monospace;">${escapeHtml(sdtDoiTac)}</span>
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
                        <span style="padding-left: 8px;">454 Nguyễn Trãi, Hạc Thành, Thanh Hóa, Việt Nam</span>
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
    let partnerName = isXuat 
        ? (partner.ten_kh || partner.ten || res.khach_hang_ten || res.doi_tac || res.kh_ten || '')
        : (partner.ten_ncc || partner.ten || res.nha_cung_cap_ten || res.doi_tac || res.ncc_ten || '');
    let partnerPhone = partner.dien_thoai || res.dien_thoai || res.sdt || '';
    let partnerAddress = partner.dia_chi || res.dia_chi || '';

    // Làm sạch chuỗi
    partnerPhone = String(partnerPhone || '').replace(/^None$/i, '').trim();
    partnerAddress = String(partnerAddress || '').replace(/^None$/i, '').trim();

    // Fallback nếu partnerName có dạng ID (DT..., KH..., NCC...) hoặc còn thiếu thông tin
    const isIdLike = /^(DT|KH|NCC)\d+/i.test(partnerName) || /^\d{10,}$/.test(partnerName);
    if (!partnerName || isIdLike || (!partnerPhone && !partnerAddress)) {
        if (!window.allPartnersCache) {
            try {
                const dtRes = await apiRequest('/api/doi-tuong');
                window.allPartnersCache = dtRes.data || [];
            } catch (e) {
                window.allPartnersCache = [];
            }
        }
        if (window.allPartnersCache && window.allPartnersCache.length) {
            const refKey = (res.khach_hang_id || res.nha_cung_cap_id || partner.id || partnerName || '').trim().toLowerCase();
            const found = window.allPartnersCache.find(p => {
                const pid = String(p.id || '').trim().toLowerCase();
                const pma = String(p.ma || p.ma_doi_tuong || '').trim().toLowerCase();
                const pten = String(p.ten || p.ten_kh || p.ten_ncc || '').trim().toLowerCase();
                return (refKey && (refKey === pid || refKey === pma || refKey === pten));
            });
            if (found) {
                const realTen = found.ten || found.ten_kh || found.ten_ncc || '';
                if (realTen) partnerName = realTen;
                if (!partnerPhone) partnerPhone = String(found.dien_thoai || '').replace(/^None$/i, '').trim();
                if (!partnerAddress) partnerAddress = String(found.dia_chi || '').replace(/^None$/i, '').trim();
            }
        }
    }
    if (!partnerName || isIdLike) {
        partnerName = isXuat ? 'Khách lẻ' : 'Nhà cung cấp lẻ';
    }

    // Đồng bộ lại vào window.currentReceiptDetail để nút In Phiếu dùng đúng 100%
    if (isXuat) {
        window.currentReceiptDetail.khach_hang = {
            id: res.khach_hang_id || partner.id,
            ten_kh: partnerName,
            dien_thoai: partnerPhone,
            dia_chi: partnerAddress
        };
        window.currentReceiptDetail.khach_hang_ten = partnerName;
        window.currentReceiptDetail.dien_thoai = partnerPhone;
        window.currentReceiptDetail.dia_chi = partnerAddress;
    } else {
        window.currentReceiptDetail.nha_cung_cap = {
            id: res.nha_cung_cap_id || partner.id,
            ten_ncc: partnerName,
            dien_thoai: partnerPhone,
            dia_chi: partnerAddress
        };
        window.currentReceiptDetail.nha_cung_cap_ten = partnerName;
        window.currentReceiptDetail.dien_thoai = partnerPhone;
        window.currentReceiptDetail.dia_chi = partnerAddress;
    }
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
                        <div class="fw-bold text-dark fs-6 mb-1">${escapeHtml(partnerName)}</div>
                        ${partnerPhone ? `<div class="text-secondary small mb-1"><i class="bi bi-telephone text-primary me-1"></i>SĐT: <strong class="text-dark font-monospace">${escapeHtml(partnerPhone)}</strong></div>` : ''}
                        ${partnerAddress ? `<div class="text-secondary small"><i class="bi bi-geo-alt text-danger me-1"></i>Địa chỉ: <span class="text-dark">${escapeHtml(partnerAddress)}</span></div>` : ''}
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
                        const pLive = isXuat ? (allProducts || []).find(x => x.ma_hang === it.ma_hang) : null;
                        const maxAvail = isXuat ? ((parseInt(pLive?.ton_kho || 0) || 0) + it.so_luong) : 0;
                        const stockHint = isXuat ? `<div class="small text-muted mt-1 stock-hint" style="font-size: 0.72rem;" title="Số lượng tối đa có thể xuất">(Kho: <strong class="text-dark">${maxAvail}</strong>)</div>` : '';
                        return `
                            <tr data-ma="${escapeHtml(it.ma_hang)}" data-ten="${escapeHtml(it.ten_hang)}" data-dvt="${escapeHtml(it.don_vi_tinh || 'Cái')}" data-max-avail="${maxAvail}">
                                <td class="text-center text-muted small row-stt">${idx + 1}</td>
                                <td><span class="badge bg-secondary font-monospace">${escapeHtml(it.ma_hang)}</span></td>
                                <td class="fw-semibold">${escapeHtml(it.ten_hang)}</td>
                                <td class="text-center text-muted small">${escapeHtml(it.don_vi_tinh || 'Cái')}</td>
                                <td class="text-center">
                                    <input type="number" min="1" class="form-control form-control-sm text-center fw-bold receipt-row-sl ${isXuat ? 'text-danger' : 'text-primary'}" value="${it.so_luong}" oninput="onReceiptDetailRowInput(this)">
                                    ${stockHint}
                                </td>
                                <td class="text-end">
                                    <input type="text" inputmode="numeric" autocomplete="off" class="form-control form-control-sm text-end receipt-row-gia" value="${gia}" oninput="onReceiptDetailRowInput(this)">
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
                    <div class="position-relative" style="flex: 2; min-width: 250px;">
                        <div class="input-group input-group-sm">
                            <input type="text" class="form-control form-control-sm" id="detail-add-prod-input"
                                placeholder="Gõ mã hoặc tên hàng..."
                                autocomplete="off"
                                onfocus="onDetailProductInputFocus(this)"
                                onkeydown="onDetailProductInputKeydown(event)"
                                oninput="onDetailProductSearchInput(this)">
                            <button class="btn btn-outline-secondary btn-sm" type="button" onclick="clearDetailAddProduct()" title="Xóa chọn">
                                <i class="bi bi-x"></i>
                            </button>
                            <button class="btn btn-outline-primary btn-sm btn-toggle-detail-prod-dd" type="button" onclick="toggleDetailProductDropdown(event)" title="Chọn hàng hóa từ danh sách">
                                <i class="bi bi-chevron-down"></i>
                            </button>
                        </div>
                        <input type="hidden" id="detail-add-prod-ma" value="">
                        <div id="detail-add-prod-sug" class="autocomplete-dropdown d-none shadow" style="max-height: 380px; width: 100%; z-index: 1070; position: absolute; left: 0; top: 100%;"></div>
                    </div>
                    <button type="button" class="btn btn-outline-success btn-sm text-nowrap fw-semibold" onclick="openQuickCreateProductInReceipt()" title="Tạo hàng hóa mới trực tiếp vào hệ thống">
                        <i class="bi bi-box-seam me-1"></i>+ Tạo SP mới
                    </button>
                    <div style="width: 85px;">
                        <input type="number" id="detail-add-sl" min="1" value="1" class="form-control form-control-sm text-center" placeholder="SL">
                    </div>
                    <div style="width: 140px;">
                        <input type="text" inputmode="numeric" autocomplete="off" id="detail-add-gia" value="0" class="form-control form-control-sm text-end" placeholder="Đơn giá">
                    </div>
                    <button type="button" class="btn btn-primary btn-sm px-3 text-nowrap" onclick="submitAddProductToReceiptDetail()">
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
 * Hỗ trợ: Phiếu Xuất, Phiếu Nhập, Phiếu Thu, Phiếu Chi
 */
function confirmDeleteReceipt(so_phieu, type, onDone, record_id = null) {
    if (!so_phieu && !record_id) return;
    const isThu = (type === 'thu') || (type === 'THU') || String(so_phieu).startsWith('TM') || String(so_phieu).startsWith('TG');
    const isChi = (type === 'chi') || (type === 'CHI') || String(so_phieu).startsWith('CM') || String(so_phieu).startsWith('CG');
    const isXuat = (type === 'xuat') || String(so_phieu).startsWith('XH');
    const isNhap = (type === 'nhap') || String(so_phieu).startsWith('NH');

    let typeLabel = 'phiếu';
    let descText = `Hành động này sẽ xóa vĩnh viễn phiếu ${so_phieu}. Không thể hoàn tác.`;

    if (isThu) {
        typeLabel = 'phiếu thu';
        descText = `Hành động này sẽ xóa vĩnh viễn phiếu ${so_phieu}, đồng thời tự động hoàn trả công nợ về phiếu xuất kho và khấu trừ lại quỹ tiền của công ty. Không thể hoàn tác.`;
    } else if (isChi) {
        typeLabel = 'phiếu chi';
        descText = `Hành động này sẽ xóa vĩnh viễn phiếu ${so_phieu}, đồng thời tự động hoàn trả công nợ về phiếu nhập kho và hoàn tiền lại vào quỹ của công ty. Không thể hoàn tác.`;
    } else if (isXuat) {
        typeLabel = 'phiếu xuất kho';
        descText = `Hành động này sẽ xóa vĩnh viễn phiếu ${so_phieu} và tự động hoàn trả số lượng hàng tồn kho tương ứng vào hệ thống. Không thể hoàn tác.`;
    } else if (isNhap) {
        typeLabel = 'phiếu nhập kho';
        descText = `Hành động này sẽ xóa vĩnh viễn phiếu ${so_phieu} và tự động khấu trừ số lượng hàng tồn kho tương ứng khỏi hệ thống. Không thể hoàn tác.`;
    }

    const modalEl = document.getElementById('confirm-delete-receipt-modal');
    if (!modalEl) {
        if (confirm(`Bạn có chắc chắn muốn xóa ${typeLabel} "${so_phieu}"?\n${descText}`)) {
            executeDeleteReceiptApi(so_phieu, type, onDone, record_id);
        }
        return;
    }

    const titleEl = document.getElementById('del-receipt-title');
    const descEl = document.getElementById('del-receipt-desc');
    if (titleEl) titleEl.textContent = `Xác nhận xóa ${typeLabel} "${so_phieu}"?`;
    if (descEl) descEl.textContent = descText;

    const confirmBtn = document.getElementById('btn-confirm-delete-receipt');
    if (confirmBtn) {
        confirmBtn.onclick = async () => {
            confirmBtn.disabled = true;
            confirmBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Đang xóa...';
            try {
                await executeDeleteReceiptApi(so_phieu, type, onDone, record_id);
                closeModal('confirm-delete-receipt-modal');
                window.isReceiptDetailDirty = false;
                window.isThuChiDetailDirty = false;
                window.isPhieuThuDetailDirty = false;
                closeModal('detail-modal');
                closeModal('history-detail-modal');
                closeModal('modal-detail-thuchi');
                closeModal('modal-detail-phieu-thu');
                closeModal('modal-detail-phieu-chi');
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
window.confirmDeleteReceipt = confirmDeleteReceipt;
window.confirmDeleteThuChi = confirmDeleteReceipt;

function confirmDeleteCurrentReceipt() {
    if (!window.currentReceiptDetail || !window.currentReceiptDetail.so_phieu) return;
    confirmDeleteReceipt(
        window.currentReceiptDetail.so_phieu,
        window.currentReceiptDetail.type,
        window.receiptDetailOnUpdated
    );
}

async function executeDeleteReceiptApi(so_phieu, type, onDone, record_id = null) {
    const isThu = (type === 'thu') || (type === 'THU') || String(so_phieu).startsWith('TM') || String(so_phieu).startsWith('TG');
    const isChi = (type === 'chi') || (type === 'CHI') || String(so_phieu).startsWith('CM') || String(so_phieu).startsWith('CG');
    const isXuat = (type === 'xuat') || String(so_phieu).startsWith('XH');

    let apiUrl = '';
    if (isThu || isChi) {
        const idToDel = record_id || so_phieu;
        apiUrl = `/api/so-quy?id=${encodeURIComponent(idToDel)}`;
    } else if (isXuat) {
        apiUrl = `/api/xuat-hang/${encodeURIComponent(so_phieu)}`;
    } else {
        apiUrl = `/api/nhap-hang/${encodeURIComponent(so_phieu)}`;
    }

    try {
        showLoading();
        const res = await apiRequest(apiUrl, 'DELETE');
        showToast(res.message || `Đã xóa phiếu ${so_phieu} thành công!`, 'success');

        // Báo cho các tab iframe khác cập nhật kho, công nợ và số dư tức thì
        broadcastDataUpdate('DEBT_UPDATED');
        broadcastDataUpdate('BALANCE_UPDATED');
        broadcastDataUpdate('PRODUCTS_UPDATED');
        broadcastDataUpdate('RECEIPTS_UPDATED');
        broadcastDataUpdate('SO_QUY_UPDATED');

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
    const gia = parseCurrencyValue(giaInput?.value || 0);
    const lineTotal = sl * gia;

    if (totalEl) {
        totalEl.textContent = formatVND(lineTotal);
    }

    // Kiểm tra tồn kho theo thời gian thực cho phiếu xuất
    const isXuat = window.currentReceiptDetail?.type === 'xuat';
    if (isXuat) {
        const ma = tr.dataset.ma;
        const list = window.allReceiptProductsCache || [];
        const p = list.find(x => x.ma_hang === ma);
        const origReceiptSl = (window.currentReceiptDetail?.items || []).find(it => it.ma_hang === ma)?.so_luong || 0;
        const tonKhoLive = p ? (parseInt(p.ton_kho || 0) || 0) : 0;
        const maxAvail = tonKhoLive + origReceiptSl;
        const hintEl = tr.querySelector('.stock-hint');
        if (sl > maxAvail) {
            slInput.classList.add('is-invalid', 'border-danger', 'bg-danger-subtle');
            if (hintEl) {
                hintEl.innerHTML = `<span class="badge bg-danger text-white px-1 py-0" style="font-size: 0.68rem;"><i class="bi bi-exclamation-circle me-1"></i>Kho: ${maxAvail} (Không đủ!)</span>`;
            }
            const rawTen = tr.dataset.ten || ma;
            const shortTen = rawTen.length > 25 ? (rawTen.substring(0, 23) + '...') : rawTen;
            showToast(`<strong>Kho không đủ!</strong> "${escapeHtml(shortTen)}" chỉ còn tồn tối đa <strong>${maxAvail}</strong> để xuất.`, 'warning');
        } else {
            slInput.classList.remove('is-invalid', 'border-danger', 'bg-danger-subtle');
            if (hintEl) {
                hintEl.innerHTML = `(Kho: <strong class="text-dark">${maxAvail}</strong>)`;
            }
        }
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
        const gia = parseCurrencyValue(tr.querySelector('.receipt-row-gia')?.value || 0);
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
 * ── Autocomplete Thêm hàng trong Modal Chi tiết phiếu ─────────
 */
function filterDetailProducts(query) {
    const list = window.allReceiptProductsCache || [];
    if (!list.length) return [];
    if (!query) return list.slice(0, 50);
    const matcher = window.matchSearchKeywords || ((txt, q) => (txt || '').toLowerCase().includes((q || '').toLowerCase()));
    return list.filter(p => {
        const text = `${p.ma_hang || ''} ${p.ten_hang || ''} ${p.danh_muc || ''}`;
        return matcher(text, query);
    }).slice(0, 50);
}

function renderDetailProductSuggestions(matches) {
    const box = document.getElementById('detail-add-prod-sug');
    if (!box) return;
    if (!matches || !matches.length) {
        box.innerHTML = `
            <div class="p-3 text-muted small text-center"><i class="bi bi-inbox me-1"></i>Không tìm thấy hàng khớp</div>
            <div class="p-2 border-top bg-light text-center">
                <button type="button" class="btn btn-link btn-sm text-decoration-none py-1 text-success fw-bold" onclick="openQuickCreateProductInReceipt()">
                    <i class="bi bi-plus-circle me-1"></i>+ Tạo hàng hóa mới vào hệ thống
                </button>
            </div>
        `;
        box.classList.remove('d-none');
        return;
    }
    const isXuat = window.currentReceiptDetail?.type === 'xuat';
    const itemsHtml = matches.map(p => {
        const gia = isXuat ? (p.gia_ban || 0) : (p.gia_nhap || 0);
        return `
            <div class="autocomplete-item py-2 px-3 border-bottom" onclick="selectDetailProduct('${escapeHtml(p.ma_hang)}')">
                <div class="d-flex align-items-start justify-content-between gap-2">
                    <div class="d-flex align-items-start gap-2 flex-grow-1" style="min-width: 0;">
                        <span class="badge bg-primary bg-opacity-10 text-primary font-monospace flex-shrink-0 mt-1">${escapeHtml(p.ma_hang)}</span>
                        <span class="fw-semibold small text-dark" style="white-space: normal; word-break: break-word; line-height: 1.35;">${escapeHtml(p.ten_hang)}</span>
                    </div>
                    <span class="${isXuat ? 'text-danger' : 'text-success'} fw-bold small flex-shrink-0 text-nowrap ms-2">${formatVND(gia)}</span>
                </div>
                <div class="text-muted small mt-1 d-flex justify-content-between align-items-center" style="font-size: 0.75rem;">
                    <span>${p.danh_muc ? `<span class="badge bg-light text-dark border me-1">${escapeHtml(p.danh_muc)}</span>` : ''} ĐVT: ${escapeHtml(p.don_vi_tinh || 'Cái')}</span>
                    <span>Tồn hiện tại: <strong class="text-dark">${formatNumber(p.ton_kho)}</strong></span>
                </div>
            </div>
        `;
    }).join('');

    box.innerHTML = itemsHtml + `
        <div class="p-2 border-top bg-light text-center">
            <button type="button" class="btn btn-link btn-sm text-decoration-none py-1 text-success fw-bold" onclick="openQuickCreateProductInReceipt()">
                <i class="bi bi-plus-circle me-1"></i>+ Tạo hàng hóa mới vào hệ thống
            </button>
        </div>
    `;
    box.classList.remove('d-none');
}

let _detailProdDebounceTimer = null;
function onDetailProductSearchInput(input) {
    const maEl = document.getElementById('detail-add-prod-ma');
    if (maEl) maEl.value = '';
    clearTimeout(_detailProdDebounceTimer);
    _detailProdDebounceTimer = setTimeout(() => {
        const query = (input?.value || '').trim();
        const matches = filterDetailProducts(query);
        renderDetailProductSuggestions(matches);
    }, 150);
}

function onDetailProductInputFocus(input) {
    const query = (input?.value || '').trim();
    const matches = filterDetailProducts(query);
    renderDetailProductSuggestions(matches);
}

function onDetailProductInputKeydown(e) {
    if (e.key === 'Enter') {
        e.preventDefault();
        const query = e.target.value.trim().toLowerCase();
        if (!query) return;
        const list = window.allReceiptProductsCache || [];
        let match = list.find(p => (p.ma_hang || '').toLowerCase() === query);
        if (!match) {
            match = list.find(p => (p.ma_hang || '').toLowerCase().includes(query) || (p.ten_hang || '').toLowerCase().includes(query));
        }
        if (match) {
            selectDetailProduct(match.ma_hang);
        }
    }
}

function toggleDetailProductDropdown(e) {
    if (e) {
        e.preventDefault();
        e.stopPropagation();
    }
    const box = document.getElementById('detail-add-prod-sug');
    if (!box) return;
    if (!box.classList.contains('d-none')) {
        box.classList.add('d-none');
    } else {
        const input = document.getElementById('detail-add-prod-input');
        const query = (input?.value || '').trim();
        const matches = filterDetailProducts(query);
        renderDetailProductSuggestions(matches);
        if (input) input.focus();
    }
}

function selectDetailProduct(ma_hang) {
    const list = window.allReceiptProductsCache || [];
    const p = list.find(x => x.ma_hang === ma_hang);
    if (!p) return;

    const input = document.getElementById('detail-add-prod-input');
    if (input) {
        input.value = `${p.ma_hang} - ${p.ten_hang}`;
        input.title = `${p.ma_hang} - ${p.ten_hang}`;
    }
    const maEl = document.getElementById('detail-add-prod-ma');
    if (maEl) maEl.value = p.ma_hang;
    document.getElementById('detail-add-prod-sug')?.classList.add('d-none');

    const isXuat = window.currentReceiptDetail?.type === 'xuat';
    const gia = isXuat ? (parseFloat(p.gia_ban) || 0) : (parseFloat(p.gia_nhap) || 0);

    const giaInput = document.getElementById('detail-add-gia');
    if (giaInput) giaInput.value = gia;

    const slInput = document.getElementById('detail-add-sl');
    if (slInput) {
        slInput.focus();
        slInput.select();
    }
}

function clearDetailAddProduct() {
    const input = document.getElementById('detail-add-prod-input');
    if (input) input.value = '';
    const maEl = document.getElementById('detail-add-prod-ma');
    if (maEl) maEl.value = '';
    document.getElementById('detail-add-prod-sug')?.classList.add('d-none');
    const giaInput = document.getElementById('detail-add-gia');
    if (giaInput) giaInput.value = 0;
}

// Đóng dropdown autocomplete chi tiết khi click ra ngoài
document.addEventListener('click', (e) => {
    if (!e.target.closest('#detail-add-prod-sug') && !e.target.closest('#detail-add-prod-input') && !e.target.closest('.btn-toggle-detail-prod-dd')) {
        document.getElementById('detail-add-prod-sug')?.classList.add('d-none');
    }
});

/**
 * Thêm mặt hàng được chọn vào bảng chi tiết
 */
function submitAddProductToReceiptDetail() {
    let ma = document.getElementById('detail-add-prod-ma')?.value || '';
    const inputVal = (document.getElementById('detail-add-prod-input')?.value || '').trim();
    const list = window.allReceiptProductsCache || [];

    // Nếu chưa chọn từ dropdown mà gõ trực tiếp tên/mã
    if (!ma && inputVal) {
        const q = inputVal.toLowerCase();
        let match = list.find(p => (p.ma_hang || '').toLowerCase() === q);
        if (!match) {
            match = list.find(p => (p.ma_hang || '').toLowerCase().includes(q) || (p.ten_hang || '').toLowerCase().includes(q));
        }
        if (match) {
            ma = match.ma_hang;
        }
    }

    if (!ma) {
        showToast('Vui lòng chọn một mặt hàng để thêm', 'warning');
        return;
    }

    const p = list.find(x => x.ma_hang === ma);
    const ten = p?.ten_hang || ma;
    const dvt = p?.don_vi_tinh || 'Cái';

    const slInput = document.getElementById('detail-add-sl');
    const giaInput = document.getElementById('detail-add-gia');
    const sl = parseInt(slInput?.value || 0) || 0;
    const gia = parseCurrencyValue(giaInput?.value || 0);

    if (sl <= 0) {
        showToast('Số lượng phải lớn hơn 0', 'warning');
        return;
    }

    const tbody = document.getElementById('receipt-detail-tbody');
    if (!tbody) return;

    const isXuat = window.currentReceiptDetail?.type === 'xuat';
    if (isXuat && p) {
        const allTrsForMa = Array.from(tbody.querySelectorAll('tr')).filter(tr => tr.dataset.ma === ma);
        const curTrSl = allTrsForMa.reduce((sum, tr) => sum + (parseInt(tr.querySelector('.receipt-row-sl')?.value || 0) || 0), 0);
        const origReceiptSl = (window.currentReceiptDetail?.items || []).filter(it => it.ma_hang === ma).reduce((sum, it) => sum + (parseInt(it.so_luong || 0) || 0), 0);
        const tonKhoLive = parseInt(p.ton_kho || 0) || 0;
        const maxAvail = tonKhoLive + origReceiptSl;
        if (curTrSl + sl > maxAvail) {
            const rawTen = ten || ma;
            const shortTen = rawTen.length > 25 ? (rawTen.substring(0, 23) + '...') : rawTen;
            showToast(`<strong>Kho không đủ!</strong> "${escapeHtml(shortTen)}" chỉ còn tối đa <strong>${maxAvail}</strong> ${dvt}.`, 'warning');
            return;
        }
    }

    // Kiểm tra xem đã có dòng nào trùng cả mã hàng và đơn giá chưa (hỗ trợ nhiều lô giá khác nhau)
    const existingTr = Array.from(tbody.querySelectorAll('tr')).find(tr => {
        if (tr.dataset.ma !== ma) return false;
        const rowGia = parseCurrencyValue(tr.querySelector('.receipt-row-gia')?.value || 0);
        return Math.abs(rowGia - gia) < 0.01;
    });

    if (existingTr) {
        const curSlInput = existingTr.querySelector('.receipt-row-sl');
        if (curSlInput) {
            curSlInput.value = (parseInt(curSlInput.value) || 0) + sl;
            onReceiptDetailRowInput(curSlInput);
            showToast(`Đã cộng thêm ${sl} ${dvt} vào dòng giá ${formatVND(gia)} của mã ${ma}`, 'info');
        }
    } else {
        const lineTotal = sl * gia;
        const newIdx = tbody.querySelectorAll('tr').length + 1;
        const maxAvail = isXuat ? ((parseInt(p?.ton_kho || 0) || 0) + ((window.currentReceiptDetail?.items || []).filter(it => it.ma_hang === ma).reduce((sum, it) => sum + (parseInt(it.so_luong || 0) || 0), 0))) : 0;
        const stockHint = isXuat ? `<div class="small text-muted mt-1 stock-hint" style="font-size: 0.72rem;" title="Số lượng tối đa có thể xuất">(Kho: <strong class="text-dark">${maxAvail}</strong>)</div>` : '';
        const newTr = document.createElement('tr');
        newTr.dataset.ma = ma;
        newTr.dataset.ten = ten;
        newTr.dataset.dvt = dvt;
        newTr.dataset.maxAvail = maxAvail;
        newTr.innerHTML = `
            <td class="text-center text-muted small row-stt">${newIdx}</td>
            <td><span class="badge bg-secondary font-monospace">${escapeHtml(ma)}</span></td>
            <td class="fw-semibold">${escapeHtml(ten)}</td>
            <td class="text-center text-muted small">${escapeHtml(dvt)}</td>
            <td class="text-center">
                <input type="number" min="1" class="form-control form-control-sm text-center fw-bold receipt-row-sl ${isXuat ? 'text-danger' : 'text-primary'}" value="${sl}" oninput="onReceiptDetailRowInput(this)">
                ${stockHint}
            </td>
            <td class="text-end">
                <input type="text" inputmode="numeric" autocomplete="off" class="form-control form-control-sm text-end receipt-row-gia" value="${gia}" oninput="onReceiptDetailRowInput(this)">
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
    clearDetailAddProduct();
    if (slInput) slInput.value = 1;
    if (giaInput) giaInput.value = 0;
    const input = document.getElementById('detail-add-prod-input');
    if (input) input.focus();
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
        const gia = parseCurrencyValue(tr.querySelector('.receipt-row-gia')?.value || 0);

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

    if (isXuat) {
        const qtyByMa = {};
        for (const it of items) {
            qtyByMa[it.ma_hang] = (qtyByMa[it.ma_hang] || 0) + it.so_luong;
        }
        const list = window.allReceiptProductsCache || [];
        for (const [m, totSl] of Object.entries(qtyByMa)) {
            const p = list.find(x => x.ma_hang === m);
            const origReceiptSl = (window.currentReceiptDetail?.items || []).filter(it => it.ma_hang === m).reduce((sum, it) => sum + (parseInt(it.so_luong || 0) || 0), 0);
            const tonKhoLive = p ? (parseInt(p.ton_kho || 0) || 0) : 0;
            const maxAvail = tonKhoLive + origReceiptSl;
            if (totSl > maxAvail) {
                const ten = p?.ten_hang || m;
                const shortTen = ten.length > 25 ? (ten.substring(0, 23) + '...') : ten;
                showToast(`<strong>Không thể lưu!</strong> "${escapeHtml(shortTen)}" chỉ còn tồn tối đa <strong>${maxAvail}</strong> để xuất (bạn chọn tổng ${totSl}).`, 'error');
                return;
            }
        }
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

        // Báo cho tất cả các tab khác cập nhật kho, sổ quỹ và công nợ
        try {
            const types = ['PRODUCTS_UPDATED', 'SO_QUY_UPDATED', 'BALANCE_UPDATED', 'DEBT_UPDATED', 'DATA_CHANGED'];
            types.forEach(t => {
                try { window.top.postMessage({ type: t }, '*'); } catch (err) {}
                try { window.postMessage({ type: t }, '*'); } catch (err) {}
            });
            if (typeof broadcastDataUpdate === 'function') {
                types.forEach(t => broadcastDataUpdate(t));
            } else if (typeof BroadcastChannel !== 'undefined') {
                const bc = new BroadcastChannel('inventory_sync');
                types.forEach(t => bc.postMessage({ type: t }));
            }
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
                                <input type="text" inputmode="numeric" autocomplete="off" class="form-control form-control-sm fs-5 fw-bold text-success" id="qpt-so-tien" value="${so_tien_no}" required>
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
        const so_tien = parseCurrencyValue(document.getElementById('qpt-so-tien')?.value || 0);
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
                                <input type="text" inputmode="numeric" autocomplete="off" class="form-control form-control-sm fs-5 fw-bold text-danger" id="qpc-so-tien" value="${so_tien_no}" required>
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
        const so_tien = parseCurrencyValue(document.getElementById('qpc-so-tien')?.value || 0);
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
            loai_chi: 'NHA_CUNG_CAP',
            hang_muc_chi: 'Chi trả nhà cung cấp',
            doi_tuong: ten_ncc,
            dien_thoai: dien_thoai,
            dia_chi: dia_chi,
            nha_cung_cap_id: ncc_id,
            so_tien: so_tien,
            phieu_lien_quan: so_phieu,
            ghi_chu: ghi_chu || `Thanh toán tiền nhập hàng theo phiếu ${so_phieu}`
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
    address: '454 Nguyễn Trãi, Hạc Thành, Thanh Hóa, Việt Nam',
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
 * In Báo cáo tổng hợp / Sổ nhật ký theo format xuất Excel (Chuẩn Kế toán Việt Nam, giống Ảnh 2 & Ảnh 3):
 * - Tiêu đề Báo cáo in hoa, xanh dương đậm
 * - Đơn vị tính: Đồng
 * - 2 hàng tiêu đề cột (Tên cột & Mã A, B, C, 1, 2, 3...)
 * - Dòng Tổng cộng gộp nhãn
 * - Khối ngày tháng mở sổ và 3 chữ ký: Người ghi sổ, Kế toán trưởng, Giám đốc
 */
function printAccountingReport({
    title = 'BÁO CÁO TỔNG HỢP NHẬP KHO',
    monthText = '',
    accountText = 'Tài khoản: 156 (Hàng hoá)',
    unitText = 'Đơn vị tính : Đồng',
    companyName = COMPANY_INFO.name,
    companyAddress = COMPANY_INFO.address,
    columns = [],
    rows = [],
    summaryRow = null,
    dateOpen = null,
    dateClose = null,
}) {
    if (!rows || !rows.length) {
        showToast('Không có dữ liệu để in báo cáo!', 'info');
        return;
    }

    const now = new Date();
    const curMonthText = monthText || `Tháng ${now.getMonth() + 1} năm ${now.getFullYear()}`;
    const defaultDateOpen = dateOpen || `Ngày mở sổ : 01/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;
    const defaultDateClose = dateClose || `Ngày ${String(now.getDate()).padStart(2, '0')} tháng ${String(now.getMonth() + 1).padStart(2, '0')} năm ${now.getFullYear()}`;

    const formatVNDClean = (v) => {
        if (!v || isNaN(v)) return '0';
        return Math.round(Number(v)).toLocaleString('vi-VN');
    };

    // Tạo dòng Tổng cộng tfoot
    let summaryHtml = '';
    if (summaryRow && summaryRow.length) {
        let mergeCols = 1;
        for (let i = 1; i < summaryRow.length; i++) {
            if (summaryRow[i] === '' || summaryRow[i] === null || summaryRow[i] === undefined || summaryRow[i] === '-') {
                if (columns[i] && columns[i].isNumber) break;
                mergeCols = i + 1;
            } else {
                break;
            }
        }

        let sumCells = `<td colspan="${mergeCols}" style="text-align: center; font-weight: bold; border: 1px solid #000; padding: 6px;">Tổng cộng</td>`;
        for (let i = mergeCols; i < columns.length; i++) {
            const val = summaryRow[i];
            const col = columns[i] || {};
            const align = (typeof val === 'number' || col.isNumber) ? 'right' : 'center';
            let disp = '';
            if (typeof val === 'number') {
                disp = Math.round(val).toLocaleString('vi-VN');
            } else if (val !== null && val !== undefined && val !== '') {
                disp = escapeHtml(String(val));
            } else {
                disp = '-';
            }
            sumCells += `<td style="text-align: ${align}; font-weight: bold; border: 1px solid #000; padding: 6px;">${disp}</td>`;
        }
        summaryHtml = `<tfoot><tr style="background-color: #f8fafc; font-weight: bold;">${sumCells}</tr></tfoot>`;
    }

    const printWindow = window.open('', '_blank', 'width=1100,height=800');
    if (!printWindow) {
        window.print();
        return;
    }

    printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <title>${escapeHtml(title)}</title>
            <style>
                @page {
                    size: A4 landscape;
                    margin: 10mm 12mm 10mm 12mm;
                }
                body {
                    font-family: 'Times New Roman', Times, serif;
                    font-size: 10.5pt;
                    line-height: 1.35;
                    color: #000;
                    margin: 0;
                    padding: 15px;
                }
                .header-company {
                    margin-bottom: 12px;
                }
                .header-company .comp-name {
                    font-weight: bold;
                    font-size: 11pt;
                    text-transform: uppercase;
                }
                .header-company .comp-addr {
                    font-weight: bold;
                    font-size: 10.5pt;
                }
                .report-title-area {
                    text-align: center;
                    margin: 10px 0 16px 0;
                }
                .report-title {
                    color: #002060;
                    font-size: 16pt;
                    font-weight: bold;
                    text-transform: uppercase;
                    margin: 0 0 5px 0;
                }
                .report-subtitle {
                    font-weight: bold;
                    font-size: 11pt;
                    margin-bottom: 3px;
                }
                .unit-label {
                    text-align: right;
                    font-weight: bold;
                    font-size: 10.5pt;
                    margin-bottom: 5px;
                }
                table.accounting-table {
                    width: 100%;
                    border-collapse: collapse;
                    font-size: 10pt;
                    margin-bottom: 15px;
                }
                table.accounting-table th, table.accounting-table td {
                    border: 1px solid #000;
                    padding: 5px 6px;
                }
                table.accounting-table thead tr:first-child th {
                    font-weight: bold;
                    text-align: center;
                    background-color: #f8fafc !important;
                    -webkit-print-color-adjust: exact;
                    print-color-adjust: exact;
                }
                table.accounting-table thead tr:nth-child(2) th {
                    font-weight: bold;
                    text-align: center;
                    font-size: 9.5pt;
                    background-color: #f1f5f9 !important;
                    -webkit-print-color-adjust: exact;
                    print-color-adjust: exact;
                }
                table.accounting-table tbody td {
                    border-top: 1px dotted #444;
                    border-bottom: 1px dotted #444;
                    border-left: 1px solid #000;
                    border-right: 1px solid #000;
                }
                table.accounting-table tfoot td {
                    font-weight: bold;
                    border: 1px solid #000;
                    background-color: #f8fafc !important;
                    -webkit-print-color-adjust: exact;
                    print-color-adjust: exact;
                }
                .signature-date-row {
                    display: flex;
                    justify-content: space-between;
                    margin-top: 25px;
                    font-size: 10.5pt;
                }
                .signature-titles-row {
                    display: flex;
                    justify-content: space-between;
                    text-align: center;
                    margin-top: 8px;
                    font-size: 10.5pt;
                }
                .signature-titles-row .sign-col {
                    width: 32%;
                }
                .signature-titles-row .sign-name {
                    font-weight: bold;
                }
                .signature-titles-row .sign-note {
                    font-style: italic;
                    font-size: 9.5pt;
                    margin-top: 2px;
                }
                @media print {
                    .no-print { display: none !important; }
                    body { padding: 0; }
                }
            </style>
        </head>
        <body>
            <div class="no-print" style="text-align: right; margin-bottom: 15px;">
                <button onclick="window.print()" style="padding: 8px 18px; background: #0d6efd; color: #fff; border: none; border-radius: 4px; font-weight: bold; cursor: pointer;">
                    In Báo Cáo
                </button>
            </div>
            <div class="header-company">
                <div class="comp-name">Đơn vị : ${escapeHtml(companyName)}</div>
                <div class="comp-addr">Địa chỉ : ${escapeHtml(companyAddress)}</div>
            </div>
            <div class="report-title-area">
                <div class="report-title">${escapeHtml(title)}</div>
                <div class="report-subtitle">${escapeHtml(curMonthText)}</div>
                ${accountText ? `<div class="report-subtitle">${escapeHtml(accountText)}</div>` : ''}
            </div>
            <div class="unit-label">${escapeHtml(unitText)}</div>

            <table class="accounting-table">
                <thead>
                    <tr>
                        ${columns.map(c => `<th>${escapeHtml(c.header)}</th>`).join('')}
                    </tr>
                    <tr>
                        ${columns.map((c, i) => `<th>${escapeHtml(c.code || String(i + 1))}</th>`).join('')}
                    </tr>
                </thead>
                <tbody>
                    ${rows.map(row => `
                        <tr>
                            ${row.map((val, idx) => {
                                const col = columns[idx] || {};
                                const isNum = col.isNumber;
                                const align = col.align || (isNum ? 'right' : 'left');
                                const displayVal = (isNum && typeof val === 'number') ? formatVNDClean(val) : (val !== null && val !== undefined ? escapeHtml(String(val)) : '');
                                return `<td style="text-align: ${align};">${displayVal}</td>`;
                            }).join('')}
                        </tr>
                    `).join('')}
                </tbody>
                ${summaryHtml}
            </table>

            <div class="signature-date-row">
                <div>${escapeHtml(defaultDateOpen)}</div>
                <div style="text-align: center; min-width: 280px;">${escapeHtml(defaultDateClose)}</div>
            </div>
            <div class="signature-titles-row">
                <div class="sign-col">
                    <div class="sign-name">Người ghi sổ</div>
                    <div class="sign-note">(ký, họ tên)</div>
                </div>
                <div class="sign-col">
                    <div class="sign-name">Kế toán trưởng</div>
                    <div class="sign-note">(ký, họ tên)</div>
                </div>
                <div class="sign-col">
                    <div class="sign-name">Giám đốc</div>
                    <div class="sign-note">(ký, họ tên, đóng dấu)</div>
                </div>
            </div>

            <script>
                window.onload = function() {
                    setTimeout(function() {
                        window.print();
                    }, 350);
                };
            </script>
        </body>
        </html>
    `);
    printWindow.document.close();
}
window.printAccountingReport = printAccountingReport;


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
        const res = await apiRequest('/api/system/sync-sheets', 'POST', null, 90000);
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
    if (e.data && (e.data.type === 'PRODUCTS_UPDATED' || e.data.type === 'DATA_UPDATED' || e.data.type === 'DEBT_UPDATED' || e.data.type === 'BALANCE_UPDATED')) {
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
        if (e.data && (e.data.type === 'PRODUCTS_UPDATED' || e.data.type === 'DATA_UPDATED' || e.data.type === 'DEBT_UPDATED' || e.data.type === 'BALANCE_UPDATED')) {
            document.querySelectorAll('.tab-frame').forEach(f => {
                try {
                    f.contentWindow.postMessage(e.data, '*');
                } catch (err) {}
            });
        }
    };
} catch (err) {}

// ── Shared Date Range Presets Helper ─────────────────────────────────────────
function getPresetDateRange(type) {
    const today = new Date();
    let fromDate = new Date();
    let toDate = new Date();

    if (type === 'today') {
        fromDate = today;
        toDate = today;
    } else if (type === 'week') {
        const day = today.getDay();
        const diff = today.getDate() - day + (day === 0 ? -6 : 1); // Thứ 2 đầu tuần
        fromDate = new Date(today.getFullYear(), today.getMonth(), diff);
        toDate = new Date(today.getFullYear(), today.getMonth(), diff + 6);
    } else if (type === 'month') {
        fromDate = new Date(today.getFullYear(), today.getMonth(), 1);
        toDate = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    } else if (type === 'year') {
        fromDate = new Date(today.getFullYear(), 0, 1);
        toDate = new Date(today.getFullYear(), 11, 31);
    } else if (type === 'all') {
        return { from: '', to: '' };
    }

    const pad = n => String(n).padStart(2, '0');
    const formatISO = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

    return {
        from: formatISO(fromDate),
        to: formatISO(toDate)
    };
}
window.getPresetDateRange = getPresetDateRange;




// ── Account & Password Management Modal Logic ──────────────────────────────
let currentUserInfo = null;
let accountModalInstance = null;
let resetPwdModalInstance = null;

async function openAccountModal() {
    try {
        const modalEl = document.getElementById('account-modal');
        if (!modalEl) return;
        if (!accountModalInstance) {
            accountModalInstance = new bootstrap.Modal(modalEl);
        }

        // Lấy thông tin tài khoản hiện tại
        const res = await fetch('/api/auth/me');
        if (res.ok) {
            currentUserInfo = await res.json();
            const usernameEl = document.getElementById('acc-display-username');
            const roleEl = document.getElementById('acc-display-role');
            const navAdminTab = document.getElementById('nav-item-manage-users');

            if (usernameEl) usernameEl.textContent = currentUserInfo.full_name ? `${currentUserInfo.full_name} (${currentUserInfo.username})` : currentUserInfo.username;
            if (roleEl) {
                if (currentUserInfo.role === 'admin') {
                    roleEl.innerHTML = '<span class="badge bg-danger">Quản Trị Viên / Tester</span>';
                } else if (currentUserInfo.role === 'kho') {
                    roleEl.innerHTML = '<span class="badge bg-primary">Kho Hàng An Nam</span>';
                } else {
                    roleEl.innerHTML = `<span class="badge bg-secondary">${currentUserInfo.role || 'Nhân viên'}</span>`;
                }
            }

            // Hiển thị hoặc ẩn tab Quản trị tài khoản
            if (navAdminTab) {
                if (currentUserInfo.is_admin) {
                    navAdminTab.style.display = 'block';
                    loadUsersList();
                } else {
                    navAdminTab.style.display = 'none';
                    // Active lại tab Đổi mật khẩu
                    const pwdTabBtn = document.getElementById('tab-change-pwd-btn');
                    if (pwdTabBtn) {
                        const tabTrigger = new bootstrap.Tab(pwdTabBtn);
                        tabTrigger.show();
                    }
                }
            }
        }

        // Reset form đổi mật khẩu
        const formChangePwd = document.getElementById('form-change-password');
        if (formChangePwd) formChangePwd.reset();

        accountModalInstance.show();
    } catch (err) {
        console.error('Lỗi khi mở modal tài khoản:', err);
        showToast('Không thể mở thông tin tài khoản', 'error');
    }
}
window.openAccountModal = openAccountModal;

function togglePasswordVisibility(inputId) {
    const input = document.getElementById(inputId);
    if (!input) return;
    const btn = input.nextElementSibling;
    const icon = btn ? btn.querySelector('i') : null;

    if (input.type === 'password') {
        input.type = 'text';
        if (icon) {
            icon.classList.remove('bi-eye');
            icon.classList.add('bi-eye-slash');
        }
    } else {
        input.type = 'password';
        if (icon) {
            icon.classList.remove('bi-eye-slash');
            icon.classList.add('bi-eye');
        }
    }
}
window.togglePasswordVisibility = togglePasswordVisibility;

async function submitChangePassword(e) {
    if (e) e.preventDefault();
    const curPwd = document.getElementById('cp-current-password')?.value || '';
    const newPwd = document.getElementById('cp-new-password')?.value || '';
    const confirmPwd = document.getElementById('cp-confirm-password')?.value || '';
    const submitBtn = document.getElementById('btn-submit-change-pwd');

    if (newPwd.length < 4) {
        showToast('Mật khẩu mới phải có ít nhất 4 ký tự', 'error');
        return;
    }

    if (newPwd !== confirmPwd) {
        showToast('Mật khẩu xác nhận không trùng khớp!', 'error');
        return;
    }

    await withButtonLoading(submitBtn, async () => {
        try {
            const res = await fetch('/api/auth/change-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    current_password: curPwd,
                    new_password: newPwd
                })
            });

            const data = await res.json();
            if (res.ok && data.success) {
                showToast('Đổi mật khẩu thành công! Hãy ghi nhớ mật khẩu mới.', 'success');
                const form = document.getElementById('form-change-password');
                if (form) form.reset();
                if (accountModalInstance) accountModalInstance.hide();
            } else {
                showToast(data.detail || 'Đổi mật khẩu thất bại, vui lòng kiểm tra lại mật khẩu cũ!', 'error');
            }
        } catch (err) {
            console.error('Lỗi đổi mật khẩu:', err);
            showToast('Lỗi kết nối máy chủ khi đổi mật khẩu', 'error');
        }
    }, 'Đang cập nhật...');
}
window.submitChangePassword = submitChangePassword;

async function loadUsersList() {
    const tbody = document.getElementById('users-table-body');
    if (!tbody) return;

    try {
        const res = await fetch('/api/auth/users');
        if (!res.ok) {
            tbody.innerHTML = `<tr><td colspan="5" class="text-center py-3 text-danger">Không có quyền xem danh sách người dùng</td></tr>`;
            return;
        }

        const data = await res.json();
        const users = data.users || [];

        if (users.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" class="text-center py-3 text-muted">Chưa có người dùng nào</td></tr>`;
            return;
        }

        tbody.innerHTML = users.map(u => {
            const roleBadge = u.role === 'admin'
                ? '<span class="badge bg-danger-subtle text-danger border border-danger-subtle">Quản trị viên / Tester</span>'
                : '<span class="badge bg-primary-subtle text-primary border border-primary-subtle">Kho Hàng An Nam</span>';
            const isProtected = u.username === 'admin';
            const createdDate = u.created_at ? formatDate(u.created_at) : '---';

            return `
                <tr>
                    <td class="fw-bold text-dark">
                        <i class="bi bi-person-circle me-1 text-secondary"></i>${u.username}
                        ${isProtected ? '<span class="badge bg-warning-subtle text-warning-emphasis ms-1" style="font-size: 0.65rem;">Gốc</span>' : ''}
                    </td>
                    <td>${u.full_name || '---'}</td>
                    <td>${roleBadge}</td>
                    <td class="text-muted">${createdDate}</td>
                    <td class="text-end">
                        <div class="btn-group btn-group-sm">
                            <button class="btn btn-outline-warning btn-sm" onclick="openResetPasswordModal('${u.username}')" title="Đặt lại mật khẩu">
                                <i class="bi bi-key-fill"></i> Đổi MK
                            </button>
                            ${!isProtected ? `
                            <button class="btn btn-outline-danger btn-sm" onclick="deleteUser('${u.username}')" title="Xóa tài khoản">
                                <i class="bi bi-trash3"></i>
                            </button>
                            ` : ''}
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    } catch (err) {
        console.error('Lỗi tải danh sách users:', err);
        tbody.innerHTML = `<tr><td colspan="5" class="text-center py-3 text-danger">Lỗi khi tải danh sách tài khoản</td></tr>`;
    }
}
window.loadUsersList = loadUsersList;

async function submitCreateUser(e) {
    if (e) e.preventDefault();
    const username = document.getElementById('nu-username')?.value.trim();
    const password = document.getElementById('nu-password')?.value;
    const full_name = document.getElementById('nu-fullname')?.value.trim();
    const role = document.getElementById('nu-role')?.value || 'kho';

    if (!username || !password) {
        showToast('Vui lòng điền tên đăng nhập và mật khẩu', 'error');
        return;
    }

    try {
        const res = await fetch('/api/auth/users', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username,
                password,
                full_name,
                role
            })
        });

        const data = await res.json();
        if (res.ok && data.success) {
            showToast(`Tạo tài khoản "${username}" thành công!`, 'success');
            const form = document.getElementById('form-create-user');
            if (form) form.reset();
            // Đóng collapse
            const collapseEl = document.getElementById('collapse-create-user');
            if (collapseEl && window.bootstrap) {
                const bsCollapse = bootstrap.Collapse.getInstance(collapseEl) || new bootstrap.Collapse(collapseEl);
                bsCollapse.hide();
            }
            loadUsersList();
        } else {
            showToast(data.detail || 'Không thể tạo tài khoản, có thể tên đăng nhập đã tồn tại', 'error');
        }
    } catch (err) {
        console.error('Lỗi tạo tài khoản:', err);
        showToast('Lỗi khi gửi yêu cầu tạo tài khoản', 'error');
    }
}
window.submitCreateUser = submitCreateUser;

function openResetPasswordModal(username) {
    const targetEl = document.getElementById('reset-pwd-target-user');
    const inputEl = document.getElementById('reset-new-pwd-input');
    if (targetEl) targetEl.textContent = username;
    if (inputEl) inputEl.value = '';

    const modalEl = document.getElementById('reset-pwd-modal');
    if (!resetPwdModalInstance && modalEl) {
        resetPwdModalInstance = new bootstrap.Modal(modalEl);
    }
    if (resetPwdModalInstance) resetPwdModalInstance.show();
}
window.openResetPasswordModal = openResetPasswordModal;

async function submitResetPassword(e) {
    if (e) e.preventDefault();
    const targetUser = document.getElementById('reset-pwd-target-user')?.textContent.trim();
    const newPwd = document.getElementById('reset-new-pwd-input')?.value;

    if (!targetUser || !newPwd) {
        showToast('Vui lòng nhập mật khẩu mới', 'error');
        return;
    }

    try {
        const res = await fetch(`/api/auth/users/${encodeURIComponent(targetUser)}/reset-password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ new_password: newPwd })
        });

        const data = await res.json();
        if (res.ok && data.success) {
            showToast(`Đã đặt lại mật khẩu cho tài khoản "${targetUser}" thành công!`, 'success');
            if (resetPwdModalInstance) resetPwdModalInstance.hide();
        } else {
            showToast(data.detail || 'Đặt lại mật khẩu thất bại', 'error');
        }
    } catch (err) {
        console.error('Lỗi đặt lại mật khẩu:', err);
        showToast('Lỗi kết nối khi đặt lại mật khẩu', 'error');
    }
}
window.submitResetPassword = submitResetPassword;

async function deleteUser(username) {
    if (!confirm(`Bạn có chắc chắn muốn xóa tài khoản "${username}"? Hành động này không thể hoàn tác.`)) {
        return;
    }

    try {
        const res = await fetch(`/api/auth/users/${encodeURIComponent(username)}`, {
            method: 'DELETE'
        });

        const data = await res.json();
        if (res.ok && data.success) {
            showToast(`Đã xóa tài khoản "${username}" thành công!`, 'success');
            loadUsersList();
        } else {
            showToast(data.detail || 'Không thể xóa tài khoản', 'error');
        }
    } catch (err) {
        console.error('Lỗi xóa user:', err);
        showToast('Lỗi khi xóa tài khoản', 'error');
    }
}
window.deleteUser = deleteUser;


// ── Quản Lý Nhật Ký Hoạt Động & Sửa Lỗi (Activity & Audit Logs) ───────────

let activityLogModalInstance = null;
let logSearchDebounceTimer = null;
let currentActivityLogsData = [];

async function openActivityLogModal() {
    try {
        // Kiểm tra quyền Admin trước khi mở nhật ký
        let isAdmin = false;
        try {
            const meRes = await fetch('/api/auth/me');
            if (meRes.ok) {
                const meData = await meRes.json();
                window.currentUserInfo = meData;
                isAdmin = !!meData.is_admin;
            }
        } catch (e) {}

        if (!isAdmin) {
            showToast('Chỉ tài khoản Quản trị viên (Admin) mới có quyền xem nhật ký hoạt động!', 'error');
            return;
        }

        const modalEl = document.getElementById('activity-log-modal');
        if (!modalEl) return;

        if (!activityLogModalInstance) {
            activityLogModalInstance = new bootstrap.Modal(modalEl);
        }

        const clearBtn = document.getElementById('btn-clear-activity-logs');
        if (clearBtn) {
            clearBtn.classList.remove('d-none');
            clearBtn.classList.add('d-flex');
        }

        activityLogModalInstance.show();
        await fetchActivityLogs();
    } catch (err) {
        console.error('Lỗi khi mở modal nhật ký:', err);
    }
}
window.openActivityLogModal = openActivityLogModal;

function handleLogSearchInput(event) {
    if (logSearchDebounceTimer) clearTimeout(logSearchDebounceTimer);
    logSearchDebounceTimer = setTimeout(() => {
        fetchActivityLogs();
    }, 350);
}
window.handleLogSearchInput = handleLogSearchInput;

async function fetchActivityLogs() {
    const container = document.getElementById('log-container');
    const statusSummary = document.getElementById('log-status-summary');
    const refreshBtn = document.getElementById('btn-refresh-logs');
    const sizeBadge = document.getElementById('log-file-size-badge');

    if (!container) return;

    if (refreshBtn) {
        refreshBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Đang tải...';
        refreshBtn.disabled = true;
    }

    const search = (document.getElementById('log-search-input')?.value || '').trim();
    const level = document.getElementById('log-level-filter')?.value || '';
    const lines = document.getElementById('log-lines-limit')?.value || '150';

    try {
        const url = `/api/system/activity-logs?lines=${encodeURIComponent(lines)}&search=${encodeURIComponent(search)}&level=${encodeURIComponent(level)}`;
        const res = await fetch(url);
        if (res.status === 403) {
            showToast('Chỉ tài khoản Quản trị viên (Admin) mới có quyền xem nhật ký hoạt động!', 'error');
            if (activityLogModalInstance) activityLogModalInstance.hide();
            return;
        }
        if (!res.ok) {
            throw new Error(`Mã lỗi HTTP: ${res.status}`);
        }

        const data = await res.json();
        if (!data.success) {
            throw new Error(data.detail || 'Không thể tải nhật ký');
        }

        currentActivityLogsData = data.logs || [];

        if (sizeBadge) {
            sizeBadge.textContent = `${data.file_size} | logs/activity.log`;
        }

        if (statusSummary) {
            statusSummary.innerHTML = `Hiển thị <strong>${currentActivityLogsData.length}</strong> bản ghi gần nhất ${search ? `(Tìm kiếm: "${escapeHtml(search)}")` : ''} | Kích thước file: <strong>${data.file_size}</strong>`;
        }

        renderActivityLogs();
    } catch (err) {
        console.error('Lỗi khi tải nhật ký hoạt động:', err);
        container.innerHTML = `
            <div class="alert alert-danger py-3 px-4 mb-0 small">
                <i class="bi bi-exclamation-triangle-fill me-2"></i>Không thể tải nhật ký hoạt động: ${escapeHtml(err.message)}
            </div>
        `;
        if (statusSummary) statusSummary.textContent = 'Lỗi tải dữ liệu';
    } finally {
        if (refreshBtn) {
            refreshBtn.innerHTML = '<i class="bi bi-arrow-clockwise"></i> <span>Làm mới</span>';
            refreshBtn.disabled = false;
        }
    }
}
window.fetchActivityLogs = fetchActivityLogs;

function renderActivityLogs() {
    const container = document.getElementById('log-container');
    if (!container) return;

    const isCompact = document.getElementById('toggle-compact-log')?.checked;

    if (!currentActivityLogsData || currentActivityLogsData.length === 0) {
        container.innerHTML = `
            <div class="text-center py-5 text-muted">
                <i class="bi bi-journal-x fs-2 d-block mb-2 text-secondary opacity-50"></i>
                Chưa có dữ liệu nhật ký phù hợp với bộ lọc hiện tại.
            </div>
        `;
        return;
    }

    if (isCompact) {
        // Giao diện dòng gọn (Console view)
        const consoleLines = currentActivityLogsData.map(item => {
            const raw = item.raw || `[${item.timestamp}] [${item.level}] [User: ${item.user} | IP: ${item.ip}] [${item.action}] ${item.message}`;
            let color = '#22c55e'; // green
            if (item.level === 'WARNING') color = '#eab308'; // yellow
            if (item.level === 'ERROR' || item.level === 'CRITICAL') color = '#ef4444'; // red
            return `<div style="color: ${color}; white-space: pre-wrap; word-break: break-all; margin-bottom: 2px;">${escapeHtml(raw)}</div>`;
        }).join('');

        container.innerHTML = `
            <div class="p-3 bg-dark rounded-2 text-light" style="font-family: Consolas, 'Courier New', monospace; font-size: 0.82rem; line-height: 1.45; min-height: 200px;">
                ${consoleLines}
            </div>
        `;
        return;
    }

    // Giao diện danh sách thẻ chuyên nghiệp (Card list view)
    let html = '<div class="d-flex flex-column gap-2">';
    for (const item of currentActivityLogsData) {
        let levelBadgeClass = 'bg-primary-subtle text-primary border border-primary-subtle';
        let levelIcon = 'bi-info-circle-fill';

        if (item.level === 'WARNING') {
            levelBadgeClass = 'bg-warning-subtle text-dark border border-warning-subtle';
            levelIcon = 'bi-exclamation-triangle-fill';
        } else if (item.level === 'ERROR' || item.level === 'CRITICAL') {
            levelBadgeClass = 'bg-danger-subtle text-danger border border-danger-subtle';
            levelIcon = 'bi-x-circle-fill';
        }

        const hasTraceback = item.message && item.message.includes('Traceback');
        let displayMessage = item.message || '';
        let tracebackHtml = '';

        if (hasTraceback) {
            const parts = displayMessage.split('\nTraceback:');
            displayMessage = parts[0];
            const tbContent = parts[1] || '';
            tracebackHtml = `
                <details class="mt-2">
                    <summary class="text-danger small fw-bold" style="cursor: pointer;">
                        <i class="bi bi-bug me-1"></i>Chi tiết lỗi máy chủ (Traceback kỹ thuật)
                    </summary>
                    <pre class="bg-dark text-white p-2 rounded small mt-1 mb-0" style="font-size: 0.78rem; overflow-x: auto; max-height: 260px;"><code>${escapeHtml(tbContent.trim())}</code></pre>
                </details>
            `;
        }

        html += `
            <div class="border rounded-2 p-2 px-3 bg-white hover-shadow-sm d-flex flex-column gap-1" style="border-left: 4px solid ${item.level === 'ERROR' ? '#dc3545' : (item.level === 'WARNING' ? '#ffc107' : '#0d6efd')} !important;">
                <div class="d-flex align-items-center justify-content-between flex-wrap gap-2 small">
                    <div class="d-flex align-items-center gap-2 flex-wrap">
                        <span class="badge ${levelBadgeClass} py-1 px-2 d-flex align-items-center gap-1 font-monospace" style="font-size: 0.75rem;">
                            <i class="bi ${levelIcon}"></i> ${escapeHtml(item.level)}
                        </span>
                        <span class="badge bg-secondary-subtle text-secondary py-1 px-2 font-monospace" style="font-size: 0.75rem;">
                            <i class="bi bi-clock me-1"></i>${escapeHtml(item.timestamp || '-')}
                        </span>
                        <span class="badge bg-info-subtle text-dark py-1 px-2" style="font-size: 0.75rem;">
                            <i class="bi bi-person me-1"></i>${escapeHtml(item.user || '-')}
                        </span>
                        <span class="text-muted small">
                            <i class="bi bi-hdd-network me-1"></i>IP: ${escapeHtml(item.ip || '-')}
                        </span>
                    </div>
                    <span class="badge bg-light text-dark border py-1 px-2 fw-semibold" style="font-size: 0.75rem;">
                        ${escapeHtml(item.action || 'HOẠT ĐỘNG')}
                    </span>
                </div>
                <div class="text-dark small mt-1" style="line-height: 1.45; word-break: break-word;">
                    ${escapeHtml(displayMessage)}
                    ${tracebackHtml}
                </div>
            </div>
        `;
    }
    html += '</div>';

    container.innerHTML = html;
}

function toggleCompactLogView(checkbox) {
    renderActivityLogs();
}
window.toggleCompactLogView = toggleCompactLogView;

function downloadActivityLogFile() {
    window.open('/api/system/activity-logs/download', '_blank');
}
window.downloadActivityLogFile = downloadActivityLogFile;

async function confirmClearActivityLogs() {
    if (!confirm('BẠN CÓ CHẮC CHẮN MUỐN XÓA TOÀN BỘ NHẬT KÝ HOẠT ĐỘNG?\\n\\nThao tác này sẽ làm trắng file log activity.log. Dữ liệu lịch sử cũ sẽ không thể khôi phục.')) {
        return;
    }

    try {
        const res = await fetch('/api/system/activity-logs/clear', {
            method: 'POST'
        });
        const data = await res.json();
        if (res.ok && data.success) {
            showToast('Đã làm mới toàn bộ file nhật ký hoạt động thành công!', 'success');
            await fetchActivityLogs();
        } else {
            showToast(data.detail || 'Không thể xóa nhật ký', 'error');
        }
    } catch (err) {
        console.error('Lỗi khi xóa nhật ký:', err);
        showToast('Lỗi khi gửi yêu cầu xóa nhật ký', 'error');
    }
}
window.confirmClearActivityLogs = confirmClearActivityLogs;

/**
 * ── Mở modal tạo nhanh hàng hóa trực tiếp trong chi tiết phiếu ─────────
 */
function openQuickCreateProductInReceipt() {
    // Đảm bảo modal tồn tại trong DOM
    if (!document.getElementById('modal-quick-create-prod')) {
        const modalDiv = document.createElement('div');
        modalDiv.className = 'modal fade';
        modalDiv.id = 'modal-quick-create-prod';
        modalDiv.tabIndex = -1;
        modalDiv.setAttribute('aria-hidden', 'true');
        modalDiv.style.zIndex = '1070';
        modalDiv.innerHTML = `
            <div class="modal-dialog modal-dialog-centered">
                <div class="modal-content shadow-lg border-0 rounded-3">
                    <div class="modal-header bg-primary text-white py-2 px-3">
                        <h6 class="modal-title fw-bold fs-6 d-flex align-items-center gap-2 mb-0 text-white">
                            <i class="bi bi-box-seam-fill"></i> Tạo Hàng Hóa Mới
                        </h6>
                        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>
                    </div>
                    <form id="form-quick-create-prod" onsubmit="submitQuickCreateProductInReceipt(event)">
                        <div class="modal-body p-3">
                            <div class="mb-3">
                                <label class="form-label small fw-semibold text-secondary mb-1">
                                    Tên Hàng Hóa <span class="text-danger">*</span>
                                </label>
                                <input type="text" class="form-control form-control-sm fw-semibold" id="quick-prod-ten" placeholder="Nhập tên hàng hóa, cấu hình..." required autocomplete="off">
                            </div>
                            <div class="row g-2 mb-3">
                                <div class="col-6">
                                    <label class="form-label small fw-semibold text-secondary mb-1">Danh Mục</label>
                                    <select class="form-select form-select-sm" id="quick-prod-danh-muc">
                                        <option value="Laptop" selected>Laptop</option>
                                        <option value="Phụ Kiện">Phụ Kiện</option>
                                        <option value="Linh Kiện">Linh Kiện</option>
                                        <option value="Khác">Khác</option>
                                    </select>
                                </div>
                                <div class="col-6">
                                    <label class="form-label small fw-semibold text-secondary mb-1">Đơn Vị Tính</label>
                                    <select class="form-select form-select-sm" id="quick-prod-dvt">
                                        <option value="Cái" selected>Cái</option>
                                        <option value="Bộ">Bộ</option>
                                        <option value="Chiếc">Chiếc</option>
                                        <option value="Hộp">Hộp</option>
                                        <option value="Gói">Gói</option>
                                        <option value="Cặp">Cặp</option>
                                    </select>
                                </div>
                            </div>
                            <div class="row g-2 mb-3">
                                <div class="col-6">
                                    <label class="form-label small fw-semibold text-secondary mb-1">Giá Nhập (đ)</label>
                                    <input type="text" inputmode="numeric" class="form-control form-control-sm text-end fw-semibold" id="quick-prod-gia-nhap" value="0" placeholder="0">
                                </div>
                                <div class="col-6">
                                    <label class="form-label small fw-semibold text-secondary mb-1">Giá Bán (đ)</label>
                                    <input type="text" inputmode="numeric" class="form-control form-control-sm text-end fw-semibold" id="quick-prod-gia-ban" value="0" placeholder="0">
                                </div>
                            </div>
                            <div class="mb-2">
                                <label class="form-label small fw-semibold text-secondary mb-1">Ghi Chú</label>
                                <input type="text" class="form-control form-control-sm" id="quick-prod-ghi-chu" placeholder="Ghi chú thêm về hàng hóa...">
                            </div>
                        </div>
                        <div class="modal-footer py-2 px-3 bg-light d-flex justify-content-between">
                            <button type="button" class="btn btn-secondary btn-sm" data-bs-dismiss="modal">Hủy</button>
                            <button type="submit" class="btn btn-primary btn-sm fw-bold px-3" id="btn-submit-quick-create-prod">
                                <i class="bi bi-check-circle me-1"></i>Tạo &amp; Chọn Ngay
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        `;
        document.body.appendChild(modalDiv);
    }

    // Đóng gợi ý dropdown chi tiết phiếu
    document.getElementById('detail-add-prod-sug')?.classList.add('d-none');

    // Cập nhật các danh mục đang có trong hệ thống vào dropdown Danh Mục
    const dmSelect = document.getElementById('quick-prod-danh-muc');
    if (dmSelect) {
        const defaultCats = ['Laptop', 'Phụ Kiện', 'Linh Kiện', 'Khác'];
        const existingCats = Array.from(new Set((window.allReceiptProductsCache || []).map(p => p.danh_muc).filter(Boolean)));
        const allCats = Array.from(new Set([...defaultCats, ...existingCats]));
        const curVal = dmSelect.value || 'Laptop';
        dmSelect.innerHTML = allCats.map(c => `<option value="${escapeHtml(c)}" ${c === curVal ? 'selected' : ''}>${escapeHtml(c)}</option>`).join('');
    }

    const dvtSelect = document.getElementById('quick-prod-dvt');
    if (dvtSelect && (!dvtSelect.options || !dvtSelect.options.length)) {
        const units = ['Cái', 'Bộ', 'Chiếc', 'Hộp', 'Gói', 'Cặp'];
        dvtSelect.innerHTML = units.map(u => `<option value="${u}">${u}</option>`).join('');
    }
    if (dvtSelect && !dvtSelect.value) {
        dvtSelect.value = 'Cái';
    }

    // Lấy query text hiện tại (nếu người dùng vừa gõ vào ô tìm kiếm hàng)
    const curQuery = (document.getElementById('detail-add-prod-input')?.value || '').trim();
    const tenInput = document.getElementById('quick-prod-ten');
    if (tenInput) {
        tenInput.value = curQuery;
    }

    const curGiaVal = parseCurrencyValue(document.getElementById('detail-add-gia')?.value || 0);
    const isXuat = window.currentReceiptDetail?.type === 'xuat';

    const giaNhapInput = document.getElementById('quick-prod-gia-nhap');
    if (giaNhapInput) {
        giaNhapInput.value = (!isXuat && curGiaVal > 0) ? formatNumber(curGiaVal) : '0';
    }

    const giaBanInput = document.getElementById('quick-prod-gia-ban');
    if (giaBanInput) {
        giaBanInput.value = (isXuat && curGiaVal > 0) ? formatNumber(curGiaVal) : '0';
    }

    // Tự động định dạng tiền tệ khi người dùng gõ
    [giaNhapInput, giaBanInput].forEach(inp => {
        if (inp && !inp.dataset.boundCurrency) {
            inp.dataset.boundCurrency = 'true';
            inp.addEventListener('input', function() {
                const raw = parseCurrencyValue(this.value);
                this.value = raw > 0 ? formatNumber(raw) : (raw === 0 ? '0' : '');
            });
        }
    });

    openModal('modal-quick-create-prod');
    setTimeout(() => {
        if (tenInput) {
            tenInput.focus();
            if (curQuery) tenInput.select();
        }
    }, 200);
}
window.openQuickCreateProductInReceipt = openQuickCreateProductInReceipt;

/**
 * Submit form tạo nhanh hàng hóa
 */
async function submitQuickCreateProductInReceipt(e) {
    if (e) e.preventDefault();
    const ten = (document.getElementById('quick-prod-ten')?.value || '').trim();
    if (!ten) {
        showToast('Vui lòng nhập tên hàng hóa!', 'warning');
        document.getElementById('quick-prod-ten')?.focus();
        return;
    }

    const danhMuc = (document.getElementById('quick-prod-danh-muc')?.value || '').trim() || 'Laptop';
    const dvt = (document.getElementById('quick-prod-dvt')?.value || '').trim() || 'Cái';
    const giaNhap = parseCurrencyValue(document.getElementById('quick-prod-gia-nhap')?.value || 0);
    const giaBan = parseCurrencyValue(document.getElementById('quick-prod-gia-ban')?.value || 0);
    const ghiChu = (document.getElementById('quick-prod-ghi-chu')?.value || '').trim();

    const btn = document.getElementById('btn-submit-quick-create-prod');
    const origHtml = btn ? btn.innerHTML : '';
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Đang tạo...';
    }

    try {
        showLoading();
        const payload = {
            ten_hang: ten,
            danh_muc: danhMuc,
            don_vi_tinh: dvt,
            gia_nhap: giaNhap,
            gia_ban: giaBan,
            ton_kho: 0,
            ghi_chu: ghiChu
        };

        const res = await apiRequest('/api/hang-hoa', 'POST', payload);
        const newProd = res.data;

        showToast(`Đã tạo hàng hóa [${newProd.ma_hang}] ${newProd.ten_hang} thành công!`, 'success');
        closeModal('modal-quick-create-prod');

        // Cập nhật bộ nhớ cache danh sách sản phẩm
        if (!window.allReceiptProductsCache) window.allReceiptProductsCache = [];
        window.allReceiptProductsCache.unshift(newProd);

        // Tự động điền sản phẩm vừa tạo vào form thêm hàng của phiếu
        selectDetailProduct(newProd.ma_hang);

        // Báo cho toàn hệ thống cập nhật sản phẩm
        broadcastDataUpdate('PRODUCTS_UPDATED');
    } catch (err) {
        showToast('Lỗi khi tạo hàng hóa: ' + (err.message || 'Không thể tạo'), 'error');
    } finally {
        hideLoading();
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = origHtml;
        }
    }
}
window.submitQuickCreateProductInReceipt = submitQuickCreateProductInReceipt;

