/**
 * nhap_hang.js - Import goods page logic
 * Có lưu trạng thái form vào sessionStorage để giữ dữ liệu khi chuyển tab
 * Sử dụng Autocomplete tìm kiếm hàng hóa theo Mã hoặc Tên thay vì Dropdown
 */

const urlParams = new URLSearchParams(window.location.search);
const currentTabId = urlParams.get('tab_id') || `nhap_hang_${Date.now()}`;
const STATE_KEY = `nhap_hang_state_${currentTabId}`;

// Xóa key dùng chung cũ nếu còn tồn tại trong bộ nhớ trình duyệt
try {
    sessionStorage.removeItem('nhap_hang_state');
} catch (e) {}

let products = [];
let suppliers = [];
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
            gia_nhap: document.getElementById(`gia-${id}`)?.value || 0,
        });
    });

    const state = {
        ngay: document.getElementById('f-ngay')?.value || '',
        ncc_id: document.getElementById('f-ncc-id')?.value || '',
        ncc_ten: document.getElementById('f-ncc-ten')?.value || '',
        ncc_dia_chi: document.getElementById('f-ncc-dia-chi')?.value || '',
        ncc_sdt: document.getElementById('f-ncc-sdt')?.value || '',
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
        const nccIdEl = document.getElementById('f-ncc-id');
        if (nccIdEl) nccIdEl.value = state.ncc_id || '';
        const nccTenEl = document.getElementById('f-ncc-ten');
        if (nccTenEl) nccTenEl.value = state.ncc_ten || '';
        const nccDiaChiEl = document.getElementById('f-ncc-dia-chi');
        if (nccDiaChiEl) nccDiaChiEl.value = state.ncc_dia_chi || '';
        const nccSdtEl = document.getElementById('f-ncc-sdt');
        if (nccSdtEl) nccSdtEl.value = state.ncc_sdt || '';
        const ghiChuEl = document.getElementById('f-ghi-chu');
        if (ghiChuEl) ghiChuEl.value = state.ghi_chu || '';

        if (state.items && Array.isArray(state.items) && state.items.length > 0) {
            const tbody = document.getElementById('items-tbody');
            if (tbody) tbody.innerHTML = '';
            itemCount = parseInt(state.itemCount) || 0;
            state.items.forEach(item => {
                addItemWithData(item.rowId, item.ma_hang, item.so_luong, item.gia_nhap);
            });
            calcTotal();
            return true;
        }
    } catch (e) {
        console.warn('Lỗi phục hồi trạng thái phiếu nhập:', e);
    }
    return false;
}

function clearState() {
    sessionStorage.removeItem(STATE_KEY);
}

function bindAutoSave() {
    document.getElementById('f-ngay').addEventListener('change', saveState);
    document.getElementById('f-ncc-ten').addEventListener('input', saveState);
    document.getElementById('f-ncc-dia-chi').addEventListener('input', saveState);
    document.getElementById('f-ncc-sdt').addEventListener('input', saveState);
    document.getElementById('f-ghi-chu').addEventListener('input', saveState);
    document.getElementById('items-tbody').addEventListener('input', saveState);
    document.getElementById('items-tbody').addEventListener('change', saveState);
}

// ── Autocomplete NCC ─────────────────────────────────────────────────────────

function onNccInput(input) {
    const query = input.value.trim().toLowerCase();
    const box = document.getElementById('ncc-suggestions');
    document.getElementById('f-ncc-id').value = '';

    if (!query || !suppliers.length) { box.classList.add('d-none'); return; }

    const matches = suppliers.filter(s =>
        (s.ten_ncc || '').toLowerCase().includes(query) ||
        (s.dien_thoai || '').includes(query)
    ).slice(0, 8);

    if (!matches.length) { box.classList.add('d-none'); return; }

    box.innerHTML = matches.map(s => `
        <div class="autocomplete-item py-2 px-3 border-bottom" onclick="selectNcc('${s.id}')">
            <div class="fw-semibold text-primary">${escapeHtml(s.ten_ncc)}</div>
            <div class="small text-muted">
                ${s.dien_thoai ? '📞 ' + escapeHtml(s.dien_thoai) : ''}
                ${s.dia_chi ? ' · ' + escapeHtml(s.dia_chi) : ''}
            </div>
        </div>
    `).join('');
    box.classList.remove('d-none');
}

