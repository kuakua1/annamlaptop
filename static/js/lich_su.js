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
                        <button class="btn btn-sm btn-outline-primary py-0 px-2 shadow-sm" onclick="viewHistoryReceipt('${escapeHtml(r.loai)}', '${escapeHtml(r.so_phieu)}')" title="Xem chi tiết phiếu">
                            <i class="bi bi-eye me-1"></i>Xem
                        </button>
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
        const items = res.items || [];
        const partner = isNhap ? (res.nha_cung_cap || {}) : (res.khach_hang || {});
        const partnerName = isNhap ? (partner.ten_ncc || 'Không xác định') : (partner.ten_kh || 'Không xác định');
        const badgeColor = isNhap ? 'bg-primary' : 'bg-danger';
        const typeLabel = isNhap ? 'Phiếu Nhập Kho' : 'Phiếu Xuất Kho';
        const dateLabel = isNhap ? formatDate(res.ngay_nhap) : formatDate(res.ngay_xuat);
        const totalQty = res.tong_so_luong || res.total_sl || items.reduce((s, x) => s + (parseInt(x.so_luong) || 0), 0);

        const titleEl = document.getElementById('history-modal-title');
        if (titleEl) titleEl.textContent = `Chi Tiết ${typeLabel}: ${so_phieu}`;
        
        const modal = document.getElementById('history-modal-body');
        modal.innerHTML = `
            <!-- Khung Thông Tin Phiếu & Đối Tác -->
            <div class="card bg-light border-0 mb-3">
                <div class="card-body py-2 px-3">
                    <div class="row align-items-center">
                        <div class="col-sm-7 mb-2 mb-sm-0">
                            <div class="d-flex align-items-center gap-2 mb-1">
                                <span class="badge ${badgeColor} fs-6 px-3 py-1 font-monospace">${escapeHtml(so_phieu)}</span>
                                <span class="badge bg-success-subtle text-success border border-success-subtle">
                                    <i class="bi bi-check2-circle me-1"></i>${isNhap ? 'Đã nhập kho' : 'Đã xuất kho'}
                                </span>
                            </div>
                            <div class="text-secondary small mt-1">
                                <i class="bi bi-calendar-event me-1 ${isNhap ? 'text-primary' : 'text-danger'}"></i>Ngày: <strong class="text-dark">${dateLabel}</strong>
                            </div>
                        </div>
                        <div class="col-sm-5 text-sm-end">
                            <div class="small text-muted mb-0">Tổng tiền giao dịch</div>
                            <div class="fs-4 fw-bold ${isNhap ? 'text-primary' : 'text-danger'} font-monospace">${formatVND(res.total)}</div>
                        </div>
                    </div>
                    <hr class="my-2 border-secondary opacity-25">
                    <div class="row g-2 small">
                        <div class="col-md-7">
                            <div class="d-flex align-items-start">
                                <i class="bi ${isNhap ? 'bi-building text-primary' : 'bi-person-fill text-danger'} me-2 fs-6 mt-1"></i>
                                <div>
                                    <div class="fw-bold text-dark fs-6">${escapeHtml(partnerName)}</div>
                                    ${partner.dien_thoai ? `<div class="text-muted"><i class="bi bi-telephone me-1 text-success"></i>SĐT: <strong>${escapeHtml(partner.dien_thoai)}</strong></div>` : ''}
                                    ${partner.dia_chi ? `<div class="text-muted"><i class="bi bi-geo-alt me-1 text-danger"></i>Địa chỉ: ${escapeHtml(partner.dia_chi)}</div>` : ''}
                                </div>
                            </div>
                        </div>
                        <div class="col-md-5 text-md-end">
                            ${res.ghi_chu ? `<div class="text-muted fst-italic mb-1"><i class="bi bi-chat-left-text me-1"></i>${escapeHtml(res.ghi_chu)}</div>` : '<div class="text-muted fst-italic mb-1">Không có ghi chú</div>'}
                            <div class="text-muted">
                                Quy mô: <strong>${items.length}</strong> mặt hàng &middot; Tổng SL: <strong class="${isNhap ? 'text-primary' : 'text-danger'} fs-6">${formatNumber(totalQty)}</strong>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Bảng chi tiết hàng hóa -->
            <div class="table-responsive border rounded mb-2">
                <table class="table table-hover table-striped align-middle mb-0">
                    <thead style="background-color: #1e293b !important; color: #ffffff !important;">
                        <tr style="background-color: #1e293b !important;">
                            <th class="text-center" style="width: 45px; background-color: #1e293b !important; color: #ffffff !important;">#</th>
                            <th style="width: 100px; background-color: #1e293b !important; color: #ffffff !important;">Mã hàng</th>
                            <th style="background-color: #1e293b !important; color: #ffffff !important;">Tên hàng hóa</th>
                            <th class="text-center" style="width: 70px; background-color: #1e293b !important; color: #ffffff !important;">ĐVT</th>
                            <th class="text-center" style="width: 70px; background-color: #1e293b !important; color: #ffffff !important;">SL</th>
                            <th class="text-end text-nowrap" style="width: 140px; background-color: #1e293b !important; color: #ffffff !important;">Đơn giá</th>
                            <th class="text-end text-nowrap" style="min-width: 165px; width: 175px; background-color: #1e293b !important; color: #ffffff !important;">Thành tiền</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${items.map((it, idx) => `
                            <tr>
                                <td class="text-center text-muted small">${idx + 1}</td>
                                <td><span class="badge bg-secondary font-monospace">${escapeHtml(it.ma_hang)}</span></td>
                                <td class="fw-semibold">${escapeHtml(it.ten_hang)}</td>
                                <td class="text-center text-muted small">${escapeHtml(it.don_vi_tinh || 'Cái')}</td>
                                <td class="text-center fw-bold fs-6 ${isNhap ? 'text-primary' : 'text-danger'}">${formatNumber(it.so_luong)}</td>
                                <td class="text-end text-nowrap">${formatVND(isNhap ? it.gia_nhap : it.gia_ban)}</td>
                                <td class="text-end fw-bold text-dark font-monospace text-nowrap" style="min-width: 165px;">${formatVND(it.thanh_tien)}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                    <tfoot class="table-light fw-bold border-top border-2">
                        <tr>
                            <td colspan="4" class="text-end text-uppercase small text-secondary">Tổng cộng:</td>
                            <td class="text-center ${isNhap ? 'text-primary' : 'text-danger'} fs-6">${formatNumber(totalQty)}</td>
                            <td></td>
                            <td class="text-end ${isNhap ? 'text-primary' : 'text-danger'} fs-5 font-monospace text-nowrap" style="min-width: 165px;">${formatVND(res.total)}</td>
                        </tr>
                    </tfoot>
                </table>
            </div>
        `;
        openModal('history-detail-modal');
    } catch (e) {
        showToast(e.message, 'error');
    } finally {
        hideLoading();
    }
}

