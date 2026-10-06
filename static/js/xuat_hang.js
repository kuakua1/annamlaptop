/**
 * xuat_hang.js - Export goods page logic
 * Có lưu trạng thái form vào sessionStorage để giữ dữ liệu khi chuyển tab
 * Sử dụng Autocomplete tìm kiếm hàng hóa theo Mã hoặc Tên thay vì Dropdown
 */

const urlParams = new URLSearchParams(window.location.search);
const currentTabId = urlParams.get('tab_id') || `xuat_hang_${Date.now()}`;
const STATE_KEY = `xuat_hang_state_${currentTabId}`;

// Xóa key dùng chung cũ nếu còn tồn tại trong bộ nhớ trình duyệt
try {
    sessionStorage.removeItem('xuat_hang_state');
} catch (e) {}

let products = [];
let customers = [];
let itemCount = 0;

// ── State persistence ────────────────────────────────────────────────────────

function saveState() {
    const rows = document.querySelectorAll('#items-tbody tr');
    const items = [];
    rows.forEach(row => {
        const id = row.id.replace('row-', '');
        const ma_hang = document.getElementById(`prod-ma-${id}`)?.value || '';
        items.push({
            rowId: id,
            ma_hang: ma_hang,
            so_luong: document.getElementById(`sl-${id}`)?.value || 1,
            gia_ban: document.getElementById(`gia-${id}`)?.value || 0,
        });
    });

    const state = {
        ngay: document.getElementById('f-ngay')?.value || '',
        kh_id: document.getElementById('f-kh-id')?.value || '',
        kh_ten: document.getElementById('f-kh-ten')?.value || '',
        kh_dia_chi: document.getElementById('f-kh-dia-chi')?.value || '',
        kh_sdt: document.getElementById('f-kh-sdt')?.value || '',
        ghi_chu: document.getElementById('f-ghi-chu')?.value || '',
        items,
        itemCount,
    };
    sessionStorage.setItem(STATE_KEY, JSON.stringify(state));
}

function restoreState(state) {
    if (!state) return false;
    try {
        const ngayEl = document.getElementById('f-ngay');
        if (ngayEl) ngayEl.value = state.ngay || todayISO();
        const khIdEl = document.getElementById('f-kh-id');
        if (khIdEl) khIdEl.value = state.kh_id || '';
        const khTenEl = document.getElementById('f-kh-ten');
        if (khTenEl) khTenEl.value = state.kh_ten || '';
        const khDiaChiEl = document.getElementById('f-kh-dia-chi');
        if (khDiaChiEl) khDiaChiEl.value = state.kh_dia_chi || '';
        const khSdtEl = document.getElementById('f-kh-sdt');
        if (khSdtEl) khSdtEl.value = state.kh_sdt || '';
        const ghiChuEl = document.getElementById('f-ghi-chu');
        if (ghiChuEl) ghiChuEl.value = state.ghi_chu || '';

        if (state.items && Array.isArray(state.items) && state.items.length > 0) {
            const tbody = document.getElementById('items-tbody');
            if (tbody) tbody.innerHTML = '';
            itemCount = parseInt(state.itemCount) || 0;
            state.items.forEach(item => {
                addItemWithData(item.rowId, item.ma_hang, item.so_luong, item.gia_ban);
            });
            calcTotal();
            return true;
        }
    } catch (e) {
        console.warn('Lỗi phục hồi trạng thái phiếu xuất:', e);
    }
    return false;
}

function clearState() {
    sessionStorage.removeItem(STATE_KEY);
}

function bindAutoSave() {
    document.getElementById('f-ngay').addEventListener('change', saveState);
    document.getElementById('f-kh-ten').addEventListener('input', saveState);
    document.getElementById('f-kh-dia-chi').addEventListener('input', saveState);
    document.getElementById('f-kh-sdt').addEventListener('input', saveState);
    document.getElementById('f-ghi-chu').addEventListener('input', saveState);
    document.getElementById('items-tbody').addEventListener('input', saveState);
    document.getElementById('items-tbody').addEventListener('change', saveState);
}

// ── Autocomplete & Dropdown Khách Hàng ───────────────────────────────────────

