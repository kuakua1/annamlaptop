/**
 * bang_xuat_kho.js - Logic cho Bảng Xuất Kho (hiển thị theo Phiếu Xuất, preview tối đa 3 mặt hàng)
 */

let allMonthExportRecords = []; // Dữ liệu chi tiết từng dòng mặt hàng
let filteredExportReceipts = []; // Danh sách phiếu xuất đã gom nhóm sau khi lọc

function getCurrentMonthStr() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
}

/**
 * Gom nhóm danh sách dòng hàng hóa thành danh sách Phiếu Xuất
 */
function groupExportRecordsByReceipt(records) {
    const map = new Map();
    records.forEach(r => {
        const sp = (r.so_phieu || '').trim();
        if (!sp) return;

        if (!map.has(sp)) {
            map.set(sp, {
                so_phieu: sp,
                ngay_xuat: r.ngay_xuat || '',
                kh_ten: r.kh_ten || r.khach_hang_id || 'Khách lẻ',
                kh_sdt: r.kh_sdt || '',
                kh_dia_chi: r.kh_dia_chi || '',
                ghi_chu: r.ghi_chu || '',
                items: [],
                tong_so_luong: 0,
                tong_thanh_tien: 0,
                tong_loi_nhuan: 0,
                tong_khach_no: 0
            });
        }
        const rc = map.get(sp);
        const sl = parseInt(r.so_luong) || 0;
        const giaBan = parseFloat(r.gia_ban) || 0;
        const thanhTien = parseFloat(r.thanh_tien) || (sl * giaBan);
        const loiNhuan = parseFloat(r.loi_nhuan) || 0;
        const khachNo = parseFloat(r.tien_khach_no !== undefined ? r.tien_khach_no : (r.cong_no !== undefined ? r.cong_no : r.thanh_tien)) || 0;

        rc.items.push({
            ma_hang: r.ma_hang || '',
            ten_hang: r.ten_hang || '',
            don_vi_tinh: r.don_vi_tinh || 'Cái',
            so_luong: sl,
            gia_ban: giaBan,
            thanh_tien: thanhTien,
            loi_nhuan: loiNhuan,
            khach_no: khachNo
        });
        rc.tong_so_luong += sl;
        rc.tong_thanh_tien += thanhTien;
        rc.tong_loi_nhuan += loiNhuan;
        rc.tong_khach_no += khachNo;
    });
    return Array.from(map.values());
}

async function loadExportData(silent = false) {
    try {
        const monthInput = document.getElementById('filter-month');
        const month = monthInput ? monthInput.value : '';

        const tbody = document.getElementById('export-tbody');
        if (!silent && tbody) {
            tbody.innerHTML = '<tr><td colspan="9" class="text-center text-muted py-4"><div class="spinner-border spinner-border-sm text-danger me-2"></div>Đang tải dữ liệu phiếu xuất kho...</td></tr>';
        }

        let url = '/api/xuat-hang?';
        if (month) url += `month=${encodeURIComponent(month)}&`;

        const res = await apiRequest(url);
        allMonthExportRecords = res.data || [];

        filterAndRenderExportTable();
    } catch (e) {
        if (!silent) {
            showToast('Lỗi khi tải dữ liệu xuất kho: ' + e.message, 'error');
        }
    }
}

function filterAndRenderExportTable() {
    const searchInput = document.getElementById('search-input');
    const search = (searchInput ? searchInput.value : '').toLowerCase().trim();

    const allReceipts = groupExportRecordsByReceipt(allMonthExportRecords);

    if (!search) {
        filteredExportReceipts = allReceipts;
    } else {
        filteredExportReceipts = allReceipts.filter(rc => {
            const sp = (rc.so_phieu || '').toLowerCase();
            const kh = (rc.kh_ten || '').toLowerCase();
            const sdt = (rc.kh_sdt || '').toLowerCase();
            const addr = (rc.kh_dia_chi || '').toLowerCase();
            const note = (rc.ghi_chu || '').toLowerCase();
            if (sp.includes(search) || kh.includes(search) || sdt.includes(search) || addr.includes(search) || note.includes(search)) {
                return true;
            }
            return rc.items.some(it => {
                const ma = (it.ma_hang || '').toLowerCase();
                const ten = (it.ten_hang || '').toLowerCase();
                return ma.includes(search) || ten.includes(search);
            });
        });
    }

    renderExportTable();
}

