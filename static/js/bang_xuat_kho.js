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

async function loadExportData(silent = false) {
    try {
        const monthInput = document.getElementById('filter-month');
        const month = monthInput ? monthInput.value : '';
        const searchInput = document.getElementById('search-input');
        const search = searchInput ? searchInput.value.trim() : '';

        const tbody = document.getElementById('export-tbody');
        if (!silent && tbody) {
            tbody.innerHTML = '<tr><td colspan="12" class="text-center text-muted py-4"><div class="spinner-border spinner-border-sm text-danger me-2"></div>Đang tải dữ liệu xuất kho...</td></tr>';
        }

        let url = '/api/xuat-hang?';
        if (month) url += `month=${encodeURIComponent(month)}&`;
        if (search) url += `search=${encodeURIComponent(search)}&`;

        const res = await apiRequest(url);
        exportRecords = res.data || [];

        renderExportTable(res);
    } catch (e) {
        if (!silent) {
            showToast('Lỗi khi tải dữ liệu xuất kho: ' + e.message, 'error');
        }
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
    const totalDebt = apiRes.tong_khach_no !== undefined ? apiRes.tong_khach_no : exportRecords.reduce((sum, r) => sum + (parseFloat(r.tien_khach_no !== undefined ? r.tien_khach_no : (r.cong_no !== undefined ? r.cong_no : r.thanh_tien)) || 0), 0);

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
        const tfDebt = document.getElementById('tf-debt');
        if (tfDebt) tfDebt.textContent = formatVND(totalDebt);
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
        const khachNo = parseFloat(r.tien_khach_no !== undefined ? r.tien_khach_no : (r.cong_no !== undefined ? r.cong_no : r.thanh_tien)) || 0;
        const debtHtml = khachNo > 0
            ? `<span class="fw-bold text-danger font-monospace text-nowrap">${formatVND(khachNo)}</span>`
            : `<span class="text-muted font-monospace text-nowrap">0 đ</span>`;

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
                <td class="text-end font-monospace text-nowrap" style="white-space: nowrap; min-width: 145px;">${debtHtml}</td>
                <td class="text-center no-print">
                    <div class="d-flex justify-content-center gap-1">
                        <button class="btn btn-xs btn-outline-danger btn-sm" onclick="viewReceipt('${escapeHtml(r.so_phieu)}')" title="Xem chi tiết phiếu xuất">
                            <i class="bi bi-eye"></i>
                        </button>
                        <button class="btn btn-xs btn-outline-danger btn-sm" onclick="confirmDeleteReceipt('${escapeHtml(r.so_phieu)}', 'xuat', () => loadExportData())" title="Xóa phiếu xuất">
                            <i class="bi bi-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

async function viewReceipt(so_phieu) {
    try {
        const res = await apiRequest(`/api/xuat-hang/${so_phieu}`);
        await renderEditableReceiptDetail(res, 'xuat', 'detail-modal-body', () => {
            loadExportData();
        });
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
    let totalDebt = 0;

    const rows = exportRecords.map((r, idx) => {
        const sl = parseInt(r.so_luong) || 0;
        const giaBan = parseFloat(r.gia_ban) || 0;
        const thanhTien = parseFloat(r.thanh_tien) || 0;
        const khachNo = parseFloat(r.tien_khach_no !== undefined ? r.tien_khach_no : (r.cong_no !== undefined ? r.cong_no : r.thanh_tien)) || 0;

        totalQty += sl;
        totalThanhTien += thanhTien;
        totalDebt += khachNo;

        return [
            idx + 1,
            formatDate(r.ngay_xuat),
            r.so_phieu,
            r.ten_hang,
            r.don_vi_tinh || 'Cái',
            sl,
            giaBan,
            thanhTien,
            khachNo,
            r.kh_ten || 'Khách lẻ'
        ];
    });

    const summaryRow = ['Tổng cộng', '', '', '', '-', totalQty, '-', totalThanhTien, totalDebt, '-'];

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
            { header: 'Khách nợ', code: '4', width: 18, align: 'right', isNumber: true },
            { header: 'Khách hàng', code: '5', width: 25, align: 'left', wrapText: true }
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

    // Tự động làm mới dữ liệu khi người dùng chuyển tab quay lại hoặc có nhập/xuất kho
    window.addEventListener('message', (e) => {
        if (e.data && (e.data.type === 'TAB_ACTIVATED' || e.data.type === 'PRODUCTS_UPDATED')) {
            loadExportData(true);
        }
    });

    try {
        if (typeof BroadcastChannel !== 'undefined') {
            const bc = new BroadcastChannel('inventory_sync');
            bc.onmessage = (e) => {
                if (e.data && e.data.type === 'PRODUCTS_UPDATED') {
                    loadExportData(true);
                }
            };
        }
    } catch (err) {}
});
