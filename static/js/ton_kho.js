/**
 * ton_kho.js - Logic cho trang Hàng Hóa Tồn Kho
 */

let allProducts = [];

async function loadStockData() {
    try {
        const tbody = document.getElementById('stock-tbody');
        tbody.innerHTML = '<tr><td colspan="10" class="text-center text-muted py-4"><div class="spinner-border spinner-border-sm text-primary me-2"></div>Đang tải dữ liệu tồn kho...</td></tr>';

        const res = await apiRequest('/api/hang-hoa');
        allProducts = res.data || [];
        renderStockTable();
    } catch (e) {
        showToast('Lỗi khi tải dữ liệu tồn kho: ' + e.message, 'error');
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
                <td class="text-end font-monospace">${formatVND(giaBan)}</td>
                <td class="text-center">
                    <div><span class="badge ${badgeClass} fs-6 px-2 py-1 font-monospace">${formatNumber(sl)}</span></div>
                    ${batchBadgeHtml}
                </td>
                <td class="text-end fw-bold text-primary font-monospace text-nowrap" style="white-space: nowrap; min-width: 165px;">${formatVND(giaTriTon)}</td>
                <td class="text-center no-print">
                    <div class="btn-group btn-group-sm">
                        <a href="/nhap-hang?ma_hang=${encodeURIComponent(p.ma_hang)}" class="btn btn-outline-primary" title="Nhập thêm">
                            <i class="bi bi-plus-lg"></i>
                        </a>
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
});
