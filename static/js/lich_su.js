/**
 * lich_su.js - Sổ nhật ký chi tiết giao dịch kho hàng (Gom nhóm theo Phiếu Giao Dịch)
 */

let currentPage = 1;
let currentLoai = 'all';
let currentSearch = '';
let currentMonth = '';

let allHistoryRecords = []; // Dữ liệu thô từng dòng mặt hàng từ backend
let allHistoryReceipts = []; // Danh sách phiếu đã gom nhóm
let filteredHistoryReceipts = []; // Danh sách phiếu sau khi tìm kiếm/lọc
let currentRecords = []; // Danh sách phiếu trên trang hiện tại
const HISTORY_PAGE_SIZE = 50;

function getCurrentMonthStr() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
}

/**
 * Gom nhóm danh sách dòng hàng hóa thành danh sách Phiếu Giao Dịch (1 dòng = 1 phiếu)
 */
function groupHistoryRecordsByReceipt(records) {
    const map = new Map();
    records.forEach(r => {
        const sp = (r.so_phieu || '').trim();
        const loaiCode = r.loai_code || ((r.loai || '').toLowerCase().includes('nhập') || sp.startsWith('NH') ? 'nhap' : 'xuat');
        const key = sp ? `${loaiCode}_${sp}` : `raw_${r.id || Math.random()}`;

        if (!map.has(key)) {
            const isNhap = loaiCode === 'nhap';
            map.set(key, {
                id: r.id,
                so_phieu: sp || '---',
                loai: r.loai || (isNhap ? 'Nhập' : 'Xuất'),
                loai_code: loaiCode,
                ngay: r.ngay || '',
                doi_tac: r.doi_tac || (isNhap ? 'Nhà cung cấp lẻ' : 'Khách lẻ'),
                dien_thoai: (r.dien_thoai || '').replace(/^None$/i, '').trim(),
                dia_chi: (r.dia_chi || '').replace(/^None$/i, '').trim(),
                ghi_chu: r.ghi_chu || '',
                items: [],
                tong_sl: 0,
                tong_tien: 0,
                tong_tien_no: 0
            });
        }
        const rc = map.get(key);
        const sl = parseInt(r.so_luong) || 0;
        const donGia = parseFloat(r.don_gia) || 0;
        const thanhTien = parseFloat(r.thanh_tien) || (sl * donGia);
        const tienNo = parseFloat(r.tien_no !== undefined ? r.tien_no : (r.cong_no !== undefined ? r.cong_no : 0)) || 0;

        rc.items.push({
            ma_hang: r.ma_hang || '',
            ten_hang: r.ten_hang || '',
            don_vi_tinh: r.don_vi_tinh || 'Cái',
            so_luong: sl,
            don_gia: donGia,
            thanh_tien: thanhTien,
            tien_no: tienNo
        });

        rc.tong_sl += sl;
        rc.tong_tien += thanhTien;
        rc.tong_tien_no += tienNo;
    });

    const list = Array.from(map.values());
    list.sort((a, b) => (b.ngay || '').localeCompare(a.ngay || ''));
    return list;
}

let currentFromDate = '';
let currentToDate = '';

function setQuickPeriod(type) {
    const range = (typeof getPresetDateRange === 'function') ? getPresetDateRange(type) : { from: '', to: '' };
    currentFromDate = range.from;
    currentToDate = range.to;

    const fromEl = document.getElementById('filter-from-date');
    const toEl = document.getElementById('filter-to-date');
    if (fromEl) fromEl.value = currentFromDate;
    if (toEl) toEl.value = currentToDate;

    // Cập nhật trạng thái active của nút
    document.querySelectorAll('.date-range-presets .btn').forEach(b => b.classList.remove('active'));
    if (window.event && window.event.target && window.event.target.classList.contains('btn')) {
        window.event.target.classList.add('active');
    }

    currentPage = 1;
    loadHistory();
}

