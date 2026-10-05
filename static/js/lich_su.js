/**
 * lich_su.js - Transaction history page logic
 */

let currentPage = 1;
let currentLoai = 'all';
let currentSearch = '';
let currentFrom = '';
let currentTo = '';

let currentRecords = [];

async function loadHistory() {
    try {
        showLoading();
        const params = new URLSearchParams({
            loai: currentLoai,
            from_date: currentFrom,
            to_date: currentTo,
            search: currentSearch,
            page: currentPage,
        });
        const res = await apiRequest(`/api/lich-su?${params}`);
        const records = res.data || [];
        currentRecords = records;

        document.getElementById('total-count').textContent = res.total;
        document.getElementById('page-info').textContent =
            `Trang ${res.page}/${res.total_pages}`;

        const tbody = document.getElementById('history-tbody');
        if (!records.length) {
            tbody.innerHTML = '<tr><td colspan="10" class="text-center text-muted py-4">Không có dữ liệu</td></tr>';
        } else {
            tbody.innerHTML = records.map((r, i) => `
                <tr>
                    <td class="text-center">
                        <span class="badge rounded-pill ${r.loai === 'Nhập' ? 'badge-nhap' : 'badge-xuat'}">
                            ${r.loai === 'Nhập' ? '↓ Nhập' : '↑ Xuất'}
                        </span>
                    </td>
                    <td>
                        <a href="javascript:void(0)" class="fw-bold text-decoration-none font-monospace ${r.loai === 'Nhập' ? 'text-primary' : 'text-danger'}" onclick="viewHistoryReceipt('${escapeHtml(r.loai)}', '${escapeHtml(r.so_phieu)}')" title="Xem chi tiết phiếu">${escapeHtml(r.so_phieu)}</a>
                    </td>
                    <td>${formatDate(r.ngay)}</td>
                    <td><span class="badge bg-secondary font-monospace">${escapeHtml(r.ma_hang)}</span></td>
                    <td>${escapeHtml(r.ten_hang)}</td>
                    <td class="text-center">${formatNumber(r.so_luong)}</td>
                    <td class="text-end">${formatVND(r.don_gia)}</td>
                    <td class="text-end fw-bold ${r.loai === 'Nhập' ? 'text-primary' : 'text-danger'}">${formatVND(r.thanh_tien)}</td>
                    <td>${escapeHtml(r.doi_tac || '-')}</td>
                    <td class="text-center">
                        <div class="d-flex justify-content-center gap-1">
                            <button class="btn btn-sm btn-outline-primary py-0 px-2 shadow-sm" onclick="viewHistoryReceipt('${escapeHtml(r.loai)}', '${escapeHtml(r.so_phieu)}')" title="Xem chi tiết phiếu">
                                <i class="bi bi-eye me-1"></i>Xem
                            </button>
                            <button class="btn btn-sm btn-outline-danger py-0 px-2 shadow-sm" onclick="confirmDeleteReceipt('${escapeHtml(r.so_phieu)}', '${(r.loai || '').toLowerCase().includes('nhập') ? 'nhap' : 'xuat'}', () => loadHistory())" title="Xóa phiếu">
                                <i class="bi bi-trash"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `).join('');
        }

        renderPagination('pagination-container', currentPage, res.total_pages, (p) => {
            currentPage = p;
            loadHistory();
        });
    } catch (e) {
        showToast(e.message, 'error');
    } finally {
        hideLoading();
    }
}

function setTab(loai) {
    currentLoai = loai;
    currentPage = 1;
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.loai === loai);
    });
    loadHistory();
}

function applyFilters() {
    currentFrom = document.getElementById('filter-from').value;
    currentTo = document.getElementById('filter-to').value;
    currentSearch = document.getElementById('filter-search').value.trim();
    currentPage = 1;
    loadHistory();
}

function clearFilters() {
    document.getElementById('filter-from').value = '';
    document.getElementById('filter-to').value = '';
    document.getElementById('filter-search').value = '';
    currentFrom = '';
    currentTo = '';
    currentSearch = '';
    currentPage = 1;
    loadHistory();
}

function exportHistoryExcel() {
    if (!currentRecords || !currentRecords.length) {
        showToast('Không có dữ liệu giao dịch để xuất Excel!', 'info');
        return;
    }

    let totalQty = 0;
    let totalThanhTien = 0;

    const rows = currentRecords.map((r, idx) => {
        const sl = parseInt(r.so_luong) || 0;
        const donGia = parseFloat(r.don_gia) || 0;
        const thanhTien = parseFloat(r.thanh_tien) || 0;

        totalQty += sl;
        totalThanhTien += thanhTien;

        return [
            idx + 1,
            r.loai === 'nhap' ? 'Nhập kho' : 'Xuất kho',
            r.so_phieu,
            formatDate(r.ngay),
            r.ten_hang,
            sl,
            donGia,
            thanhTien,
            r.doi_tac || ''
        ];
    });

    const summaryRow = ['Tổng cộng', '', '', '', '-', totalQty, '-', totalThanhTien, '-'];

    const now = new Date();
    const monthText = `Tháng ${now.getMonth() + 1} năm ${now.getFullYear()}`;

    exportAccountingReportToExcel({
        title: 'SỔ NHẬT KÝ CHI TIẾT GIAO DỊCH KHO HÀNG',
        monthText,
        accountText: 'Tài khoản: 156 (Hàng hoá)',
        unitText: 'Đơn vị tính : Đồng',
        columns: [
            { header: 'STT', code: 'A', width: 8, align: 'center' },
            { header: 'Loại GD', code: 'B', width: 14, align: 'center' },
            { header: 'Số phiếu', code: 'C', width: 16, align: 'center' },
            { header: 'Ngày', code: 'D', width: 14, align: 'center' },
            { header: 'Tên vật tư, hàng hóa', code: 'E', width: 45, align: 'left', wrapText: true },
            { header: 'Số lượng', code: '1', width: 12, align: 'right', isNumber: true },
            { header: 'Đơn giá', code: '2', width: 16, align: 'right', isNumber: true },
            { header: 'Thành tiền', code: '3', width: 20, align: 'right', isNumber: true },
            { header: 'Đối tác', code: '4', width: 25, align: 'left', wrapText: true }
        ],
        rows,
        summaryRow,
        fileName: `Nhat_Ky_Giao_Dich_${todayISO()}.xlsx`,
        sheetName: 'LichSu'
    });
}

document.addEventListener('DOMContentLoaded', () => {
    loadHistory();
    document.getElementById('filter-search')?.addEventListener('keyup', (e) => {
        if (e.key === 'Enter') applyFilters();
    });
});

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

