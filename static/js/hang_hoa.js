/**
 * hang_hoa.js - Products management page logic
 */

// ── Danh mục cố định ──────────────────────────────────────────────────────────
const DANH_MUC_LIST = ['Laptop', 'Linh Kiện', 'Phụ Kiện', 'Khác'];


let allProducts = [];
let allProductsCache = [];
let currentFiltered = [];
let editingId = null;
let currentPeriodLabel = 'Tất cả';

const COMPANY_REPORT_INFO = window.COMPANY_INFO || {
    name: 'CÔNG TY CỔ PHẦN THIẾT BỊ VÀ CÔNG NGHỆ SỐ AN NAM',
    address: '454 Nguyễn Trãi, Hạc Thành, Thanh Hóa, Việt Nam',
    brand: 'KHO HÀNG AN NAM',
    hotline: '0386.539.555',
    email: 'contact@laptopannam.com'
};

function formatVNDClean(v) {
    if (!v || isNaN(v)) return '0';
    return Math.round(Number(v)).toLocaleString('vi-VN');
}

function clearSearch() {
    const el = document.getElementById('search-input');
    if (el) {
        el.value = '';
        applyFilters();
    }
}

function setQuickPeriod(type) {
    document.querySelectorAll('.date-range-presets .btn').forEach(btn => btn.classList.remove('active'));

    const range = typeof getPresetDateRange === 'function' ? getPresetDateRange(type) : { from: '', to: '' };
    const fromEl = document.getElementById('filter-from-date');
    const toEl = document.getElementById('filter-to-date');

    if (fromEl) fromEl.value = range.from || '';
    if (toEl) toEl.value = range.to || '';

    const map = {
        'today': 'Hôm nay',
        'week': 'Tuần này',
        'month': 'Tháng này',
        'year': 'Năm nay',
        'all': 'Tất cả'
    };
    currentPeriodLabel = map[type] || 'Tùy chọn';

    const clickedBtn = Array.from(document.querySelectorAll('.date-range-presets .btn'))
        .find(b => b.textContent.trim().toLowerCase() === (map[type] || '').toLowerCase());
    if (clickedBtn) {
        clickedBtn.classList.add('active');
    }

    loadProducts();
}

function onDateRangeChanged() {
    document.querySelectorAll('.date-range-presets .btn').forEach(btn => btn.classList.remove('active'));
    currentPeriodLabel = 'Tùy chọn';
}

function applyDateFilter() {
    loadProducts();
}

function populateDanhMucDropdowns() {
    // Populate modal dropdown
    const modalSel = document.getElementById('f-danh-muc');
    if (modalSel) {
        modalSel.innerHTML = '<option value="">-- Chọn danh mục --</option>';
        DANH_MUC_LIST.forEach(dm => {
            modalSel.innerHTML += `<option value="${dm}">${dm}</option>`;
        });
    }

    // Populate filter dropdown
    const filterSel = document.getElementById('filter-danh-muc');
    if (filterSel) {
        filterSel.innerHTML = '<option value="">Tất cả danh mục</option>';
        DANH_MUC_LIST.forEach(dm => {
            filterSel.innerHTML += `<option value="${dm}">${dm}</option>`;
        });
    }
}

async function loadProducts(silent = false) {
    try {
        const tbody = document.getElementById('products-tbody');
        if (!silent && tbody) {
            tbody.innerHTML = '<tr><td colspan="10" class="text-center text-muted py-4"><div class="spinner-border spinner-border-sm text-primary me-2"></div>Đang tải dữ liệu...</td></tr>';
        }
        const fromDate = document.getElementById('filter-from-date')?.value || '';
        const toDate = document.getElementById('filter-to-date')?.value || '';

        let url = '/api/hang-hoa';
        const params = new URLSearchParams();
        if (fromDate) params.append('from_date', fromDate);
        if (toDate) params.append('to_date', toDate);
        const qStr = params.toString();
        if (qStr) url += `?${qStr}`;

        const res = await apiRequest(url);
        allProductsCache = res.data || [];
        applyFilters();
    } catch (e) {
        if (!silent) showToast(e.message, 'error');
    }
}

function applyFilters() {
    const search = (document.getElementById('search-input')?.value || '').trim();
    const danhMuc = document.getElementById('filter-danh-muc')?.value || '';
    const stockStatus = document.getElementById('filter-stock-status')?.value || 'all';

    let filtered = allProductsCache;
    if (danhMuc) {
        filtered = filtered.filter(p => p.danh_muc === danhMuc);
    }

    if (stockStatus === 'in_stock') {
        filtered = filtered.filter(p => (parseInt(p.ton_kho) || 0) > 0);
    } else if (stockStatus === 'low_stock') {
        filtered = filtered.filter(p => {
            const ton = parseInt(p.ton_kho) || 0;
            return ton > 0 && ton <= 2;
        });
    } else if (stockStatus === 'out_of_stock') {
        filtered = filtered.filter(p => (parseInt(p.ton_kho) || 0) <= 0);
    }

    if (search) {
        const matcher = window.matchSearchKeywords || matchSearchKeywords || ((txt, q) => (txt || '').toLowerCase().includes((q || '').toLowerCase()));
        filtered = filtered.filter(p => {
            const targetText = `${p.ma_hang || ''} ${p.ten_hang || ''} ${p.danh_muc || ''} ${p.ghi_chu || ''}`;
            return matcher(targetText, search);
        });
    }

    allProducts = filtered;
    currentFiltered = filtered;
    renderTable(allProducts);

    const countEl = document.getElementById('total-count');
    if (countEl) countEl.textContent = allProducts.length;

    // Cập nhật tổng footer
    const totalQty = allProducts.reduce((sum, p) => sum + (parseInt(p.ton_kho) || 0), 0);
    const totalVal = allProducts.reduce((sum, p) => {
        if (p.thanh_tien_ton !== undefined) return sum + p.thanh_tien_ton;
        const sl = parseInt(p.ton_kho) || 0;
        const batches = p.batches || [];
        if (batches.length > 1) {
            return sum + batches.reduce((bSum, b) => bSum + (b.so_luong * b.gia_nhap), 0);
        }
        const gia = parseFloat(p.gia_nhap) || 0;
        return sum + Math.round(sl * gia);
    }, 0);

    const tfQty = document.getElementById('tf-qty');
    const tfVal = document.getElementById('tf-val');
    if (tfQty) tfQty.textContent = formatNumber(totalQty);
    if (tfVal) tfVal.textContent = formatVND(totalVal);
}

