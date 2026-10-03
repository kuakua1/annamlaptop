/**
 * danh_muc.js - Suppliers & Customers management with search, filter and full purchase/import history
 */

let editingNccId = null;
let editingKhId = null;

let rawNCCList = [];
let rawKHList = [];

// ── Nhà Cung Cấp ─────────────────────────────────────────────────────────────

async function loadNCC() {
    try {
        showLoading();
        const res = await apiRequest('/api/nha-cung-cap');
        rawNCCList = res.data || [];
        const badge = document.getElementById('ncc-badge-count');
        if (badge) badge.textContent = rawNCCList.length;
        filterNCC();
    } catch (e) {
        showToast(e.message, 'error');
    } finally {
        hideLoading();
    }
}

function filterNCC() {
    const search = (document.getElementById('ncc-search-input')?.value || '').toLowerCase().trim();
    const status = document.getElementById('ncc-filter-status')?.value || 'all';
    const sortBy = document.getElementById('ncc-sort-by')?.value || 'default';

    let list = [...rawNCCList];

    // Search filter
    if (search) {
        list = list.filter(r => {
            const text = `${r.ten_ncc || ''} ${r.dien_thoai || ''} ${r.dia_chi || ''} ${r.email || ''} ${r.ghi_chu || ''}`.toLowerCase();
            return text.includes(search);
        });
    }

    // Status filter
    if (status === 'has_orders') {
        list = list.filter(r => (r.so_don_nhap || 0) > 0);
    } else if (status === 'no_orders') {
        list = list.filter(r => (r.so_don_nhap || 0) === 0);
    }

    // Sort
    if (sortBy === 'name_asc') {
        list.sort((a, b) => (a.ten_ncc || '').localeCompare(b.ten_ncc || '', 'vi'));
    } else if (sortBy === 'spent_desc') {
        list.sort((a, b) => (b.tong_tien_nhap || 0) - (a.tong_tien_nhap || 0));
    } else if (sortBy === 'orders_desc') {
        list.sort((a, b) => (b.so_don_nhap || 0) - (a.so_don_nhap || 0));
    }

    // Update counter
    const summaryEl = document.getElementById('ncc-filter-summary');
    if (summaryEl) {
        summaryEl.textContent = `${list.length} / ${rawNCCList.length} NCC`;
    }

    renderNCCTable(list);
}

function clearNCCSearch() {
    const input = document.getElementById('ncc-search-input');
    if (input) input.value = '';
    filterNCC();
}

