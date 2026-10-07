/**
 * dong_tien.js - Quản lý Dòng Tiền & Sổ Quỹ Doanh Nghiệp
 * Chuẩn định dạng giao diện tương đồng Bảng Xuất/Nhập Kho & Báo Cáo Kế Toán
 */

let allTransactions = [];
let filteredTransactions = [];
let currentLoaiPhieuFilter = ''; // '' (Tất cả), 'THU', 'CHI'
let quyBalanceData = null;

function getCurrentMonthStr() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
}

// ── Bộ Lọc Ngày Tháng (Kỳ Báo Cáo) & Tải Dữ Liệu Sổ Quỹ ──────────────────────

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

    loadSoQuy();
}

function onDateRangeChanged() {
    document.querySelectorAll('.date-range-presets .btn').forEach(b => b.classList.remove('active'));
    currentFromDate = document.getElementById('filter-from-date')?.value || '';
    currentToDate = document.getElementById('filter-to-date')?.value || '';
    if (currentFromDate && currentToDate && currentFromDate <= currentToDate) {
        loadSoQuy();
    }
}

function applyDateFilter() {
    currentFromDate = document.getElementById('filter-from-date')?.value || '';
    currentToDate = document.getElementById('filter-to-date')?.value || '';
    loadSoQuy();
}