function renderKhSuggestions(matches) {
    const box = document.getElementById('kh-suggestions');
    if (!box) return;

    if (!matches || !matches.length) {
        box.innerHTML = `<div class="p-3 text-muted small text-center"><i class="bi bi-inbox me-1"></i>Không tìm thấy đối tác khớp</div>`;
        box.classList.remove('d-none');
        return;
    }

    box.innerHTML = matches.map(c => {
        const name = c.ten || c.ten_kh || c.ten_ncc || '';
        const type = (c.phan_loai || 'CA_HAI').toUpperCase();
        let badge = '<span class="badge bg-primary-subtle text-primary border small ms-1">Đối tác</span>';
        if (type === 'KHACH_HANG') badge = '<span class="badge bg-success-subtle text-success border small ms-1">Khách Hàng</span>';
        else if (type === 'NHA_CUNG_CAP') badge = '<span class="badge bg-info-subtle text-info border small ms-1">Nhà Cung Cấp</span>';

        const codePart = (c.id && c.id !== name && c.id !== c.ma_so_thue) ? `<span class="badge bg-light text-secondary border font-monospace me-1">${escapeHtml(c.id)}</span>` : '';
        const mstPart = c.ma_so_thue ? `<span class="badge bg-warning-subtle text-dark border font-monospace me-1">MST: ${escapeHtml(c.ma_so_thue)}</span>` : '';
        const phonePart = c.dien_thoai ? `<span class="me-2"><i class="bi bi-telephone text-primary me-1"></i>${escapeHtml(c.dien_thoai)}</span>` : '';
        const addrPart = c.dia_chi ? `<span><i class="bi bi-geo-alt text-danger me-1"></i>${escapeHtml(c.dia_chi)}</span>` : '';

        return `
            <div class="autocomplete-item py-2 px-3 border-bottom" onclick="selectKh('${escapeHtml(String(c.id))}')">
                <div class="d-flex justify-content-between align-items-center">
                    <div>
                        ${codePart}
                        <span class="fw-semibold text-danger">${escapeHtml(name)}</span>
                    </div>
                    <div>
                        ${mstPart}
                        ${badge}
                    </div>
                </div>
                <div class="small text-muted mt-1 text-truncate">
                    ${phonePart}
                    ${addrPart}
                </div>
            </div>
        `;
    }).join('');
    box.classList.remove('d-none');
}

function filterCustomers(query) {
    if (!customers || !customers.length) return [];
    if (!query) {
        // Trả về tối đa 60 đối tác để người dùng duyệt chọn khi bấm mũi tên
        return customers.slice(0, 60);
    }
    const q = query.toLowerCase().trim();
    return customers.filter(c => {
        const name = (c.ten || c.ten_kh || c.ten_ncc || '').toLowerCase();
        const code = (c.id || '').toLowerCase();
        const phone = (c.dien_thoai || '').toLowerCase();
        const mst = (c.ma_so_thue || '').toLowerCase();
        const addr = (c.dia_chi || '').toLowerCase();
        return name.includes(q) || code.includes(q) || phone.includes(q) || mst.includes(q) || addr.includes(q);
    }).slice(0, 50);
}

let _khDebounceTimer = null;
function onKhInput(input) {
    document.getElementById('f-kh-id').value = '';
    clearTimeout(_khDebounceTimer);
    _khDebounceTimer = setTimeout(() => {
        const query = (input?.value || '').trim();
        const matches = filterCustomers(query);
        renderKhSuggestions(matches);
    }, 180);
}

function onKhFocus(input) {
    const query = input.value.trim();
    const matches = filterCustomers(query);
    if (matches.length) {
        renderKhSuggestions(matches);
    }
}

function toggleKhDropdown(e) {
    if (e) {
        e.preventDefault();
        e.stopPropagation();
    }
    const box = document.getElementById('kh-suggestions');
    if (!box) return;

    if (!box.classList.contains('d-none')) {
        box.classList.add('d-none');
    } else {
        const input = document.getElementById('f-kh-ten');
        const query = (input?.value || '').trim();
        const matches = filterCustomers(query);
        renderKhSuggestions(matches);
        if (input) input.focus();
    }
}

function selectKh(cOrId) {
    const c = typeof cOrId === 'object' ? cOrId : customers.find(x => String(x.id) === String(cOrId));
    if (!c) return;
    const name = c.ten || c.ten_kh || c.ten_ncc || '';
    document.getElementById('f-kh-ten').value = name;
    document.getElementById('f-kh-id').value = c.id || '';
    document.getElementById('f-kh-dia-chi').value = c.dia_chi || '';
    document.getElementById('f-kh-sdt').value = c.dien_thoai || '';
    document.getElementById('kh-suggestions').classList.add('d-none');
    saveState();
}

// ── Autocomplete Tìm Kiếm Hàng Hóa ──────────────────────────────────────────

let lastLoadTime = 0;
let isRefreshingProducts = false;

