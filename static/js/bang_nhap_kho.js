/**
 * bang_nhap_kho.js - Logic cho Bảng Nhập Kho (chi tiết nhập, lọc tháng, tìm kiếm đa năng)
 */

let importRecords = [];

function getCurrentMonthStr() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
}

async function loadImportData() {
    try {
        const monthInput = document.getElementById('filter-month');
        const month = monthInput ? monthInput.value : '';
        const searchInput = document.getElementById('search-input');
        const search = searchInput ? searchInput.value.trim() : '';

        const tbody = document.getElementById('import-tbody');
        tbody.innerHTML = '<tr><td colspan="12" class="text-center text-muted py-4"><div class="spinner-border spinner-border-sm text-primary me-2"></div>Đang tải dữ liệu nhập kho...</td></tr>';

        let url = '/api/nhap-hang?';
        if (month) url += `month=${encodeURIComponent(month)}&`;
        if (search) url += `search=${encodeURIComponent(search)}&`;

        const res = await apiRequest(url);
        importRecords = res.data || [];

        renderImportTable(res);
    } catch (e) {
        showToast('Lỗi khi tải dữ liệu nhập kho: ' + e.message, 'error');
    }
}

function renderImportTable(apiRes) {
    const month = document.getElementById('filter-month')?.value || '';
    const monthLabel = month ? `tháng ${month.split('-')[1]}/${month.split('-')[0]}` : 'tất cả các tháng';
    document.getElementById('stat-month-label').textContent = monthLabel;

    const count = importRecords.length;
    const totalQty = apiRes.tong_so_luong || importRecords.reduce((sum, r) => sum + (parseInt(r.so_luong) || 0), 0);
    const totalCost = apiRes.tong_thanh_tien || importRecords.reduce((sum, r) => sum + (parseFloat(r.thanh_tien) || 0), 0);

    // Cập nhật card trên đầu
    document.getElementById('stat-count').textContent = formatNumber(count);
    document.getElementById('stat-qty').textContent = formatNumber(totalQty);
    document.getElementById('stat-cost').textContent = formatVND(totalCost);
    document.getElementById('total-count').textContent = count;

    // Cập nhật footer
    const tfoot = document.getElementById('import-tfoot');
    if (count > 0) {
        tfoot.style.display = '';
        document.getElementById('tf-qty').textContent = formatNumber(totalQty);
        document.getElementById('tf-val').textContent = formatVND(totalCost);
    } else {
        tfoot.style.display = 'none';
    }

    const tbody = document.getElementById('import-tbody');
    if (count === 0) {
        tbody.innerHTML = `<tr><td colspan="12" class="text-center text-muted py-5">
            <i class="bi bi-inbox fs-2 d-block text-secondary mb-2"></i>
            Không tìm thấy dữ liệu nhập kho phù hợp
        </td></tr>`;
        return;
    }

    tbody.innerHTML = importRecords.map((r, idx) => {
        const sl = parseInt(r.so_luong) || 0;
        const giaNhap = parseFloat(r.gia_nhap) || 0;
        const thanhTien = parseFloat(r.thanh_tien) || 0;

        // Định dạng thông tin đơn vị nhập (Tên, SĐT, Địa chỉ)
        const nccTen = r.ncc_ten || r.nha_cung_cap_id || 'Nhà cung cấp lẻ';
        const nccSdt = r.ncc_sdt || '';
        const nccDiaChi = r.ncc_dia_chi || '';

        return `
            <tr>
                <td class="text-center text-muted small">${idx + 1}</td>
                <td><span class="badge bg-light text-secondary border font-monospace">${formatDate(r.ngay_nhap)}</span></td>
                <td>
                    <button class="btn btn-sm btn-link p-0 text-primary fw-bold font-monospace text-decoration-none" onclick="viewReceipt('${escapeHtml(r.so_phieu)}')">
                        <i class="bi bi-file-earmark-text me-1"></i>${escapeHtml(r.so_phieu)}
                    </button>
                </td>
                <td><span class="badge bg-secondary font-monospace">${escapeHtml(r.ma_hang)}</span></td>
                <td class="fw-semibold text-dark">${escapeHtml(r.ten_hang)}</td>
                <td class="text-center text-muted small">${escapeHtml(r.don_vi_tinh || 'Cái')}</td>
                <td class="text-center fw-bold fs-6 text-primary font-monospace">${formatNumber(sl)}</td>
                <td class="text-end text-muted font-monospace text-nowrap" style="white-space: nowrap;">${formatVND(giaNhap)}</td>
                <td class="text-end fw-bold text-dark font-monospace text-nowrap" style="white-space: nowrap; min-width: 160px;">${formatVND(thanhTien)}</td>
                <td>
                    <div class="fw-bold text-dark"><i class="bi bi-building me-1 text-primary"></i>${escapeHtml(nccTen)}</div>
                    ${nccSdt ? `<div class="text-muted small"><i class="bi bi-telephone me-1 text-success"></i>${escapeHtml(nccSdt)}</div>` : ''}
                    ${nccDiaChi ? `<div class="text-muted small text-truncate" style="max-width: 260px;"><i class="bi bi-geo-alt me-1 text-secondary"></i>${escapeHtml(nccDiaChi)}</div>` : ''}
                </td>
                <td>${r.ghi_chu ? `<small class="text-muted text-truncate d-block" style="max-width: 180px;">${escapeHtml(r.ghi_chu)}</small>` : '<span class="text-muted small">-</span>'}</td>
                <td class="text-center no-print">
                    <button class="btn btn-xs btn-outline-primary btn-sm" onclick="viewReceipt('${escapeHtml(r.so_phieu)}')" title="Xem chi tiết phiếu nhập">
                        <i class="bi bi-eye"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

async function viewReceipt(so_phieu) {
    try {
        const res = await apiRequest(`/api/nhap-hang/${so_phieu}`);
        const items = res.items || [];
        const ncc = res.nha_cung_cap || {};
        const modal = document.getElementById('detail-modal-body');

        modal.innerHTML = `
            <div class="card bg-light border-0 mb-3">
                <div class="card-body py-2 px-3">
                    <div class="row align-items-center">
                        <div class="col-sm-7 mb-2 mb-sm-0">
                            <div class="d-flex align-items-center gap-2 mb-1">
                                <span class="badge bg-primary fs-6 px-3 py-1 font-monospace">${so_phieu}</span>
                                <span class="badge bg-success-subtle text-success border border-success-subtle"><i class="bi bi-check2-circle me-1"></i>Đã nhập kho</span>
                            </div>
                            <div class="text-secondary small mt-1">
                                <i class="bi bi-calendar-event me-1 text-primary"></i>Ngày nhập: <strong class="text-dark">${formatDate(res.ngay_nhap)}</strong>
                            </div>
                        </div>
                        <div class="col-sm-5 text-sm-end">
                            <div class="small text-muted mb-0">Tổng tiền thanh toán</div>
                            <div class="fs-4 fw-bold text-primary font-monospace">${formatVND(res.total)}</div>
                        </div>
                    </div>
                    <hr class="my-2 border-secondary opacity-25">
                    <div class="row g-2 small">
                        <div class="col-md-7">
                            <div class="d-flex align-items-start">
                                <i class="bi bi-building me-2 text-primary fs-6 mt-1"></i>
                                <div>
                                    <div class="fw-bold text-dark fs-6">${escapeHtml(ncc.ten_ncc || 'Không xác định')}</div>
                                    ${ncc.dien_thoai ? `<div class="text-muted"><i class="bi bi-telephone me-1 text-success"></i>SĐT: <strong>${escapeHtml(ncc.dien_thoai)}</strong></div>` : ''}
                                    ${ncc.dia_chi ? `<div class="text-muted"><i class="bi bi-geo-alt me-1 text-danger"></i>Địa chỉ: ${escapeHtml(ncc.dia_chi)}</div>` : ''}
                                </div>
                            </div>
                        </div>
                        <div class="col-md-5 text-md-end">
                            ${res.ghi_chu ? `<div class="text-muted fst-italic mb-1"><i class="bi bi-chat-left-text me-1"></i>${escapeHtml(res.ghi_chu)}</div>` : '<div class="text-muted fst-italic mb-1">Không có ghi chú</div>'}
                            <div class="text-muted">
                                Quy mô: <strong>${res.so_mat_hang || items.length}</strong> mặt hàng &middot; Tổng SL: <strong class="text-primary fs-6">${formatNumber(res.tong_so_luong)}</strong>
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
                            <th class="text-end text-nowrap" style="width: 140px; background-color: #1e293b !important; color: #ffffff !important; white-space: nowrap;">Đơn giá nhập</th>
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
                                <td class="text-center fw-bold fs-6 text-primary">${formatNumber(it.so_luong)}</td>
                                <td class="text-end text-nowrap" style="white-space: nowrap;">${formatVND(it.gia_nhap)}</td>
                                <td class="text-end fw-bold text-dark font-monospace text-nowrap" style="white-space: nowrap; min-width: 165px;">${formatVND(it.thanh_tien)}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                    <tfoot class="table-light fw-bold border-top border-2">
                        <tr>
                            <td colspan="4" class="text-end text-uppercase small text-secondary">Tổng cộng:</td>
                            <td class="text-center text-primary fs-6">${formatNumber(res.tong_so_luong)}</td>
                            <td></td>
                            <td class="text-end text-primary fs-5 font-monospace text-nowrap" style="white-space: nowrap !important; min-width: 165px;">${formatVND(res.total)}</td>
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
    loadImportData();
}

function clearSearch() {
    const input = document.getElementById('search-input');
    if (input) input.value = '';
    loadImportData();
}

function printImportReport() {
    printReceiptModal('printable-import-area', 'Sổ Báo Cáo Nhập Kho');
}

function exportImportToExcel() {
    if (!importRecords || !importRecords.length) {
        showToast('Không có dữ liệu nhập kho để xuất Excel!', 'info');
        return;
    }

    let totalQty = 0;
    let totalThanhTien = 0;

    const rows = importRecords.map((r, idx) => {
        const sl = parseInt(r.so_luong) || 0;
        const giaNhap = parseFloat(r.gia_nhap) || 0;
        const thanhTien = parseFloat(r.thanh_tien) || 0;

        totalQty += sl;
        totalThanhTien += thanhTien;

        return [
            idx + 1,
            formatDate(r.ngay_nhap),
            r.so_phieu,
            r.ten_hang,
            r.don_vi_tinh || 'Cái',
            sl,
            giaNhap,
            thanhTien,
            r.ncc_ten || 'Không xác định'
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
        title: 'BẢNG KÊ CHI TIẾT NHẬP KHO HÀNG HÓA',
        monthText: monthLabel,
        accountText: 'Tài khoản: 156 (Hàng hoá)',
        unitText: 'Đơn vị tính : Đồng',
        columns: [
            { header: 'STT', code: 'A', width: 8, align: 'center' },
            { header: 'Ngày nhập', code: 'B', width: 14, align: 'center' },
            { header: 'Số phiếu', code: 'C', width: 16, align: 'center' },
            { header: 'Tên vật tư, hàng hóa', code: 'D', width: 45, align: 'left', wrapText: true },
            { header: 'ĐVT', code: 'E', width: 10, align: 'center' },
            { header: 'Số lượng', code: '1', width: 12, align: 'right', isNumber: true },
            { header: 'Đơn giá nhập', code: '2', width: 16, align: 'right', isNumber: true },
            { header: 'Thành tiền', code: '3', width: 20, align: 'right', isNumber: true },
            { header: 'Nhà cung cấp', code: '4', width: 25, align: 'left', wrapText: true }
        ],
        rows,
        summaryRow,
        fileName: `Bang_Ke_Nhap_Kho_${fileSuffix}.xlsx`,
        sheetName: 'NhapKho'
    });
}

// ── Bind Events ───────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    // Mặc định chọn tháng hiện tại
    const monthInput = document.getElementById('filter-month');
    if (monthInput) {
        monthInput.value = getCurrentMonthStr();
    }

    loadImportData();

    monthInput?.addEventListener('change', loadImportData);

    let debounceTimer;
    document.getElementById('search-input')?.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(loadImportData, 300);
    });
});