function renderTonKhoCell(p) {
    if (p.ton_kho <= 0) {
        return `<span class="badge bg-danger fs-6 px-2 py-1">0</span>`;
    }
    const batches = p.batches || [];
    if (batches.length <= 1) {
        return `<span class="badge ${p.ton_kho <= 10 ? 'bg-warning text-dark' : 'bg-success'} fs-6 px-2 py-1" title="Đơn giá nhập: ${formatVND(p.gia_nhap)}">${formatNumber(p.ton_kho)}</span>`;
    }
    // Multiple price batches!
    return `
        <div class="dropdown d-inline-block">
            <button class="btn btn-sm btn-outline-primary dropdown-toggle py-0 px-2 fw-bold" type="button" data-bs-toggle="dropdown" aria-expanded="false" title="Bấm để xem chi tiết ${batches.length} lô giá khác nhau">
                ${formatNumber(p.ton_kho)} <span class="badge bg-primary ms-1">${batches.length} lô</span>
            </button>
            <ul class="dropdown-menu dropdown-menu-end shadow py-2" style="min-width: 250px;">
                <li class="dropdown-header text-uppercase fw-bold text-muted small pb-1 border-bottom">
                    <i class="bi bi-layers me-1 text-primary"></i>Chi Tiết Các Lô Giá
                </li>
                ${batches.map((b, idx) => `
                    <li class="dropdown-item-text py-1 px-3 d-flex justify-content-between align-items-center">
                        <span><span class="badge bg-secondary me-1">Lô ${idx + 1}</span> <strong>${formatNumber(b.so_luong)}</strong> ${escapeHtml(p.don_vi_tinh)}</span>
                        <span class="text-primary fw-semibold ms-2">${formatVND(b.gia_nhap)}</span>
                    </li>
                `).join('')}
                <li class="dropdown-divider my-1"></li>
                <li class="dropdown-item-text text-muted small px-3 d-flex justify-content-between">
                    <span>Tổng vốn tồn:</span>
                    <strong class="text-dark">${formatVND(batches.reduce((sum, b) => sum + b.so_luong * b.gia_nhap, 0))}</strong>
                </li>
            </ul>
        </div>
    `;
}