const _prodDebounceTimers = {};
function onProductSearchInput(id, input) {
    document.getElementById(`prod-ma-${id}`).value = '';
    const infoEl = document.getElementById(`prod-info-${id}`);
    if (infoEl) infoEl.textContent = '';

    clearTimeout(_prodDebounceTimers[id]);
    _prodDebounceTimers[id] = setTimeout(() => {
        const query = (input?.value || '').trim().toLowerCase();
        const box = document.getElementById(`prod-sug-${id}`);
        if (!box) return;

        if (!query) {
            box.classList.add('d-none');
            return;
        }

        const matches = products.filter(p =>
            (p.ma_hang || '').toLowerCase().includes(query) ||
            (p.ten_hang || '').toLowerCase().includes(query)
        ).slice(0, 20);

        renderProductSuggestions(id, matches);
    }, 180);
}

function onProductInputFocus(id, input) {
    const query = (input?.value || '').trim().toLowerCase();
    if (query) {
        const matches = products.filter(p =>
            (p.ma_hang || '').toLowerCase().includes(query) ||
            (p.ten_hang || '').toLowerCase().includes(query)
        ).slice(0, 20);
        renderProductSuggestions(id, matches);
    }
}

function renderProductSuggestions(id, matches) {
    const box = document.getElementById(`prod-sug-${id}`);
    if (!box) return;

    if (!matches || !matches.length) {
        box.innerHTML = `<div class="p-2 text-muted small text-center">Không tìm thấy hàng khớp</div>`;
        box.classList.remove('d-none');
        return;
    }

    box.innerHTML = matches.map(p => `
        <div class="autocomplete-item py-2 px-2 border-bottom" onclick="selectProductForRow(${id}, '${p.id}')">
            <div class="d-flex justify-content-between align-items-center">
                <span class="badge bg-danger bg-opacity-10 text-danger me-2 font-monospace">${escapeHtml(p.ma_hang)}</span>
                <span class="fw-semibold text-truncate small flex-grow-1">${escapeHtml(p.ten_hang)}</span>
                <span class="text-danger fw-bold small ms-2 text-nowrap">${formatVND(p.gia_ban)}</span>
            </div>
            <div class="text-muted small mt-1 d-flex justify-content-between" style="font-size: 0.75rem;">
                <span>${p.danh_muc ? `<span class="badge bg-light text-dark border me-1">${escapeHtml(p.danh_muc)}</span>` : ''} ĐVT: ${escapeHtml(p.don_vi_tinh || 'Cái')}</span>
                <span class="${p.ton_kho <= 0 ? 'text-danger fw-bold' : 'text-success fw-bold'}">Tồn kho: ${formatNumber(p.ton_kho)}</span>
            </div>
        </div>
    `).join('');
    box.classList.remove('d-none');
}

function toggleProductDropdown(id, e) {
    if (e) {
        e.preventDefault();
        e.stopPropagation();
    }
    const box = document.getElementById(`prod-sug-${id}`);
    if (!box) return;

    if (!box.classList.contains('d-none')) {
        box.classList.add('d-none');
    } else {
        // Đóng các dropdown khác trước
        document.querySelectorAll('div[id^="prod-sug-"]').forEach(el => el.classList.add('d-none'));
        
        const input = document.getElementById(`prod-input-${id}`);
        const query = (input?.value || '').trim().toLowerCase();
        let matches = [];
        if (query) {
            matches = products.filter(p =>
                (p.ma_hang || '').toLowerCase().includes(query) ||
                (p.ten_hang || '').toLowerCase().includes(query)
            ).slice(0, 50);
        }
        if (!matches.length) {
            matches = products.slice(0, 50);
        }
        renderProductSuggestions(id, matches);
        if (input) input.focus();
    }
}

function selectProductForRow(id, prodIdOrMa) {
    const p = products.find(x => x.id === prodIdOrMa || x.ma_hang === prodIdOrMa);
    if (!p) return;

    document.getElementById(`prod-input-${id}`).value = `${p.ma_hang} - ${p.ten_hang}`;
    document.getElementById(`prod-ma-${id}`).value = p.ma_hang;
    document.getElementById(`prod-sug-${id}`).classList.add('d-none');

    // Fill giá bán
    const giaInput = document.getElementById(`gia-${id}`);
    if (giaInput) {
        giaInput.value = p.gia_ban || 0;
    }

    // Hiển thị chi tiết tồn kho & các lô giá
    const infoEl = document.getElementById(`prod-info-${id}`);
    if (infoEl) {
        let batchInfo = '';
        if (p.batches && p.batches.length > 1) {
            batchInfo = ` &middot; <span class="text-muted">(${p.batches.map((b, i) => `Lô ${i+1}: ${b.so_luong}c @ ${formatVND(b.gia_nhap)}`).join(', ')})</span>`;
        }
        const statusClass = p.ton_kho <= 0 ? 'text-danger fw-bold' : 'text-success fw-bold';
        infoEl.innerHTML = `<span class="badge bg-light text-dark border">${escapeHtml(p.danh_muc || 'Hàng hóa')}</span> ĐVT: <strong>${escapeHtml(p.don_vi_tinh || 'Cái')}</strong> | <span class="${statusClass}">Tồn: ${formatNumber(p.ton_kho)}</span>${batchInfo}`;
    }

    calcRow(id);
    saveState();
}