async function loadSoQuy(silent = false) {
    try {
        const tbody = document.getElementById('tbody-so-quy');
        if (!silent && tbody) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="10" class="text-center text-muted py-4">
                        <div class="spinner-border spinner-border-sm text-primary me-2"></div> Đang tải sổ quỹ...
                    </td>
                </tr>
            `;
        }

        let url = '/api/dong-tien/tong-quan?';
        if (currentFromDate) url += `from_date=${encodeURIComponent(currentFromDate)}&`;
        if (currentToDate) url += `to_date=${encodeURIComponent(currentToDate)}&`;

        const res = await apiRequest(url);
        if (res && res.success) {
            // Cập nhật số dư thực tế của cửa hàng
            const tm = res.tien_mat || 0;
            const tg = res.tien_gui || 0;
            const tq = res.tong_quy || 0;

            const cardTm = document.getElementById('card-tien-mat');
            if (cardTm) cardTm.innerText = formatVND(tm);

            const cardTg = document.getElementById('card-tien-gui');
            if (cardTg) cardTg.innerText = formatVND(tg);

            const cardTq = document.getElementById('card-tong-quy');
            if (cardTq) cardTq.innerText = formatVND(tq);

            allTransactions = res.transactions || [];
            filterAndRenderSoQuy();
        }
    } catch (e) {
        if (!silent) {
            showToast('Lỗi tải dữ liệu dòng tiền: ' + e.message, 'error');
        }
    }
}

// ── Bộ Lọc & Tìm Kiếm ────────────────────────────────────────────────────────

function setLoaiPhieuFilter(type) {
    currentLoaiPhieuFilter = type;

    // Cập nhật giao diện tabs
    const btnAll = document.getElementById('btn-tab-all');
    const btnThu = document.getElementById('btn-tab-thu');
    const btnChi = document.getElementById('btn-tab-chi');

    if (btnAll) btnAll.className = `btn btn-sm ${type === '' ? 'btn-primary active text-white fw-semibold' : 'btn-outline-primary'}`;
    if (btnThu) btnThu.className = `btn btn-sm ${type === 'THU' ? 'btn-success active text-white fw-semibold' : 'btn-outline-success'}`;
    if (btnChi) btnChi.className = `btn btn-sm ${type === 'CHI' ? 'btn-danger active text-white fw-semibold' : 'btn-outline-danger'}`;

    filterAndRenderSoQuy();
}

function clearMonthFilter() {
    const input = document.getElementById('filter-month');
    if (input) input.value = '';
    loadSoQuy();
}

function clearSearch() {
    const input = document.getElementById('search-input');
    if (input) input.value = '';
    filterAndRenderSoQuy();
}

function filterAndRenderSoQuy() {
    const loaiQuy = document.getElementById('filter-loai-quy')?.value || '';
    const q = (document.getElementById('search-input')?.value || '').toLowerCase().trim();

    filteredTransactions = allTransactions.filter(item => {
        if (currentLoaiPhieuFilter && item.loai_phieu !== currentLoaiPhieuFilter) return false;
        if (loaiQuy && item.loai_quy !== loaiQuy) return false;
        if (q) {
            const str = `${item.ma_phieu} ${item.doi_tuong} ${item.dien_thoai} ${item.phieu_lien_quan} ${item.ghi_chu} ${item.so_tien}`.toLowerCase();
            if (!str.includes(q)) return false;
        }
        return true;
    });

    renderSoQuyStats();
    renderSoQuyTable();
}

// ── Render Thống Kê & Bảng Sổ Quỹ ──────────────────────────────────────────

function renderSoQuyStats() {
    let totalThu = 0;
    let totalChi = 0;
    let countThu = 0;
    let countChi = 0;

    filteredTransactions.forEach(t => {
        const amt = parseFloat(t.so_tien) || 0;
        if (t.loai_phieu === 'THU') {
            totalThu += amt;
            countThu++;
        } else if (t.loai_phieu === 'CHI') {
            totalChi += amt;
            countChi++;
        }
    });

    const netAmount = totalThu - totalChi;

    // Stat Cards trên đầu (chuẩn theo Image 1)
    const statCount = document.getElementById('stat-count');
    if (statCount) statCount.innerText = formatNumber(filteredTransactions.length);

    const statThu = document.getElementById('stat-thu');
    if (statThu) statThu.innerText = formatVND(totalThu);

    const statChi = document.getElementById('stat-chi');
    if (statChi) statChi.innerText = formatVND(totalChi);

    const statNet = document.getElementById('stat-net');
    if (statNet) {
        statNet.innerText = (netAmount >= 0 ? '+ ' : '- ') + formatVND(Math.abs(netAmount));
        statNet.className = `fs-3 fw-bold font-monospace mt-1 ${netAmount >= 0 ? 'text-info' : 'text-danger'}`;
    }

    const totalBadge = document.getElementById('total-count');
    if (totalBadge) totalBadge.innerText = filteredTransactions.length;

    // Footer tổng kết
    const tfoot = document.getElementById('so-quy-tfoot');
    if (filteredTransactions.length > 0) {
        if (tfoot) tfoot.style.display = '';
        const tfThu = document.getElementById('tf-thu');
        if (tfThu) tfThu.innerText = formatVND(totalThu);

        const tfChi = document.getElementById('tf-chi');
        if (tfChi) tfChi.innerText = formatVND(totalChi);

        const tfNet = document.getElementById('tf-net');
        if (tfNet) {
            tfNet.innerText = (netAmount >= 0 ? '+ ' : '- ') + formatVND(Math.abs(netAmount));
            tfNet.className = `text-end fs-5 font-monospace text-nowrap ${netAmount >= 0 ? 'text-primary' : 'text-danger'}`;
        }
    } else {
        if (tfoot) tfoot.style.display = 'none';
    }
}

function renderSoQuyTable() {
    const tbody = document.getElementById('tbody-so-quy');
    if (!tbody) return;

    if (!filteredTransactions || filteredTransactions.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="10" class="text-center py-5 text-muted">
                    <i class="bi bi-inbox fs-2 d-block text-secondary mb-2"></i>
                    Không có giao dịch thu / chi nào phù hợp
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = filteredTransactions.map((item, idx) => {
        const isThu = item.loai_phieu === 'THU';
        const typeBadge = isThu
            ? '<span class="badge bg-success">PHIẾU THU</span>'
            : '<span class="badge bg-danger">PHIẾU CHI</span>';

        const quyBadge = item.loai_quy === 'TIEN_MAT'
            ? '<span class="badge bg-light text-dark border"><i class="bi bi-cash me-1"></i>Tiền mặt</span>'
            : '<span class="badge bg-info-subtle text-info-emphasis border border-info"><i class="bi bi-bank me-1"></i>Ngân hàng</span>';

        const amountColor = isThu ? 'text-success' : 'text-danger';
        const sign = isThu ? '+' : '-';

        const phoneHtml = item.dien_thoai
            ? `<div class="text-muted small font-monospace"><i class="bi bi-telephone me-1 text-primary"></i>${escapeHtml(item.dien_thoai)}</div>`
            : '';

        let phieuLqHtml = '<span class="text-muted small">Thu/Chi tự do</span>';
        if (item.phieu_lien_quan && String(item.phieu_lien_quan).trim()) {
            const plq = String(item.phieu_lien_quan).trim();
            const isXuat = plq.startsWith('XH');
            const isNhap = plq.startsWith('NH');
            if (isXuat || isNhap) {
                const btnColor = isXuat ? 'text-danger' : 'text-primary';
                phieuLqHtml = `
                    <button class="btn btn-sm btn-link p-0 ${btnColor} fw-bold font-monospace text-decoration-none" onclick="viewRelatedInvoice('${escapeHtml(plq)}')">
                        <i class="bi bi-receipt me-1"></i>${escapeHtml(plq)}
                    </button>
                `;
            } else {
                phieuLqHtml = `<span class="badge bg-light text-secondary border font-monospace">${escapeHtml(plq)}</span>`;
            }
        }

        const maPhieuColor = isThu ? 'text-success' : 'text-danger';

        return `
            <tr>
                <td class="text-center text-muted small">${idx + 1}</td>
                <td><span class="badge bg-light text-secondary border font-monospace">${formatDate(item.ngay)}</span></td>
                <td>
                    <button class="btn btn-sm btn-link p-0 ${maPhieuColor} fw-bold font-monospace text-decoration-none" onclick="viewThuChiDetail('${item.id}', '${item.loai_phieu}')">
                        <i class="bi bi-file-earmark-text me-1"></i>${escapeHtml(item.ma_phieu)}
                    </button>
                </td>
                <td class="text-center">${typeBadge}</td>
                <td class="text-center">${quyBadge}</td>
                <td>
                    <div class="fw-bold text-dark text-truncate" style="max-width: 210px;" title="${escapeHtml(item.doi_tuong)}">${escapeHtml(item.doi_tuong)}</div>
                    ${phoneHtml}
                </td>
                <td>${phieuLqHtml}</td>
                <td class="text-end fw-bold font-monospace ${amountColor} text-nowrap" style="white-space: nowrap;">
                    ${sign} ${formatVND(item.so_tien)}
                </td>
                <td class="small">
                    <div class="text-truncate" style="max-width: 280px;" title="${escapeHtml(item.ghi_chu || '')}">
                        ${escapeHtml(item.ghi_chu || '—')}
                    </div>
                </td>
                <td class="text-center no-print">
                    <div class="d-flex justify-content-center gap-1">
                        <button class="btn btn-xs btn-outline-primary btn-sm" onclick="viewThuChiDetail('${item.id}', '${item.loai_phieu}')" title="Xem chi tiết & in phiếu">
                            <i class="bi bi-eye"></i>
                        </button>
                        <button class="btn btn-xs btn-outline-danger btn-sm" onclick="deleteReceipt('${item.id}', '${item.ma_phieu}', '${item.loai_phieu}')" title="Xóa phiếu">
                            <i class="bi bi-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

// ── Xem Chi Tiết & Chỉnh Sửa & In Phiếu Thu/Chi ────────────────────────────

window.currentThuChiRecord = null;
window.initialThuChiData = null;
window.isThuChiDetailDirty = false;

async function viewThuChiDetail(recordId, loaiPhieu) {
    try {
        let item = allTransactions.find(x => String(x.id) === String(recordId));
        if (!item) {
            const res = await apiRequest(`/api/so-quy/${encodeURIComponent(recordId)}`);
            if (res && res.success) item = res.data;
        }
        if (!item) {
            showToast('Không tìm thấy thông tin phiếu!', 'error');
            return;
        }

        window.currentThuChiRecord = { ...item };
        window.initialThuChiData = { ...item };
        resetThuChiClean();

        const isThu = (item.loai_phieu || loaiPhieu) === 'THU';
        const titleEl = document.getElementById('detail-thuchi-title');
        if (titleEl) {
            titleEl.innerText = `${isThu ? 'Chi Tiết Phiếu Thu' : 'Chi Tiết Phiếu Chi'}: ${item.ma_phieu}`;
        }

        const headerEl = document.getElementById('detail-thuchi-header');
        if (headerEl) {
            headerEl.className = `modal-header py-2 text-white ${isThu ? 'bg-success' : 'bg-danger'}`;
        }

        const amountClass = isThu ? 'text-success' : 'text-danger';
        const partnerLabel = isThu ? 'Người / Đơn Vị Nộp Tiền' : 'Người / Đơn Vị Nhận Tiền';
        const relatedLabel = isThu ? 'Phiếu Xuất Liên Quan' : 'Phiếu Nhập Liên Quan';
        const docTitle = isThu ? 'PHIẾU THU TIỀN' : 'PHIẾU CHI TIỀN';

        const modalBody = document.getElementById('detail-thuchi-body');
        if (modalBody) {
            modalBody.innerHTML = `
                <!-- Khung tiêu đề phiếu -->
                <div class="card bg-light border-0 mb-3 shadow-none">
                    <div class="card-body p-3">
                        <div class="d-flex justify-content-between align-items-center flex-wrap gap-2 pb-2 border-bottom">
                            <div class="d-flex align-items-center gap-2">
                                <span class="badge ${isThu ? 'bg-success' : 'bg-danger'} fs-6 px-3 py-1 font-monospace">
                                    ${escapeHtml(item.ma_phieu)}
                                </span>
                                <span class="badge ${isThu ? 'bg-success-subtle text-success border border-success' : 'bg-danger-subtle text-danger border border-danger'}">
                                    ${isThu ? 'PHIẾU THU' : 'PHIẾU CHI'}
                                </span>
                            </div>
                            <div class="text-end">
                                <span class="text-muted small me-1">Số tiền:</span>
                                <span class="fs-4 fw-bold ${amountClass} font-monospace" id="edit-thuchi-so-tien-preview">
                                    ${formatVND(item.so_tien)}
                                </span>
                            </div>
                        </div>

                        <!-- Form chỉnh sửa thông tin phiếu -->
                        <div class="row g-2 pt-2">
                            <div class="col-md-6">
                                <label class="form-label small fw-semibold text-muted mb-1">
                                    <i class="bi bi-calendar3 me-1"></i>Ngày ${isThu ? 'Thu' : 'Chi'} <span class="text-danger">*</span>
                                </label>
                                <input type="date" id="edit-thuchi-ngay" class="form-control form-control-sm font-monospace fw-semibold" value="${item.ngay || ''}" onchange="checkThuChiDirty()">
                            </div>
                            <div class="col-md-6">
                                <label class="form-label small fw-semibold text-muted mb-1">
                                    <i class="bi bi-credit-card me-1"></i>Hình Thức Thanh Toán <span class="text-danger">*</span>
                                </label>
                                <select id="edit-thuchi-loai-quy" class="form-select form-select-sm" onchange="checkThuChiDirty()">
                                    <option value="TIEN_MAT" ${item.loai_quy === 'TIEN_MAT' ? 'selected' : ''}>Tiền mặt (Két tiền)</option>
                                    <option value="NGAN_HANG" ${item.loai_quy === 'NGAN_HANG' ? 'selected' : ''}>Tiền gửi ngân hàng (Chuyển khoản)</option>
                                </select>
                            </div>

                            <div class="col-md-7">
                                <label class="form-label small fw-semibold text-muted mb-1">
                                    <i class="bi bi-person me-1"></i>${partnerLabel} <span class="text-danger">*</span>
                                </label>
                                <input type="text" id="edit-thuchi-doi-tuong" class="form-control form-control-sm fw-bold text-dark" value="${escapeHtml(item.doi_tuong || '')}" placeholder="Tên đối tượng..." oninput="checkThuChiDirty()">
                            </div>
                            <div class="col-md-5">
                                <label class="form-label small fw-semibold text-muted mb-1">
                                    <i class="bi bi-telephone me-1"></i>Số Điện Thoại
                                </label>
                                <input type="text" id="edit-thuchi-dien-thoai" class="form-control form-control-sm font-monospace" value="${escapeHtml(item.dien_thoai || '')}" placeholder="Số điện thoại..." oninput="checkThuChiDirty()">
                            </div>

                            <div class="col-md-6">
                                <label class="form-label small fw-semibold text-muted mb-1">
                                    <i class="bi bi-receipt me-1"></i>${relatedLabel}
                                </label>
                                <input type="text" id="edit-thuchi-phieu-lq" class="form-control form-control-sm font-monospace fw-semibold ${item.phieu_lien_quan && item.phieu_lien_quan.startsWith('XH') ? 'text-danger' : 'text-primary'}" value="${escapeHtml(item.phieu_lien_quan || '')}" placeholder="Ví dụ: XH1003/10 (hoặc để trống)" oninput="checkThuChiDirty()">
                            </div>
                            <div class="col-md-6">
                                <label class="form-label small fw-semibold text-muted mb-1">
                                    <i class="bi bi-cash-coin me-1"></i>Số Tiền (VNĐ) <span class="text-danger">*</span>
                                </label>
                                <input type="number" min="1" step="1000" id="edit-thuchi-so-tien" class="form-control form-control-sm fs-6 fw-bold font-monospace ${amountClass}" value="${item.so_tien || 0}" oninput="onEditSoTienInput(this)">
                            </div>

                            <div class="col-12">
                                <label class="form-label small fw-semibold text-muted mb-1">
                                    <i class="bi bi-chat-left-text me-1"></i>Nội Dung / Ghi Chú
                                </label>
                                <textarea id="edit-thuchi-ghi-chu" class="form-control form-control-sm" rows="2" placeholder="Ghi chú nội dung thu chi..." oninput="checkThuChiDirty()">${escapeHtml(item.ghi_chu || '')}</textarea>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Vùng in phiếu chuẩn khổ giấy (ẩn trên giao diện, chỉ hiển thị khi in) -->
                <div class="d-none" id="printable-thuchi-container"></div>
            `;
        }

        // Cập nhật nút in & xóa
        const btnPrint = document.getElementById('btn-print-thuchi-detail');
        if (btnPrint) {
            btnPrint.onclick = () => printCurrentThuChiReceipt(docTitle);
        }

        const btnDelete = document.getElementById('btn-delete-thuchi-detail');
        if (btnDelete) {
            btnDelete.onclick = () => {
                deleteReceipt(item.id, item.ma_phieu, item.loai_phieu, () => {
                    window.isThuChiDetailDirty = false;
                    const modalEl = document.getElementById('modal-detail-thuchi');
                    if (modalEl) {
                        const bsModal = bootstrap.Modal.getInstance(modalEl);
                        if (bsModal) bsModal.hide();
                    }
                });
            };
        }

        setupThuChiModalUnsavedHook('modal-detail-thuchi');

        const modalEl = document.getElementById('modal-detail-thuchi');
        if (modalEl) {
            let bsModal = bootstrap.Modal.getInstance(modalEl);
            if (!bsModal) bsModal = new bootstrap.Modal(modalEl);
            bsModal.show();
        }
    } catch (e) {
        showToast('Lỗi hiển thị chi tiết phiếu: ' + e.message, 'error');
    }
}

function onEditSoTienInput(input) {
    const val = parseFloat(input.value || 0) || 0;
    const previewEl = document.getElementById('edit-thuchi-so-tien-preview');
    if (previewEl) {
        previewEl.innerText = formatVND(val);
    }
    checkThuChiDirty();
}

function checkThuChiDirty() {
    if (!window.initialThuChiData) return;
    const init = window.initialThuChiData;

    const curNgay = document.getElementById('edit-thuchi-ngay')?.value || '';
    const curLoaiQuy = document.getElementById('edit-thuchi-loai-quy')?.value || '';
    const curDoiTuong = document.getElementById('edit-thuchi-doi-tuong')?.value.trim() || '';
    const curSdt = document.getElementById('edit-thuchi-dien-thoai')?.value.trim() || '';
    const curPhieuLq = document.getElementById('edit-thuchi-phieu-lq')?.value.trim() || '';
    const curSoTien = parseFloat(document.getElementById('edit-thuchi-so-tien')?.value || 0) || 0;
    const curGhiChu = document.getElementById('edit-thuchi-ghi-chu')?.value.trim() || '';

    const isDirty = (
        curNgay !== (init.ngay || '') ||
        curLoaiQuy !== (init.loai_quy || '') ||
        curDoiTuong !== (init.doi_tuong || '').trim() ||
        curSdt !== (init.dien_thoai || '').trim() ||
        curPhieuLq !== (init.phieu_lien_quan || '').trim() ||
        curSoTien !== (parseFloat(init.so_tien || 0) || 0) ||
        curGhiChu !== (init.ghi_chu || '').trim()
    );

    if (isDirty) {
        markThuChiDirty();
    } else {
        resetThuChiClean();
    }
}

function markThuChiDirty() {
    window.isThuChiDetailDirty = true;
    const saveBtn = document.getElementById('btn-save-thuchi-detail');
    if (saveBtn) {
        saveBtn.className = 'btn btn-success btn-sm fw-bold shadow px-3';
        saveBtn.disabled = false;
        saveBtn.innerHTML = '<i class="bi bi-floppy2-fill me-1"></i>Lưu thay đổi';
    }
}

function resetThuChiClean() {
    window.isThuChiDetailDirty = false;
    const saveBtn = document.getElementById('btn-save-thuchi-detail');
    if (saveBtn) {
        saveBtn.className = 'btn btn-secondary btn-sm opacity-50 px-3';
        saveBtn.disabled = true;
        saveBtn.innerHTML = '<i class="bi bi-floppy2 me-1"></i>Lưu thay đổi';
    }
}

async function saveThuChiDetail(shouldCloseAfterSave = false) {
    if (!window.currentThuChiRecord) return;
    const item = window.currentThuChiRecord;

    const curNgay = document.getElementById('edit-thuchi-ngay')?.value || '';
    const curLoaiQuy = document.getElementById('edit-thuchi-loai-quy')?.value || '';
    const curDoiTuong = document.getElementById('edit-thuchi-doi-tuong')?.value.trim() || '';
    const curSdt = document.getElementById('edit-thuchi-dien-thoai')?.value.trim() || '';
    const curPhieuLq = document.getElementById('edit-thuchi-phieu-lq')?.value.trim() || '';
    const curSoTien = parseFloat(document.getElementById('edit-thuchi-so-tien')?.value || 0) || 0;
    const curGhiChu = document.getElementById('edit-thuchi-ghi-chu')?.value.trim() || '';

    if (!curDoiTuong) {
        showToast('Vui lòng nhập tên người / đơn vị!', 'warning');
        return;
    }
    if (curSoTien <= 0) {
        showToast('Số tiền phải lớn hơn 0!', 'warning');
        return;
    }
    if (!curNgay) {
        showToast('Vui lòng chọn ngày thu/chi!', 'warning');
        return;
    }

    const saveBtn = document.getElementById('btn-save-thuchi-detail');
    const origHtml = saveBtn ? saveBtn.innerHTML : '';
    if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Đang lưu...';
    }

    try {
        showLoading();
        const payload = {
            ngay: curNgay,
            loai_quy: curLoaiQuy,
            doi_tuong: curDoiTuong,
            dien_thoai: curSdt,
            phieu_lien_quan: curPhieuLq,
            so_tien: curSoTien,
            ghi_chu: curGhiChu
        };

        const res = await apiRequest(`/api/so-quy/${encodeURIComponent(item.id)}`, 'PUT', payload);
        if (res && res.success) {
            showToast(res.message || `Đã lưu cập nhật phiếu ${item.ma_phieu} thành công!`, 'success');

            const updatedData = res.data || { ...item, ...payload };
            window.initialThuChiData = { ...updatedData };
            window.currentThuChiRecord = { ...updatedData };
            resetThuChiClean();

            // Cập nhật mảng local & render lại bảng tức thì
            const idx = allTransactions.findIndex(x => String(x.id) === String(item.id));
            if (idx >= 0) {
                allTransactions[idx] = updatedData;
            }
            filterAndRenderSoQuy();

            // Tải lại quỹ trên server và phát sự kiện đồng bộ
            await loadSoQuy(true);
            if (typeof broadcastDataUpdate === 'function') {
                broadcastDataUpdate('BALANCE_UPDATED');
                broadcastDataUpdate('DEBT_UPDATED');
            }

            if (shouldCloseAfterSave) {
                closeModal('confirm-unsaved-receipt-modal');
                const modalEl = document.getElementById('modal-detail-thuchi');
                if (modalEl) {
                    const bsModal = bootstrap.Modal.getInstance(modalEl);
                    if (bsModal) bsModal.hide();
                }
            }
        }
    } catch (e) {
        showToast('Lỗi khi lưu phiếu: ' + (e.message || 'Không thể lưu'), 'error');
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.innerHTML = origHtml;
        }
    } finally {
        hideLoading();
    }
}

