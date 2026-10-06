/**
 * danh_muc.js - Unified Partners Management (Danh Mục Đối Tượng: Khách Hàng & Nhà Cung Cấp)
 */

let editingDtId = null;
let rawDoiTuongList = [];
let currentHistoryPartner = null;

document.addEventListener('DOMContentLoaded', function () {
    loadDoiTuong();
});

window.addEventListener('message', function (e) {
    if (e.data && (e.data.type === 'TAB_ACTIVATED' || e.data.type === 'DATA_CHANGED' || e.data.type === 'PRODUCTS_UPDATED')) {
        loadDoiTuong(true);
    }
});

// ── Tải dữ liệu Đối Tượng ────────────────────────────────────────────────────

async function loadDoiTuong(silent = false) {
    try {
        if (!silent) showLoading();
        const res = await apiRequest('/api/doi-tuong');
        rawDoiTuongList = res.data || [];

        // Cập nhật thẻ thống kê
        updateStatCards(rawDoiTuongList);

        filterDoiTuong();
    } catch (e) {
        if (!silent) showToast('Lỗi tải danh mục đối tượng: ' + e.message, 'error');
    } finally {
        if (!silent) hideLoading();
    }
}

function updateStatCards(list) {
    const total = list.length;
    let countKh = 0;
    let countNcc = 0;
    let countBoth = 0;

    list.forEach(r => {
        const type = (r.phan_loai || '').toUpperCase();
        if (type === 'KHACH_HANG') countKh++;
        else if (type === 'NHA_CUNG_CAP') countNcc++;
        else countBoth++;
    });

    const elTotal = document.getElementById('stat-tong');
    const elKh = document.getElementById('stat-kh');
    const elNcc = document.getElementById('stat-ncc');
    const elCaHai = document.getElementById('stat-cahai');

    if (elTotal) elTotal.innerText = total;
    if (elKh) elKh.innerText = countKh;
    if (elNcc) elNcc.innerText = countNcc;
    if (elCaHai) elCaHai.innerText = countBoth;
}

// ── Bộ lọc & Tìm kiếm ─────────────────────────────────────────────────────────

function filterDoiTuong() {
    const q = (document.getElementById('dt-search-input')?.value || '').toLowerCase().trim();
    const typeFilter = document.getElementById('dt-filter-type')?.value || 'all';
    const statusFilter = document.getElementById('dt-filter-status')?.value || 'all';
    const sortBy = document.getElementById('dt-sort-by')?.value || 'default';

    let list = [...rawDoiTuongList];

    // 1. Tìm kiếm chuỗi
    if (q) {
        list = list.filter(r => {
            const str = `${r.ten || ''} ${r.dien_thoai || ''} ${r.dia_chi || ''} ${r.email || ''} ${r.ghi_chu || ''}`.toLowerCase();
            return str.includes(q);
        });
    }

    // 2. Lọc theo Phân loại
    if (typeFilter !== 'all') {
        list = list.filter(r => (r.phan_loai || 'CA_HAI').toUpperCase() === typeFilter);
    }

    // 3. Lọc theo trạng thái giao dịch
    if (statusFilter === 'has_orders') {
        list = list.filter(r => (r.tong_don || 0) > 0);
    } else if (statusFilter === 'has_nhap') {
        list = list.filter(r => (r.so_don_nhap || 0) > 0);
    } else if (statusFilter === 'has_xuat') {
        list = list.filter(r => (r.so_don_xuat || 0) > 0);
    } else if (statusFilter === 'no_orders') {
        list = list.filter(r => (r.tong_don || 0) === 0);
    }

    // 4. Sắp xếp
    if (sortBy === 'name_asc') {
        list.sort((a, b) => (a.ten || '').localeCompare(b.ten || '', 'vi'));
    } else if (sortBy === 'spent_desc') {
        list.sort((a, b) => (b.tong_giao_dich || 0) - (a.tong_giao_dich || 0));
    } else if (sortBy === 'xuat_desc') {
        list.sort((a, b) => (b.tong_tien_xuat || 0) - (a.tong_tien_xuat || 0));
    } else if (sortBy === 'nhap_desc') {
        list.sort((a, b) => (b.tong_tien_nhap || 0) - (a.tong_tien_nhap || 0));
    } else if (sortBy === 'orders_desc') {
        list.sort((a, b) => (b.tong_don || 0) - (a.tong_don || 0));
    }

    // Cập nhật tóm tắt số lượng
    const summaryEl = document.getElementById('dt-filter-summary');
    if (summaryEl) {
        summaryEl.innerText = `${list.length} / ${rawDoiTuongList.length} Đối Tượng`;
    }

    renderDoiTuongTable(list);
}