function clearProductRow(id) {
    document.getElementById(`prod-input-${id}`).value = '';
    document.getElementById(`prod-ma-${id}`).value = '';
    document.getElementById(`prod-sug-${id}`).classList.add('d-none');
    document.getElementById(`gia-${id}`).value = 0;
    const infoEl = document.getElementById(`prod-info-${id}`);
    if (infoEl) infoEl.textContent = '';
    calcRow(id);
    saveState();
}

// Đóng dropdown khi click ra ngoài
document.addEventListener('click', (e) => {
    if (!e.target.closest('#f-kh-ten') && !e.target.closest('#kh-suggestions') && !e.target.closest('#btn-toggle-kh-dropdown')) {
        document.getElementById('kh-suggestions')?.classList.add('d-none');
    }
    if (!e.target.closest('.autocomplete-dropdown') && !e.target.closest('input[id^="prod-input-"]') && !e.target.closest('.btn-toggle-prod-dd')) {
        document.querySelectorAll('div[id^="prod-sug-"]').forEach(el => el.classList.add('d-none'));
    }
});

// ── Load data & Auto Sync ─────────────────────────────────────────────────────

async function loadData() {
    try {
        const [pRes, cRes] = await Promise.all([
            apiRequest('/api/hang-hoa'),
            apiRequest('/api/doi-tuong'),
        ]);
        products = pRes.data || [];
        customers = cRes.data || [];
        lastLoadTime = Date.now();
    } catch (e) {
        console.warn('Lỗi tải dữ liệu tồn kho:', e);
    }
}

// Tự động lắng nghe cập nhật từ các tab khác và khi tab được active
try {
    const syncChannel = new BroadcastChannel('inventory_sync');
    syncChannel.onmessage = (e) => {
        if (e.data && e.data.type === 'PRODUCTS_UPDATED') {
            loadData();
        }
    };
} catch(e) {}

window.addEventListener('message', (e) => {
    if (e.data && (e.data.type === 'TAB_ACTIVATED' || e.data.type === 'PRODUCTS_UPDATED' || e.data.type === 'DATA_CHANGED')) {
        if (e.data.type === 'TAB_ACTIVATED' && Date.now() - lastLoadTime < 15000) return;
        loadData();
    }
});

window.addEventListener('focus', () => { 
    if (Date.now() - lastLoadTime > 30000) loadData(); 
});
document.addEventListener('visibilitychange', () => {
    if (!document.hidden && Date.now() - lastLoadTime > 30000) loadData();
});

// ── Line items ────────────────────────────────────────────────────────────────

function addItem() {
    itemCount++;
    _appendRow(itemCount, '', 1, 0);
    saveState();
}

function addItemWithData(rowId, ma_hang, so_luong, gia_ban) {
    _appendRow(rowId, ma_hang, so_luong, gia_ban);
}

function onProductInputKeydown(id, e) {
    if (e.key === 'Enter') {
        e.preventDefault();
        const query = e.target.value.trim().toLowerCase();
        if (!query) return;
        let match = products.find(p => p.ma_hang.toLowerCase() === query);
        if (!match) {
            match = products.find(p => (p.ma_hang || '').toLowerCase().includes(query) || (p.ten_hang || '').toLowerCase().includes(query));
        }
        if (match) {
            selectProductForRow(id, match.ma_hang);
            const slInput = document.getElementById(`sl-${id}`);
            if (slInput) {
                slInput.focus();
                slInput.select();
            }
        }
    }
}

function onQuantityInputKeydown(id, e) {
    if (e.key === 'Enter') {
        e.preventDefault();
        addItem();
        setTimeout(() => {
            const nextInput = document.getElementById(`prod-input-${itemCount}`);
            if (nextInput) nextInput.focus();
        }, 50);
    }
}