function selectNcc(sOrId) {
    const s = typeof sOrId === 'object' ? sOrId : suppliers.find(x => x.id === sOrId);
    if (!s) return;
    document.getElementById('f-ncc-ten').value = s.ten_ncc || '';
    document.getElementById('f-ncc-id').value = s.id || '';
    document.getElementById('f-ncc-dia-chi').value = s.dia_chi || '';
    document.getElementById('f-ncc-sdt').value = s.dien_thoai || '';
    document.getElementById('ncc-suggestions').classList.add('d-none');
    saveState();
}

// ── Autocomplete Tìm Kiếm Hàng Hóa ──────────────────────────────────────────

function onProductSearchInput(id, input) {
    const query = input.value.trim().toLowerCase();
    const box = document.getElementById(`prod-sug-${id}`);
    const infoEl = document.getElementById(`prod-info-${id}`);

    // Khi gõ phím, tạm thời xóa mã đã chọn để tránh sai lệch
    document.getElementById(`prod-ma-${id}`).value = '';
    if (infoEl) infoEl.textContent = '';

    if (!query || !products.length) {
        box.classList.add('d-none');
        return;
    }

    // Tìm kiếm theo Mã Hàng hoặc Tên Hàng
    const matches = products.filter(p =>
        (p.ma_hang || '').toLowerCase().includes(query) ||
        (p.ten_hang || '').toLowerCase().includes(query)
    ).slice(0, 10);

    if (!matches.length) {
        box.innerHTML = `<div class="p-2 text-muted small text-center">Không tìm thấy hàng khớp</div>`;
        box.classList.remove('d-none');
        return;
    }

    box.innerHTML = matches.map(p => `
        <div class="autocomplete-item py-2 px-2 border-bottom" onclick="selectProductForRow(${id}, '${p.id}')">
            <div class="d-flex justify-content-between align-items-center">
                <span class="badge bg-primary bg-opacity-10 text-primary me-2">${escapeHtml(p.ma_hang)}</span>
                <span class="fw-semibold text-truncate small flex-grow-1">${escapeHtml(p.ten_hang)}</span>
                <span class="text-success fw-bold small ms-2 text-nowrap">${formatVND(p.gia_nhap)}</span>
            </div>
            <div class="text-muted small mt-1 d-flex justify-content-between" style="font-size: 0.75rem;">
                <span>${p.danh_muc ? `<span class="badge bg-light text-dark border me-1">${escapeHtml(p.danh_muc)}</span>` : ''} ĐVT: ${escapeHtml(p.don_vi_tinh || 'Cái')}</span>
                <span>Tồn hiện tại: <strong>${formatNumber(p.ton_kho)}</strong></span>
            </div>
        </div>
    `).join('');
    box.classList.remove('d-none');
}

function selectProductForRow(id, prodIdOrMa) {
    const p = products.find(x => x.id === prodIdOrMa || x.ma_hang === prodIdOrMa);
    if (!p) return;

    document.getElementById(`prod-input-${id}`).value = `${p.ma_hang} - ${p.ten_hang}`;
    document.getElementById(`prod-ma-${id}`).value = p.ma_hang;
    document.getElementById(`prod-sug-${id}`).classList.add('d-none');

    // Tự động điền giá nhập gợi ý (người dùng có thể sửa thành giá mới)
    const giaInput = document.getElementById(`gia-${id}`);
    if (giaInput) {
        giaInput.value = p.gia_nhap || 0;
    }

    const infoEl = document.getElementById(`prod-info-${id}`);
    if (infoEl) {
        infoEl.innerHTML = `<span class="badge bg-light text-dark border">${escapeHtml(p.danh_muc || 'Hàng hóa')}</span> ĐVT: <strong>${escapeHtml(p.don_vi_tinh || 'Cái')}</strong> | Tồn hiện tại: <strong>${formatNumber(p.ton_kho)}</strong>`;
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
    if (!e.target.closest('#f-ncc-ten') && !e.target.closest('#ncc-suggestions')) {
        document.getElementById('ncc-suggestions')?.classList.add('d-none');
    }
    if (!e.target.closest('.autocomplete-dropdown') && !e.target.closest('input[id^="prod-input-"]')) {
        document.querySelectorAll('div[id^="prod-sug-"]').forEach(el => el.classList.add('d-none'));
    }
});

// ── Quick Create Product ─────────────────────────────────────────────────────

function openQuickCreateProduct() {
    document.getElementById('qp-ten-hang').value = '';
    document.getElementById('qp-danh-muc').value = '';
    document.getElementById('qp-dvt').value = 'Cái';
    document.getElementById('qp-gia-nhap').value = '0';
    document.getElementById('qp-gia-ban').value = '0';
    openModal('quick-product-modal');
}