function safeCloseThuChiModal() {
    if (window.isThuChiDetailDirty) {
        const unsavedModalEl = document.getElementById('confirm-unsaved-receipt-modal');
        if (unsavedModalEl) {
            const btnSave = document.getElementById('btn-unsaved-save');
            const btnDiscard = document.getElementById('btn-unsaved-discard');
            const btnCancel = document.getElementById('btn-unsaved-cancel');

            if (btnSave) {
                btnSave.onclick = () => saveThuChiDetail(true);
            }
            if (btnDiscard) {
                btnDiscard.onclick = () => {
                    window.isThuChiDetailDirty = false;
                    closeModal('confirm-unsaved-receipt-modal');
                    const modalEl = document.getElementById('modal-detail-thuchi');
                    if (modalEl) {
                        const bsModal = bootstrap.Modal.getInstance(modalEl);
                        if (bsModal) bsModal.hide();
                    }
                };
            }
            if (btnCancel) {
                btnCancel.onclick = () => {
                    closeModal('confirm-unsaved-receipt-modal');
                };
            }
            openModal('confirm-unsaved-receipt-modal');
            return;
        }
    }
    const modalEl = document.getElementById('modal-detail-thuchi');
    if (modalEl) {
        const bsModal = bootstrap.Modal.getInstance(modalEl);
        if (bsModal) bsModal.hide();
    }
}