function renderNCCTable(records) {
    const tbody = document.getElementById('ncc-tbody');
    if (!tbody) return;

    if (!records.length) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted py-4">Không tìm thấy nhà cung cấp nào phù hợp</td></tr>';
        return;
    }

    tbody.innerHTML = records.map((r, i) => {
        const hasOrders = (r.so_don_nhap || 0) > 0;
        return `
            <tr>
                <td class="text-center text-muted">${i + 1}</td>
                <td>
                    <div class="d-flex align-items-center">
                        <span class="avatar-sm bg-primary-subtle text-primary rounded-circle d-inline-flex align-items-center justify-content-center me-2" style="width:32px;height:32px;font-size:13px;font-weight:bold;">
                            ${(r.ten_ncc || 'N').charAt(0).toUpperCase()}
                        </span>
                        <div>
                            <a href="javascript:void(0)" onclick="viewNCCHistory('${r.id}')" class="fw-bold text-primary text-decoration-none" title="Bấm xem lịch sử nhập hàng">
                                ${escapeHtml(r.ten_ncc)}
                            </a>
                            ${r.ghi_chu ? `<div class="text-muted small text-truncate" style="max-width:230px;">${escapeHtml(r.ghi_chu)}</div>` : ''}
                        </div>
                    </div>
                </td>
                <td>
                    ${r.dien_thoai ? `<a href="tel:${r.dien_thoai}" class="text-decoration-none text-dark fw-semibold"><i class="bi bi-telephone text-primary me-1"></i>${escapeHtml(r.dien_thoai)}</a>` : '<span class="text-muted">-</span>'}
                </td>
                <td>
                    ${r.dia_chi ? `<span class="text-truncate d-inline-block" style="max-width:250px;" title="${escapeHtml(r.dia_chi)}"><i class="bi bi-geo-alt text-danger me-1"></i>${escapeHtml(r.dia_chi)}</span>` : '<span class="text-muted">-</span>'}
                </td>
                <td>
                    ${r.email ? `<span class="text-truncate d-inline-block small" style="max-width:160px;"><i class="bi bi-envelope text-info me-1"></i>${escapeHtml(r.email)}</span>` : '<span class="text-muted">-</span>'}
                </td>
                <td class="text-end">
                    ${hasOrders 
                        ? `<button class="btn btn-sm btn-outline-primary font-monospace fw-bold py-1 px-2 text-nowrap" onclick="viewNCCHistory('${r.id}')" title="Xem lịch sử nhập hàng">
                             <i class="bi bi-box-arrow-in-down me-1"></i>${r.so_don_nhap} phiếu &bull; ${formatVND(r.tong_tien_nhap)}
                           </button>`
                        : `<span class="badge bg-light text-muted border py-1 px-2">Chưa có đơn</span>`
                    }
                </td>
                <td class="text-center text-nowrap">
                    <button class="btn btn-sm btn-primary me-1 px-2 py-1" onclick="viewNCCHistory('${r.id}')" title="Xem chi tiết lịch sử nhập hàng">
                        <i class="bi bi-clock-history me-1"></i>Lịch sử
                    </button>
                    <button class="btn btn-sm btn-outline-primary btn-icon me-1" onclick="openEditNCC('${r.id}')" title="Chỉnh sửa">
                        <i class="bi bi-pencil"></i>
                    </button>
                    <button class="btn btn-sm btn-outline-danger btn-icon" onclick="deleteNCC('${r.id}', '${escapeHtml(r.ten_ncc)}')" title="Xóa">
                        <i class="bi bi-trash"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

function openAddNCC() {
    editingNccId = null;
    document.getElementById('ncc-modal-title').textContent = 'Thêm Nhà Cung Cấp';
    document.getElementById('ncc-form').reset();
    openModal('ncc-modal');
}

async function openEditNCC(id) {
    editingNccId = id;
    const r = rawNCCList.find(x => x.id === id);
    if (!r) return;
    document.getElementById('ncc-modal-title').textContent = 'Chỉnh Sửa Nhà Cung Cấp';
    document.getElementById('ncc-ten').value = r.ten_ncc || '';
    document.getElementById('ncc-dia-chi').value = r.dia_chi || '';
    document.getElementById('ncc-dt').value = r.dien_thoai || '';
    document.getElementById('ncc-email').value = r.email || '';
    document.getElementById('ncc-ghi-chu').value = r.ghi_chu || '';
    openModal('ncc-modal');
}

async function saveNCC() {
    const body = {
        ten_ncc: document.getElementById('ncc-ten').value.trim(),
        dia_chi: document.getElementById('ncc-dia-chi').value.trim(),
        dien_thoai: document.getElementById('ncc-dt').value.trim(),
        email: document.getElementById('ncc-email').value.trim(),
        ghi_chu: document.getElementById('ncc-ghi-chu').value.trim(),
    };
    if (!body.ten_ncc) { showToast('Vui lòng nhập tên nhà cung cấp', 'error'); return; }
    try {
        showLoading();
        if (editingNccId) {
            await apiRequest(`/api/nha-cung-cap/${editingNccId}`, 'PUT', body);
            showToast('Cập nhật nhà cung cấp thành công');
        } else {
            await apiRequest('/api/nha-cung-cap', 'POST', body);
            showToast('Thêm nhà cung cấp thành công');
        }
        closeModal('ncc-modal');
        await loadNCC();
    } catch (e) { showToast(e.message, 'error'); }
    finally { hideLoading(); }
}

async function deleteNCC(id, name) {
    if (!confirmDelete(`Xóa nhà cung cấp "${name}"?`)) return;
    try {
        showLoading();
        await apiRequest(`/api/nha-cung-cap/${id}`, 'DELETE');
        showToast('Đã xóa nhà cung cấp');
        await loadNCC();
    } catch (e) { showToast(e.message, 'error'); }
    finally { hideLoading(); }
}

// ── Khách Hàng ────────────────────────────────────────────────────────────────

async function loadKH() {
    try {
        showLoading();
        const res = await apiRequest('/api/khach-hang');
        rawKHList = res.data || [];
        const badge = document.getElementById('kh-badge-count');
        if (badge) badge.textContent = rawKHList.length;
        filterKH();
    } catch (e) {
        showToast(e.message, 'error');
    } finally {
        hideLoading();
    }
}

function filterKH() {
    const search = (document.getElementById('kh-search-input')?.value || '').toLowerCase().trim();
    const status = document.getElementById('kh-filter-status')?.value || 'all';
    const sortBy = document.getElementById('kh-sort-by')?.value || 'default';

    let list = [...rawKHList];

    // Search filter
    if (search) {
        list = list.filter(r => {
            const text = `${r.ten_kh || ''} ${r.dien_thoai || ''} ${r.dia_chi || ''} ${r.email || ''} ${r.ghi_chu || ''}`.toLowerCase();
            return text.includes(search);
        });
    }

    // Status filter
    if (status === 'has_orders') {
        list = list.filter(r => (r.so_don_hang || 0) > 0);
    } else if (status === 'no_orders') {
        list = list.filter(r => (r.so_don_hang || 0) === 0);
    }

    // Sort
    if (sortBy === 'name_asc') {
        list.sort((a, b) => (a.ten_kh || '').localeCompare(b.ten_kh || '', 'vi'));
    } else if (sortBy === 'spent_desc') {
        list.sort((a, b) => (b.tong_tien_mua || 0) - (a.tong_tien_mua || 0));
    } else if (sortBy === 'orders_desc') {
        list.sort((a, b) => (b.so_don_hang || 0) - (a.so_don_hang || 0));
    }

    // Update counter
    const summaryEl = document.getElementById('kh-filter-summary');
    if (summaryEl) {
        summaryEl.textContent = `${list.length} / ${rawKHList.length} Khách Hàng`;
    }

    renderKHTable(list);
}

function clearKHSearch() {
    const input = document.getElementById('kh-search-input');
    if (input) input.value = '';
    filterKH();
}

function renderKHTable(records) {
    const tbody = document.getElementById('kh-tbody');
    if (!tbody) return;

    if (!records.length) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted py-4">Không tìm thấy khách hàng nào phù hợp</td></tr>';
        return;
    }

    tbody.innerHTML = records.map((r, i) => {
        const hasOrders = (r.so_don_hang || 0) > 0;
        return `
            <tr>
                <td class="text-center text-muted">${i + 1}</td>
                <td>
                    <div class="d-flex align-items-center">
                        <span class="avatar-sm bg-success-subtle text-success rounded-circle d-inline-flex align-items-center justify-content-center me-2" style="width:32px;height:32px;font-size:13px;font-weight:bold;">
                            ${(r.ten_kh || 'K').charAt(0).toUpperCase()}
                        </span>
                        <div>
                            <a href="javascript:void(0)" onclick="viewKHHistory('${r.id}')" class="fw-bold text-success text-decoration-none" title="Bấm xem lịch sử mua hàng">
                                ${escapeHtml(r.ten_kh)}
                            </a>
                            ${r.ghi_chu ? `<div class="text-muted small text-truncate" style="max-width:230px;">${escapeHtml(r.ghi_chu)}</div>` : ''}
                        </div>
                    </div>
                </td>
                <td>
                    ${r.dien_thoai ? `<a href="tel:${r.dien_thoai}" class="text-decoration-none text-dark fw-semibold"><i class="bi bi-telephone text-primary me-1"></i>${escapeHtml(r.dien_thoai)}</a>` : '<span class="text-muted">-</span>'}
                </td>
                <td>
                    ${r.dia_chi ? `<span class="text-truncate d-inline-block" style="max-width:250px;" title="${escapeHtml(r.dia_chi)}"><i class="bi bi-geo-alt text-danger me-1"></i>${escapeHtml(r.dia_chi)}</span>` : '<span class="text-muted">-</span>'}
                </td>
                <td>
                    ${r.email ? `<span class="text-truncate d-inline-block small" style="max-width:160px;"><i class="bi bi-envelope text-info me-1"></i>${escapeHtml(r.email)}</span>` : '<span class="text-muted">-</span>'}
                </td>
                <td class="text-end">
                    ${hasOrders 
                        ? `<button class="btn btn-sm btn-outline-success font-monospace fw-bold py-1 px-2 text-nowrap" onclick="viewKHHistory('${r.id}')" title="Xem lịch sử mua hàng">
                             <i class="bi bi-bag-check me-1"></i>${r.so_don_hang} đơn &bull; ${formatVND(r.tong_tien_mua)}
                           </button>`
                        : `<span class="badge bg-light text-muted border py-1 px-2">Chưa có đơn</span>`
                    }
                </td>
                <td class="text-center text-nowrap">
                    <button class="btn btn-sm btn-info text-white me-1 px-2 py-1" onclick="viewKHHistory('${r.id}')" title="Xem chi tiết lịch sử mua hàng">
                        <i class="bi bi-clock-history me-1"></i>Lịch sử
                    </button>
                    <button class="btn btn-sm btn-outline-primary btn-icon me-1" onclick="openEditKH('${r.id}')" title="Chỉnh sửa">
                        <i class="bi bi-pencil"></i>
                    </button>
                    <button class="btn btn-sm btn-outline-danger btn-icon" onclick="deleteKH('${r.id}', '${escapeHtml(r.ten_kh)}')" title="Xóa">
                        <i class="bi bi-trash"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

function openAddKH() {
    editingKhId = null;
    document.getElementById('kh-modal-title').textContent = 'Thêm Khách Hàng';
    document.getElementById('kh-form').reset();
    openModal('kh-modal');
}

async function openEditKH(id) {
    editingKhId = id;
    const r = rawKHList.find(x => x.id === id);
    if (!r) return;
    document.getElementById('kh-modal-title').textContent = 'Chỉnh Sửa Khách Hàng';
    document.getElementById('kh-ten').value = r.ten_kh || '';
    document.getElementById('kh-dia-chi').value = r.dia_chi || '';
    document.getElementById('kh-dt').value = r.dien_thoai || '';
    document.getElementById('kh-email').value = r.email || '';
    document.getElementById('kh-ghi-chu').value = r.ghi_chu || '';
    openModal('kh-modal');
}

async function saveKH() {
    const body = {
        ten_kh: document.getElementById('kh-ten').value.trim(),
        dia_chi: document.getElementById('kh-dia-chi').value.trim(),
        dien_thoai: document.getElementById('kh-dt').value.trim(),
        email: document.getElementById('kh-email').value.trim(),
        ghi_chu: document.getElementById('kh-ghi-chu').value.trim(),
    };
    if (!body.ten_kh) { showToast('Vui lòng nhập tên khách hàng', 'error'); return; }
    try {
        showLoading();
        if (editingKhId) {
            await apiRequest(`/api/khach-hang/${editingKhId}`, 'PUT', body);
            showToast('Cập nhật khách hàng thành công');
        } else {
            await apiRequest('/api/khach-hang', 'POST', body);
            showToast('Thêm khách hàng thành công');
        }
        closeModal('kh-modal');
        await loadKH();
    } catch (e) { showToast(e.message, 'error'); }
    finally { hideLoading(); }
}

async function deleteKH(id, name) {
    if (!confirmDelete(`Xóa khách hàng "${name}"?`)) return;
    try {
        showLoading();
        await apiRequest(`/api/khach-hang/${id}`, 'DELETE');
        showToast('Đã xóa khách hàng');
        await loadKH();
    } catch (e) { showToast(e.message, 'error'); }
    finally { hideLoading(); }
}

// ── Lịch Sử Giao Dịch Modal ───────────────────────────────────────────────────

let currentHistoryPartner = null;
let currentHistoryType = null; // 'KH' or 'NCC'

async function viewKHHistory(id) {
    try {
        showLoading();
        currentHistoryType = 'KH';
        const res = await apiRequest(`/api/khach-hang/${id}/lich-su`);
        const kh = res.khach_hang || {};
        const summary = res.summary || {};
        const phieuList = res.danh_sach_phieu || [];
        const itemsList = res.chi_tiet_hang || [];

        currentHistoryPartner = { type: 'KH', data: kh, summary };

        // Header info
        document.getElementById('history-modal-icon').className = 'bi bi-person-badge fs-4 text-success';
        document.getElementById('history-modal-title').textContent = `Lịch Sử Mua Hàng - ${kh.ten_kh}`;
        document.getElementById('history-modal-subtitle').textContent = `Lịch sử các phiếu xuất kho và toàn bộ sản phẩm khách hàng đã mua`;

        // Partner Profile
        document.getElementById('hist-partner-name').textContent = kh.ten_kh || 'Khách Hàng';
        document.getElementById('hist-partner-phone').textContent = kh.dien_thoai || 'Chưa có SĐT';
        document.getElementById('hist-partner-address').textContent = kh.dia_chi || 'Chưa có địa chỉ';
        document.getElementById('hist-partner-email').textContent = kh.email || 'Chưa có email';

        const noteWrap = document.getElementById('hist-partner-note-wrap');
        const noteEl = document.getElementById('hist-partner-note');
        if (kh.ghi_chu) {
            noteEl.textContent = kh.ghi_chu;
            noteWrap.style.display = 'block';
        } else {
            noteWrap.style.display = 'none';
        }

        // Summary stats
        document.getElementById('hist-stat-orders').textContent = summary.tong_so_phieu || 0;
        document.getElementById('hist-stat-qty').textContent = formatNumber(summary.tong_so_luong || 0);
        document.getElementById('hist-stat-amount').textContent = formatVND(summary.tong_tien_mua || 0);

        // Counts on tab headers
        document.getElementById('hist-receipt-count').textContent = phieuList.length;
        document.getElementById('hist-item-count').textContent = itemsList.length;

        // Render Receipts
        renderReceiptsList(phieuList, 'export');

        // Render Items
        renderItemsList(itemsList, 'gia_ban');

        // Reset to first tab
        const firstTab = document.getElementById('hist-tab-receipts');
        if (firstTab) {
            const triggerEl = new bootstrap.Tab(firstTab);
            triggerEl.show();
        }

        openModal('history-modal');
    } catch (e) {
        showToast(e.message, 'error');
    } finally {
        hideLoading();
    }
}

async function viewNCCHistory(id) {
    try {
        showLoading();
        currentHistoryType = 'NCC';
        const res = await apiRequest(`/api/nha-cung-cap/${id}/lich-su`);
        const ncc = res.nha_cung_cap || {};
        const summary = res.summary || {};
        const phieuList = res.danh_sach_phieu || [];
        const itemsList = res.chi_tiet_hang || [];

        currentHistoryPartner = { type: 'NCC', data: ncc, summary };

        // Header info
        document.getElementById('history-modal-icon').className = 'bi bi-truck fs-4 text-primary';
        document.getElementById('history-modal-title').textContent = `Lịch Sử Nhập Hàng - ${ncc.ten_ncc}`;
        document.getElementById('history-modal-subtitle').textContent = `Lịch sử các phiếu nhập kho và toàn bộ sản phẩm nhập từ nhà cung cấp`;

        // Partner Profile
        document.getElementById('hist-partner-name').textContent = ncc.ten_ncc || 'Nhà Cung Cấp';
        document.getElementById('hist-partner-phone').textContent = ncc.dien_thoai || 'Chưa có SĐT';
        document.getElementById('hist-partner-address').textContent = ncc.dia_chi || 'Chưa có địa chỉ';
        document.getElementById('hist-partner-email').textContent = ncc.email || 'Chưa có email';

        const noteWrap = document.getElementById('hist-partner-note-wrap');
        const noteEl = document.getElementById('hist-partner-note');
        if (ncc.ghi_chu) {
            noteEl.textContent = ncc.ghi_chu;
            noteWrap.style.display = 'block';
        } else {
            noteWrap.style.display = 'none';
        }

        // Summary stats
        document.getElementById('hist-stat-orders').textContent = summary.tong_so_phieu || 0;
        document.getElementById('hist-stat-qty').textContent = formatNumber(summary.tong_so_luong || 0);
        document.getElementById('hist-stat-amount').textContent = formatVND(summary.tong_tien_nhap || 0);

        // Counts on tab headers
        document.getElementById('hist-receipt-count').textContent = phieuList.length;
        document.getElementById('hist-item-count').textContent = itemsList.length;

        // Render Receipts
        renderReceiptsList(phieuList, 'import');

        // Render Items
        renderItemsList(itemsList, 'gia_nhap');

        // Reset to first tab
        const firstTab = document.getElementById('hist-tab-receipts');
        if (firstTab) {
            const triggerEl = new bootstrap.Tab(firstTab);
            triggerEl.show();
        }

        openModal('history-modal');
    } catch (e) {
        showToast(e.message, 'error');
    } finally {
        hideLoading();
    }
}

function renderReceiptsList(phieuList, type) {
    const tbody = document.getElementById('hist-tbody-receipts');
    if (!tbody) return;

    if (!phieuList || !phieuList.length) {
        tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted py-4">Chưa có giao dịch phiếu nào</td></tr>';
        return;
    }

    tbody.innerHTML = phieuList.map((p, i) => {
        const dateStr = formatDate(p.ngay_xuat || p.ngay_nhap);
        const viewAction = type === 'export'
            ? `viewExportReceiptDetail('${p.so_phieu}')`
            : `viewImportReceiptDetail('${p.so_phieu}')`;

        return `
            <tr>
                <td class="text-center text-muted">${i + 1}</td>
                <td>${dateStr}</td>
                <td><span class="badge bg-secondary font-monospace">${escapeHtml(p.so_phieu)}</span></td>
                <td class="text-center"><span class="badge bg-light text-dark border">${p.so_mat_hang} mặt hàng</span></td>
                <td class="text-center fw-bold">${formatNumber(p.tong_so_luong)}</td>
                <td class="text-end font-monospace fw-bold text-danger">${formatVND(p.tong_tien)}</td>
                <td><span class="small text-muted text-truncate d-inline-block" style="max-width:180px;">${escapeHtml(p.ghi_chu || '-')}</span></td>
                <td class="text-center">
                    <button class="btn btn-sm btn-outline-primary py-0 px-2" onclick="${viewAction}" title="Xem chi tiết phiếu">
                        <i class="bi bi-eye me-1"></i>Chi tiết
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

function renderItemsList(itemsList, priceField) {
    const tbody = document.getElementById('hist-tbody-items');
    if (!tbody) return;

    if (!itemsList || !itemsList.length) {
        tbody.innerHTML = '<tr><td colspan="9" class="text-center text-muted py-4">Chưa có mặt hàng nào</td></tr>';
        return;
    }

    tbody.innerHTML = itemsList.map((item, i) => {
        const dateStr = formatDate(item.ngay_xuat || item.ngay_nhap);
        const price = item[priceField] || item.gia_ban || item.gia_nhap || 0;

        return `
            <tr>
                <td class="text-center text-muted">${i + 1}</td>
                <td>${dateStr}</td>
                <td><span class="badge bg-secondary font-monospace">${escapeHtml(item.so_phieu)}</span></td>
                <td><span class="badge bg-light text-dark border font-monospace">${escapeHtml(item.ma_hang)}</span></td>
                <td><strong>${escapeHtml(item.ten_hang)}</strong></td>
                <td class="text-center text-muted">${escapeHtml(item.don_vi_tinh || 'Cái')}</td>
                <td class="text-center fw-bold">${formatNumber(item.so_luong)}</td>
                <td class="text-end font-monospace text-muted">${formatVND(price)}</td>
                <td class="text-end font-monospace fw-bold text-danger">${formatVND(item.thanh_tien)}</td>
            </tr>
        `;
    }).join('');
}

// ── Receipt Detail Previews ───────────────────────────────────────────────────

async function viewExportReceiptDetail(so_phieu) {
    try {
        showLoading();
        const res = await apiRequest(`/api/xuat-hang/${so_phieu}`);
        const p = res;
        const kh = p.khach_hang || {};
        const items = p.items || [];

        document.getElementById('receipt-modal-title').innerHTML = `
            <i class="bi bi-journal-arrow-up text-danger me-2"></i>Phiếu Xuất Kho: <span class="font-monospace text-danger">${p.so_phieu}</span>
        `;

        const body = document.getElementById('receipt-modal-body');
        body.innerHTML = `
            <div class="row mb-3 bg-light p-3 rounded">
                <div class="col-md-6">
                    <p class="mb-1"><strong>Khách hàng:</strong> <span class="text-primary fw-bold">${escapeHtml(kh.ten_kh || '-')}</span></p>
                    <p class="mb-1"><strong>Điện thoại:</strong> ${escapeHtml(kh.dien_thoai || '-')}</p>
                    <p class="mb-0"><strong>Địa chỉ:</strong> ${escapeHtml(kh.dia_chi || '-')}</p>
                </div>
                <div class="col-md-6 text-md-end mt-2 mt-md-0">
                    <p class="mb-1"><strong>Ngày xuất:</strong> ${formatDate(p.ngay_xuat)}</p>
                    <p class="mb-1"><strong>Số mặt hàng:</strong> ${p.so_mat_hang} loại (${p.tong_so_luong} sản phẩm)</p>
                    <p class="mb-0"><strong>Ghi chú:</strong> ${escapeHtml(p.ghi_chu || '-')}</p>
                </div>
            </div>
            <div class="table-responsive border rounded mb-3">
                <table class="table table-bordered table-sm mb-0">
                    <thead style="background-color: #1e293b !important; color: #ffffff !important;">
                        <tr>
                            <th class="text-center" style="width: 40px; background-color: #1e293b !important; color: #ffffff !important;">STT</th>
                            <th style="width: 100px; background-color: #1e293b !important; color: #ffffff !important;">Mã Hàng</th>
                            <th style="background-color: #1e293b !important; color: #ffffff !important;">Tên Hàng Hóa</th>
                            <th class="text-center" style="width: 60px; background-color: #1e293b !important; color: #ffffff !important;">ĐVT</th>
                            <th class="text-center" style="width: 70px; background-color: #1e293b !important; color: #ffffff !important;">SL</th>
                            <th class="text-end" style="width: 130px; background-color: #1e293b !important; color: #ffffff !important;">Đơn Giá</th>
                            <th class="text-end" style="width: 140px; background-color: #1e293b !important; color: #ffffff !important;">Thành Tiền</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${items.map((it, idx) => `
                            <tr>
                                <td class="text-center text-muted">${idx + 1}</td>
                                <td><span class="badge bg-light text-dark border font-monospace">${escapeHtml(it.ma_hang)}</span></td>
                                <td><strong>${escapeHtml(it.ten_hang)}</strong></td>
                                <td class="text-center text-muted">${escapeHtml(it.don_vi_tinh || 'Cái')}</td>
                                <td class="text-center fw-bold">${it.so_luong}</td>
                                <td class="text-end font-monospace">${formatVND(it.gia_ban)}</td>
                                <td class="text-end font-monospace fw-bold text-danger">${formatVND(it.thanh_tien)}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                    <tfoot>
                        <tr class="table-light fw-bold">
                            <td colspan="4" class="text-end">TỔNG CỘNG:</td>
                            <td class="text-center">${p.tong_so_luong}</td>
                            <td></td>
                            <td class="text-end text-danger font-monospace fs-6" style="white-space:nowrap;min-width:160px;">${formatVND(p.total)}</td>
                        </tr>
                    </tfoot>
                </table>
            </div>
        `;

        openModal('receipt-detail-modal');
    } catch (e) {
        showToast(e.message, 'error');
    } finally {
        hideLoading();
    }
}

async function viewImportReceiptDetail(so_phieu) {
    try {
        showLoading();
        const res = await apiRequest(`/api/nhap-hang/${so_phieu}`);
        const p = res;
        const ncc = p.nha_cung_cap || {};
        const items = p.items || [];

        document.getElementById('receipt-modal-title').innerHTML = `
            <i class="bi bi-journal-arrow-down text-primary me-2"></i>Phiếu Nhập Kho: <span class="font-monospace text-primary">${p.so_phieu}</span>
        `;

        const body = document.getElementById('receipt-modal-body');
        body.innerHTML = `
            <div class="row mb-3 bg-light p-3 rounded">
                <div class="col-md-6">
                    <p class="mb-1"><strong>Nhà cung cấp:</strong> <span class="text-primary fw-bold">${escapeHtml(ncc.ten_ncc || '-')}</span></p>
                    <p class="mb-1"><strong>Điện thoại:</strong> ${escapeHtml(ncc.dien_thoai || '-')}</p>
                    <p class="mb-0"><strong>Địa chỉ:</strong> ${escapeHtml(ncc.dia_chi || '-')}</p>
                </div>
                <div class="col-md-6 text-md-end mt-2 mt-md-0">
                    <p class="mb-1"><strong>Ngày nhập:</strong> ${formatDate(p.ngay_nhap)}</p>
                    <p class="mb-1"><strong>Số mặt hàng:</strong> ${p.so_mat_hang} loại (${p.tong_so_luong} sản phẩm)</p>
                    <p class="mb-0"><strong>Ghi chú:</strong> ${escapeHtml(p.ghi_chu || '-')}</p>
                </div>
            </div>
            <div class="table-responsive border rounded mb-3">
                <table class="table table-bordered table-sm mb-0">
                    <thead style="background-color: #1e293b !important; color: #ffffff !important;">
                        <tr>
                            <th class="text-center" style="width: 40px; background-color: #1e293b !important; color: #ffffff !important;">STT</th>
                            <th style="width: 100px; background-color: #1e293b !important; color: #ffffff !important;">Mã Hàng</th>
                            <th style="background-color: #1e293b !important; color: #ffffff !important;">Tên Hàng Hóa</th>
                            <th class="text-center" style="width: 60px; background-color: #1e293b !important; color: #ffffff !important;">ĐVT</th>
                            <th class="text-center" style="width: 70px; background-color: #1e293b !important; color: #ffffff !important;">SL</th>
                            <th class="text-end" style="width: 130px; background-color: #1e293b !important; color: #ffffff !important;">Đơn Giá</th>
                            <th class="text-end" style="width: 140px; background-color: #1e293b !important; color: #ffffff !important;">Thành Tiền</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${items.map((it, idx) => `
                            <tr>
                                <td class="text-center text-muted">${idx + 1}</td>
                                <td><span class="badge bg-light text-dark border font-monospace">${escapeHtml(it.ma_hang)}</span></td>
                                <td><strong>${escapeHtml(it.ten_hang)}</strong></td>
                                <td class="text-center text-muted">${escapeHtml(it.don_vi_tinh || 'Cái')}</td>
                                <td class="text-center fw-bold">${it.so_luong}</td>
                                <td class="text-end font-monospace">${formatVND(it.gia_nhap)}</td>
                                <td class="text-end font-monospace fw-bold text-primary">${formatVND(it.thanh_tien)}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                    <tfoot>
                        <tr class="table-light fw-bold">
                            <td colspan="4" class="text-end">TỔNG CỘNG:</td>
                            <td class="text-center">${p.tong_so_luong}</td>
                            <td></td>
                            <td class="text-end text-primary font-monospace fs-6" style="white-space:nowrap;min-width:160px;">${formatVND(p.total)}</td>
                        </tr>
                    </tfoot>
                </table>
            </div>
        `;

        openModal('receipt-detail-modal');
    } catch (e) {
        showToast(e.message, 'error');
    } finally {
        hideLoading();
    }
}

function printPartnerHistory() {
    printReceiptModal('history-modal-body', 'Lịch Sử Giao Dịch Đối Tác');
}

function exportSuppliersExcel() {
    if (!rawNCCList || !rawNCCList.length) {
        showToast('Không có dữ liệu Nhà cung cấp để xuất Excel!', 'info');
        return;
    }

    let totalReceipts = 0;
    let totalMoney = 0;

    const rows = rawNCCList.map((n, idx) => {
        const phieuCount = parseInt(n.tong_so_phieu) || 0;
        const tienNhap = parseFloat(n.tong_gia_tri) || 0;
        totalReceipts += phieuCount;
        totalMoney += tienNhap;

        return [
            idx + 1,
            n.ten_ncc,
            n.dien_thoai || '',
            n.dia_chi || '',
            n.email || '',
            phieuCount,
            tienNhap,
            n.ghi_chu || ''
        ];
    });

    const summaryRow = ['TỔNG CỘNG', '', '', '', '', totalReceipts, totalMoney, ''];

    const now = new Date();
    const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;

    exportReportToExcel({
        title: 'DANH SÁCH NHÀ CUNG CẤP & ĐỐI TÁC HÀNG HÓA',
        subInfo: `Tổng số: ${rawNCCList.length} nhà cung cấp đối tác`,
        headers: ['STT', 'Tên Nhà Cung Cấp', 'Điện Thoại', 'Địa Chỉ', 'Email', 'Số Phiếu Nhập', 'Tổng Tiền Nhập (đ)', 'Ghi Chú'],
        rows,
        summaryRow,
        fileName: `Danh_Sach_Nha_Cung_Cap_${dateStr}.xlsx`,
        sheetName: 'NhaCungCap'
    });
}

function exportCustomersExcel() {
    if (!rawKHList || !rawKHList.length) {
        showToast('Không có dữ liệu Khách hàng để xuất Excel!', 'info');
        return;
    }

    let totalOrders = 0;
    let totalMoney = 0;

    const rows = rawKHList.map((k, idx) => {
        const orderCount = parseInt(k.tong_so_phieu) || 0;
        const tienMua = parseFloat(k.tong_gia_tri) || 0;
        totalOrders += orderCount;
        totalMoney += tienMua;

        return [
            idx + 1,
            k.ten_kh,
            k.dien_thoai || '',
            k.dia_chi || '',
            k.email || '',
            orderCount,
            tienMua,
            k.ghi_chu || ''
        ];
    });

    const summaryRow = ['TỔNG CỘNG', '', '', '', '', totalOrders, totalMoney, ''];

    const now = new Date();
    const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;

    exportReportToExcel({
        title: 'DANH SÁCH KHÁCH HÀNG & LỊCH SỬ MUA HÀNG',
        subInfo: `Tổng số: ${rawKHList.length} khách hàng trong hệ thống`,
        headers: ['STT', 'Tên Khách Hàng', 'Điện Thoại', 'Địa Chỉ', 'Email', 'Số Đơn Mua', 'Tổng Tiền Mua (đ)', 'Ghi Chú'],
        rows,
        summaryRow,
        fileName: `Danh_Sach_Khach_Hang_${dateStr}.xlsx`,
        sheetName: 'KhachHang'
    });
}

// ── Initial Load ─────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
    loadNCC();
    loadKH();
});