async function quickCreateProduct() {
    const ten_hang = document.getElementById('qp-ten-hang').value.trim();
    if (!ten_hang) { showToast('Vui lòng nhập tên hàng', 'error'); return; }

    const body = {
        ten_hang,
        danh_muc: document.getElementById('qp-danh-muc').value,
        don_vi_tinh: document.getElementById('qp-dvt').value || 'Cái',
        gia_nhap: parseFloat(document.getElementById('qp-gia-nhap').value) || 0,
        gia_ban: parseFloat(document.getElementById('qp-gia-ban').value) || 0,
        ton_kho: 0,
        ghi_chu: '',
    };

    try {
        showLoading();
        const res = await apiRequest('/api/hang-hoa', 'POST', body);
        showToast(`Đã tạo hàng hóa "${ten_hang}" thành công`);
        closeModal('quick-product-modal');

        // Reload danh sách sản phẩm và tự động chọn vào dòng cuối
        await loadData();
        addItem();
        const rows = document.querySelectorAll('#items-tbody tr');
        if (rows.length > 0) {
            const lastRow = rows[rows.length - 1];
            const lastId = lastRow.id.replace('row-', '');
            const created = products.find(p => p.ten_hang === ten_hang);
            if (created) {
                selectProductForRow(lastId, created.ma_hang);
            }
        }
    } catch (e) {
        showToast(e.message, 'error');
    } finally {
        hideLoading();
    }
}

// ── Load data ─────────────────────────────────────────────────────────────────

async function loadData() {
    try {
        const [pRes, sRes] = await Promise.all([
            apiRequest('/api/hang-hoa'),
            apiRequest('/api/nha-cung-cap'),
        ]);
        products = pRes.data || [];
        suppliers = sRes.data || [];
    } catch (e) {
        showToast('Lỗi tải dữ liệu: ' + e.message, 'error');
    }
}

// ── Line items ────────────────────────────────────────────────────────────────

function addItem() {
    itemCount++;
    _appendRow(itemCount, '', 1, 0);
    saveState();
}

