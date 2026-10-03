/**
 * xuat_hang.js - Export goods page logic
 * Có lưu trạng thái form vào sessionStorage để giữ dữ liệu khi chuyển tab
 * Sử dụng Autocomplete tìm kiếm hàng hóa theo Mã hoặc Tên thay vì Dropdown
 */

const STATE_KEY = 'xuat_hang_state';
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
    document.getElementById('f-ngay').value = state.ngay || todayISO();
    document.getElementById('f-kh-id').value = state.kh_id || '';
    document.getElementById('f-kh-ten').value = state.kh_ten || '';
    document.getElementById('f-kh-dia-chi').value = state.kh_dia_chi || '';
    document.getElementById('f-kh-sdt').value = state.kh_sdt || '';
    document.getElementById('f-ghi-chu').value = state.ghi_chu || '';

    if (state.items && state.items.length > 0) {
        document.getElementById('items-tbody').innerHTML = '';
        itemCount = parseInt(state.itemCount) || 0;
        state.items.forEach(item => {
            addItemWithData(item.rowId, item.ma_hang, item.so_luong, item.gia_ban);
        });
        calcTotal();
        return true;
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

// ── Autocomplete KH ───────────────────────────────────────────────────────────

function onKhInput(input) {
    const query = input.value.trim().toLowerCase();
    const box = document.getElementById('kh-suggestions');
    document.getElementById('f-kh-id').value = '';

    if (!query || !customers.length) { box.classList.add('d-none'); return; }

    const matches = customers.filter(c =>
        (c.ten_kh || '').toLowerCase().includes(query) ||
        (c.dien_thoai || '').includes(query)
    ).slice(0, 8);

    if (!matches.length) { box.classList.add('d-none'); return; }

    box.innerHTML = matches.map(c => `
        <div class="autocomplete-item py-2 px-3 border-bottom" onclick="selectKh(${JSON.stringify(c).replace(/"/g, '&quot;')})">
            <div class="fw-semibold text-danger">${c.ten_kh}</div>
            <div class="small text-muted">
                ${c.dien_thoai ? '📞 ' + c.dien_thoai : ''}
                ${c.dia_chi ? ' · ' + c.dia_chi : ''}
            </div>
        </div>
    `).join('');
    box.classList.remove('d-none');
}

function selectKh(c) {
    document.getElementById('f-kh-ten').value = c.ten_kh;
    document.getElementById('f-kh-id').value = c.id;
    document.getElementById('f-kh-dia-chi').value = c.dia_chi || '';
    document.getElementById('f-kh-sdt').value = c.dien_thoai || '';
    document.getElementById('kh-suggestions').classList.add('d-none');
    saveState();
}

// ── Autocomplete Tìm Kiếm Hàng Hóa ──────────────────────────────────────────

function onProductSearchInput(id, input) {
    const query = input.value.trim().toLowerCase();
    const box = document.getElementById(`prod-sug-${id}`);
    const infoEl = document.getElementById(`prod-info-${id}`);

    document.getElementById(`prod-ma-${id}`).value = '';
    if (infoEl) infoEl.textContent = '';

    if (!query || !products.length) {
        box.classList.add('d-none');
        return;
    }

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
        <div class="autocomplete-item py-2 px-2 border-bottom" onclick="selectProductForRow(${id}, '${p.ma_hang}')">
            <div class="d-flex justify-content-between align-items-center">
                <span class="badge bg-danger bg-opacity-10 text-danger me-2">${p.ma_hang}</span>
                <span class="fw-semibold text-truncate small flex-grow-1">${p.ten_hang}</span>
                <span class="text-danger fw-bold small ms-2 text-nowrap">${formatVND(p.gia_ban)}</span>
            </div>
            <div class="text-muted small mt-1 d-flex justify-content-between" style="font-size: 0.75rem;">
                <span>${p.danh_muc ? `<span class="badge bg-light text-dark border me-1">${p.danh_muc}</span>` : ''} ĐVT: ${p.don_vi_tinh}</span>
                <span class="${p.ton_kho <= 0 ? 'text-danger fw-bold' : 'text-success fw-bold'}">Tồn kho: ${formatNumber(p.ton_kho)}</span>
            </div>
        </div>
    `).join('');
    box.classList.remove('d-none');
}

function selectProductForRow(id, ma_hang) {
    const p = products.find(x => x.ma_hang === ma_hang);
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
        infoEl.innerHTML = `<span class="badge bg-light text-dark border">${p.danh_muc || 'Hàng hóa'}</span> ĐVT: <strong>${p.don_vi_tinh}</strong> | <span class="${statusClass}">Tồn: ${formatNumber(p.ton_kho)}</span>${batchInfo}`;
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
    if (!e.target.closest('#f-kh-ten') && !e.target.closest('#kh-suggestions')) {
        document.getElementById('kh-suggestions')?.classList.add('d-none');
    }
    if (!e.target.closest('.autocomplete-dropdown') && !e.target.closest('input[id^="prod-input-"]')) {
        document.querySelectorAll('div[id^="prod-sug-"]').forEach(el => el.classList.add('d-none'));
    }
});

// ── Load data ─────────────────────────────────────────────────────────────────

async function loadData() {
    try {
        const [pRes, cRes] = await Promise.all([
            apiRequest('/api/hang-hoa'),
            apiRequest('/api/khach-hang'),
        ]);
        products = pRes.data || [];
        customers = cRes.data || [];
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
        infoText = `<span class="badge bg-light text-dark border">${prod.danh_muc || 'Hàng hóa'}</span> ĐVT: <strong>${prod.don_vi_tinh}</strong> | <span class="${statusClass}">Tồn: ${formatNumber(prod.ton_kho)}</span>${batchInfo}`;
    }

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
        const gia_ban = parseFloat(document.getElementById(`gia-${id}`).value) || 0;

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
        items.push({ ma_hang, ten_hang, so_luong, gia_ban });
    });

    if (!valid || !items.length) return;

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
    } catch (e) {
        showToast(e.message, 'error');
    } finally {
        hideLoading();
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
        <div class="receipt-list-item p-3 mb-2 border rounded shadow-sm bg-white" onclick="viewReceipt('${r.so_phieu}')" style="cursor: pointer; transition: all 0.2s ease;">
            <!-- Dòng 1: Thời gian bên trái (to rõ ràng) + Số phiếu & Tổng tiền bên phải -->
            <div class="d-flex justify-content-between align-items-center mb-2">
                <div class="d-flex align-items-center gap-2">
                    <span class="badge bg-danger-subtle text-danger border border-danger-subtle fs-6 px-2 py-1 fw-bold">
                        <i class="bi bi-calendar3 me-1"></i>${formatDate(r.ngay)}
                    </span>
                    <span class="fw-bold text-danger font-monospace fs-6">${r.so_phieu}</span>
                </div>
                <div class="text-end">
                    <span class="fw-bold text-danger fs-5 font-monospace">${formatVND(r.total)}</span>
                </div>
            </div>

            <!-- Dòng 2: Thông tin khách hàng đầy đủ (Tên, SĐT, Địa chỉ) -->
            <div class="mb-2 bg-light p-2 rounded">
                <div class="d-flex align-items-center justify-content-between">
                    <div class="fw-bold text-dark fs-6 text-truncate" title="${escapeHtml(r.kh_ten)}">
                        <i class="bi bi-person-fill text-danger me-1"></i>${escapeHtml(r.kh_ten)}
                    </div>
                    ${r.kh_sdt ? `<span class="badge bg-white text-dark border small fw-semibold"><i class="bi bi-telephone text-success me-1"></i>${escapeHtml(r.kh_sdt)}</span>` : ''}
                </div>
                ${r.kh_dia_chi ? `<div class="small text-muted text-truncate mt-1"><i class="bi bi-geo-alt me-1 text-danger"></i>${escapeHtml(r.kh_dia_chi)}</div>` : ''}
            </div>

            <!-- Dòng 3: Tổng số lượng hàng & Số loại món -->
            <div class="d-flex justify-content-between align-items-center text-muted small pt-1 border-top">
                <span><i class="bi bi-box-seam me-1 text-secondary"></i>Tổng xuất: <strong class="text-dark">${formatNumber(r.total_sl)}</strong> cái &middot; <strong>${r.count}</strong> món</span>
                <span class="text-danger small fw-semibold">Xem chi tiết <i class="bi bi-arrow-right-short"></i></span>
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
        const items = res.items || [];
        document.querySelectorAll('.receipt-list-item').forEach(el => el.classList.remove('selected'));
        event?.currentTarget?.classList.add('selected');

        const kh = res.khach_hang || {};
        const modal = document.getElementById('detail-modal-body');
        modal.innerHTML = `
            <!-- Khung Thông Tin Phiếu & Đối Tác -->
            <div class="card bg-light border-0 mb-3">
                <div class="card-body py-2 px-3">
                    <div class="row align-items-center">
                        <div class="col-sm-7 mb-2 mb-sm-0">
                            <div class="d-flex align-items-center gap-2 mb-1">
                                <span class="badge bg-danger fs-6 px-3 py-1 font-monospace">${so_phieu}</span>
                                <span class="badge bg-success-subtle text-success border border-success-subtle"><i class="bi bi-check2-circle me-1"></i>Đã xuất kho</span>
                            </div>
                            <div class="text-secondary small mt-1">
                                <i class="bi bi-calendar-event me-1 text-danger"></i>Ngày xuất: <strong class="text-dark">${formatDate(res.ngay_xuat)}</strong>
                            </div>
                        </div>
                        <div class="col-sm-5 text-sm-end">
                            <div class="small text-muted mb-0">Tổng tiền thanh toán</div>
                            <div class="fs-4 fw-bold text-danger font-monospace">${formatVND(res.total)}</div>
                        </div>
                    </div>
                    <hr class="my-2 border-secondary opacity-25">
                    <div class="row g-2 small">
                        <div class="col-md-7">
                            <div class="d-flex align-items-start">
                                <i class="bi bi-person-circle me-2 text-danger fs-6 mt-1"></i>
                                <div>
                                    <div class="fw-bold text-dark fs-6">${escapeHtml(kh.ten_kh || 'Khách lẻ')}</div>
                                    ${kh.dien_thoai ? `<div class="text-muted"><i class="bi bi-telephone me-1 text-success"></i>SĐT: <strong>${escapeHtml(kh.dien_thoai)}</strong></div>` : ''}
                                    ${kh.dia_chi ? `<div class="text-muted"><i class="bi bi-geo-alt me-1 text-danger"></i>Địa chỉ: ${escapeHtml(kh.dia_chi)}</div>` : ''}
                                </div>
                            </div>
                        </div>
                        <div class="col-md-5 text-md-end">
                            ${res.ghi_chu ? `<div class="text-muted fst-italic mb-1"><i class="bi bi-chat-left-text me-1"></i>${escapeHtml(res.ghi_chu)}</div>` : '<div class="text-muted fst-italic mb-1">Không có ghi chú</div>'}
                            <div class="text-muted">
                                Quy mô: <strong>${res.so_mat_hang || items.length}</strong> mặt hàng &middot; Tổng SL: <strong class="text-danger fs-6">${formatNumber(res.tong_so_luong)}</strong>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Bảng chi tiết hàng hóa -->
            <div class="table-responsive border rounded mb-2">
                <table class="table table-hover table-striped align-middle mb-0">
                    <thead style="background-color: #1e293b !important; color: #ffffff !important;">
                        <tr style="background-color: #1e293b !important;">
                            <th class="text-center" style="width: 45px; background-color: #1e293b !important; color: #ffffff !important;">#</th>
                            <th style="width: 100px; background-color: #1e293b !important; color: #ffffff !important;">Mã hàng</th>
                            <th style="background-color: #1e293b !important; color: #ffffff !important;">Tên hàng hóa</th>
                            <th class="text-center" style="width: 70px; background-color: #1e293b !important; color: #ffffff !important;">ĐVT</th>
                            <th class="text-center" style="width: 70px; background-color: #1e293b !important; color: #ffffff !important;">SL</th>
                            <th class="text-end text-nowrap" style="width: 140px; background-color: #1e293b !important; color: #ffffff !important; white-space: nowrap;">Đơn giá bán</th>
                            <th class="text-end text-nowrap" style="min-width: 165px; width: 175px; background-color: #1e293b !important; color: #ffffff !important; white-space: nowrap;">Thành tiền</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${items.map((it, idx) => `
                            <tr>
                                <td class="text-center text-muted small">${idx + 1}</td>
                                <td><span class="badge bg-secondary font-monospace">${it.ma_hang}</span></td>
                                <td class="fw-semibold">${escapeHtml(it.ten_hang)}</td>
                                <td class="text-center text-muted small">${it.don_vi_tinh || 'Cái'}</td>
                                <td class="text-center fw-bold fs-6 text-danger">${formatNumber(it.so_luong)}</td>
                                <td class="text-end text-nowrap" style="white-space: nowrap;">${formatVND(it.gia_ban)}</td>
                                <td class="text-end fw-bold text-dark font-monospace text-nowrap" style="white-space: nowrap; min-width: 165px;">${formatVND(it.thanh_tien)}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                    <tfoot class="table-light fw-bold border-top border-2">
                        <tr>
                            <td colspan="4" class="text-end text-uppercase small text-secondary">Tổng cộng:</td>
                            <td class="text-center text-danger fs-6">${formatNumber(res.tong_so_luong)}</td>
                            <td></td>
                            <td class="text-end text-danger fs-5 font-monospace text-nowrap" style="white-space: nowrap !important; min-width: 165px;">${formatVND(res.total)}</td>
                        </tr>
                    </tfoot>
                </table>
            </div>
        `;
        lastLoadedReceipt = res;
        openModal('detail-modal');
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
    document.getElementById('f-ngay').value = todayISO();
    await loadData();

    const savedState = JSON.parse(sessionStorage.getItem(STATE_KEY) || 'null');
    const restored = restoreState(savedState);
    if (!restored) {
        addItem();
    }

    // Kiểm tra URL param ?ma_hang=...
    const urlParams = new URLSearchParams(window.location.search);
    const prefillMa = urlParams.get('ma_hang');
    if (prefillMa) {
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

    bindAutoSave();
    await loadReceipts();
});