function renderTable(products) {
    const tbody = document.getElementById('products-tbody');
    if (!products.length) {
        tbody.innerHTML = '<tr><td colspan="10" class="text-center text-muted py-4"><i class="bi bi-inbox fs-2 d-block text-secondary mb-2"></i>Không có hàng hóa nào phù hợp với bộ lọc</td></tr>';
        return;
    }
    tbody.innerHTML = products.map((p, i) => {
        const sl = parseInt(p.ton_kho) || 0;
        const giaNhap = parseFloat(p.gia_nhap) || 0;
        const giaBan = parseFloat(p.gia_ban) || 0;
        const batches = p.batches || [];

        let giaTriTon = 0;
        if (p.thanh_tien_ton !== undefined) {
            giaTriTon = p.thanh_tien_ton;
        } else if (batches.length > 1) {
            giaTriTon = batches.reduce((bSum, b) => bSum + (b.so_luong * b.gia_nhap), 0);
        } else {
            giaTriTon = Math.round(sl * giaNhap);
        }

        return `
            <tr>
                <td class="text-center text-muted small">${i + 1}</td>
                <td><span class="badge bg-secondary font-monospace">${escapeHtml(p.ma_hang)}</span></td>
                <td>
                    <div class="fw-semibold text-dark">${escapeHtml(p.ten_hang)}</div>
                    ${p.ghi_chu ? `<small class="text-muted text-truncate d-block" style="max-width: 250px;">${escapeHtml(p.ghi_chu)}</small>` : ''}
                </td>
                <td><span class="badge bg-light text-secondary border">${escapeHtml(p.danh_muc || 'Khác')}</span></td>
                <td class="text-center text-muted small">${escapeHtml(p.don_vi_tinh || 'Cái')}</td>
                <td class="text-end text-muted font-monospace">${formatVND(giaNhap)}</td>
                <td class="text-end font-monospace text-primary fw-semibold">${formatVND(giaBan)}</td>
                <td class="text-center">
                    ${renderTonKhoCell(p)}
                </td>
                <td class="text-end fw-bold text-primary font-monospace text-nowrap" style="white-space: nowrap; min-width: 150px;">${formatVND(giaTriTon)}</td>
                <td class="text-center no-print">
                    <div class="btn-group btn-group-sm">
                        <button class="btn btn-outline-secondary" onclick="openEdit('${p.id}')" title="Chỉnh sửa thông số hàng & kho">
                            <i class="bi bi-pencil-square"></i>
                        </button>
                        ${sl > 0 ? `
                            <a href="/xuat-hang?ma_hang=${encodeURIComponent(p.ma_hang)}" class="btn btn-outline-success" title="Xuất kho">
                                <i class="bi bi-box-arrow-up-right"></i>
                            </a>
                        ` : ''}
                        <button class="btn btn-outline-danger" onclick="deleteProduct('${p.id}')" title="Xóa hàng hóa">
                            <i class="bi bi-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

function openAdd(prefill = {}) {
    editingId = null;
    document.getElementById('modal-title').textContent = 'Thêm Hàng Hóa';
    document.getElementById('product-form').reset();
    // Pre-fill fields if provided (called from nhap_hang quick-create)
    if (prefill.ten_hang) document.getElementById('f-ten-hang').value = prefill.ten_hang;
    if (prefill.danh_muc) document.getElementById('f-danh-muc').value = prefill.danh_muc;
    if (prefill.gia_nhap) document.getElementById('f-gia-nhap').value = prefill.gia_nhap;
    if (prefill.gia_ban) document.getElementById('f-gia-ban').value = prefill.gia_ban;
    openModal('product-modal');
}

let currentEditingProduct = null;
let editStockModalInstance = null;

function openEdit(id) {
    const p = allProductsCache.find(x => String(x.id) === String(id)) || allProducts.find(x => String(x.id) === String(id));
    if (!p) {
        showToast('Không tìm thấy thông tin hàng hóa!', 'error');
        return;
    }
    currentEditingProduct = p;

    document.getElementById('edit-prod-id').value = p.id;
    document.getElementById('edit-prod-ma').value = p.ma_hang || '';
    document.getElementById('edit-prod-ten').value = p.ten_hang || '';
    document.getElementById('edit-prod-danh-muc').value = p.danh_muc || 'Khác';
    document.getElementById('edit-prod-dvt').value = p.don_vi_tinh || 'Cái';
    document.getElementById('edit-prod-ton-kho').value = p.ton_kho || 0;
    document.getElementById('edit-prod-gia-nhap').value = p.gia_nhap || 0;
    const giaBanInput = document.getElementById('edit-prod-gia-ban');
    if (giaBanInput) giaBanInput.value = p.gia_ban || 0;
    document.getElementById('edit-prod-ghi-chu').value = p.ghi_chu || '';

    // Render các lô hàng
    const tbody = document.getElementById('edit-batches-tbody');
    tbody.innerHTML = '';
    const batches = (p.batches && p.batches.length > 0) ? p.batches : [
        { so_luong: p.ton_kho || 1, gia_nhap: p.gia_nhap || 0 }
    ];

    batches.forEach(b => {
        addBatchRow(b.so_luong, b.gia_nhap);
    });
    calcBatchTotals();

    // Lắng nghe thay đổi của ô giá nhập / tồn kho đơn để cập nhật lô nếu chỉ có 1 lô
    const singleQtyInput = document.getElementById('edit-prod-ton-kho');
    const singleGiaInput = document.getElementById('edit-prod-gia-nhap');
    singleQtyInput.oninput = () => {
        const rows = document.querySelectorAll('#edit-batches-tbody tr');
        if (rows.length === 1) {
            const slInput = rows[0].querySelector('.batch-sl');
            if (slInput) slInput.value = singleQtyInput.value;
            calcBatchTotals(false);
        }
    };
    singleGiaInput.oninput = () => {
        const rows = document.querySelectorAll('#edit-batches-tbody tr');
        if (rows.length === 1) {
            const giaInput = rows[0].querySelector('.batch-gia');
            if (giaInput) giaInput.value = singleGiaInput.value;
            calcBatchTotals(false);
        }
    };

    const modalEl = document.getElementById('modal-edit-stock');
    if (!editStockModalInstance) {
        editStockModalInstance = new bootstrap.Modal(modalEl);
    }
    editStockModalInstance.show();
}
window.openEditStockModal = openEdit;

function addBatchRow(so_luong = 1, gia_nhap = 0) {
    const tbody = document.getElementById('edit-batches-tbody');
    const rowIdx = tbody.querySelectorAll('tr').length + 1;
    const tr = document.createElement('tr');
    tr.innerHTML = `
        <td class="text-center text-muted batch-stt">${rowIdx}</td>
        <td>
            <input type="number" class="form-control form-control-sm font-monospace batch-sl" value="${so_luong}" min="0" oninput="calcBatchTotals()">
        </td>
        <td>
            <input type="text" inputmode="numeric" autocomplete="off" class="form-control form-control-sm font-monospace batch-gia" value="${gia_nhap}" oninput="calcBatchTotals()">
        </td>
        <td class="text-end font-monospace fw-semibold batch-subtotal">0 đ</td>
        <td class="text-center">
            <button type="button" class="btn btn-outline-danger btn-xs py-0 px-2" onclick="deleteBatchRow(this)" title="Xóa lô này">
                <i class="bi bi-trash"></i>
            </button>
        </td>
    `;
    tbody.appendChild(tr);
    calcBatchTotals();
}

function deleteBatchRow(btn) {
    const tbody = document.getElementById('edit-batches-tbody');
    if (tbody.querySelectorAll('tr').length <= 1) {
        showToast('Hàng hóa phải có ít nhất một lô thông số tồn!', 'warning');
        return;
    }
    btn.closest('tr').remove();
    tbody.querySelectorAll('tr').forEach((row, i) => {
        row.querySelector('.batch-stt').textContent = i + 1;
    });
    calcBatchTotals();
}

function calcBatchTotals(updateMainInputs = true) {
    const rows = document.querySelectorAll('#edit-batches-tbody tr');
    let totalQty = 0;
    let totalVal = 0;

    rows.forEach(row => {
        const sl = parseInt(row.querySelector('.batch-sl')?.value) || 0;
        const parseMoney = window.parseCurrencyValue || parseCurrencyValue || (v => parseFloat(String(v).replace(/\./g, '').replace(/,/g, '')) || 0);
        const gia = parseMoney(row.querySelector('.batch-gia')?.value);
        const sub = Math.round(sl * gia);
        row.querySelector('.batch-subtotal').textContent = formatVND(sub);
        totalQty += sl;
        totalVal += sub;
    });

    const qtySpan = document.getElementById('batch-total-qty');
    const valSpan = document.getElementById('batch-total-val');
    if (qtySpan) qtySpan.textContent = formatNumber(totalQty);
    if (valSpan) valSpan.textContent = formatVND(totalVal);

    if (updateMainInputs) {
        const mainQty = document.getElementById('edit-prod-ton-kho');
        if (mainQty) {
            mainQty.value = totalQty;
            if (rows.length > 1) {
                mainQty.readOnly = true;
                mainQty.title = "Đang có nhiều lô giá: Tổng tồn kho được tự động tính từ bảng chi tiết lô bên dưới";
                mainQty.classList.add('bg-light');
            } else {
                mainQty.readOnly = false;
                mainQty.title = "";
                mainQty.classList.remove('bg-light');
            }
        }
        if (rows.length > 0) {
            const parseMoney = window.parseCurrencyValue || parseCurrencyValue || (v => parseFloat(String(v).replace(/\./g, '').replace(/,/g, '')) || 0);
            const firstGia = parseMoney(rows[0].querySelector('.batch-gia')?.value);
            const mainGia = document.getElementById('edit-prod-gia-nhap');
            if (mainGia && rows.length === 1) mainGia.value = firstGia;
        }
    }
}

async function saveStockEdit() {
    if (!currentEditingProduct) return;
    const id = document.getElementById('edit-prod-id').value;
    const ten_hang = document.getElementById('edit-prod-ten').value.trim();
    const danh_muc = document.getElementById('edit-prod-danh-muc').value;
    const don_vi_tinh = document.getElementById('edit-prod-dvt').value.trim() || 'Cái';
    const ghi_chu = document.getElementById('edit-prod-ghi-chu').value.trim();

    if (!ten_hang) {
        showToast('Vui lòng nhập tên hàng hóa!', 'warning');
        return;
    }

    const parseMoney = window.parseCurrencyValue || parseCurrencyValue || (v => parseFloat(String(v).replace(/\./g, '').replace(/,/g, '')) || 0);

    // Thu thập các lô
    const rows = document.querySelectorAll('#edit-batches-tbody tr');
    const batches = [];
    rows.forEach(row => {
        const sl = parseInt(row.querySelector('.batch-sl')?.value) || 0;
        const gia = parseMoney(row.querySelector('.batch-gia')?.value);
        if (sl > 0) {
            batches.push({ so_luong: sl, gia_nhap: gia });
        }
    });

    let ton_kho = parseInt(document.getElementById('edit-prod-ton-kho').value) || 0;
    let gia_nhap = parseMoney(document.getElementById('edit-prod-gia-nhap').value);
    let gia_ban = parseMoney(document.getElementById('edit-prod-gia-ban')?.value);

    if (batches.length > 0) {
        ton_kho = batches.reduce((sum, b) => sum + b.so_luong, 0);
        gia_nhap = batches[0].gia_nhap;
    } else if (ton_kho > 0) {
        batches.push({ so_luong: ton_kho, gia_nhap: gia_nhap });
    }

    const payload = {
        ten_hang,
        danh_muc,
        don_vi_tinh,
        ton_kho,
        gia_nhap,
        gia_ban,
        ghi_chu,
        batches
    };

    try {
        showLoading('Đang lưu thông số hàng hóa...');
        await apiRequest(`/api/hang-hoa/${id}`, 'PUT', payload);

        hideLoading();
        showToast('Cập nhật thông số hàng hóa thành công!', 'success');
        if (editStockModalInstance) {
            editStockModalInstance.hide();
        } else {
            closeModal('modal-edit-stock');
        }

        // Tải lại dữ liệu ngay lập tức
        await loadProducts(true);

        // Phát tín hiệu đồng bộ sang các tab khác
        if (typeof broadcastDataUpdate === 'function') {
            broadcastDataUpdate('PRODUCTS_UPDATED');
        } else if (typeof window.broadcastDataUpdate === 'function') {
            window.broadcastDataUpdate('PRODUCTS_UPDATED');
        }
        try {
            if (typeof BroadcastChannel !== 'undefined') {
                const bc = new BroadcastChannel('inventory_sync');
                bc.postMessage({ type: 'PRODUCTS_UPDATED' });
            }
        } catch (bcErr) {}
    } catch (e) {
        hideLoading();
        showToast(`Lỗi cập nhật: ${e.message}`, 'error');
    }
}

async function saveProduct() {
    const tenHang = document.getElementById('f-ten-hang')?.value.trim() || '';
    if (!tenHang) { 
        showToast('Vui lòng nhập tên hàng', 'error'); 
        return; 
    }

    const parseMoney = window.parseCurrencyValue || parseCurrencyValue || (v => parseFloat(String(v).replace(/\./g, '').replace(/,/g, '')) || 0);
    const body = {
        ten_hang: tenHang,
        danh_muc: document.getElementById('f-danh-muc')?.value.trim() || '',
        don_vi_tinh: document.getElementById('f-dvt')?.value.trim() || 'Cái',
        gia_nhap: parseMoney(document.getElementById('f-gia-nhap')?.value),
        gia_ban: parseMoney(document.getElementById('f-gia-ban')?.value),
        ton_kho: parseInt(document.getElementById('f-ton-kho')?.value) || 0,
        ghi_chu: document.getElementById('f-ghi-chu')?.value.trim() || '',
    };

    const saveBtn = document.getElementById('btn-save-product') || document.querySelector('#product-modal .btn-primary');
    if (saveBtn) {
        if (saveBtn.disabled) return;
        saveBtn.disabled = true;
    }
    const origHtml = saveBtn ? saveBtn.innerHTML : '';
    if (saveBtn) {
        saveBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Đang lưu...';
    }

    try {
        showLoading();
        await apiRequest('/api/hang-hoa', 'POST', body);
        showToast('Thêm hàng hóa thành công', 'success');
        
        closeModal('product-modal');
        
        // Tải lại dữ liệu ngay lập tức
        await loadProducts(true);

        // Phát tín hiệu đồng bộ sang các tab khác
        if (typeof broadcastDataUpdate === 'function') {
            broadcastDataUpdate('PRODUCTS_UPDATED');
        } else if (typeof window.broadcastDataUpdate === 'function') {
            window.broadcastDataUpdate('PRODUCTS_UPDATED');
        }
        try {
            if (typeof BroadcastChannel !== 'undefined') {
                const bc = new BroadcastChannel('inventory_sync');
                bc.postMessage({ type: 'PRODUCTS_UPDATED' });
            }
        } catch (bcErr) {}
    } catch (e) {
        showToast(e.message || 'Lỗi khi lưu hàng hóa', 'error');
    } finally {
        hideLoading();
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.innerHTML = origHtml;
        }
    }
}

async function deleteProduct(id) {
    const p = allProducts.find(x => x.id === id);
    const name = p ? p.ten_hang : 'này';
    if (!confirmDelete(`Xóa hàng hóa "${name}"?`)) return;
    try {
        showLoading();
        await apiRequest(`/api/hang-hoa/${id}`, 'DELETE');
        showToast('Đã xóa hàng hóa');
        await loadProducts();
    } catch (e) {
        showToast(e.message, 'error');
    } finally {
        hideLoading();
    }
}

async function exportProductsExcel() {
    const items = currentFiltered && currentFiltered.length ? currentFiltered : allProducts;
    if (!items || !items.length) {
        showToast('Không có dữ liệu hàng hóa để xuất Excel!', 'info');
        return;
    }

    if (typeof window.ExcelJS === 'undefined') {
        showToast('Đang khởi tạo công cụ ExcelJS, vui lòng thử lại sau giây lát!', 'info');
        return;
    }

    const now = new Date();
    const dateCloseStr = `Ngày ${String(now.getDate()).padStart(2, '0')} tháng ${String(now.getMonth() + 1).padStart(2, '0')} năm ${now.getFullYear()}`;
    const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;

    const wb = new window.ExcelJS.Workbook();
    wb.creator = COMPANY_REPORT_INFO.name;
    wb.lastModifiedBy = COMPANY_REPORT_INFO.name;
    wb.created = now;

    const ws = wb.addWorksheet('DanhSachHangHoa', { views: [{ showGridLines: true }] });

    ws.columns = [
        { width: 6 },   // A: STT
        { width: 14 },  // B: Mã hàng
        { width: 42 },  // C: Tên hàng hóa
        { width: 18 },  // D: Danh mục
        { width: 10 },  // E: ĐVT
        { width: 14 },  // F: Số lượng tồn
        { width: 18 },  // G: Đơn giá vốn
        { width: 22 },  // H: Thành tiền tồn
        { width: 22 },  // I: Ghi chú
    ];

    const fontNormal = { name: 'Times New Roman', size: 10, color: { argb: 'FF000000' } };
    const fontBold = { name: 'Times New Roman', size: 10, bold: true, color: { argb: 'FF000000' } };
    const fontTitle = { name: 'Times New Roman', size: 15, bold: true, color: { argb: 'FF000000' } };
    const fontItalic = { name: 'Times New Roman', size: 9.5, italic: true, color: { argb: 'FF000000' } };

    const borderThinAll = {
        top: { style: 'thin', color: { argb: 'FF000000' } },
        bottom: { style: 'thin', color: { argb: 'FF000000' } },
        left: { style: 'thin', color: { argb: 'FF000000' } },
        right: { style: 'thin', color: { argb: 'FF000000' } }
    };

    // Header góc trái (Đơn vị & Địa chỉ)
    ws.getCell('A1').value = `Đơn vị: ${COMPANY_REPORT_INFO.name}`;
    ws.getCell('A1').font = fontBold;
    ws.getCell('A2').value = `Địa chỉ: ${COMPANY_REPORT_INFO.address}`;
    ws.getCell('A2').font = fontBold;

    // Header góc phải (Mẫu số TT 133)
    ws.mergeCells('G1:I1');
    const mCell = ws.getCell('G1');
    mCell.value = 'Mẫu số 01 - VT';
    mCell.font = fontBold;
    mCell.alignment = { horizontal: 'center' };

    ws.mergeCells('G2:I2');
    const qdCell = ws.getCell('G2');
    qdCell.value = '(Ban hành theo TT 133/2016/TT-BTC';
    qdCell.font = fontItalic;
    qdCell.alignment = { horizontal: 'center' };

    ws.mergeCells('G3:I3');
    const qd2Cell = ws.getCell('G3');
    qd2Cell.value = 'ngày 26/08/2016 của Bộ Trưởng BTC)';
    qd2Cell.font = fontItalic;
    qd2Cell.alignment = { horizontal: 'center' };

    const fromDateVal = document.getElementById('filter-from-date')?.value || '';
    const toDateVal = document.getElementById('filter-to-date')?.value || '';
    let periodSubtitle = `Thời điểm: ${dateCloseStr}`;
    if (fromDateVal && toDateVal) {
        periodSubtitle = `Kỳ báo cáo: Từ ngày ${formatDate(fromDateVal)} đến ngày ${formatDate(toDateVal)}`;
    } else if (toDateVal) {
        periodSubtitle = `Tính đến ngày: ${formatDate(toDateVal)}`;
    } else if (fromDateVal) {
        periodSubtitle = `Từ ngày: ${formatDate(fromDateVal)}`;
    }

    // Tiêu đề bảng
    ws.mergeCells('A5:I5');
    const tCell = ws.getCell('A5');
    tCell.value = 'BÁO CÁO DANH MỤC & TỒN KHO HÀNG HÓA';
    tCell.font = fontTitle;
    tCell.alignment = { horizontal: 'center', vertical: 'middle' };

    // Thời điểm báo cáo
    ws.mergeCells('A6:I6');
    const pCell = ws.getCell('A6');
    pCell.value = periodSubtitle;
    pCell.font = fontNormal;
    pCell.alignment = { horizontal: 'center', vertical: 'middle' };

    // Đơn vị tính
    ws.mergeCells('G8:I8');
    const uCell = ws.getCell('G8');
    uCell.value = 'Đơn vị tính: Đồng';
    uCell.font = fontBold;
    uCell.alignment = { horizontal: 'right', vertical: 'middle' };

    // Hàng 9: Tiêu đề các cột
    const headers = [
        'STT',
        'Mã hàng',
        'Tên vật tư, hàng hóa',
        'Danh mục',
        'ĐVT',
        'Số lượng tồn',
        'Đơn giá vốn',
        'Thành tiền vốn',
        'Ghi chú'
    ];

    const hRow = ws.getRow(9);
    hRow.height = 25;
    headers.forEach((h, idx) => {
        const cell = hRow.getCell(idx + 1);
        cell.value = h;
        cell.font = fontBold;
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } };
        cell.border = borderThinAll;
    });

    let currentRow = 10;
    let totQty = 0;
    let totVal = 0;

    items.forEach((p, idx) => {
        const row = ws.getRow(currentRow);
        row.height = 20;

        const sl = parseInt(p.ton_kho) || 0;
        const giaNhap = parseFloat(p.gia_nhap) || 0;
        const batches = p.batches || [];
        let giaTriTon = 0;
        if (p.thanh_tien_ton !== undefined) {
            giaTriTon = p.thanh_tien_ton;
        } else if (batches.length > 1) {
            giaTriTon = batches.reduce((bSum, b) => bSum + (b.so_luong * b.gia_nhap), 0);
        } else {
            giaTriTon = Math.round(sl * giaNhap);
        }

        const donGiaHienThi = (sl > 0 && batches.length > 1) ? Math.round(giaTriTon / sl) : giaNhap;

        totQty += sl;
        totVal += giaTriTon;

        row.getCell(1).value = idx + 1;
        row.getCell(1).alignment = { horizontal: 'center' };

        row.getCell(2).value = p.ma_hang || '';
        row.getCell(2).alignment = { horizontal: 'center' };

        row.getCell(3).value = p.ten_hang || '';
        row.getCell(3).alignment = { horizontal: 'left' };

        row.getCell(4).value = p.danh_muc || 'Khác';
        row.getCell(4).alignment = { horizontal: 'left' };

        row.getCell(5).value = p.don_vi_tinh || 'Cái';
        row.getCell(5).alignment = { horizontal: 'center' };

        row.getCell(6).value = sl;
        row.getCell(6).numFmt = '#,##0';
        row.getCell(6).alignment = { horizontal: 'right' };

        row.getCell(7).value = donGiaHienThi;
        row.getCell(7).numFmt = '#,##0';
        row.getCell(7).alignment = { horizontal: 'right' };

        row.getCell(8).value = giaTriTon;
        row.getCell(8).numFmt = '#,##0';
        row.getCell(8).alignment = { horizontal: 'right' };

        row.getCell(9).value = p.ghi_chu || '';
        row.getCell(9).alignment = { horizontal: 'left' };

        for (let c = 1; c <= 9; c++) {
            row.getCell(c).font = fontNormal;
            row.getCell(c).border = borderThinAll;
        }

        currentRow++;
    });

    // Hàng Tổng cộng
    const rTot = ws.getRow(currentRow);
    rTot.height = 24;
    ws.mergeCells(`A${currentRow}:E${currentRow}`);
    rTot.getCell(1).value = 'TỔNG CỘNG';
    rTot.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };

    rTot.getCell(6).value = totQty;
    rTot.getCell(6).numFmt = '#,##0';
    rTot.getCell(6).alignment = { horizontal: 'right', vertical: 'middle' };

    rTot.getCell(7).value = '';
    rTot.getCell(7).alignment = { horizontal: 'center', vertical: 'middle' };

    rTot.getCell(8).value = totVal;
    rTot.getCell(8).numFmt = '#,##0';
    rTot.getCell(8).alignment = { horizontal: 'right', vertical: 'middle' };

    rTot.getCell(9).value = '';

    for (let c = 1; c <= 9; c++) {
        const cell = rTot.getCell(c);
        cell.font = fontBold;
        cell.border = borderThinAll;
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDBEAFE' } };
    }
    currentRow++;

    // Phần Ký Tên
    const signRow = currentRow + 2;
    ws.mergeCells(`G${signRow}:I${signRow}`);
    const dCell = ws.getCell(`G${signRow}`);
    dCell.value = dateCloseStr;
    dCell.font = fontItalic;
    dCell.alignment = { horizontal: 'center' };

    const rSignTitle = ws.getRow(signRow + 1);
    ws.mergeCells(`A${signRow + 1}:B${signRow + 1}`);
    rSignTitle.getCell(1).value = 'Người lập biểu';
    rSignTitle.getCell(1).font = fontBold;
    rSignTitle.getCell(1).alignment = { horizontal: 'center' };

    ws.mergeCells(`C${signRow + 1}:D${signRow + 1}`);
    rSignTitle.getCell(3).value = 'Thủ kho';
    rSignTitle.getCell(3).font = fontBold;
    rSignTitle.getCell(3).alignment = { horizontal: 'center' };

    ws.mergeCells(`E${signRow + 1}:F${signRow + 1}`);
    rSignTitle.getCell(5).value = 'Kế toán trưởng';
    rSignTitle.getCell(5).font = fontBold;
    rSignTitle.getCell(5).alignment = { horizontal: 'center' };

    ws.mergeCells(`G${signRow + 1}:I${signRow + 1}`);
    rSignTitle.getCell(7).value = 'Giám đốc';
    rSignTitle.getCell(7).font = fontBold;
    rSignTitle.getCell(7).alignment = { horizontal: 'center' };

    const rSignNote = ws.getRow(signRow + 2);
    ws.mergeCells(`A${signRow + 2}:B${signRow + 2}`);
    rSignNote.getCell(1).value = '(Ký, họ tên)';
    rSignNote.getCell(1).font = fontItalic;
    rSignNote.getCell(1).alignment = { horizontal: 'center' };

    ws.mergeCells(`C${signRow + 2}:D${signRow + 2}`);
    rSignNote.getCell(3).value = '(Ký, họ tên)';
    rSignNote.getCell(3).font = fontItalic;
    rSignNote.getCell(3).alignment = { horizontal: 'center' };

    ws.mergeCells(`E${signRow + 2}:F${signRow + 2}`);
    rSignNote.getCell(5).value = '(Ký, họ tên)';
    rSignNote.getCell(5).font = fontItalic;
    rSignNote.getCell(5).alignment = { horizontal: 'center' };

    ws.mergeCells(`G${signRow + 2}:I${signRow + 2}`);
    rSignNote.getCell(7).value = '(Ký, họ tên, đóng dấu)';
    rSignNote.getCell(7).font = fontItalic;
    rSignNote.getCell(7).alignment = { horizontal: 'center' };

    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Danh_Muc_Hang_Hoa_${dateStr}.xlsx`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
    }, 150);

    showToast('Đã xuất file Excel Danh Mục Hàng Hóa thành công!', 'success');
}