function _appendRow(id, ma_hang, so_luong, gia_ban) {
    const prod = products.find(p => p.ma_hang === ma_hang);
    const prodName = prod ? `${prod.ma_hang} - ${prod.ten_hang}` : '';
    let infoText = '';
    if (prod) {
        let batchInfo = '';
        if (prod.batches && prod.batches.length > 1) {
            batchInfo = ` &middot; <span class="text-muted">(${prod.batches.map((b, i) => `Lô ${i+1}: ${b.so_luong}c @ ${formatVND(b.gia_nhap)}`).join(', ')})</span>`;
        }
        const statusClass = prod.ton_kho <= 0 ? 'text-danger fw-bold' : 'text-success fw-bold';
        infoText = `<span class="badge bg-light text-dark border">${escapeHtml(prod.danh_muc || 'Hàng hóa')}</span> ĐVT: <strong>${escapeHtml(prod.don_vi_tinh || 'Cái')}</strong> | <span class="${statusClass}">Tồn: ${formatNumber(prod.ton_kho)}</span>${batchInfo}`;
    }

    const tbody = document.getElementById('items-tbody');
    const tr = document.createElement('tr');
    tr.id = `row-${id}`;
    tr.innerHTML = `
        <td class="position-relative" style="min-width: 260px;">
            <div class="input-group input-group-sm">
                <input type="text" class="form-control form-control-sm" id="prod-input-${id}"
                    value="${prodName}"
                    placeholder="Gõ mã hoặc tên hàng..."
                    autocomplete="off"
                    onfocus="onProductInputFocus(${id}, this)"
                    onkeydown="onProductInputKeydown(${id}, event)"
                    oninput="onProductSearchInput(${id}, this)">
                <button class="btn btn-outline-secondary btn-sm" type="button" onclick="clearProductRow(${id})" title="Xóa chọn">
                    <i class="bi bi-x"></i>
                </button>
                <button class="btn btn-outline-danger btn-sm btn-toggle-prod-dd" type="button" onclick="toggleProductDropdown(${id}, event)" title="Chọn hàng hóa từ danh sách">
                    <i class="bi bi-chevron-down"></i>
                </button>
            </div>
            <input type="hidden" id="prod-ma-${id}" value="${ma_hang}">
            <div id="prod-sug-${id}" class="autocomplete-dropdown d-none shadow" style="max-height: 250px; z-index: 1060;"></div>
            <small id="prod-info-${id}" class="d-block text-truncate mt-1">${infoText}</small>
        </td>
        <td style="width: 15%;"><input type="number" class="form-control form-control-sm" id="sl-${id}" min="1" value="${so_luong}" onkeydown="onQuantityInputKeydown(${id}, event)" onchange="calcRow(${id})"></td>
        <td style="width: 20%;"><input type="number" class="form-control form-control-sm" id="gia-${id}" min="0" value="${gia_ban}" onchange="calcRow(${id})"></td>
        <td style="width: 20%;"><input type="text" class="form-control form-control-sm" id="tt-${id}" readonly value="0 đ"></td>
        <td style="width: 5%;"><button class="btn btn-sm btn-outline-danger" onclick="removeRow(${id})"><i class="bi bi-x"></i></button></td>
    `;
    tbody.appendChild(tr);
    calcRow(id);
}

function calcRow(idx) {
    const sl = parseFloat(document.getElementById(`sl-${idx}`)?.value) || 0;
    const gia = parseFloat(document.getElementById(`gia-${idx}`)?.value) || 0;
    const tt = sl * gia;
    const ttEl = document.getElementById(`tt-${idx}`);
    if (ttEl) ttEl.value = formatVND(tt);

    // Kiểm tra cảnh báo nếu số lượng vượt tồn kho
    const ma_hang = document.getElementById(`prod-ma-${idx}`)?.value;
    const prod = products.find(p => p.ma_hang === ma_hang);
    const slInput = document.getElementById(`sl-${idx}`);
    if (prod && sl > prod.ton_kho) {
        slInput?.classList.add('is-invalid');
        showToast(`Hàng "${prod.ten_hang}" chỉ còn ${prod.ton_kho}, không đủ xuất ${sl}`, 'error');
    } else {
        slInput?.classList.remove('is-invalid');
    }

    calcTotal();
}

function calcTotal() {
    const rows = document.querySelectorAll('#items-tbody tr');
    let total = 0;
    rows.forEach(row => {
        const id = row.id.replace('row-', '');
        const sl = parseFloat(document.getElementById(`sl-${id}`)?.value) || 0;
        const gia = parseFloat(document.getElementById(`gia-${id}`)?.value) || 0;
        total += sl * gia;
    });
    document.getElementById('total-amount').textContent = formatVND(total);
}

function removeRow(idx) {
    const row = document.getElementById(`row-${idx}`);
    if (row) row.remove();
    calcTotal();
    saveState();
}

// ── Save receipt ──────────────────────────────────────────────────────────────