function onDateRangeChanged() {
    document.querySelectorAll('.date-range-presets .btn').forEach(b => b.classList.remove('active'));
    currentFromDate = document.getElementById('filter-from-date')?.value || '';
    currentToDate = document.getElementById('filter-to-date')?.value || '';
    if (currentFromDate && currentToDate && currentFromDate <= currentToDate) {
        currentPage = 1;
        loadHistory();
    }
}

function applyDateFilter() {
    currentFromDate = document.getElementById('filter-from-date')?.value || '';
    currentToDate = document.getElementById('filter-to-date')?.value || '';
    currentPage = 1;
    loadHistory();
}

async function loadHistory(silent = false) {
    try {
        if (!silent) showLoading();

        const params = new URLSearchParams({
            loai: currentLoai,
            from_date: currentFromDate,
            to_date: currentToDate,
            page: 1,
            page_size: 10000
        });

        const res = await apiRequest(`/api/lich-su?${params}`);
        allHistoryRecords = res.all_data || res.data || [];
        allHistoryReceipts = groupHistoryRecordsByReceipt(allHistoryRecords);

        filterAndRenderHistory(1);
    } catch (e) {
        if (!silent) showToast(e.message, 'error');
    } finally {
        if (!silent) hideLoading();
    }
}

function filterAndRenderHistory(page = 1) {
    currentPage = page;
    const searchInput = document.getElementById('search-input');
    const q = (searchInput ? searchInput.value : '').toLowerCase().trim();

    if (!q) {
        filteredHistoryReceipts = allHistoryReceipts;
    } else {
        filteredHistoryReceipts = allHistoryReceipts.filter(rc => {
            const fullText = `${rc.so_phieu || ''} ${rc.doi_tac || ''} ${rc.dien_thoai || ''} ${rc.dia_chi || ''} ${rc.ghi_chu || ''}`.toLowerCase();
            if (fullText.includes(q)) return true;
            return rc.items.some(it => {
                const itemText = `${it.ma_hang || ''} ${it.ten_hang || ''}`.toLowerCase();
                return itemText.includes(q);
            });
        });
    }

    // Cập nhật Thống kê
    const totalCount = filteredHistoryReceipts.length;
    const totalQty = filteredHistoryReceipts.reduce((s, r) => s + r.tong_sl, 0);
    const totalCost = filteredHistoryReceipts.reduce((s, r) => s + r.tong_tien, 0);
    const totalDebt = filteredHistoryReceipts.reduce((s, r) => s + r.tong_tien_no, 0);

    const totalCountBadge = document.getElementById('total-count');
    if (totalCountBadge) totalCountBadge.textContent = formatNumber(totalCount);
    if (document.getElementById('stat-count')) document.getElementById('stat-count').textContent = formatNumber(totalCount);
    if (document.getElementById('stat-qty')) document.getElementById('stat-qty').textContent = formatNumber(totalQty);
    if (document.getElementById('stat-cost')) document.getElementById('stat-cost').textContent = formatVND(totalCost);
    if (document.getElementById('stat-debt')) document.getElementById('stat-debt').textContent = formatVND(totalDebt);

    const totalPages = Math.ceil(totalCount / HISTORY_PAGE_SIZE) || 1;
    if (currentPage > totalPages) currentPage = totalPages;
    if (currentPage < 1) currentPage = 1;

    const pageInfoEl = document.getElementById('page-info');
    if (pageInfoEl) {
        pageInfoEl.textContent = totalCount > 0 ? `Trang ${currentPage}/${totalPages} (${totalCount} phiếu giao dịch)` : '';
    }

    // Cập nhật tfoot
    const tfoot = document.getElementById('history-tfoot');
    if (tfoot) {
        if (totalCount > 0) {
            tfoot.style.display = '';
            const tfQty = document.getElementById('tf-qty');
            if (tfQty) tfQty.textContent = formatNumber(totalQty);
            const tfVal = document.getElementById('tf-val');
            if (tfVal) tfVal.textContent = formatVND(totalCost);
            const tfDebt = document.getElementById('tf-debt');
            if (tfDebt) tfDebt.textContent = formatVND(totalDebt);
        } else {
            tfoot.style.display = 'none';
        }
    }

    // Slicing for page
    const startIdx = (currentPage - 1) * HISTORY_PAGE_SIZE;
    const records = filteredHistoryReceipts.slice(startIdx, startIdx + HISTORY_PAGE_SIZE);
    currentRecords = records;

    // Render tbody
    const tbody = document.getElementById('history-tbody');
    if (!tbody) return;

    if (!records.length) {
        tbody.innerHTML = `<tr><td colspan="13" class="text-center text-muted py-5">
            <i class="bi bi-inbox fs-2 d-block text-secondary mb-2"></i>
            Không tìm thấy dữ liệu giao dịch phù hợp
        </td></tr>`;
    } else {
        tbody.innerHTML = records.map((r, i) => {
            const idx = startIdx + i + 1;
            const isNhap = (r.loai || '').toLowerCase().includes('nhập') || r.loai_code === 'nhap' || (r.so_phieu && r.so_phieu.startsWith('NH'));

            const debtHtml = r.tong_tien_no > 0
                ? `<span class="fw-bold text-danger font-monospace text-nowrap">${formatVND(r.tong_tien_no)}</span>`
                : `<span class="text-muted font-monospace text-nowrap">0 đ</span>`;

            const typeBadge = isNhap
                ? `<span class="badge bg-primary-subtle text-primary border border-primary-subtle rounded-pill"><i class="bi bi-arrow-down-left me-1"></i>Nhập</span>`
                : `<span class="badge bg-danger-subtle text-danger border border-danger-subtle rounded-pill"><i class="bi bi-arrow-up-right me-1"></i>Xuất</span>`;

            const doiTacInfo = r.doi_tac || (isNhap ? 'Nhà cung cấp lẻ' : 'Khách lẻ');
            const cleanPhone = (r.dien_thoai || '').replace(/^None$/i, '').trim();

            const previewItems = r.items.slice(0, 3);
            const hasMore = r.items.length > 3;

            // 1. Mã hàng: Mỗi hàng 1 dòng tương ứng
            const maHangHtml = previewItems.map(it => `
                <div class="py-0 my-0 text-truncate" style="min-height: 22px; line-height: 1.5;">
                    <span class="badge bg-secondary font-monospace">${escapeHtml(it.ma_hang || '-')}</span>
                </div>
            `).join('') + (hasMore ? `<div class="text-muted small fw-bold ps-1" style="min-height: 18px; line-height: 1.5;">...</div>` : '');

            // 2. Tên hàng hóa: Mỗi hàng 1 dòng có bullet • như ảnh 1
            const tenHangHtml = previewItems.map(it => `
                <div class="text-truncate py-0 my-0" style="min-height: 22px; line-height: 1.5;" title="${escapeHtml(it.ten_hang)}">
                    <span class="text-secondary me-1">•</span><span class="fw-semibold text-dark">${escapeHtml(it.ten_hang)}</span>
                </div>
            `).join('') + (hasMore ? `<div class="text-muted small fw-bold ps-2 pt-0" style="min-height: 18px; line-height: 1.5;">...</div>` : '');

            // 3. ĐVT: Mỗi hàng 1 dòng tương ứng
            const dvtHtml = previewItems.map(it => `
                <div class="text-muted small py-0 my-0" style="min-height: 22px; line-height: 1.5;">${escapeHtml(it.don_vi_tinh || 'Cái')}</div>
            `).join('') + (hasMore ? `<div class="text-muted small" style="min-height: 18px; line-height: 1.5;">&nbsp;</div>` : '');

            // 4. Đơn giá: Mỗi hàng 1 dòng tương ứng
            const donGiaHtml = previewItems.map(it => `
                <div class="text-muted font-monospace small py-0 my-0 text-nowrap" style="min-height: 22px; line-height: 1.5;">${formatVND(it.don_gia || 0)}</div>
            `).join('') + (hasMore ? `<div class="text-muted small" style="min-height: 18px; line-height: 1.5;">&nbsp;</div>` : '');

            return `
                <tr>
                    <td class="text-center text-muted small">${idx}</td>
                    <td class="text-center">${typeBadge}</td>
                    <td><span class="badge bg-light text-secondary border font-monospace">${formatDate(r.ngay)}</span></td>
                    <td>
                        <button class="btn btn-sm btn-link p-0 ${isNhap ? 'text-primary' : 'text-danger'} fw-bold font-monospace text-decoration-none" onclick="viewHistoryReceipt('${escapeHtml(r.loai)}', '${escapeHtml(r.so_phieu)}')">
                            <i class="bi bi-file-earmark-text me-1"></i>${escapeHtml(r.so_phieu)}
                        </button>
                    </td>
                    <td>
                        <div class="d-flex flex-column gap-1">
                            ${maHangHtml}
                        </div>
                    </td>
                    <td>
                        <div class="d-flex flex-column gap-1" style="max-width: 380px;">
                            ${tenHangHtml}
                        </div>
                    </td>
                    <td class="text-center">
                        <div class="d-flex flex-column gap-1">
                            ${dvtHtml}
                        </div>
                    </td>
                    <td class="text-center fw-bold fs-6 ${isNhap ? 'text-primary' : 'text-danger'} font-monospace" title="Tổng: ${formatNumber(r.tong_sl)} (${r.items.length} mặt hàng)">
                        ${formatNumber(r.tong_sl)}
                    </td>
                    <td class="text-end text-nowrap" style="white-space: nowrap;">
                        <div class="d-flex flex-column gap-1">
                            ${donGiaHtml}
                        </div>
                    </td>
                    <td class="text-end fw-bold text-dark font-monospace text-nowrap" style="white-space: nowrap; min-width: 160px;">
                        ${formatVND(r.tong_tien)}
                    </td>
                    <td class="text-end font-monospace text-nowrap" style="white-space: nowrap; min-width: 145px;">
                        ${debtHtml}
                    </td>
                    <td>
                        <div class="fw-medium text-dark text-truncate" style="max-width: 220px;" title="${escapeHtml(doiTacInfo)}">${escapeHtml(doiTacInfo)}</div>
                        ${cleanPhone ? `<div class="small text-muted font-monospace"><i class="bi bi-telephone me-1 text-primary"></i>${escapeHtml(cleanPhone)}</div>` : ''}
                    </td>
                    <td class="text-center no-print">
                        <div class="d-flex justify-content-center gap-1">
                            <button class="btn btn-xs btn-outline-primary btn-sm" onclick="viewHistoryReceipt('${escapeHtml(r.loai)}', '${escapeHtml(r.so_phieu)}')" title="Xem chi tiết & in phiếu">
                                <i class="bi bi-eye"></i>
                            </button>
                            <button class="btn btn-xs btn-outline-danger btn-sm" onclick="confirmDeleteReceipt('${escapeHtml(r.so_phieu)}', '${isNhap ? 'nhap' : 'xuat'}', () => loadHistory())" title="Xóa phiếu">
                                <i class="bi bi-trash"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    }

    renderPagination('pagination-container', currentPage, totalPages, (p) => {
        filterAndRenderHistory(p);
    });
}

function setTab(loai) {
    currentLoai = loai;
    currentPage = 1;
    document.querySelectorAll('.tab-btn').forEach(btn => {
        const btnLoai = btn.dataset.loai;
        btn.classList.remove('active', 'btn-secondary', 'btn-primary', 'btn-danger');
        if (btnLoai === loai) {
            btn.classList.add('active');
            if (btnLoai === 'nhap') btn.classList.add('btn-primary');
            else if (btnLoai === 'xuat') btn.classList.add('btn-danger');
            else btn.classList.add('btn-secondary');
        } else {
            if (btnLoai === 'nhap') btn.classList.add('btn-outline-primary');
            else if (btnLoai === 'xuat') btn.classList.add('btn-outline-danger');
            else btn.classList.add('btn-outline-secondary');
        }
    });
    loadHistory();
}

function clearMonthFilter() {
    const input = document.getElementById('filter-month');
    if (input) input.value = '';
    currentMonth = '';
    currentPage = 1;
    loadHistory();
}

function clearSearch() {
    const input = document.getElementById('search-input');
    if (input) input.value = '';
    currentSearch = '';
    filterAndRenderHistory(1);
}

function printHistoryReport() {
    printReceiptModal('printable-history-area', 'Sổ Báo Cáo Lịch Sử Giao Dịch Kho');
}

function exportHistoryExcel() {
    if (!filteredHistoryReceipts || !filteredHistoryReceipts.length) {
        showToast('Không có dữ liệu giao dịch để xuất Excel!', 'info');
        return;
    }

    // Lấy các mặt hàng thuộc các phiếu đang được hiển thị
    const validSoPhieuSet = new Set(filteredHistoryReceipts.map(r => r.so_phieu));
    const itemsToExport = allHistoryRecords.filter(r => validSoPhieuSet.has(r.so_phieu));
    if (!itemsToExport.length) {
        showToast('Không có dữ liệu chi tiết để xuất Excel!', 'info');
        return;
    }

    let totalQty = 0;
    let totalThanhTien = 0;
    let totalDebt = 0;

    const rows = itemsToExport.map((r, idx) => {
        const sl = parseInt(r.so_luong) || 0;
        const donGia = parseFloat(r.don_gia) || 0;
        const thanhTien = parseFloat(r.thanh_tien) || 0;
        const tienNo = parseFloat(r.tien_no !== undefined ? r.tien_no : (r.cong_no !== undefined ? r.cong_no : 0)) || 0;
        const isNhap = (r.loai || '').toLowerCase().includes('nhập') || r.loai_code === 'nhap' || (r.so_phieu && r.so_phieu.startsWith('NH'));

        totalQty += sl;
        totalThanhTien += thanhTien;
        totalDebt += tienNo;

        return [
            idx + 1,
            isNhap ? 'Nhập kho' : 'Xuất kho',
            formatDate(r.ngay),
            r.so_phieu,
            r.ma_hang,
            r.ten_hang,
            r.don_vi_tinh || 'Cái',
            sl,
            donGia,
            thanhTien,
            tienNo,
            r.doi_tac || ''
        ];
    });

    const summaryRow = ['Tổng cộng', '', '', '', '', '', '-', totalQty, '-', totalThanhTien, totalDebt, '-'];

    const monthInput = document.getElementById('filter-month');
    const selectedMonth = monthInput ? monthInput.value : '';
    let monthText = 'Tất cả các kỳ';
    let fileSuffix = 'all';
    if (currentFromDate && currentToDate) {
        monthText = `Từ ${formatDate(currentFromDate)} đến ${formatDate(currentToDate)}`;
        fileSuffix = `${currentFromDate}_${currentToDate}`;
    } else if (currentFromDate) {
        monthText = `Từ ngày ${formatDate(currentFromDate)}`;
        fileSuffix = `from_${currentFromDate}`;
    } else if (currentToDate) {
        monthText = `Đến ngày ${formatDate(currentToDate)}`;
        fileSuffix = `to_${currentToDate}`;
    }

    exportAccountingReportToExcel({
        title: 'SỔ NHẬT KÝ CHI TIẾT GIAO DỊCH KHO HÀNG',
        monthText,
        accountText: 'Tài khoản: 156 (Hàng hoá)',
        unitText: 'Đơn vị tính : Đồng',
        columns: [
            { header: 'STT', code: 'A', width: 8, align: 'center' },
            { header: 'Loại GD', code: 'B', width: 14, align: 'center' },
            { header: 'Ngày GD', code: 'C', width: 14, align: 'center' },
            { header: 'Số phiếu', code: 'D', width: 18, align: 'center' },
            { header: 'Mã hàng', code: 'E', width: 14, align: 'center' },
            { header: 'Tên vật tư, hàng hóa', code: 'F', width: 40, align: 'left', wrapText: true },
            { header: 'ĐVT', code: 'G', width: 10, align: 'center' },
            { header: 'Số lượng', code: '1', width: 12, align: 'right', isNumber: true },
            { header: 'Đơn giá', code: '2', width: 16, align: 'right', isNumber: true },
            { header: 'Thành tiền', code: '3', width: 20, align: 'right', isNumber: true },
            { header: 'Tiền nợ', code: '4', width: 20, align: 'right', isNumber: true },
            { header: 'Đối tác', code: '5', width: 28, align: 'left', wrapText: true }
        ],
        rows,
        summaryRow,
        fileName: `Nhat_Ky_Giao_Dich_${fileSuffix}.xlsx`,
        sheetName: 'LichSu'
    });
}

async function viewHistoryReceipt(loai, so_phieu) {
    try {
        showLoading();
        const isNhap = (loai || '').toLowerCase().includes('nhập') || loai === 'nhap' || (so_phieu && so_phieu.startsWith('NH'));
        const apiUrl = isNhap ? `/api/nhap-hang/${encodeURIComponent(so_phieu)}` : `/api/xuat-hang/${encodeURIComponent(so_phieu)}`;
        
        const res = await apiRequest(apiUrl);
        const type = isNhap ? 'nhap' : 'xuat';
        const titleEl = document.getElementById('history-modal-title');
        if (titleEl) titleEl.textContent = `Chi Tiết ${isNhap ? 'Phiếu Nhập Kho' : 'Phiếu Xuất Kho'}: ${so_phieu}`;

        await renderEditableReceiptDetail(res, type, 'history-modal-body', () => {
            loadHistory();
        });
    } catch (e) {
        showToast(e.message, 'error');
    } finally {
        hideLoading();
    }
}

function initLichSu() {
    // Mặc định chọn Tháng này
    const range = (typeof getPresetDateRange === 'function') ? getPresetDateRange('month') : { from: '', to: '' };
    currentFromDate = range.from;
    currentToDate = range.to;

    const fromEl = document.getElementById('filter-from-date');
    const toEl = document.getElementById('filter-to-date');
    if (fromEl) fromEl.value = currentFromDate;
    if (toEl) toEl.value = currentToDate;

    loadHistory();

    const searchInput = document.getElementById('search-input');
    if (searchInput) {
        const searchHandler = typeof debounce === 'function' ? debounce(() => filterAndRenderHistory(1), 200) : () => filterAndRenderHistory(1);
        searchInput.addEventListener('input', searchHandler);
    }

    // Tự động làm mới dữ liệu khi người dùng chuyển tab quay lại hoặc có nhập/xuất kho / thu chi / công nợ
    window.addEventListener('message', (e) => {
        if (e.data && (e.data.type === 'TAB_ACTIVATED' || e.data.type === 'PRODUCTS_UPDATED' || e.data.type === 'DATA_CHANGED' || e.data.type === 'DATA_UPDATED' || e.data.type === 'DEBT_UPDATED' || e.data.type === 'SO_QUY_UPDATED' || e.data.type === 'BALANCE_UPDATED')) {
            loadHistory(true);
        }
    });

    try {
        if (typeof BroadcastChannel !== 'undefined') {
            const bc = new BroadcastChannel('inventory_sync');
            bc.onmessage = (e) => {
                if (e.data && (e.data.type === 'PRODUCTS_UPDATED' || e.data.type === 'DATA_CHANGED' || e.data.type === 'DATA_UPDATED' || e.data.type === 'DEBT_UPDATED' || e.data.type === 'SO_QUY_UPDATED' || e.data.type === 'BALANCE_UPDATED')) {
                    loadHistory(true);
                }
            };
        }
    } catch (err) {}
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initLichSu);
} else {
    initLichSu();
}