function clearDoiTuongSearch() {
    const input = document.getElementById('dt-search-input');
    if (input) input.value = '';
    filterDoiTuong();
}

// ── Render Bảng Đối Tượng ────────────────────────────────────────────────────

function renderDoiTuongTable(records) {
    const tbody = document.getElementById('dt-tbody');
    if (!tbody) return;

    if (!records.length) {
        tbody.innerHTML = `
            <tr>
                <td colspan="9" class="text-center text-muted py-5">
                    <i class="bi bi-inbox fs-2 d-block text-secondary mb-2"></i>
                    Không tìm thấy đối tượng nào phù hợp
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = records.map((r, i) => {
        const type = (r.phan_loai || 'CA_HAI').toUpperCase();
        let badgeType = '';
        if (type === 'KHACH_HANG') {
            badgeType = '<span class="badge bg-success-subtle text-success-emphasis border border-success"><i class="bi bi-person me-1"></i>Khách Hàng</span>';
        } else if (type === 'NHA_CUNG_CAP') {
            badgeType = '<span class="badge bg-info-subtle text-info-emphasis border border-info"><i class="bi bi-truck me-1"></i>Nhà Cung Cấp</span>';
        } else {
            badgeType = '<span class="badge bg-primary-subtle text-primary-emphasis border border-primary"><i class="bi bi-arrow-left-right me-1"></i>Cả Hai</span>';
        }

        const hasNhap = (r.so_don_nhap || 0) > 0;
        const hasXuat = (r.so_don_xuat || 0) > 0;

        const nhapHtml = hasNhap
            ? `<button class="btn btn-sm btn-outline-primary py-0 px-2 font-monospace small" onclick="viewDoiTuongHistory('${r.id}', 'nhap')" title="Xem phiếu nhập">
                 ${r.so_don_nhap} đơn &bull; ${formatVND(r.tong_tien_nhap)}
               </button>`
            : '<span class="text-muted small">-</span>';

        const xuatHtml = hasXuat
            ? `<button class="btn btn-sm btn-outline-success py-0 px-2 font-monospace small" onclick="viewDoiTuongHistory('${r.id}', 'xuat')" title="Xem phiếu xuất">
                 ${r.so_don_xuat} đơn &bull; ${formatVND(r.tong_tien_xuat)}
               </button>`
            : '<span class="text-muted small">-</span>';

        const initial = (r.ten || 'D').trim().charAt(0).toUpperCase();

        return `
            <tr>
                <td class="text-center text-muted small">${i + 1}</td>
                <td>
                    <div class="d-flex align-items-center">
                        <span class="avatar-sm bg-primary-subtle text-primary rounded-circle d-inline-flex align-items-center justify-content-center me-2 fw-bold" style="width:34px;height:34px;font-size:14px;flex-shrink:0;">
                            ${initial}
                        </span>
                        <div>
                            <a href="javascript:void(0)" onclick="viewDoiTuongHistory('${r.id}')" class="fw-bold text-dark text-decoration-none hover-primary" title="Bấm xem lịch sử mua / bán 2 chiều">
                                ${escapeHtml(r.ten)}
                            </a>
                            ${r.ghi_chu ? `<div class="text-muted small text-truncate" style="max-width:240px;">${escapeHtml(r.ghi_chu)}</div>` : ''}
                        </div>
                    </div>
                </td>
                <td>${badgeType}</td>
                <td class="font-monospace">
                    ${r.dien_thoai ? `<a href="tel:${r.dien_thoai}" class="text-decoration-none text-dark fw-semibold"><i class="bi bi-telephone text-primary me-1"></i>${escapeHtml(r.dien_thoai)}</a>` : '<span class="text-muted small">-</span>'}
                </td>
                <td>
                    ${r.dia_chi ? `<span class="text-truncate d-inline-block small" style="max-width:220px;" title="${escapeHtml(r.dia_chi)}"><i class="bi bi-geo-alt text-danger me-1"></i>${escapeHtml(r.dia_chi)}</span>` : '<span class="text-muted small">-</span>'}
                </td>
                <td>
                    ${r.email ? `<span class="text-truncate d-inline-block small" style="max-width:160px;" title="${escapeHtml(r.email)}"><i class="bi bi-envelope text-info me-1"></i>${escapeHtml(r.email)}</span>` : '<span class="text-muted small">-</span>'}
                </td>
                <td class="text-end">${nhapHtml}</td>
                <td class="text-end">${xuatHtml}</td>
                <td class="text-center text-nowrap">
                    <button class="btn btn-sm btn-primary me-1 px-2 py-1" onclick="viewDoiTuongHistory('${r.id}')" title="Xem chi tiết lịch sử giao dịch 2 chiều">
                        <i class="bi bi-clock-history me-1"></i>Lịch sử
                    </button>
                    <button class="btn btn-sm btn-outline-secondary me-1 p-1 px-2" onclick="editDoiTuong('${r.id}')" title="Sửa thông tin">
                        <i class="bi bi-pencil"></i>
                    </button>
                    <button class="btn btn-sm btn-outline-danger p-1 px-2" onclick="deleteDoiTuong('${r.id}')" title="Xóa đối tượng">
                        <i class="bi bi-trash"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

// ── Modal Thêm / Sửa Đối Tượng ───────────────────────────────────────────────

function openAddDoiTuong() {
    editingDtId = null;
    document.getElementById('dt-modal-title').innerHTML = '<i class="bi bi-person-plus me-2"></i>Thêm Đối Tượng Mới';
    document.getElementById('dt-form').reset();
    document.getElementById('dt-phan-loai').value = 'CA_HAI';
    openModal('dt-modal');
}

function editDoiTuong(id) {
    const dt = rawDoiTuongList.find(x => x.id === id);
    if (!dt) return;
    editingDtId = id;
    document.getElementById('dt-modal-title').innerHTML = '<i class="bi bi-pencil-square me-2"></i>Sửa Thông Tin Đối Tượng';
    document.getElementById('dt-ten').value = dt.ten || '';
    document.getElementById('dt-phan-loai').value = dt.phan_loai || 'CA_HAI';
    document.getElementById('dt-dia-chi').value = dt.dia_chi || '';
    document.getElementById('dt-dt').value = dt.dien_thoai || '';
    document.getElementById('dt-email').value = dt.email || '';
    document.getElementById('dt-ghi-chu').value = dt.ghi_chu || '';
    openModal('dt-modal');
}

async function saveDoiTuong() {
    const ten = document.getElementById('dt-ten')?.value.trim();
    if (!ten) {
        showToast('Vui lòng nhập Tên đối tượng', 'warning');
        return;
    }

    const payload = {
        ten: ten,
        phan_loai: document.getElementById('dt-phan-loai')?.value || 'CA_HAI',
        dia_chi: document.getElementById('dt-dia-chi')?.value.trim() || '',
        dien_thoai: document.getElementById('dt-dt')?.value.trim() || '',
        email: document.getElementById('dt-email')?.value.trim() || '',
        ghi_chu: document.getElementById('dt-ghi-chu')?.value.trim() || '',
    };

    try {
        showLoading();
        if (editingDtId) {
            await apiRequest(`/api/doi-tuong/${editingDtId}`, 'PUT', payload);
            showToast('Cập nhật đối tượng thành công');
        } else {
            await apiRequest('/api/doi-tuong', 'POST', payload);
            showToast('Thêm đối tượng thành công');
        }
        closeModal('dt-modal');
        await loadDoiTuong();
    } catch (e) {
        showToast(e.message, 'error');
    } finally {
        hideLoading();
    }
}

async function deleteDoiTuong(id) {
    const dt = rawDoiTuongList.find(x => x.id === id);
    const name = dt ? dt.ten : 'này';
    if (!confirmDelete(`Xóa đối tượng "${name}" khỏi danh mục?`)) return;

    try {
        showLoading();
        await apiRequest(`/api/doi-tuong/${id}`, 'DELETE');
        showToast('Đã xóa đối tượng');
        await loadDoiTuong();
    } catch (e) {
        showToast(e.message, 'error');
    } finally {
        hideLoading();
    }
}

// ── Xem Lịch Sử Giao Dịch 2 Chiều ──────────────────────────────────────────

async function viewDoiTuongHistory(id, defaultTab = 'all') {
    try {
        showLoading();
        const res = await apiRequest(`/api/doi-tuong/${id}/lich-su`);
        if (!res.success) {
            showToast('Không thể tải lịch sử', 'error');
            return;
        }

        const dt = res.doi_tuong || {};
        const summary = res.summary || {};
        const allReceipts = res.tat_ca_phieu || [];
        const nhapReceipts = res.phieu_nhap || [];
        const xuatReceipts = res.phieu_xuat || [];
        const itemsList = res.chi_tiet_hang || [];

        currentHistoryPartner = { data: dt, summary, allReceipts, nhapReceipts, xuatReceipts, itemsList };

        // Profile
        document.getElementById('hist-partner-name').innerText = dt.ten || 'Đối Tác';
        const typeBadge = document.getElementById('hist-partner-badge');
        if (typeBadge) {
            const t = (dt.phan_loai || 'CA_HAI').toUpperCase();
            typeBadge.innerText = t === 'KHACH_HANG' ? 'Khách Hàng' : (t === 'NHA_CUNG_CAP' ? 'Nhà Cung Cấp' : 'Khách & NCC');
        }
        document.getElementById('hist-partner-phone').innerText = dt.dien_thoai || 'Chưa có SĐT';
        document.getElementById('hist-partner-address').innerText = dt.dia_chi || 'Chưa có địa chỉ';
        document.getElementById('hist-partner-email').innerText = dt.email || 'Chưa có email';

        const noteWrap = document.getElementById('hist-partner-note-wrap');
        const noteEl = document.getElementById('hist-partner-note');
        if (dt.ghi_chu) {
            noteEl.innerText = dt.ghi_chu;
            noteWrap.style.display = 'block';
        } else {
            noteWrap.style.display = 'none';
        }

        // Summary Stats
        document.getElementById('hist-stat-xuat').innerText = formatVND(summary.tong_tien_xuat || 0);
        document.getElementById('hist-stat-xuat-count').innerText = `${summary.tong_so_phieu_xuat || 0} phiếu`;

        document.getElementById('hist-stat-nhap').innerText = formatVND(summary.tong_tien_nhap || 0);
        document.getElementById('hist-stat-nhap-count').innerText = `${summary.tong_so_phieu_nhap || 0} phiếu`;

        const totalMoney = (summary.tong_tien_xuat || 0) + (summary.tong_tien_nhap || 0);
        document.getElementById('hist-stat-total').innerText = formatVND(totalMoney);
        document.getElementById('hist-stat-total-count').innerText = `${summary.tong_so_phieu || 0} đơn`;

        // Tab Counts
        document.getElementById('hist-all-count').innerText = allReceipts.length;
        document.getElementById('hist-xuat-count').innerText = xuatReceipts.length;
        document.getElementById('hist-nhap-count').innerText = nhapReceipts.length;
        document.getElementById('hist-item-count').innerText = itemsList.length;

        // Render contents
        renderReceiptRows('hist-tbody-all', allReceipts, true);
        renderReceiptRows('hist-tbody-xuat', xuatReceipts, false);
        renderReceiptRows('hist-tbody-nhap', nhapReceipts, false);
        renderItemsRows('hist-tbody-items', itemsList);

        // Switch to chosen tab
        let tabButtonId = 'hist-tab-all';
        if (defaultTab === 'nhap') tabButtonId = 'hist-tab-nhap';
        else if (defaultTab === 'xuat') tabButtonId = 'hist-tab-xuat';

        const tabBtn = document.getElementById(tabButtonId);
        if (tabBtn) {
            const triggerEl = new bootstrap.Tab(tabBtn);
            triggerEl.show();
        }

        openModal('history-modal');
    } catch (e) {
        showToast('Lỗi xem lịch sử: ' + e.message, 'error');
    } finally {
        hideLoading();
    }
}

function renderReceiptRows(tbodyId, list, showTypeBadge = false) {
    const tbody = document.getElementById(tbodyId);
    if (!tbody) return;

    if (!list || !list.length) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted py-4">Chưa có giao dịch</td></tr>';
        return;
    }

    tbody.innerHTML = list.map((r, i) => {
        const isXuat = r.loai === 'XUAT';
        const typeBadge = isXuat
            ? '<span class="badge bg-success-subtle text-success-emphasis border border-success">XUẤT</span>'
            : '<span class="badge bg-primary-subtle text-primary-emphasis border border-primary">NHẬP</span>';

        const amtColor = isXuat ? 'text-success' : 'text-primary';

        return `
            <tr>
                <td class="text-center text-muted small">${i + 1}</td>
                ${showTypeBadge ? `<td>${typeBadge}</td>` : ''}
                <td class="small text-muted font-monospace">${formatDate(r.ngay)}</td>
                <td class="fw-bold font-monospace text-dark">${escapeHtml(r.so_phieu)}</td>
                <td class="text-center font-monospace">${r.tong_sl || (r.items ? r.items.length : 0)}</td>
                <td class="text-end fw-bold font-monospace ${amtColor}">${formatVND(r.tong_tien)}</td>
                <td class="small text-muted">${escapeHtml(r.ghi_chu || '')}</td>
            </tr>
        `;
    }).join('');
}

function renderItemsRows(tbodyId, items) {
    const tbody = document.getElementById(tbodyId);
    if (!tbody) return;

    if (!items || !items.length) {
        tbody.innerHTML = '<tr><td colspan="9" class="text-center text-muted py-4">Chưa có mặt hàng nào</td></tr>';
        return;
    }

    tbody.innerHTML = items.map((it, i) => {
        const isXuat = it.loai === 'XUAT';
        const typeBadge = isXuat
            ? '<span class="badge bg-success-subtle text-success-emphasis border border-success">XUẤT</span>'
            : '<span class="badge bg-primary-subtle text-primary-emphasis border border-primary">NHẬP</span>';
        const amtColor = isXuat ? 'text-success' : 'text-primary';

        return `
            <tr>
                <td class="text-center text-muted small">${i + 1}</td>
                <td>${typeBadge}</td>
                <td class="small text-muted font-monospace">${formatDate(it.ngay)}</td>
                <td class="font-monospace small">${escapeHtml(it.so_phieu)}</td>
                <td class="font-monospace text-primary fw-semibold">${escapeHtml(it.ma_hang)}</td>
                <td class="fw-semibold">${escapeHtml(it.ten_hang)}</td>
                <td class="text-center font-monospace fw-bold">${it.so_luong}</td>
                <td class="text-end font-monospace">${formatVND(it.don_gia)}</td>
                <td class="text-end font-monospace fw-bold ${amtColor}">${formatVND(it.thanh_tien)}</td>
            </tr>
        `;
    }).join('');
}

function printDoiTuongHistory() {
    if (!currentHistoryPartner) return;
    const { data, summary, allReceipts } = currentHistoryPartner;

    const printWin = window.open('', '_blank');
    if (!printWin) {
        showToast('Trình duyệt đã chặn cửa sổ in pop-up', 'warning');
        return;
    }

    const rowsHtml = (allReceipts || []).map((r, i) => `
        <tr>
            <td style="text-align:center;">${i + 1}</td>
            <td style="text-align:center;">${r.loai === 'XUAT' ? 'XUẤT KHO' : 'NHẬP KHO'}</td>
            <td style="text-align:center;">${formatDate(r.ngay)}</td>
            <td><strong>${escapeHtml(r.so_phieu)}</strong></td>
            <td style="text-align:center;">${r.tong_sl || 0}</td>
            <td style="text-align:right;"><strong>${formatVND(r.tong_tien)}</strong></td>
            <td>${escapeHtml(r.ghi_chu || '')}</td>
        </tr>
    `).join('');

    printWin.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Lịch Sử Giao Dịch - ${escapeHtml(data.ten)}</title>
            <style>
                body { font-family: Arial, sans-serif; padding: 20px; color: #333; line-height: 1.4; }
                h2 { margin: 0 0 5px; color: #1e293b; }
                .subtitle { color: #64748b; font-size: 13px; margin-bottom: 20px; }
                .profile { background: #f8fafc; border: 1px solid #e2e8f0; padding: 12px; border-radius: 6px; margin-bottom: 20px; }
                .profile p { margin: 4px 0; font-size: 13px; }
                .stats { display: flex; gap: 15px; margin-bottom: 20px; }
                .stat-box { flex: 1; border: 1px solid #cbd5e1; padding: 10px; border-radius: 6px; text-align: center; }
                .stat-box .title { font-size: 11px; text-transform: uppercase; color: #64748b; }
                .stat-box .val { font-size: 16px; font-weight: bold; margin-top: 4px; }
                table { width: 100%; border-collapse: collapse; font-size: 13px; margin-top: 10px; }
                th, td { border: 1px solid #cbd5e1; padding: 8px 10px; }
                th { background-color: #f1f5f9; text-align: left; }
            </style>
        </head>
        <body>
            <h2>LỊCH SỬ GIAO DỊCH ĐỐI TÁC</h2>
            <div class="subtitle">Kho Hàng Laptop An Nam &bull; Ngày in: ${new Date().toLocaleDateString('vi-VN')}</div>

            <div class="profile">
                <p><strong>Tên Đối Tượng:</strong> ${escapeHtml(data.ten)}</p>
                <p><strong>Số Điện Thoại:</strong> ${escapeHtml(data.dien_thoai || '-')}</p>
                <p><strong>Địa Chỉ:</strong> ${escapeHtml(data.dia_chi || '-')}</p>
                <p><strong>Email:</strong> ${escapeHtml(data.email || '-')}</p>
            </div>

            <div class="stats">
                <div class="stat-box">
                    <div class="title">Đã Mua (Xuất)</div>
                    <div class="val" style="color:#16a34a;">${formatVND(summary.tong_tien_xuat || 0)}</div>
                </div>
                <div class="stat-box">
                    <div class="title">Đã Bán Cho Ta (Nhập)</div>
                    <div class="val" style="color:#2563eb;">${formatVND(summary.tong_tien_nhap || 0)}</div>
                </div>
                <div class="stat-box">
                    <div class="title">Tổng Giao Dịch</div>
                    <div class="val">${formatVND((summary.tong_tien_xuat || 0) + (summary.tong_tien_nhap || 0))}</div>
                </div>
            </div>

            <table>
                <thead>
                    <tr>
                        <th style="width:40px;text-align:center;">STT</th>
                        <th style="width:90px;text-align:center;">Loại</th>
                        <th style="width:100px;text-align:center;">Ngày</th>
                        <th style="width:120px;">Số Phiếu</th>
                        <th style="width:60px;text-align:center;">SL</th>
                        <th style="width:130px;text-align:right;">Tổng Tiền</th>
                        <th>Ghi Chú</th>
                    </tr>
                </thead>
                <tbody>
                    ${rowsHtml}
                </tbody>
            </table>

            <script>
                window.onload = function() { window.print(); }
            </script>
        </body>
        </html>
    `);
    printWin.document.close();
}

// ── Xuất Excel Danh Mục Đối Tượng ──────────────────────────────────────────

async function exportDoiTuongExcel() {
    if (!rawDoiTuongList || !rawDoiTuongList.length) {
        showToast('Không có dữ liệu đối tượng để xuất', 'warning');
        return;
    }

    try {
        showLoading();
        if (typeof ExcelJS === 'undefined') {
            throw new Error('Thư viện ExcelJS chưa sẵn sàng');
        }

        const wb = new ExcelJS.Workbook();
        const ws = wb.addWorksheet('Danh Mục Đối Tượng');

        ws.columns = [
            { header: 'STT', key: 'stt', width: 6 },
            { header: 'Mã / ID', key: 'id', width: 16 },
            { header: 'Tên Đối Tượng', key: 'ten', width: 28 },
            { header: 'Phân Loại', key: 'phan_loai', width: 18 },
            { header: 'Điện Thoại', key: 'dien_thoai', width: 16 },
            { header: 'Địa Chỉ', key: 'dia_chi', width: 32 },
            { header: 'Email', key: 'email', width: 24 },
            { header: 'Đơn Nhập', key: 'don_nhap', width: 12 },
            { header: 'Tiền Nhập (VNĐ)', key: 'tien_nhap', width: 18 },
            { header: 'Đơn Xuất', key: 'don_xuat', width: 12 },
            { header: 'Tiền Xuất (VNĐ)', key: 'tien_xuat', width: 18 },
            { header: 'Tổng Tiền (VNĐ)', key: 'tong_tien', width: 20 },
            { header: 'Ghi Chú', key: 'ghi_chu', width: 25 },
        ];

        // Style Header
        const headerRow = ws.getRow(1);
        headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
        headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
        headerRow.height = 28;

        rawDoiTuongList.forEach((r, idx) => {
            const typeStr = r.phan_loai === 'KHACH_HANG' ? 'Khách Hàng' : (r.phan_loai === 'NHA_CUNG_CAP' ? 'Nhà Cung Cấp' : 'Cả Hai (Mua & Bán)');
            const row = ws.addRow({
                stt: idx + 1,
                id: r.id,
                ten: r.ten,
                phan_loai: typeStr,
                dien_thoai: r.dien_thoai,
                dia_chi: r.dia_chi,
                email: r.email,
                don_nhap: r.so_don_nhap || 0,
                tien_nhap: r.tong_tien_nhap || 0,
                don_xuat: r.so_don_xuat || 0,
                tien_xuat: r.tong_tien_xuat || 0,
                tong_tien: (r.tong_tien_nhap || 0) + (r.tong_tien_xuat || 0),
                ghi_chu: r.ghi_chu,
            });

            row.alignment = { vertical: 'middle' };
            row.getCell('stt').alignment = { horizontal: 'center' };
            row.getCell('don_nhap').alignment = { horizontal: 'center' };
            row.getCell('don_xuat').alignment = { horizontal: 'center' };
            row.getCell('tien_nhap').numFmt = '#,##0';
            row.getCell('tien_xuat').numFmt = '#,##0';
            row.getCell('tong_tien').numFmt = '#,##0';
        });

        const buf = await wb.xlsx.writeBuffer();
        const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Danh_Muc_Doi_Tuong_${todayISO()}.xlsx`;
        a.click();
        window.URL.revokeObjectURL(url);
        showToast('Xuất file Excel đối tượng thành công');
    } catch (e) {
        showToast('Lỗi xuất Excel: ' + e.message, 'error');
    } finally {
        hideLoading();
    }
}