async function saveReceipt() {
    const ngay = document.getElementById('f-ngay').value;
    const kh_id = document.getElementById('f-kh-id').value;
    const kh_ten = document.getElementById('f-kh-ten').value.trim();
    const kh_dia_chi = document.getElementById('f-kh-dia-chi').value.trim();
    const kh_sdt = document.getElementById('f-kh-sdt').value.trim();
    const ghi_chu = document.getElementById('f-ghi-chu').value.trim();

    if (!ngay) { showToast('Vui lòng chọn ngày xuất', 'error'); return; }

    if (!kh_ten) {
        showToast('Vui lòng nhập Tên Khách Hàng', 'error');
        const el = document.getElementById('f-kh-ten');
        if (el) {
            el.focus();
            el.classList.add('is-invalid');
            setTimeout(() => el.classList.remove('is-invalid'), 3000);
        }
        return;
    }

    const rows = document.querySelectorAll('#items-tbody tr');
    if (rows.length === 0) { showToast('Vui lòng thêm ít nhất 1 mặt hàng', 'error'); return; }

    const items = [];
    let valid = true;
    rows.forEach(row => {
        const id = row.id.replace('row-', '');
        const ma_hang = document.getElementById(`prod-ma-${id}`)?.value || '';
        const prod = products.find(p => p.ma_hang === ma_hang);
        const ten_hang = prod ? prod.ten_hang : (document.getElementById(`prod-input-${id}`)?.value || '');
        const ton = prod ? prod.ton_kho : 0;
        const so_luong = parseInt(document.getElementById(`sl-${id}`).value) || 0;
        const gia_val = document.getElementById(`gia-${id}`)?.value.trim();
        const gia_ban = parseFloat(gia_val);

        if (!ma_hang) {
            showToast('Vui lòng chọn hàng hóa từ gợi ý cho tất cả các dòng', 'error');
            valid = false;
            return;
        }
        if (so_luong <= 0) {
            showToast('Số lượng phải lớn hơn 0', 'error');
            valid = false;
            return;
        }
        if (so_luong > ton) {
            showToast(`Hàng "${ten_hang}" không đủ tồn kho (còn ${ton})`, 'error');
            valid = false;
            return;
        }
        if (gia_val === '' || isNaN(gia_ban) || gia_ban < 0) {
            showToast(`Vui lòng nhập Giá Bán hợp lệ (≥ 0) cho mặt hàng "${ten_hang}"`, 'error');
            const el = document.getElementById(`gia-${id}`);
            if (el) {
                el.focus();
                el.classList.add('is-invalid');
                setTimeout(() => el.classList.remove('is-invalid'), 3000);
            }
            valid = false;
            return;
        }
        items.push({ ma_hang, ten_hang, so_luong, gia_ban });
    });

    if (!valid || !items.length) return;

    const saveBtn = document.getElementById('btn-save-xuat') || document.querySelector('button[onclick="saveReceipt()"]');
    if (saveBtn) {
        if (saveBtn.disabled) return;
        saveBtn.disabled = true;
    }
    const origBtnHtml = saveBtn ? saveBtn.innerHTML : '';
    if (saveBtn) {
        saveBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Đang lưu...';
    }

    try {
        showLoading();
        const res = await apiRequest('/api/xuat-hang', 'POST', {
            ngay_xuat: ngay,
            khach_hang_id: kh_id,
            khach_hang_ten: kh_ten,
            khach_hang_dia_chi: kh_dia_chi,
            khach_hang_sdt: kh_sdt,
            items,
            ghi_chu,
        });
        showToast(`Tạo phiếu ${res.so_phieu} thành công`);
        clearState();
        resetForm();
        await loadReceipts();
        await loadData(); // Làm mới tồn kho và danh sách KH
        if (typeof broadcastDataUpdate === 'function') {
            broadcastDataUpdate('DEBT_UPDATED');
        } else {
            try {
                if (typeof BroadcastChannel !== 'undefined') {
                    const bc = new BroadcastChannel('inventory_sync');
                    bc.postMessage({ type: 'PRODUCTS_UPDATED' });
                    bc.postMessage({ type: 'DEBT_UPDATED' });
                }
                if (window.parent && window.parent !== window) {
                    window.parent.postMessage({ type: 'PRODUCTS_UPDATED' }, '*');
                    window.parent.postMessage({ type: 'DEBT_UPDATED' }, '*');
                }
            } catch (err) {}
        }
    } catch (e) {
        showToast(e.message, 'error');
    } finally {
        hideLoading();
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.innerHTML = origBtnHtml;
        }
    }
}

function resetForm() {
    document.getElementById('f-ngay').value = todayISO();
    document.getElementById('f-kh-ten').value = '';
    document.getElementById('f-kh-id').value = '';
    document.getElementById('f-kh-dia-chi').value = '';
    document.getElementById('f-kh-sdt').value = '';
    document.getElementById('f-ghi-chu').value = '';
    document.getElementById('items-tbody').innerHTML = '';
    itemCount = 0;
    document.getElementById('total-amount').textContent = '0 đ';
    addItem();
}