function renderExportTable() {
    const month = document.getElementById('filter-month')?.value || '';
    const monthLabel = month ? `tháng ${month.split('-')[1]}/${month.split('-')[0]}` : 'tất cả các tháng';
    const monthLabelEl = document.getElementById('stat-month-label');
    if (monthLabelEl) monthLabelEl.textContent = monthLabel;

    const receiptCount = filteredExportReceipts.length;
    const totalQty = filteredExportReceipts.reduce((sum, r) => sum + r.tong_so_luong, 0);
    const totalRevenue = filteredExportReceipts.reduce((sum, r) => sum + r.tong_thanh_tien, 0);
    const totalProfit = filteredExportReceipts.reduce((sum, r) => sum + r.tong_loi_nhuan, 0);
    const totalDebt = filteredExportReceipts.reduce((sum, r) => sum + r.tong_khach_no, 0);

    // Cập nhật card trên đầu (Số Phiếu Xuất, Tổng SL, Doanh Thu, Lợi Nhuận)
    const statCountEl = document.getElementById('stat-count');
    if (statCountEl) statCountEl.textContent = formatNumber(receiptCount);

    const statQtyEl = document.getElementById('stat-qty');
    if (statQtyEl) statQtyEl.textContent = formatNumber(totalQty);

    const statRevenueEl = document.getElementById('stat-revenue');
    if (statRevenueEl) statRevenueEl.textContent = formatVND(totalRevenue);

    const statProfitEl = document.getElementById('stat-profit');
    if (statProfitEl) statProfitEl.textContent = formatVND(totalProfit);

    const totalCountBadge = document.getElementById('total-count');
    if (totalCountBadge) totalCountBadge.textContent = receiptCount;

    // Cập nhật footer
    const tfoot = document.getElementById('export-tfoot');
    if (receiptCount > 0) {
        if (tfoot) tfoot.style.display = '';
        const tfQty = document.getElementById('tf-qty');
        if (tfQty) tfQty.textContent = formatNumber(totalQty);

        const tfVal = document.getElementById('tf-val');
        if (tfVal) tfVal.textContent = formatVND(totalRevenue);

        const tfDebt = document.getElementById('tf-debt');
        if (tfDebt) tfDebt.textContent = formatVND(totalDebt);
    } else {
        if (tfoot) tfoot.style.display = 'none';
    }

    const tbody = document.getElementById('export-tbody');
    if (!tbody) return;

    if (receiptCount === 0) {
        tbody.innerHTML = `<tr><td colspan="9" class="text-center text-muted py-5">
            <i class="bi bi-inbox fs-2 d-block text-secondary mb-2"></i>
            Không tìm thấy phiếu xuất kho phù hợp
        </td></tr>`;
        return;
    }

    tbody.innerHTML = filteredExportReceipts.map((r, idx) => {
        const debtHtml = r.tong_khach_no > 0
            ? `<span class="fw-bold text-danger font-monospace text-nowrap">${formatVND(r.tong_khach_no)}</span>`
            : `<span class="text-muted font-monospace text-nowrap">0 đ</span>`;

        // Preview tối đa 3 tên đầu tiên trong danh sách, mỗi tên 1 dòng, nếu có nhiều hơn 3 thì thêm dấu 3 chấm
        const previewItems = r.items.slice(0, 3);
        const hasMore = r.items.length > 3;
        const itemsHtml = previewItems.map(it => `
            <div class="text-truncate py-0 my-0" title="${escapeHtml(it.ten_hang)}">
                <span class="text-secondary me-1">•</span><span class="fw-semibold text-dark">${escapeHtml(it.ten_hang)}</span>
            </div>
        `).join('') + (hasMore ? `<div class="text-muted small fw-bold ps-2 pt-0">...</div>` : '');

        const khPhoneHtml = r.kh_sdt ? `<div class="text-muted small font-monospace"><i class="bi bi-telephone me-1 text-primary"></i>${escapeHtml(r.kh_sdt)}</div>` : '';

        return `
            <tr>
                <td class="text-center text-muted small">${idx + 1}</td>
                <td><span class="badge bg-light text-secondary border font-monospace">${formatDate(r.ngay_xuat)}</span></td>
                <td>
                    <button class="btn btn-sm btn-link p-0 text-danger fw-bold font-monospace text-decoration-none" onclick="viewReceipt('${escapeHtml(r.so_phieu)}')">
                        <i class="bi bi-file-earmark-text me-1"></i>${escapeHtml(r.so_phieu)}
                    </button>
                </td>
                <td>
                    <div class="fw-bold text-dark text-truncate" style="max-width: 210px;" title="${escapeHtml(r.kh_ten)}">${escapeHtml(r.kh_ten)}</div>
                    ${khPhoneHtml}
                </td>
                <td>
                    <div class="d-flex flex-column gap-1" style="max-width: 380px;">
                        ${itemsHtml}
                    </div>
                </td>
                <td class="text-center fw-bold fs-6 text-danger font-monospace">${formatNumber(r.tong_so_luong)}</td>
                <td class="text-end fw-bold text-dark font-monospace text-nowrap" style="white-space: nowrap;">${formatVND(r.tong_thanh_tien)}</td>
                <td class="text-end font-monospace text-nowrap" style="white-space: nowrap;">${debtHtml}</td>
                <td class="text-center no-print">
                    <div class="d-flex justify-content-center gap-1">
                        <button class="btn btn-xs btn-outline-danger btn-sm" onclick="viewReceipt('${escapeHtml(r.so_phieu)}')" title="Xem chi tiết & in phiếu">
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

/**
 * Lấy các dòng dữ liệu chi tiết tương ứng với các phiếu đang hiển thị để xuất Excel & In
 */
function getReportExportData() {
    if (!filteredExportReceipts || !filteredExportReceipts.length) {
        return null;
    }

    const validSoPhieuSet = new Set(filteredExportReceipts.map(r => r.so_phieu));
    const itemsToExport = allMonthExportRecords.filter(r => validSoPhieuSet.has(r.so_phieu));

    let totalQty = 0;
    let totalThanhTien = 0;
    let totalDebt = 0;

    const rows = itemsToExport.map((r, idx) => {
        const sl = parseInt(r.so_luong) || 0;
        const giaBan = parseFloat(r.gia_ban) || 0;
        const thanhTien = parseFloat(r.thanh_tien) || (sl * giaBan);
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
            r.kh_ten || r.khach_hang_id || 'Khách lẻ'
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

    const columns = [
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
    ];

    return {
        rows,
        summaryRow,
        columns,
        monthLabel,
        fileSuffix
    };
}

/**
 * In Bảng Xuất Kho theo format xuất Excel (Chuẩn Kế Toán Việt Nam, giống Ảnh 2 & Ảnh 3)
 */
function printExportReport() {
    const data = getReportExportData();
    if (!data || !data.rows.length) {
        showToast('Không có dữ liệu xuất kho để in!', 'info');
        return;
    }

    printAccountingReport({
        title: 'BÁO CÁO TỔNG HỢP XUẤT KHO',
        monthText: data.monthLabel,
        accountText: 'Tài khoản: 632 / 511 (Giá vốn / Doanh thu)',
        unitText: 'Đơn vị tính : Đồng',
        columns: data.columns,
        rows: data.rows,
        summaryRow: data.summaryRow
    });
}

/**
 * Xuất Bảng Xuất Kho ra Excel (Chuẩn Kế Toán Việt Nam, giống Ảnh 2 & Ảnh 3)
 */
function exportExportToExcel() {
    const data = getReportExportData();
    if (!data || !data.rows.length) {
        showToast('Không có dữ liệu xuất kho để xuất Excel!', 'info');
        return;
    }

    exportAccountingReportToExcel({
        title: 'BÁO CÁO TỔNG HỢP XUẤT KHO',
        monthText: data.monthLabel,
        accountText: 'Tài khoản: 632 / 511 (Giá vốn / Doanh thu)',
        unitText: 'Đơn vị tính : Đồng',
        columns: data.columns,
        rows: data.rows,
        summaryRow: data.summaryRow,
        fileName: `Bao_Cao_Tong_Hop_Xuat_Kho_${data.fileSuffix}.xlsx`,
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

    const searchHandler = typeof debounce === 'function' ? debounce(filterAndRenderExportTable, 200) : filterAndRenderExportTable;
    document.getElementById('search-input')?.addEventListener('input', searchHandler);

    // Tự động làm mới dữ liệu khi người dùng chuyển tab quay lại hoặc có nhập/xuất kho
    window.addEventListener('message', (e) => {
        if (e.data && (e.data.type === 'TAB_ACTIVATED' || e.data.type === 'PRODUCTS_UPDATED' || e.data.type === 'DATA_CHANGED')) {
            loadExportData(true);
        }
    });

    try {
        if (typeof BroadcastChannel !== 'undefined') {
            const bc = new BroadcastChannel('inventory_sync');
            bc.onmessage = (e) => {
                if (e.data && (e.data.type === 'PRODUCTS_UPDATED' || e.data.type === 'DATA_CHANGED')) {
                    loadExportData(true);
                }
            };
        }
    } catch (err) {}
});