/**
 * In Báo Cáo Danh Sách Hàng Hóa
 */
function executePrintHtml(htmlContent) {
    try {
        const printWindow = window.open('', '_blank', 'width=1100,height=800');
        if (printWindow) {
            printWindow.document.open();
            printWindow.document.write(htmlContent);
            printWindow.document.close();
            return;
        }
    } catch (e) {
        console.warn('Cửa sổ popup bị chặn, chuyển sang in qua iframe', e);
    }

    let frame = document.getElementById('report-print-hidden-frame');
    if (!frame) {
        frame = document.createElement('iframe');
        frame.id = 'report-print-hidden-frame';
        frame.style.position = 'fixed';
        frame.style.right = '0';
        frame.style.bottom = '0';
        frame.style.width = '0';
        frame.style.height = '0';
        frame.style.border = '0';
        frame.style.visibility = 'hidden';
        document.body.appendChild(frame);
    }
    const doc = frame.contentWindow.document;
    doc.open();
    doc.write(htmlContent);
    doc.close();
    setTimeout(() => {
        try {
            frame.contentWindow.focus();
            frame.contentWindow.print();
        } catch (err) {
            console.error('Lỗi khi kích hoạt in:', err);
            window.print();
        }
    }, 450);
}

function printProductsReport() {
    const items = currentFiltered && currentFiltered.length ? currentFiltered : allProducts;
    if (!items || !items.length) {
        showToast('Không có dữ liệu hàng hóa để in!', 'warning');
        return;
    }

    const now = new Date();
    const dateCloseStr = `Ngày ${String(now.getDate()).padStart(2, '0')} tháng ${String(now.getMonth() + 1).padStart(2, '0')} năm ${now.getFullYear()}`;
    const fromDateVal = document.getElementById('filter-from-date')?.value || '';
    const toDateVal = document.getElementById('filter-to-date')?.value || '';
    let periodSubtitle = `Thời điểm: ${dateCloseStr}`;
    if (fromDateVal && toDateVal) {
        periodSubtitle = `Kỳ báo cáo: Từ ngày ${formatDate(fromDateVal)} đến ngày ${formatDate(toDateVal)}`;
    } else if (toDateVal) {
        periodSubtitle = `Tính đến ngày: ${formatDate(toDateVal)}`;
    } else if (fromDateVal) {
        periodSubtitle = `Từ ngày: ${formatDate(fromDateVal)}`;
    }

    let totQty = 0;
    let totVal = 0;

    const rowsHtml = items.map((p, idx) => {
        const sl = parseInt(p.ton_kho) || 0;
        const giaNhap = parseFloat(p.gia_nhap) || 0;
        const giaBan = parseFloat(p.gia_ban) || 0;
        const batches = p.batches || [];
        let giaTriTon = 0;
        if (p.thanh_tien_ton !== undefined) {
            giaTriTon = p.thanh_tien_ton;
        } else if (batches.length > 1) {
            giaTriTon = batches.reduce((bSum, b) => bSum + (b.so_luong * b.gia_nhap), 0);
        } else {
            giaTriTon = Math.round(sl * giaNhap);
        }

        totQty += sl;
        totVal += giaTriTon;

        return `
            <tr>
                <td style="text-align: center; padding: 4px;">${idx + 1}</td>
                <td style="text-align: center; font-family: monospace; padding: 4px;">${escapeHtml(p.ma_hang || '')}</td>
                <td style="text-align: left; padding: 4px 6px;">${escapeHtml(p.ten_hang || '')}</td>
                <td style="text-align: left; padding: 4px 6px;">${escapeHtml(p.danh_muc || 'Khác')}</td>
                <td style="text-align: center; padding: 4px;">${escapeHtml(p.don_vi_tinh || 'Cái')}</td>
                <td style="text-align: right; padding: 4px 6px;">${formatVNDClean(giaNhap)}</td>
                <td style="text-align: right; padding: 4px 6px;">${formatVNDClean(giaBan)}</td>
                <td style="text-align: right; padding: 4px 6px; font-weight: bold;">${formatNumber(sl)}</td>
                <td style="text-align: right; padding: 4px 6px; font-weight: bold;">${formatVNDClean(giaTriTon)}</td>
                <td style="text-align: left; padding: 4px 6px;">${escapeHtml(p.ghi_chu || '')}</td>
            </tr>
        `;
    }).join('');

    const reportHtml = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <title>Báo Cáo Danh Sách Hàng Hóa</title>
            <style>
                @page { size: A4 landscape; margin: 10mm 12mm; }
                body {
                    font-family: "Times New Roman", Times, serif;
                    font-size: 9.5pt;
                    color: #000;
                    margin: 0;
                    padding: 8px;
                }
                .no-print-bar {
                    display: flex;
                    justify-content: flex-end;
                    margin-bottom: 10px;
                }
                .btn-print {
                    background: #0284c7;
                    color: #fff;
                    border: none;
                    padding: 7px 18px;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 13px;
                    font-weight: bold;
                }
                @media print {
                    .no-print-bar { display: none !important; }
                    body { padding: 0; }
                }
                .header-table { width: 100%; margin-bottom: 12px; border-collapse: collapse; }
                .title-block { text-align: center; margin: 10px 0 14px 0; }
                .main-title { font-size: 15pt; font-weight: bold; text-transform: uppercase; margin: 0; }
                .sub-title { font-size: 10pt; font-style: italic; margin-top: 4px; }
                .data-table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 9pt; }
                .data-table th, .data-table td { border: 1px solid #333; }
                .data-table th { background-color: #f1f5f9; padding: 6px 4px; text-align: center; font-weight: bold; }
                .data-table tfoot td { font-weight: bold; background-color: #f8fafc; }
                .sign-table { width: 100%; margin-top: 25px; border-collapse: collapse; }
                .sign-table td { text-align: center; vertical-align: top; width: 25%; }
            </style>
        </head>
        <body>
            <div class="no-print-bar">
                <button class="btn-print" onclick="window.print()">In Ngay</button>
            </div>
            <table class="header-table">
                <tr>
                    <td style="vertical-align: top; width: 60%;">
                        <div style="font-weight: bold; font-size: 10.5pt; text-transform: uppercase;">${escapeHtml(COMPANY_REPORT_INFO.name)}</div>
                        <div style="font-size: 9pt; margin-top: 2px;">Địa chỉ: ${escapeHtml(COMPANY_REPORT_INFO.address)}</div>
                        <div style="font-size: 9pt;">Hotline: ${escapeHtml(COMPANY_REPORT_INFO.hotline)} | Website: laptopannam.com</div>
                    </td>
                    <td style="vertical-align: top; text-align: right; width: 40%;">
                        <div style="font-weight: bold; font-size: 9.5pt;">Mẫu số S10-DN</div>
                        <div style="font-size: 8.5pt; font-style: italic;">(Ban hành theo TT 133/2016/TT-BTC)</div>
                    </td>
                </tr>
            </table>
            <div class="title-block">
                <div class="main-title">BÁO CÁO DANH SÁCH HÀNG HÓA VÀ TỒN KHO</div>
                <div class="sub-title">${periodSubtitle}</div>
            </div>
            <table class="data-table">
                <thead>
                    <tr>
                        <th style="width: 32px;">STT</th>
                        <th style="width: 80px;">Mã hàng</th>
                        <th>Tên hàng hóa</th>
                        <th style="width: 90px;">Danh mục</th>
                        <th style="width: 50px;">ĐVT</th>
                        <th style="width: 90px;">Giá nhập</th>
                        <th style="width: 90px;">Giá bán</th>
                        <th style="width: 60px;">SL Tồn</th>
                        <th style="width: 105px;">Giá trị tồn</th>
                        <th style="width: 110px;">Ghi chú</th>
                    </tr>
                </thead>
                <tbody>
                    ${rowsHtml}
                </tbody>
                <tfoot>
                    <tr>
                        <td colspan="7" style="text-align: right; padding: 6px; text-transform: uppercase;">Tổng cộng:</td>
                        <td style="text-align: right; padding: 6px;">${formatNumber(totQty)}</td>
                        <td style="text-align: right; padding: 6px;">${formatVNDClean(totVal)}</td>
                        <td></td>
                    </tr>
                </tfoot>
            </table>
            <table class="sign-table">
                <tr>
                    <td colspan="4" style="text-align: right; padding-bottom: 8px; font-style: italic;">${dateCloseStr}</td>
                </tr>
                <tr>
                    <td><strong>Người lập biểu</strong><br><span style="font-size: 8pt; font-style: italic;">(Ký, họ tên)</span></td>
                    <td><strong>Thủ kho</strong><br><span style="font-size: 8pt; font-style: italic;">(Ký, họ tên)</span></td>
                    <td><strong>Kế toán trưởng</strong><br><span style="font-size: 8pt; font-style: italic;">(Ký, họ tên)</span></td>
                    <td><strong>Giám đốc</strong><br><span style="font-size: 8pt; font-style: italic;">(Ký, họ tên, đóng dấu)</span></td>
                </tr>
            </table>
        </body>
        </html>
    `;
    executePrintHtml(reportHtml);
}

// Init
document.addEventListener('DOMContentLoaded', async () => {
    populateDanhMucDropdowns();
    await loadProducts();

    const searchHandler = typeof debounce === 'function' ? debounce(applyFilters, 200) : applyFilters;
    document.getElementById('search-input')?.addEventListener('input', searchHandler);
    document.getElementById('filter-danh-muc')?.addEventListener('change', applyFilters);
    document.getElementById('filter-stock-status')?.addEventListener('change', applyFilters);

    // Tự động làm mới dữ liệu khi người dùng chuyển tab quay lại hoặc có nhập/xuất kho
    window.addEventListener('message', (e) => {
        if (e.data && (e.data.type === 'TAB_ACTIVATED' || e.data.type === 'PRODUCTS_UPDATED')) {
            loadProducts(true);
        }
    });

    try {
        if (typeof BroadcastChannel !== 'undefined') {
            const bc = new BroadcastChannel('inventory_sync');
            bc.onmessage = (e) => {
                if (e.data && e.data.type === 'PRODUCTS_UPDATED') {
                    loadProducts(true);
                }
            };
        }
    } catch (err) {}
});