// ── Receipts list & Pagination ────────────────────────────────────────────────

let allReceiptsList = [];
let receiptsCurrentPage = 1;
const RECEIPTS_PAGE_SIZE = 5;

async function loadReceipts() {
    try {
        const res = await apiRequest('/api/xuat-hang');
        const records = res.data || [];
        const grouped = {};
        records.forEach(r => {
            if (!grouped[r.so_phieu]) {
                grouped[r.so_phieu] = {
                    so_phieu: r.so_phieu,
                    ngay: r.ngay_xuat,
                    kh_id: r.khach_hang_id || '',
                    kh_ten: r.kh_ten || 'Khách lẻ',
                    kh_sdt: r.kh_sdt || '',
                    kh_dia_chi: r.kh_dia_chi || '',
                    total: 0,
                    count: 0,
                    total_sl: 0
                };
            }
            grouped[r.so_phieu].total += parseFloat(r.thanh_tien) || 0;
            grouped[r.so_phieu].count++;
            grouped[r.so_phieu].total_sl += (parseInt(r.so_luong) || 0);
            if ((!grouped[r.so_phieu].kh_ten || grouped[r.so_phieu].kh_ten === 'Khách lẻ') && r.kh_ten) {
                grouped[r.so_phieu].kh_ten = r.kh_ten;
            }
            if (!grouped[r.so_phieu].kh_sdt && r.kh_sdt) grouped[r.so_phieu].kh_sdt = r.kh_sdt;
            if (!grouped[r.so_phieu].kh_dia_chi && r.kh_dia_chi) grouped[r.so_phieu].kh_dia_chi = r.kh_dia_chi;
        });

        // Sắp xếp: Phiếu mới nhất luôn ở trên đầu (theo ngày và số phiếu giảm dần)
        allReceiptsList = Object.values(grouped).sort((a, b) => {
            if (b.ngay !== a.ngay) return b.ngay.localeCompare(a.ngay);
            return b.so_phieu.localeCompare(a.so_phieu);
        });

        renderReceiptsPage(1);
    } catch (e) {
        console.error(e);
    }
}

function renderReceiptsPage(page) {
    receiptsCurrentPage = page;
    const container = document.getElementById('receipts-list');
    const paginationContainer = document.getElementById('receipts-pagination');
    const summaryContainer = document.getElementById('receipts-page-summary');

    if (!allReceiptsList.length) {
        container.innerHTML = '<p class="text-muted small text-center py-4">Chưa có phiếu xuất nào</p>';
        if (paginationContainer) paginationContainer.innerHTML = '';
        if (summaryContainer) summaryContainer.textContent = '';
        return;
    }

    const totalPages = Math.ceil(allReceiptsList.length / RECEIPTS_PAGE_SIZE);
    if (receiptsCurrentPage > totalPages) receiptsCurrentPage = totalPages;
    if (receiptsCurrentPage < 1) receiptsCurrentPage = 1;

    const startIdx = (receiptsCurrentPage - 1) * RECEIPTS_PAGE_SIZE;
    const pageItems = allReceiptsList.slice(startIdx, startIdx + RECEIPTS_PAGE_SIZE);

    container.innerHTML = pageItems.map(r => `
        <div class="receipt-list-item px-3 py-2 mb-2 border rounded shadow-sm bg-white" onclick="viewReceipt('${r.so_phieu}')" style="cursor: pointer; transition: all 0.2s ease;">
            <!-- Dòng 1: Ngày + ID phiếu (trái) và Số tiền (phải) -->
            <div class="d-flex justify-content-between align-items-center mb-1">
                <div class="d-flex align-items-center gap-2">
                    <span class="badge bg-danger-subtle text-danger border border-danger-subtle px-1.5 py-0.5 font-monospace" style="font-size: 0.75rem;">
                        <i class="bi bi-calendar3 me-1"></i>${formatDate(r.ngay)}
                    </span>
                    <span class="fw-bold text-danger font-monospace" style="font-size: 0.85rem;">${r.so_phieu}</span>
                </div>
                <div class="text-end">
                    <span class="fw-bold text-danger font-monospace" style="font-size: 0.95rem;">${formatVND(r.total)}</span>
                </div>
            </div>

            <!-- Dòng 2: Tên khách hàng (trái) + Nút thao tác (phải) -->
            <div class="d-flex justify-content-between align-items-center pt-1 border-top border-light">
                <div class="fw-semibold text-dark text-truncate pe-2" style="font-size: 0.85rem;" title="${escapeHtml(r.kh_ten || 'Khách lẻ')}">
                    <i class="bi bi-person text-secondary me-1"></i>${escapeHtml(r.kh_ten || 'Khách lẻ')}
                </div>
                <div class="d-flex align-items-center gap-2 text-nowrap">
                    <button class="btn btn-xs btn-outline-danger py-0 px-1.5" style="font-size: 0.725rem; line-height: 1.4;" onclick="event.stopPropagation(); confirmDeleteReceipt('${r.so_phieu}', 'xuat', () => { loadReceipts(); loadData(); })" title="Xóa phiếu xuất">
                        <i class="bi bi-trash"></i>
                    </button>
                    <span class="text-danger fw-semibold" style="font-size: 0.75rem;">Chi tiết <i class="bi bi-chevron-right" style="font-size: 0.65rem;"></i></span>
                </div>
            </div>
        </div>
    `).join('');

    if (summaryContainer) {
        summaryContainer.textContent = `Trang ${receiptsCurrentPage}/${totalPages} (${allReceiptsList.length} phiếu)`;
    }
    renderPagination('receipts-pagination', receiptsCurrentPage, totalPages, renderReceiptsPage);
}

