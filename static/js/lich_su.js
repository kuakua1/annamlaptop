/**
 * lich_su.js - Sổ nhật ký chi tiết giao dịch kho hàng
 */

let currentPage = 1;
let currentLoai = 'all';
let currentSearch = '';
let currentMonth = '';

let currentRecords = [];
let allHistoryRecords = [];

function getCurrentMonthStr() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
}

async function loadHistory(silent = false) {
    try {
        if (!silent) showLoading();

        const monthInput = document.getElementById('filter-month');
        if (monthInput) currentMonth = monthInput.value;

        const searchInput = document.getElementById('search-input');
        if (searchInput) currentSearch = searchInput.value.trim();

        const params = new URLSearchParams({
            loai: currentLoai,
            month: currentMonth,
            search: currentSearch,
            page: currentPage,
            page_size: 50
        });

        const res = await apiRequest(`/api/lich-su?${params}`);
        const records = res.data || [];
        currentRecords = records;
        allHistoryRecords = res.all_data || records;

        // Cập nhật Thống kê
        const totalCount = res.total || 0;
        const totalQty = res.tong_so_luong || 0;
        const totalCost = res.tong_thanh_tien || 0;
        const totalDebt = res.tong_tien_no || 0;

        document.getElementById('total-count').textContent = formatNumber(totalCount);
        if (document.getElementById('stat-count')) document.getElementById('stat-count').textContent = formatNumber(totalCount);
        if (document.getElementById('stat-qty')) document.getElementById('stat-qty').textContent = formatNumber(totalQty);
        if (document.getElementById('stat-cost')) document.getElementById('stat-cost').textContent = formatVND(totalCost);
        if (document.getElementById('stat-debt')) document.getElementById('stat-debt').textContent = formatVND(totalDebt);

        const pageInfoEl = document.getElementById('page-info');
        if (pageInfoEl) {
            pageInfoEl.textContent = totalCount > 0 ? `Trang ${res.page}/${res.total_pages} (${totalCount} bản ghi)` : '';
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

        // Render tbody
        const tbody = document.getElementById('history-tbody');
        if (!records.length) {
            tbody.innerHTML = `<tr><td colspan="13" class="text-center text-muted py-5">
                <i class="bi bi-inbox fs-2 d-block text-secondary mb-2"></i>
                Không tìm thấy dữ liệu giao dịch phù hợp
            </td></tr>`;
        } else {
            const startIdx = (res.page - 1) * res.page_size;
            tbody.innerHTML = records.map((r, i) => {
                const idx = startIdx + i + 1;
                const sl = parseInt(r.so_luong) || 0;
                const donGia = parseFloat(r.don_gia) || 0;
                const thanhTien = parseFloat(r.thanh_tien) || 0;
                const tienNo = parseFloat(r.tien_no !== undefined ? r.tien_no : (r.cong_no !== undefined ? r.cong_no : 0)) || 0;
                const isNhap = (r.loai || '').toLowerCase().includes('nhập') || r.loai_code === 'nhap';

                const debtHtml = tienNo > 0
                    ? `<span class="fw-bold text-danger font-monospace">${formatVND(tienNo)}</span>`
                    : `<span class="text-muted font-monospace">0 đ</span>`;

                const typeBadge = isNhap
                    ? `<span class="badge bg-primary-subtle text-primary border border-primary-subtle rounded-pill"><i class="bi bi-arrow-down-left me-1"></i>Nhập</span>`
                    : `<span class="badge bg-danger-subtle text-danger border border-danger-subtle rounded-pill"><i class="bi bi-arrow-up-right me-1"></i>Xuất</span>`;

                const doiTacInfo = r.doi_tac || (isNhap ? 'Nhà cung cấp lẻ' : 'Khách lẻ');

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
                        <td><span class="badge bg-secondary font-monospace">${escapeHtml(r.ma_hang)}</span></td>
                        <td class="fw-semibold text-dark">${escapeHtml(r.ten_hang)}</td>
                        <td class="text-center text-muted small">${escapeHtml(r.don_vi_tinh || 'Cái')}</td>
                        <td class="text-center fw-bold fs-6 ${isNhap ? 'text-primary' : 'text-danger'} font-monospace">${formatNumber(sl)}</td>
                        <td class="text-end text-muted font-monospace text-nowrap" style="white-space: nowrap;">${formatVND(donGia)}</td>
                        <td class="text-end fw-bold text-dark font-monospace text-nowrap" style="white-space: nowrap; min-width: 160px;">${formatVND(thanhTien)}</td>
                        <td class="text-end font-monospace text-nowrap" style="white-space: nowrap; min-width: 145px;">${debtHtml}</td>
                        <td>
                            <div class="fw-medium text-dark text-truncate" style="max-width: 220px;" title="${escapeHtml(doiTacInfo)}">${escapeHtml(doiTacInfo)}</div>
                            ${r.dien_thoai ? `<div class="small text-muted font-monospace"><i class="bi bi-telephone me-1"></i>${escapeHtml(r.dien_thoai)}</div>` : ''}
                        </td>
                        <td class="text-center no-print">
                            <div class="d-flex justify-content-center gap-1">
                                <button class="btn btn-xs btn-outline-primary btn-sm" onclick="viewHistoryReceipt('${escapeHtml(r.loai)}', '${escapeHtml(r.so_phieu)}')" title="Xem chi tiết phiếu">
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

        renderPagination('pagination-container', currentPage, res.total_pages, (p) => {
            currentPage = p;
            loadHistory();
        });
    } catch (e) {
        if (!silent) showToast(e.message, 'error');
    } finally {
        if (!silent) hideLoading();
    }
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
    currentPage = 1;
    loadHistory();
}

function printHistoryReport() {
    printReceiptModal('printable-history-area', 'Sổ Báo Cáo Lịch Sử Giao Dịch Kho');
}

function exportHistoryExcel() {
    const dataToExport = allHistoryRecords && allHistoryRecords.length ? allHistoryRecords : currentRecords;
    if (!dataToExport || !dataToExport.length) {
        showToast('Không có dữ liệu giao dịch để xuất Excel!', 'info');
        return;
    }

    let totalQty = 0;
    let totalThanhTien = 0;
    let totalDebt = 0;

    const rows = dataToExport.map((r, idx) => {
        const sl = parseInt(r.so_luong) || 0;
        const donGia = parseFloat(r.don_gia) || 0;
        const thanhTien = parseFloat(r.thanh_tien) || 0;
        const tienNo = parseFloat(r.tien_no !== undefined ? r.tien_no : (r.cong_no !== undefined ? r.cong_no : 0)) || 0;
        const isNhap = (r.loai || '').toLowerCase().includes('nhập') || r.loai_code === 'nhap';

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
    if (selectedMonth) {
        const parts = selectedMonth.split('-');
        if (parts.length === 2) {
            monthText = `Tháng ${parseInt(parts[1])} năm ${parts[0]}`;
        }
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
        fileName: `Nhat_Ky_Giao_Dich_${selectedMonth || todayISO()}.xlsx`,
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

document.addEventListener('DOMContentLoaded', () => {
    initLichSu();
});

function initLichSu() {
    // Mặc định chọn tháng hiện tại
    const monthInput = document.getElementById('filter-month');
    if (monthInput) {
        monthInput.value = getCurrentMonthStr();
        currentMonth = monthInput.value;
        monthInput.addEventListener('change', () => {
            currentPage = 1;
            loadHistory();
        });
    }

    loadHistory();

    const searchInput = document.getElementById('search-input');
    if (searchInput) {
        let debounceTimer;
        searchInput.addEventListener('input', () => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                currentPage = 1;
                loadHistory();
            }, 300);
        });
        searchInput.addEventListener('keyup', (e) => {
            if (e.key === 'Enter') {
                clearTimeout(debounceTimer);
                currentPage = 1;
                loadHistory();
            }
        });
    }

    // Tự động làm mới dữ liệu khi người dùng chuyển tab quay lại hoặc có nhập/xuất kho
    window.addEventListener('message', (e) => {
        if (e.data && (e.data.type === 'TAB_ACTIVATED' || e.data.type === 'PRODUCTS_UPDATED')) {
            loadHistory(true);
        }
    });

    try {
        if (typeof BroadcastChannel !== 'undefined') {
            const bc = new BroadcastChannel('inventory_sync');
            bc.onmessage = (e) => {
                if (e.data && e.data.type === 'PRODUCTS_UPDATED') {
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