function setupThuChiModalUnsavedHook(modalId) {
    const el = document.getElementById(modalId);
    if (!el || el._unsavedHooked) return;
    el._unsavedHooked = true;

    el.addEventListener('hide.bs.modal', function(e) {
        if (window.isThuChiDetailDirty) {
            e.preventDefault();
            safeCloseThuChiModal();
        }
    });
}

function printCurrentThuChiReceipt(docTitle) {
    if (!window.currentThuChiRecord) return;
    const item = window.currentThuChiRecord;

    const curNgay = document.getElementById('edit-thuchi-ngay')?.value || item.ngay;
    const curLoaiQuy = document.getElementById('edit-thuchi-loai-quy')?.value || item.loai_quy;
    const curDoiTuong = document.getElementById('edit-thuchi-doi-tuong')?.value || item.doi_tuong;
    const curSdt = document.getElementById('edit-thuchi-dien-thoai')?.value || item.dien_thoai;
    const curPhieuLq = document.getElementById('edit-thuchi-phieu-lq')?.value || item.phieu_lien_quan;
    const curSoTien = parseFloat(document.getElementById('edit-thuchi-so-tien')?.value || item.so_tien) || 0;
    const curGhiChu = document.getElementById('edit-thuchi-ghi-chu')?.value || item.ghi_chu;

    const isThu = item.loai_phieu === 'THU';
    const amountClass = isThu ? 'text-success' : 'text-danger';
    const partnerLabel = isThu ? 'Người / Đơn Vị Nộp Tiền:' : 'Người / Đơn Vị Nhận Tiền:';
    const relatedLabel = isThu ? 'Phiếu Xuất Liên Quan:' : 'Phiếu Nhập Liên Quan:';
    const loaiStr = curLoaiQuy === 'TIEN_MAT' ? 'Tiền mặt' : 'Tiền gửi ngân hàng (Chuyển khoản)';

    const printContainer = document.getElementById('printable-thuchi-container');
    if (!printContainer) return;

    printContainer.innerHTML = `
        <div class="p-3">
            <div class="text-center mb-3 border-bottom pb-2">
                <h5 class="fw-bold text-uppercase mb-1 ${amountClass}">${docTitle}</h5>
                <div class="font-monospace text-muted small">
                    Mã số: <strong>${escapeHtml(item.ma_phieu)}</strong> | Ngày: <strong>${formatDate(curNgay)}</strong>
                </div>
            </div>
            <div class="row g-2 mb-2">
                <div class="col-sm-4 text-muted">${partnerLabel}</div>
                <div class="col-sm-8 fw-bold text-dark">${escapeHtml(curDoiTuong)}</div>
            </div>
            ${curSdt ? `
            <div class="row g-2 mb-2">
                <div class="col-sm-4 text-muted">Số điện thoại:</div>
                <div class="col-sm-8 font-monospace">${escapeHtml(curSdt)}</div>
            </div>` : ''}
            <div class="row g-2 mb-2">
                <div class="col-sm-4 text-muted">Hình thức thanh toán:</div>
                <div class="col-sm-8">${loaiStr}</div>
            </div>
            ${curPhieuLq ? `
            <div class="row g-2 mb-2">
                <div class="col-sm-4 text-muted">${relatedLabel}</div>
                <div class="col-sm-8 font-monospace fw-bold ${curPhieuLq.startsWith('XH') ? 'text-danger' : 'text-primary'}">
                    ${escapeHtml(curPhieuLq)}
                </div>
            </div>` : ''}
            <div class="row g-2 mb-2">
                <div class="col-sm-4 text-muted">Số tiền:</div>
                <div class="col-sm-8 fs-4 fw-bold font-monospace ${amountClass}">
                    ${formatVND(curSoTien)}
                </div>
            </div>
            <div class="row g-2 mb-2">
                <div class="col-sm-4 text-muted">Nội dung / Ghi chú:</div>
                <div class="col-sm-8 p-2 bg-light rounded">${escapeHtml(curGhiChu || 'Không có')}</div>
            </div>
        </div>
    `;

    printReceiptModal('printable-thuchi-container', docTitle);
}