async function viewReceipt(so_phieu) {
    try {
        const res = await apiRequest(`/api/xuat-hang/${so_phieu}`);
        document.querySelectorAll('.receipt-list-item').forEach(el => el.classList.remove('selected'));
        event?.currentTarget?.classList.add('selected');

        lastLoadedReceipt = res;
        await renderEditableReceiptDetail(res, 'xuat', 'detail-modal-body', () => {
            loadReceipts();
            loadData();
        });
    } catch (e) {
        showToast(e.message, 'error');
    }
}

let lastLoadedReceipt = null;

function cloneCurrentReceiptToForm() {
    if (!lastLoadedReceipt) return;
    const r = lastLoadedReceipt;
    const kh = r.khach_hang || {};
    if (kh.id) document.getElementById('f-kh-id').value = kh.id;
    if (kh.ten_kh) document.getElementById('f-kh-ten').value = kh.ten_kh;
    if (kh.dien_thoai) document.getElementById('f-kh-sdt').value = kh.dien_thoai;
    if (kh.dia_chi) document.getElementById('f-kh-dia-chi').value = kh.dia_chi;
    document.getElementById('f-ghi-chu').value = r.ghi_chu ? `(Sao chép từ ${r.so_phieu}) ${r.ghi_chu}` : `Sao chép từ ${r.so_phieu}`;
    document.getElementById('f-ngay').value = todayISO();

    document.getElementById('items-tbody').innerHTML = '';
    itemCount = 0;
    (r.items || []).forEach(it => {
        itemCount++;
        _appendRow(itemCount, it.ma_hang, it.so_luong, it.gia_ban);
    });
    calcTotal();
    saveState();
    closeModal('detail-modal');
    showToast(`Đã sao chép nội dung phiếu ${r.so_phieu} vào form xuất hàng!`, 'success');
}

// ── Init ──────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
    try {
        const ngayEl = document.getElementById('f-ngay');
        if (ngayEl) ngayEl.value = todayISO();
    } catch (e) {}

    try {
        await Promise.all([
            loadData(),
            loadReceipts()
        ]);
    } catch (e) {
        console.error('Lỗi tải dữ liệu ban đầu:', e);
    }

    try {
        let savedState = null;
        try {
            savedState = JSON.parse(sessionStorage.getItem(STATE_KEY) || 'null');
        } catch (e) {}

        const restored = restoreState(savedState);
        const currentRows = document.querySelectorAll('#items-tbody tr');
        if (!restored || currentRows.length === 0) {
            addItem();
        }
    } catch (e) {
        console.error('Lỗi khởi tạo items:', e);
        if (document.querySelectorAll('#items-tbody tr').length === 0) {
            addItem();
        }
    }

    // Kiểm tra URL param ?ma_hang=...
    try {
        const urlParams = new URLSearchParams(window.location.search);
        const prefillMa = urlParams.get('ma_hang');
        if (prefillMa && products.length) {
            const p = products.find(x => x.ma_hang.toLowerCase() === prefillMa.toLowerCase());
            if (p) {
                selectProductForRow(1, p.ma_hang);
                const slInput = document.getElementById('sl-1');
                if (slInput) {
                    slInput.focus();
                    slInput.select();
                }
                showToast(`Đã tự động chọn: ${p.ten_hang}`, 'info');
            }
        }
    } catch (e) {}

    try {
        bindAutoSave();
    } catch (e) {}
});