function addItemWithData(rowId, ma_hang, so_luong, gia_nhap) {
    _appendRow(rowId, ma_hang, so_luong, gia_nhap);
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

function _appendRow(id, ma_hang, so_luong, gia_nhap) {
    const prod = products.find(p => p.ma_hang === ma_hang);
    const prodName = prod ? `${prod.ma_hang} - ${prod.ten_hang}` : '';
    const infoText = prod ? `<span class="badge bg-light text-dark border">${escapeHtml(prod.danh_muc || 'Hàng hóa')}</span> ĐVT: <strong>${escapeHtml(prod.don_vi_tinh || 'Cái')}</strong> | Tồn: <strong>${formatNumber(prod.ton_kho)}</strong>` : '';

    const tbody = document.getElementById('items-tbody');
    const tr = document.createElement('tr');
    tr.id = `row-${id}`;
    tr.innerHTML = `
        <td class="position-relative" style="min-width: 250px;">
            <div class="input-group input-group-sm">
                <input type="text" class="form-control form-control-sm" id="prod-input-${id}"
                    value="${prodName}"
                    placeholder="Gõ mã hoặc tên hàng..."
                    autocomplete="off"
                    onkeydown="onProductInputKeydown(${id}, event)"
                    oninput="onProductSearchInput(${id}, this)">
                <button class="btn btn-outline-secondary btn-sm" type="button" onclick="clearProductRow(${id})" title="Xóa chọn">
                    <i class="bi bi-x"></i>
                </button>
            </div>
            <input type="hidden" id="prod-ma-${id}" value="${ma_hang}">
            <div id="prod-sug-${id}" class="autocomplete-dropdown d-none shadow" style="max-height: 250px; z-index: 1060;"></div>
            <small id="prod-info-${id}" class="text-muted d-block text-truncate mt-1">${infoText}</small>
        </td>
        <td style="width: 15%;"><input type="number" class="form-control form-control-sm" id="sl-${id}" min="1" value="${so_luong}" onkeydown="onQuantityInputKeydown(${id}, event)" onchange="calcRow(${id})"></td>
        <td style="width: 20%;"><input type="number" class="form-control form-control-sm" id="gia-${id}" min="0" value="${gia_nhap}" onchange="calcRow(${id})"></td>
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
    const ncc_id = document.getElementById('f-ncc-id').value;
    const ncc_ten = document.getElementById('f-ncc-ten').value.trim();
    const ncc_dia_chi = document.getElementById('f-ncc-dia-chi').value.trim();
    const ncc_sdt = document.getElementById('f-ncc-sdt').value.trim();
    const ghi_chu = document.getElementById('f-ghi-chu').value.trim();

    if (!ngay) { showToast('Vui lòng chọn ngày nhập', 'error'); return; }

    if (!ncc_ten) {
        showToast('Vui lòng nhập Tên Nhà Cung Cấp', 'error');
        const el = document.getElementById('f-ncc-ten');
        if (el) {
            el.focus();
            el.classList.add('is-invalid');
            setTimeout(() => el.classList.remove('is-invalid'), 3000);
        }
        return;
    }

    if (!ncc_sdt) {
        showToast('Vui lòng nhập Số Điện Thoại Nhà Cung Cấp', 'error');
        const el = document.getElementById('f-ncc-sdt');
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
        const so_luong = parseInt(document.getElementById(`sl-${id}`).value) || 0;
        const gia_nhap = parseFloat(document.getElementById(`gia-${id}`).value) || 0;

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
        items.push({ ma_hang, ten_hang, so_luong, gia_nhap });
    });

    if (!valid || !items.length) return;

    try {
        showLoading();
        const res = await apiRequest('/api/nhap-hang', 'POST', {
            ngay_nhap: ngay,
            nha_cung_cap_id: ncc_id,
            nha_cung_cap_ten: ncc_ten,
            nha_cung_cap_dia_chi: ncc_dia_chi,
            nha_cung_cap_sdt: ncc_sdt,
            items,
            ghi_chu,
        });
        showToast(`Tạo phiếu ${res.so_phieu} thành công`);
        clearState();
        resetForm();
        await loadReceipts();
        await loadData(); // Làm mới lại danh sách NCC và tồn kho
        try {
            if (typeof BroadcastChannel !== 'undefined') {
                new BroadcastChannel('inventory_sync').postMessage({ type: 'PRODUCTS_UPDATED' });
            }
            if (window.parent && window.parent !== window) {
                window.parent.postMessage({ type: 'PRODUCTS_UPDATED' }, '*');
            }
        } catch (err) {}
    } catch (e) {
        showToast(e.message, 'error');
    } finally {
        hideLoading();
    }
}

function resetForm() {
    document.getElementById('f-ngay').value = todayISO();
    document.getElementById('f-ncc-ten').value = '';
    document.getElementById('f-ncc-id').value = '';
    document.getElementById('f-ncc-dia-chi').value = '';
    document.getElementById('f-ncc-sdt').value = '';
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
        const res = await apiRequest('/api/nhap-hang');
        const records = res.data || [];
        const grouped = {};
        records.forEach(r => {
            if (!grouped[r.so_phieu]) {
                grouped[r.so_phieu] = {
                    so_phieu: r.so_phieu,
                    ngay: r.ngay_nhap,
                    ncc_id: r.nha_cung_cap_id || '',
                    ncc_ten: r.ncc_ten || 'Nhà cung cấp lẻ',
                    ncc_sdt: r.ncc_sdt || '',
                    ncc_dia_chi: r.ncc_dia_chi || '',
                    total: 0,
                    count: 0,
                    total_sl: 0
                };
            }
            grouped[r.so_phieu].total += parseFloat(r.thanh_tien) || 0;
            grouped[r.so_phieu].count++;
            grouped[r.so_phieu].total_sl += (parseInt(r.so_luong) || 0);
            if ((!grouped[r.so_phieu].ncc_ten || grouped[r.so_phieu].ncc_ten === 'Nhà cung cấp lẻ') && r.ncc_ten) {
                grouped[r.so_phieu].ncc_ten = r.ncc_ten;
            }
            if (!grouped[r.so_phieu].ncc_sdt && r.ncc_sdt) grouped[r.so_phieu].ncc_sdt = r.ncc_sdt;
            if (!grouped[r.so_phieu].ncc_dia_chi && r.ncc_dia_chi) grouped[r.so_phieu].ncc_dia_chi = r.ncc_dia_chi;
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
        container.innerHTML = '<p class="text-muted small text-center py-4">Chưa có phiếu nhập nào</p>';
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
        <div class="receipt-list-item p-3 mb-2 border rounded shadow-sm bg-white" onclick="viewReceipt('${r.so_phieu}')" style="cursor: pointer; transition: all 0.2s ease;">
            <!-- Dòng 1: Thời gian bên trái (to rõ ràng) + Số phiếu & Tổng tiền bên phải -->
            <div class="d-flex justify-content-between align-items-center mb-2">
                <div class="d-flex align-items-center gap-2">
                    <span class="badge bg-primary-subtle text-primary border border-primary-subtle fs-6 px-2 py-1 fw-bold">
                        <i class="bi bi-calendar3 me-1"></i>${formatDate(r.ngay)}
                    </span>
                    <span class="fw-bold text-primary font-monospace fs-6">${r.so_phieu}</span>
                </div>
                <div class="text-end">
                    <span class="fw-bold text-primary fs-5 font-monospace">${formatVND(r.total)}</span>
                </div>
            </div>

            <!-- Dòng 2: Thông tin Nhà cung cấp đầy đủ (Tên, SĐT, Địa chỉ) -->
            <div class="mb-2 bg-light p-2 rounded">
                <div class="d-flex align-items-center justify-content-between">
                    <div class="fw-bold text-dark fs-6 text-truncate" title="${escapeHtml(r.ncc_ten)}">
                        <i class="bi bi-building text-primary me-1"></i>${escapeHtml(r.ncc_ten)}
                    </div>
                    ${r.ncc_sdt ? `<span class="badge bg-white text-dark border small fw-semibold"><i class="bi bi-telephone text-success me-1"></i>${escapeHtml(r.ncc_sdt)}</span>` : ''}
                </div>
                ${r.ncc_dia_chi ? `<div class="small text-muted text-truncate mt-1"><i class="bi bi-geo-alt me-1 text-primary"></i>${escapeHtml(r.ncc_dia_chi)}</div>` : ''}
            </div>

            <!-- Dòng 3: Tổng số lượng hàng & Số loại món -->
            <div class="d-flex justify-content-between align-items-center text-muted small pt-1 border-top">
                <span><i class="bi bi-box-seam me-1 text-secondary"></i>Tổng nhập: <strong class="text-dark">${formatNumber(r.total_sl)}</strong> cái &middot; <strong>${r.count}</strong> món</span>
                <div class="d-flex align-items-center gap-2">
                    <button class="btn btn-xs btn-outline-danger py-0 px-2" onclick="event.stopPropagation(); confirmDeleteReceipt('${r.so_phieu}', 'nhap', () => { loadReceipts(); loadData(); })" title="Xóa phiếu nhập">
                        <i class="bi bi-trash"></i> Xóa
                    </button>
                    <span class="text-primary small fw-semibold">Xem chi tiết <i class="bi bi-arrow-right-short"></i></span>
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
        const res = await apiRequest(`/api/nhap-hang/${so_phieu}`);
        document.querySelectorAll('.receipt-list-item').forEach(el => el.classList.remove('selected'));
        event?.currentTarget?.classList.add('selected');

        lastLoadedReceipt = res;
        await renderEditableReceiptDetail(res, 'nhap', 'detail-modal-body', () => {
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
    const ncc = r.nha_cung_cap || {};
    if (ncc.id) document.getElementById('f-ncc-id').value = ncc.id;
    if (ncc.ten_ncc) document.getElementById('f-ncc-ten').value = ncc.ten_ncc;
    if (ncc.dien_thoai) document.getElementById('f-ncc-sdt').value = ncc.dien_thoai;
    if (ncc.dia_chi) document.getElementById('f-ncc-dia-chi').value = ncc.dia_chi;
    document.getElementById('f-ghi-chu').value = r.ghi_chu ? `(Sao chép từ ${r.so_phieu}) ${r.ghi_chu}` : `Sao chép từ ${r.so_phieu}`;
    document.getElementById('f-ngay').value = todayISO();

    document.getElementById('items-tbody').innerHTML = '';
    itemCount = 0;
    (r.items || []).forEach(it => {
        itemCount++;
        _appendRow(itemCount, it.ma_hang, it.so_luong, it.gia_nhap);
    });
    calcTotal();
    saveState();
    closeModal('detail-modal');
    showToast(`Đã sao chép nội dung phiếu ${r.so_phieu} vào form nhập hàng!`, 'success');
}

// ── Init ──────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
    try {
        const ngayEl = document.getElementById('f-ngay');
        if (ngayEl) ngayEl.value = todayISO();
    } catch (e) {}

    try {
        await loadData();
    } catch (e) {
        console.error('Lỗi loadData:', e);
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

    try {
        await loadReceipts();
    } catch (e) {
        console.error('Lỗi loadReceipts:', e);
    }
});