// ── Xem Phiếu Xuất / Nhập Liên Quan ─────────────────────────────────────────

async function viewRelatedInvoice(soPhieu) {
    if (!soPhieu) return;
    try {
        showLoading();
        const isXuat = soPhieu.startsWith('XH');
        const url = isXuat ? `/api/xuat-hang/${encodeURIComponent(soPhieu)}` : `/api/nhap-hang/${encodeURIComponent(soPhieu)}`;
        const type = isXuat ? 'xuat' : 'nhap';

        const res = await apiRequest(url);
        if (typeof renderEditableReceiptDetail === 'function') {
            await renderEditableReceiptDetail(res, type, 'detail-related-modal-body', () => {
                loadSoQuy(true);
            });
            const modalEl = document.getElementById('detail-related-modal');
            if (modalEl) {
                let bsModal = bootstrap.Modal.getInstance(modalEl);
                if (!bsModal) bsModal = new bootstrap.Modal(modalEl);
                bsModal.show();
            }
        }
    } catch (e) {
        showToast(`Lỗi xem chi tiết phiếu ${soPhieu}: ${e.message}`, 'error');
    } finally {
        hideLoading();
    }
}

// ── Xóa Phiếu Thu/Chi ────────────────────────────────────────────────────────

function deleteReceipt(id, maPhieu, loaiPhieu = null, onSuccess = null) {
    if (typeof loaiPhieu === 'function') {
        onSuccess = loaiPhieu;
        loaiPhieu = null;
    }
    const type = loaiPhieu || (String(maPhieu).startsWith('TM') || String(maPhieu).startsWith('TG') ? 'thu' : 'chi');
    
    if (typeof confirmDeleteReceipt === 'function') {
        confirmDeleteReceipt(maPhieu, type, async () => {
            await loadSoQuy(true);
            if (typeof broadcastDataUpdate === 'function') {
                broadcastDataUpdate('BALANCE_UPDATED');
                broadcastDataUpdate('DEBT_UPDATED');
            }
            if (typeof onSuccess === 'function') {
                await onSuccess();
            }
        }, id);
        return;
    }

    if (!confirm(`Bạn có chắc chắn muốn xóa phiếu ${maPhieu}?\nNếu phiếu có liên quan đến công nợ, số tiền nợ và quỹ tiền sẽ được hoàn trả tự động.`)) {
        return;
    }
    apiRequest(`/api/so-quy/${encodeURIComponent(id)}`, 'DELETE').then(async res => {
        if (res && res.success) {
            showToast(`Đã xóa thành công phiếu ${maPhieu}`, 'success');
            await loadSoQuy();
            if (typeof broadcastDataUpdate === 'function') {
                broadcastDataUpdate('BALANCE_UPDATED');
                broadcastDataUpdate('DEBT_UPDATED');
            }
            if (onSuccess) onSuccess();
        }
    }).catch(e => {
        showToast('Lỗi khi xóa phiếu: ' + e.message, 'error');
    });
}

