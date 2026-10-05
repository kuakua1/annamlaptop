/**
 * ton_kho.js - Logic cho trang Hàng Hóa Tồn Kho
 */

let allProducts = [];

async function loadStockData(silent = false) {
    try {
        const tbody = document.getElementById('stock-tbody');
        if (!silent && tbody) {
            tbody.innerHTML = '<tr><td colspan="10" class="text-center text-muted py-4"><div class="spinner-border spinner-border-sm text-primary me-2"></div>Đang tải dữ liệu tồn kho...</td></tr>';
        }

        const res = await apiRequest('/api/hang-hoa');
        allProducts = res.data || [];
        renderStockTable();
    } catch (e) {
        if (!silent) {
            showToast('Lỗi khi tải dữ liệu tồn kho: ' + e.message, 'error');
        }
    }
}

let currentFiltered = [];

function renderStockTable() {
    const search = (document.getElementById('search-input')?.value || '').toLowerCase().trim();
    const danhMuc = document.getElementById('filter-danh-muc')?.value || '';
    const stockStatus = document.getElementById('filter-stock-status')?.value || 'in_stock';

    let filtered = allProducts.filter(p => {
        const ton = parseInt(p.ton_kho) || 0;
        if (stockStatus === 'in_stock' && ton <= 0) return false;
        if (stockStatus === 'low_stock' && (ton <= 0 || ton > 2)) return false;
        if (stockStatus === 'out_of_stock' && ton > 0) return false;
        if (danhMuc && p.danh_muc !== danhMuc) return false;
        if (search) {
            const text = `${p.ma_hang} ${p.ten_hang} ${p.danh_muc}`.toLowerCase();
            if (!text.includes(search)) return false;
        }
        return true;
    });

    currentFiltered = filtered;

    // Thống kê tổng hợp
    const inStockItems = allProducts.filter(p => (parseInt(p.ton_kho) || 0) > 0);
    const totalInStockItemsCount = inStockItems.length;
    const totalQty = filtered.reduce((sum, p) => sum + (parseInt(p.ton_kho) || 0), 0);
    const totalVal = filtered.reduce((sum, p) => {
        if (p.thanh_tien_ton !== undefined) {
            return sum + p.thanh_tien_ton;
        }
        const sl = parseInt(p.ton_kho) || 0;
        const batches = p.batches || [];
        if (batches.length > 1) {
            return sum + batches.reduce((bSum, b) => bSum + (b.so_luong * b.gia_nhap), 0);
        }
        const gia = parseFloat(p.gia_nhap) || 0;
        return sum + Math.round(sl * gia);
    }, 0);

    // Cập nhật card trên đầu
    document.getElementById('stat-items').textContent = formatNumber(totalInStockItemsCount);
    document.getElementById('stat-items-sub').textContent = `trên tổng số ${allProducts.length} mặt hàng`;
    document.getElementById('stat-qty').textContent = formatNumber(totalQty);
    document.getElementById('stat-val').textContent = formatVND(totalVal);
    document.getElementById('total-count').textContent = filtered.length;

    // Cập nhật footer
    const tfoot = document.getElementById('stock-tfoot');
    if (filtered.length > 0) {
        tfoot.style.display = '';
        document.getElementById('tf-qty').textContent = formatNumber(totalQty);
        document.getElementById('tf-val').textContent = formatVND(totalVal);
    } else {
        tfoot.style.display = 'none';
    }

    const tbody = document.getElementById('stock-tbody');
    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="10" class="text-center text-muted py-5">
            <i class="bi bi-inbox fs-2 d-block text-secondary mb-2"></i>
            Không có hàng hóa nào phù hợp với bộ lọc
        </td></tr>`;
        return;
    }

    tbody.innerHTML = filtered.map((p, idx) => {
        const sl = parseInt(p.ton_kho) || 0;
        const giaNhap = parseFloat(p.gia_nhap) || 0;
        const giaBan = parseFloat(p.gia_ban) || 0;
        const batches = p.batches || [];
        const hasMulti = batches.length > 1;

        let giaTriTon = 0;
        if (p.thanh_tien_ton !== undefined) {
            giaTriTon = p.thanh_tien_ton;
        } else if (batches.length > 1) {
            giaTriTon = batches.reduce((bSum, b) => bSum + (b.so_luong * b.gia_nhap), 0);
        } else {
            giaTriTon = Math.round(sl * giaNhap);
        }

        const badgeClass = sl > 5 ? 'bg-success' : (sl > 0 ? 'bg-warning text-dark' : 'bg-danger');

        // Dropdown chi tiết lô giá
        let batchBadgeHtml = '';
        if (hasMulti) {
            batchBadgeHtml = `
                <div class="dropdown d-inline-block mt-1">
                    <button class="btn btn-xs btn-outline-info dropdown-toggle py-0 px-1" type="button" data-bs-toggle="dropdown" style="font-size:0.75rem;">
                        <i class="bi bi-layers-half me-1"></i>${batches.length} lô giá
                    </button>
                    <ul class="dropdown-menu dropdown-menu-end shadow-sm small p-2" style="min-width: 200px;">
                        <li class="dropdown-header py-1 text-uppercase text-muted" style="font-size: 0.7rem;">Chi tiết lô nhập FIFO:</li>
                        ${batches.map(b => `
                            <li class="d-flex justify-content-between py-1 border-bottom border-light">
                                <span><span class="badge bg-light text-dark border me-1">${b.so_luong} ${escapeHtml(p.don_vi_tinh || 'Cái')}</span></span>
                                <span class="fw-semibold text-primary font-monospace">${formatVND(b.gia_nhap)}</span>
                            </li>
                        `).join('')}
                    </ul>
                </div>
            `;
        }

        return `
            <tr>
                <td class="text-center text-muted small">${idx + 1}</td>
                <td><span class="badge bg-secondary font-monospace">${escapeHtml(p.ma_hang)}</span></td>
                <td>
                    <div class="fw-semibold text-dark">${escapeHtml(p.ten_hang)}</div>
                    ${p.ghi_chu ? `<small class="text-muted text-truncate d-block" style="max-width: 250px;">${escapeHtml(p.ghi_chu)}</small>` : ''}
                </td>
                <td><span class="badge bg-light text-secondary border">${escapeHtml(p.danh_muc || 'Khác')}</span></td>
                <td class="text-center text-muted small">${escapeHtml(p.don_vi_tinh || 'Cái')}</td>
                <td class="text-end text-muted font-monospace">${formatVND(giaNhap)}</td>
                <td class="text-center">
                    <div><span class="badge ${badgeClass} fs-6 px-2 py-1 font-monospace">${formatNumber(sl)}</span></div>
                    ${batchBadgeHtml}
                </td>
                <td class="text-end fw-bold text-primary font-monospace text-nowrap" style="white-space: nowrap; min-width: 165px;">${formatVND(giaTriTon)}</td>
                <td class="text-center no-print">
                    <div class="btn-group btn-group-sm">
                        <button class="btn btn-outline-secondary" onclick="openEditStockModal('${escapeHtml(p.id)}')" title="Chỉnh sửa kho hàng & giá lô">
                            <i class="bi bi-pencil-square"></i>
                        </button>
                        ${sl > 0 ? `
                            <a href="/xuat-hang?ma_hang=${encodeURIComponent(p.ma_hang)}" class="btn btn-outline-success" title="Xuất kho">
                                <i class="bi bi-box-arrow-up-right"></i>
                            </a>
                        ` : ''}
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

function printStockReport() {
    printReceiptModal('printable-stock-area', 'Báo Cáo Tồn Kho Hàng Hóa');
}

function exportStockExcel() {
    if (!currentFiltered || !currentFiltered.length) {
        showToast('Không có dữ liệu hàng tồn kho để xuất!', 'info');
        return;
    }

    let totalQty = 0;
    let totalVal = 0;

    const rows = currentFiltered.map((p, idx) => {
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

        totalQty += sl;
        totalVal += giaTriTon;

        return [
            idx + 1,
            p.ten_hang,
            p.don_vi_tinh || 'Cái',
            sl,
            giaNhap,
            giaTriTon
        ];
    });

    const summaryRow = ['Tổng cộng', '', '-', totalQty, '-', totalVal];

    const now = new Date();
    const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
    const monthText = `Tháng ${now.getMonth() + 1} năm ${now.getFullYear()}`;

    exportAccountingReportToExcel({
        title: 'BÁO CÁO TỔNG HỢP TỒN KHO',
        monthText,
        accountText: 'Tài khoản: 156 (Hàng hoá)',
        unitText: 'Đơn vị tính : Đồng',
        columns: [
            { header: 'STT', code: 'A', width: 8, align: 'center' },
            { header: 'Tên vật tư, hàng hóa', code: 'B', width: 50, align: 'left', wrapText: true },
            { header: 'ĐVT', code: 'C', width: 12, align: 'center' },
            { header: 'Số lượng', code: '1', width: 14, align: 'right', isNumber: true },
            { header: 'Đơn giá', code: '2', width: 18, align: 'right', isNumber: true },
            { header: 'Thành tiền', code: '3', width: 22, align: 'right', isNumber: true },
        ],
        rows,
        summaryRow,
        fileName: `Bao_Cao_Tong_Hop_Ton_Kho_${dateStr}.xlsx`,
        sheetName: 'TonKho'
    });
}

// ── Stock Edit Modal Logic ────────────────────────────────────────────────────

let currentEditingProduct = null;
let editStockModalInstance = null;

function openEditStockModal(productId) {
    const p = allProducts.find(x => String(x.id) === String(productId));
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
    document.getElementById('edit-prod-ghi-chu').value = p.ghi_chu || '';

    // Render các lô hàng
    const tbody = document.getElementById('edit-batches-tbody');
    tbody.innerHTML = '';
    const batches = (p.batches && p.batches.length > 0) ? p.batches : [
        { so_luong: p.ton_kho || 1, gia_nhap: p.gia_nhap || 0 }
    ];

    batches.forEach((b, idx) => {
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
            <input type="number" class="form-control form-control-sm font-monospace batch-gia" value="${gia_nhap}" min="0" step="any" oninput="calcBatchTotals()">
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
    // Đánh lại số thứ tự
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
        const gia = parseFloat(row.querySelector('.batch-gia')?.value) || 0;
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
        if (mainQty) mainQty.value = totalQty;
        if (rows.length > 0) {
            const firstGia = parseFloat(rows[0].querySelector('.batch-gia')?.value) || 0;
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

    // Thu thập các lô
    const rows = document.querySelectorAll('#edit-batches-tbody tr');
    const batches = [];
    rows.forEach(row => {
        const sl = parseInt(row.querySelector('.batch-sl')?.value) || 0;
        const gia = parseFloat(row.querySelector('.batch-gia')?.value) || 0;
        if (sl > 0) {
            batches.push({ so_luong: sl, gia_nhap: gia });
        }
    });

    let ton_kho = parseInt(document.getElementById('edit-prod-ton-kho').value) || 0;
    let gia_nhap = parseFloat(document.getElementById('edit-prod-gia-nhap').value) || 0;

    if (batches.length > 0) {
        ton_kho = batches.reduce((sum, b) => sum + b.so_luong, 0);
        gia_nhap = batches[0].gia_nhap;
    } else if (ton_kho > 0) {
        batches.push({ so_luong: ton_kho, gia_nhap: gia_nhap });
    }

    try {
        showLoading('Đang lưu thông số kho hàng...');
        const res = await apiRequest(`/api/hang-hoa/${id}`, 'PUT', {
            ten_hang,
            danh_muc,
            don_vi_tinh,
            ton_kho,
            gia_nhap,
            ghi_chu,
            batches
        });

        hideLoading();
        showToast('Cập nhật thông số hàng tồn kho thành công!', 'success');
        if (editStockModalInstance) {
            editStockModalInstance.hide();
        }

        // Tải lại bảng tồn kho ngay lập tức
        await loadStockData();

        // Đồng bộ các tab khác
        try {
            if (typeof BroadcastChannel !== 'undefined') {
                new BroadcastChannel('inventory_sync').postMessage({ type: 'PRODUCTS_UPDATED' });
            }
            if (window.parent && window.parent !== window) {
                window.parent.postMessage({ type: 'PRODUCTS_UPDATED' }, '*');
            }
        } catch (err) {}
    } catch (e) {
        hideLoading();
        showToast(`Lỗi cập nhật: ${e.message}`, 'error');
    }
}

// ── Bind Events ───────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    // Check URL param ?status=low_stock
    const urlParams = new URLSearchParams(window.location.search);
    const paramStatus = urlParams.get('status');
    const statusSelect = document.getElementById('filter-stock-status');
    if (paramStatus && statusSelect) {
        statusSelect.value = paramStatus;
    }

    loadStockData();

    document.getElementById('search-input')?.addEventListener('input', renderStockTable);
    document.getElementById('filter-danh-muc')?.addEventListener('change', renderStockTable);
    document.getElementById('filter-stock-status')?.addEventListener('change', renderStockTable);

    // Tự động làm mới dữ liệu khi người dùng chuyển tab quay lại hoặc có nhập/xuất kho
    window.addEventListener('message', (e) => {
        if (e.data && (e.data.type === 'TAB_ACTIVATED' || e.data.type === 'PRODUCTS_UPDATED')) {
            loadStockData(true);
        }
    });

    try {
        if (typeof BroadcastChannel !== 'undefined') {
            const bc = new BroadcastChannel('inventory_sync');
            bc.onmessage = (e) => {
                if (e.data && e.data.type === 'PRODUCTS_UPDATED') {
                    loadStockData(true);
                }
            };
        }
    } catch (err) {}
});
