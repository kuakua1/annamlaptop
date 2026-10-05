/**
 * bang_xuat_kho.js - Logic cho Bảng Xuất Kho (chi tiết xuất, lọc tháng, tìm kiếm đa năng)
 */

let exportRecords = [];

function getCurrentMonthStr() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
}

async function loadExportData() {
    try {
        const monthInput = document.getElementById('filter-month');
        const month = monthInput ? monthInput.value : '';
        const searchInput = document.getElementById('search-input');
        const search = searchInput ? searchInput.value.trim() : '';

        const tbody = document.getElementById('export-tbody');
        tbody.innerHTML = '<tr><td colspan="12" class="text-center text-muted py-4"><div class="spinner-border spinner-border-sm text-danger me-2"></div>Đang tải dữ liệu xuất kho...</td></tr>';

        let url = '/api/xuat-hang?';
        if (month) url += `month=${encodeURIComponent(month)}&`;
        if (search) url += `search=${encodeURIComponent(search)}&`;

        const res = await apiRequest(url);
        exportRecords = res.data || [];

        renderExportTable(res);
    } catch (e) {
        showToast('Lỗi khi tải dữ liệu xuất kho: ' + e.message, 'error');
    }
}

function renderExportTable(apiRes) {
    const month = document.getElementById('filter-month')?.value || '';
    const monthLabel = month ? `tháng ${month.split('-')[1]}/${month.split('-')[0]}` : 'tất cả các tháng';
    document.getElementById('stat-month-label').textContent = monthLabel;

    const count = exportRecords.length;
    const totalQty = apiRes.tong_so_luong || exportRecords.reduce((sum, r) => sum + (parseInt(r.so_luong) || 0), 0);
    const totalRevenue = apiRes.tong_thanh_tien || exportRecords.reduce((sum, r) => sum + (parseFloat(r.thanh_tien) || 0), 0);
    const totalProfit = apiRes.tong_loi_nhuan || exportRecords.reduce((sum, r) => sum + (parseFloat(r.loi_nhuan) || 0), 0);

    // Cập nhật card trên đầu
    document.getElementById('stat-count').textContent = formatNumber(count);
    document.getElementById('stat-qty').textContent = formatNumber(totalQty);
    document.getElementById('stat-revenue').textContent = formatVND(totalRevenue);
    document.getElementById('stat-profit').textContent = formatVND(totalProfit);
    document.getElementById('total-count').textContent = count;

    // Cập nhật footer
    const tfoot = document.getElementById('export-tfoot');
    if (count > 0) {
        tfoot.style.display = '';
        document.getElementById('tf-qty').textContent = formatNumber(totalQty);
        document.getElementById('tf-val').textContent = formatVND(totalRevenue);
    } else {
        tfoot.style.display = 'none';
    }

    const tbody = document.getElementById('export-tbody');
    if (count === 0) {
        tbody.innerHTML = `<tr><td colspan="12" class="text-center text-muted py-5">
            <i class="bi bi-inbox fs-2 d-block text-secondary mb-2"></i>
            Không tìm thấy dữ liệu xuất kho phù hợp
        </td></tr>`;
        return;
    }

    tbody.innerHTML = exportRecords.map((r, idx) => {
        const sl = parseInt(r.so_luong) || 0;
        const giaBan = parseFloat(r.gia_ban) || 0;
        const thanhTien = parseFloat(r.thanh_tien) || 0;

        // Định dạng thông tin khách hàng (Tên, SĐT, Địa chỉ)
        const khTen = r.kh_ten || r.khach_hang_id || 'Khách lẻ';
        const khSdt = r.kh_sdt || '';
        const khDiaChi = r.kh_dia_chi || '';

        return `
            <tr>
                <td class="text-center text-muted small">${idx + 1}</td>
                <td><span class="badge bg-light text-secondary border font-monospace">${formatDate(r.ngay_xuat)}</span></td>
                <td>
                    <button class="btn btn-sm btn-link p-0 text-danger fw-bold font-monospace text-decoration-none" onclick="viewReceipt('${escapeHtml(r.so_phieu)}')">
                        <i class="bi bi-file-earmark-text me-1"></i>${escapeHtml(r.so_phieu)}
                    </button>
                </td>
                <td><span class="badge bg-secondary font-monospace">${escapeHtml(r.ma_hang)}</span></td>
                <td class="fw-semibold text-dark">${escapeHtml(r.ten_hang)}</td>
                <td class="text-center text-muted small">${escapeHtml(r.don_vi_tinh || 'Cái')}</td>
                <td class="text-center fw-bold fs-6 text-danger font-monospace">${formatNumber(sl)}</td>
                <td class="text-end text-muted font-monospace text-nowrap" style="white-space: nowrap;">${formatVND(giaBan)}</td>
                <td class="text-end fw-bold text-dark font-monospace text-nowrap" style="white-space: nowrap; min-width: 160px;">${formatVND(thanhTien)}</td>
                <td>
                    <div class="fw-bold text-dark"><i class="bi bi-person me-1 text-danger"></i>${escapeHtml(khTen)}</div>
                    ${khSdt ? `<div class="text-muted small"><i class="bi bi-telephone me-1 text-success"></i>${escapeHtml(khSdt)}</div>` : ''}
                    ${khDiaChi ? `<div class="text-muted small text-truncate" style="max-width: 260px;"><i class="bi bi-geo-alt me-1 text-secondary"></i>${escapeHtml(khDiaChi)}</div>` : ''}
                </td>
                <td>${r.ghi_chu ? `<small class="text-muted text-truncate d-block" style="max-width: 180px;">${escapeHtml(r.ghi_chu)}</small>` : '<span class="text-muted small">-</span>'}</td>
                <td class="text-center no-print">
                    <button class="btn btn-xs btn-outline-danger btn-sm" onclick="viewReceipt('${escapeHtml(r.so_phieu)}')" title="Xem chi tiết phiếu xuất">
                        <i class="bi bi-eye"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

async function viewReceipt(so_phieu) {
    try {
        const res = await apiRequest(`/api/xuat-hang/${so_phieu}`);
        const items = res.items || [];
        window.currentReceiptDetail = { ...res, type: 'xuat' };
        const kh = res.khach_hang || {};
        const modal = document.getElementById('detail-modal-body');

        modal.innerHTML = `
            <div class="card bg-light border-0 mb-3">
                <div class="card-body p-3">
                    <div class="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-2 pb-2 border-bottom">
                        <div>
                            <span class="badge bg-danger fs-6 px-3 py-1 font-monospace">${so_phieu}</span>
                            <span class="text-secondary small ms-2">Ngày xuất: <strong class="text-dark">${formatDate(res.ngay_xuat)}</strong></span>
                        </div>
                        <div class="text-end">
                            <span class="text-muted small me-2">Tổng tiền:</span>
                            <span class="fs-4 fw-bold text-danger font-monospace">${formatVND(res.total)}</span>
                        </div>
                    </div>
                    <div class="row g-2 small">
                        <div class="col-md-7">
                            <div class="fw-bold text-dark fs-6">${escapeHtml(kh.ten_kh || 'Khách lẻ')}</div>
                            ${kh.dien_thoai ? `<div class="text-muted">SĐT: <strong class="text-dark font-monospace">${escapeHtml(kh.dien_thoai)}</strong></div>` : ''}
                            ${kh.dia_chi ? `<div class="text-muted">Địa chỉ: <span class="text-dark">${escapeHtml(kh.dia_chi)}</span></div>` : ''}
                        </div>
                        <div class="col-md-5 text-md-end">
                            ${res.ghi_chu ? `<div class="text-muted fst-italic mb-1">Ghi chú: ${escapeHtml(res.ghi_chu)}</div>` : '<div class="text-muted fst-italic mb-1">Không có ghi chú</div>'}
                            <div class="text-muted">
                                Quy mô: <strong>${res.so_mat_hang || items.length}</strong> mặt hàng &middot; Tổng SL: <strong class="text-danger font-monospace">${formatNumber(res.tong_so_luong)}</strong>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

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
                                <td><span class="badge bg-secondary font-monospace">${escapeHtml(it.ma_hang)}</span></td>
                                <td class="fw-semibold">${escapeHtml(it.ten_hang)}</td>
                                <td class="text-center text-muted small">${escapeHtml(it.don_vi_tinh || 'Cái')}</td>
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
        openModal('detail-modal');
    } catch (e) {
        showToast(e.message, 'error');
    }
}

function clearMonthFilter() {
    const input = document.getElementById('filter-month');
    if (input) input.value = '';
    loadExportData();
}

function clearSearch() {
    const input = document.getElementById('search-input');
    if (input) input.value = '';
    loadExportData();
}

function printExportReport() {
    printReceiptModal('printable-export-area', 'Sổ Báo Cáo Xuất Kho');
}

function exportExportToExcel() {
    if (!exportRecords || !exportRecords.length) {
        showToast('Không có dữ liệu xuất kho để xuất Excel!', 'info');
        return;
    }

    let totalQty = 0;
    let totalThanhTien = 0;

    const rows = exportRecords.map((r, idx) => {
        const sl = parseInt(r.so_luong) || 0;
        const giaBan = parseFloat(r.gia_ban) || 0;
        const thanhTien = parseFloat(r.thanh_tien) || 0;

        totalQty += sl;
        totalThanhTien += thanhTien;

        return [
            idx + 1,
            formatDate(r.ngay_xuat),
            r.so_phieu,
            r.ten_hang,
            r.don_vi_tinh || 'Cái',
            sl,
            giaBan,
            thanhTien,
            r.kh_ten || 'Khách lẻ'
        ];
    });

    const summaryRow = ['Tổng cộng', '', '', '', '-', totalQty, '-', totalThanhTien, '-'];

    const monthInput = document.getElementById('filter-month')?.value;
    const now = new Date();
    let monthLabel = `Tháng ${now.getMonth() + 1} năm ${now.getFullYear()}`;
    let fileSuffix = `${now.getFullYear()}_${String(now.getMonth() + 1).padStart(2, '0')}`;
    if (monthInput && monthInput.includes('-')) {
        const [y, m] = monthInput.split('-');
        monthLabel = `Tháng ${m} năm ${y}`;
        fileSuffix = `${y}_${m}`;
    }

    exportAccountingReportToExcel({
        title: 'BẢNG KÊ CHI TIẾT XUẤT KHO HÀNG HÓA',
        monthText: monthLabel,
        accountText: 'Tài khoản: 632 / 511 (Giá vốn / Doanh thu)',
        unitText: 'Đơn vị tính : Đồng',
        columns: [
            { header: 'STT', code: 'A', width: 8, align: 'center' },
            { header: 'Ngày xuất', code: 'B', width: 14, align: 'center' },
            { header: 'Số phiếu', code: 'C', width: 16, align: 'center' },
            { header: 'Tên vật tư, hàng hóa', code: 'D', width: 45, align: 'left', wrapText: true },
            { header: 'ĐVT', code: 'E', width: 10, align: 'center' },
            { header: 'Số lượng', code: '1', width: 12, align: 'right', isNumber: true },
            { header: 'Đơn giá bán', code: '2', width: 16, align: 'right', isNumber: true },
            { header: 'Thành tiền', code: '3', width: 20, align: 'right', isNumber: true },
            { header: 'Khách hàng', code: '4', width: 25, align: 'left', wrapText: true }
        ],
        rows,
        summaryRow,
        fileName: `Bang_Ke_Xuat_Kho_${fileSuffix}.xlsx`,
        sheetName: 'XuatKho'
    });
}

// ── Bind Events ───────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    // Mặc định chọn tháng hiện tại
    const monthInput = document.getElementById('filter-month');
    if (monthInput) {
        monthInput.value = getCurrentMonthStr();
    }

    loadExportData();

    monthInput?.addEventListener('change', loadExportData);

    let debounceTimer;
    document.getElementById('search-input')?.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(loadExportData, 300);
    });
});