// ── Xuất Báo Cáo Kế Toán & Excel Chuẩn ────────────────────────────────────────

function getReportSoQuyData() {
    if (!filteredTransactions || !filteredTransactions.length) {
        return null;
    }

    let totalThu = 0;
    let totalChi = 0;

    const rows = filteredTransactions.map((r, idx) => {
        const isThu = r.loai_phieu === 'THU';
        const amt = parseFloat(r.so_tien) || 0;
        if (isThu) totalThu += amt;
        else totalChi += amt;

        const hinhThuc = r.loai_quy === 'TIEN_MAT' ? 'Tiền mặt' : 'Tiền gửi ngân hàng';
        const loaiPhieuText = isThu ? 'Phiếu Thu' : 'Phiếu Chi';
        const sign = isThu ? '+' : '-';

        return [
            idx + 1,
            formatDate(r.ngay),
            r.ma_phieu,
            loaiPhieuText,
            hinhThuc,
            r.doi_tuong || '',
            r.phieu_lien_quan || '',
            sign + ' ' + formatNumber(amt),
            r.ghi_chu || ''
        ];
    });

    const netAmount = totalThu - totalChi;
    const netSign = netAmount >= 0 ? '+' : '-';
    const summaryRow = ['Tổng cộng', '', '', '', '', '', 'Thu: ' + formatNumber(totalThu) + ' | Chi: ' + formatNumber(totalChi), netSign + ' ' + formatNumber(Math.abs(netAmount)), ''];

    let monthLabel = 'Tất cả các ngày';
    let fileSuffix = 'all';
    if (currentFromDate && currentToDate) {
        monthLabel = `Từ ${formatDate(currentFromDate)} đến ${formatDate(currentToDate)}`;
        fileSuffix = `${currentFromDate}_${currentToDate}`;
    } else if (currentFromDate) {
        monthLabel = `Từ ngày ${formatDate(currentFromDate)}`;
        fileSuffix = `from_${currentFromDate}`;
    } else if (currentToDate) {
        monthLabel = `Đến ngày ${formatDate(currentToDate)}`;
        fileSuffix = `to_${currentToDate}`;
    }

    const columns = [
        { header: 'STT', code: 'A', width: 8, align: 'center' },
        { header: 'Ngày', code: 'B', width: 14, align: 'center' },
        { header: 'Mã phiếu', code: 'C', width: 16, align: 'center' },
        { header: 'Loại phiếu', code: 'D', width: 14, align: 'center' },
        { header: 'Hình thức', code: 'E', width: 16, align: 'center' },
        { header: 'Đối tượng', code: 'F', width: 28, align: 'left', wrapText: true },
        { header: 'Phiếu liên quan', code: 'G', width: 18, align: 'center' },
        { header: 'Số tiền (VNĐ)', code: 'H', width: 22, align: 'right', isNumber: true },
        { header: 'Nội dung / Ghi chú', code: 'I', width: 35, align: 'left', wrapText: true }
    ];

    return {
        rows,
        summaryRow,
        columns,
        monthLabel,
        fileSuffix
    };
}

function printSoQuyReport() {
    const data = getReportSoQuyData();
    if (!data || !data.rows.length) {
        showToast('Không có dữ liệu sổ quỹ để in!', 'info');
        return;
    }

    printAccountingReport({
        title: 'SỔ NHẬT KÝ THU / CHI TOÀN DOANH NGHIỆP',
        monthText: data.monthLabel,
        accountText: 'Tài khoản: 111 / 112 (Tiền mặt / Tiền gửi ngân hàng)',
        unitText: 'Đơn vị tính : Đồng',
        columns: data.columns,
        rows: data.rows,
        summaryRow: data.summaryRow
    });
}

function exportSoQuyExcel() {
    const data = getReportSoQuyData();
    if (!data || !data.rows.length) {
        showToast('Không có dữ liệu sổ quỹ để xuất Excel!', 'info');
        return;
    }

    exportAccountingReportToExcel({
        title: 'SỔ NHẬT KÝ THU / CHI TOÀN DOANH NGHIỆP',
        monthText: data.monthLabel,
        accountText: 'Tài khoản: 111 / 112 (Tiền mặt / Tiền gửi ngân hàng)',
        unitText: 'Đơn vị tính : Đồng',
        columns: data.columns,
        rows: data.rows,
        summaryRow: data.summaryRow,
        fileName: `So_Nhat_Ky_Thu_Chi_${data.fileSuffix}.xlsx`,
        sheetName: 'SoQuy'
    });
}

// ── Modal Thiết Lập Số Tiền Quỹ Của Doanh Nghiệp ──────────────────────────

async function openQuyConfigModal() {
    try {
        showLoading();
        const res = await apiRequest('/api/dong-tien/quy-config');
        if (res && res.success) {
            quyBalanceData = res.balances || {};

            const radioCurrent = document.getElementById('mode-current');
            if (radioCurrent) radioCurrent.checked = true;

            const tmVal = Math.round(quyBalanceData.tien_mat || 0);
            const tgVal = Math.round(quyBalanceData.tien_gui || 0);

            document.getElementById('cfg-tien-mat').value = tmVal ? tmVal : '';
            document.getElementById('cfg-tien-gui').value = tgVal ? tgVal : '';

            onModeChange(false);
            onInputAmountChange();

            const modalEl = document.getElementById('modal-quy-config');
            if (modalEl) {
                let bsModal = bootstrap.Modal.getInstance(modalEl);
                if (!bsModal) {
                    bsModal = new bootstrap.Modal(modalEl);
                }
                bsModal.show();
            }
        }
    } catch (e) {
        showToast('Lỗi tải cấu hình quỹ: ' + e.message, 'error');
    } finally {
        hideLoading();
    }
}

function onModeChange(updateValues = true) {
    const isCurrent = document.getElementById('mode-current')?.checked;
    const lblTm = document.getElementById('lbl-tien-mat');
    const lblTg = document.getElementById('lbl-tien-gui');
    const hintTm = document.getElementById('txt-tm-hint');
    const hintTg = document.getElementById('txt-tg-hint');

    if (isCurrent) {
        if (lblTm) lblTm.innerHTML = '<i class="bi bi-cash-stack text-success me-1"></i>Số Tiền Mặt Thực Tế Hiện Tại (VNĐ) <span class="text-danger">*</span>';
        if (lblTg) lblTg.innerHTML = '<i class="bi bi-bank text-primary me-1"></i>Số Tiền Gửi Ngân Hàng Hiện Tại (VNĐ) <span class="text-danger">*</span>';
        if (hintTm) hintTm.innerText = 'Số tiền mặt đang có trong két / quầy';
        if (hintTg) hintTg.innerText = 'Số dư khả dụng trong các tài khoản ngân hàng';
    } else {
        if (lblTm) lblTm.innerHTML = '<i class="bi bi-cash-stack text-success me-1"></i>Số Dư Tiền Mặt Ban Đầu (VNĐ) <span class="text-danger">*</span>';
        if (lblTg) lblTg.innerHTML = '<i class="bi bi-bank text-primary me-1"></i>Số Dư Tiền Gửi Ban Đầu (VNĐ) <span class="text-danger">*</span>';
        if (hintTm) hintTm.innerText = 'Số dư tiền mặt trước khi phát sinh thu / chi';
        if (hintTg) hintTg.innerText = 'Số dư ngân hàng trước khi phát sinh thu / chi';
    }

    if (updateValues && quyBalanceData) {
        const tmVal = isCurrent ? Math.round(quyBalanceData.tien_mat || 0) : Math.round(quyBalanceData.so_du_dau_tien_mat || 0);
        const tgVal = isCurrent ? Math.round(quyBalanceData.tien_gui || 0) : Math.round(quyBalanceData.so_du_dau_tien_gui || 0);
        document.getElementById('cfg-tien-mat').value = tmVal ? tmVal : '';
        document.getElementById('cfg-tien-gui').value = tgVal ? tgVal : '';
    }

    onInputAmountChange();
}

function onInputAmountChange() {
    const tm = parseFloat(document.getElementById('cfg-tien-mat')?.value || 0);
    const tg = parseFloat(document.getElementById('cfg-tien-gui')?.value || 0);
    const isCurrent = document.getElementById('mode-current')?.checked;

    document.getElementById('txt-tm-preview').innerText = formatVND(tm);
    document.getElementById('txt-tg-preview').innerText = formatVND(tg);

    let tongHienTai = 0;
    if (isCurrent) {
        tongHienTai = tm + tg;
    } else {
        const netTm = quyBalanceData ? (quyBalanceData.tm_thu - quyBalanceData.tm_chi) : 0;
        const netTg = quyBalanceData ? (quyBalanceData.tg_thu - quyBalanceData.tg_chi) : 0;
        tongHienTai = (tm + netTm) + (tg + netTg);
    }

    const tongEl = document.getElementById('txt-tong-preview');
    if (tongEl) tongEl.innerText = formatVND(tongHienTai);
}

async function saveQuyConfig() {
    const btn = document.getElementById('btn-save-quy-cfg');
    const origHtml = btn ? btn.innerHTML : '';
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Đang lưu vào Config...';
    }

    try {
        const mode = document.querySelector('input[name="quy_mode"]:checked')?.value || 'current';
        const tm = parseFloat(document.getElementById('cfg-tien-mat')?.value || 0);
        const tg = parseFloat(document.getElementById('cfg-tien-gui')?.value || 0);

        if (isNaN(tm) || tm < 0 || isNaN(tg) || tg < 0) {
            showToast('Số tiền không hợp lệ, vui lòng kiểm tra lại!', 'warning');
            return;
        }

        const res = await apiRequest('/api/dong-tien/quy-config', 'POST', {
            mode: mode,
            tien_mat: tm,
            tien_gui: tg
        });

        if (res && res.success) {
            showToast('Đã lưu số tiền của công ty vào Config (Google Sheets & Database)!', 'success');

            if (res.balances) {
                quyBalanceData = res.balances;
            }

            const modalEl = document.getElementById('modal-quy-config');
            if (modalEl) {
                const bsModal = bootstrap.Modal.getInstance(modalEl);
                if (bsModal) bsModal.hide();
            }

            await loadSoQuy();
            if (typeof broadcastDataUpdate === 'function') broadcastDataUpdate('BALANCE_UPDATED');
        }
    } catch (e) {
        showToast('Lỗi lưu số tiền quỹ: ' + e.message, 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = origHtml;
        }
    }
}

function escapeHtml(text) {
    if (!text) return '';
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// ── Khởi Chạy Khi DOM Sẵn Sàng ───────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
    // Mặc định chọn Tháng này
    const range = (typeof getPresetDateRange === 'function') ? getPresetDateRange('month') : { from: '', to: '' };
    currentFromDate = range.from;
    currentToDate = range.to;

    const fromEl = document.getElementById('filter-from-date');
    const toEl = document.getElementById('filter-to-date');
    if (fromEl) fromEl.value = currentFromDate;
    if (toEl) toEl.value = currentToDate;

    loadSoQuy();

    const searchHandler = typeof debounce === 'function' ? debounce(filterAndRenderSoQuy, 200) : filterAndRenderSoQuy;
    document.getElementById('search-input')?.addEventListener('input', searchHandler);

    // Tự động làm mới khi chuyển tab hoặc có thay đổi số dư / phiếu
    window.addEventListener('message', (e) => {
        if (e.data && (e.data.type === 'TAB_ACTIVATED' || e.data.type === 'BALANCE_UPDATED' || e.data.type === 'DEBT_UPDATED' || e.data.type === 'DATA_CHANGED')) {
            loadSoQuy(true);
        }
    });

    try {
        if (typeof BroadcastChannel !== 'undefined') {
            const bc = new BroadcastChannel('inventory_sync');
            bc.onmessage = (e) => {
                if (e.data && (e.data.type === 'BALANCE_UPDATED' || e.data.type === 'DEBT_UPDATED' || e.data.type === 'DATA_CHANGED')) {
                    loadSoQuy(true);
                }
            };
        }
    } catch (err) {}
});
