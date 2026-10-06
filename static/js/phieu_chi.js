/**
 * phieu_chi.js - Logic tạo phiếu chi tiền, kiểm tra công nợ phiếu nhập kho và quản lý phiếu chi gần đây
 */

let suppliersList = [];
let unpaidInvoicesList = [];

document.addEventListener('DOMContentLoaded', async function () {
    // 1. Gán ngày mặc định hôm nay
    const today = new Date().toISOString().split('T')[0];
    const ngayEl = document.getElementById('f-chi-ngay');
    if (ngayEl) ngayEl.value = today;

    // 2. Tải mã phiếu chi dự kiến & danh sách đối tác / NCC & phiếu chi gần đây
    await fetchNextCodeChi();
    await loadSuppliers();
    await loadRecentChi();

    // 3. Kiểm tra tham số URL (ncc_id, ncc_ten, sdt) để tự động điền đối tác
    const urlParams = new URLSearchParams(window.location.search);
    const paramNccId = urlParams.get('ncc_id');
    const paramNccTen = urlParams.get('ncc_ten');
    const paramSdt = urlParams.get('sdt');

    if (paramNccId || paramNccTen) {
        if (paramNccId) {
            const found = suppliersList.find(c => String(c.id).trim() === String(paramNccId).trim());
            if (found) {
                selectSupplier(found.id);
            } else {
                const idEl = document.getElementById('f-ncc-id');
                if (idEl) idEl.value = paramNccId;
                if (paramNccTen) document.getElementById('f-chi-doi-tuong').value = paramNccTen;
                if (paramSdt) document.getElementById('f-chi-sdt').value = paramSdt;
                checkSupplierDebt();
            }
        } else if (paramNccTen) {
            document.getElementById('f-chi-doi-tuong').value = paramNccTen;
            if (paramSdt) document.getElementById('f-chi-sdt').value = paramSdt;
            checkSupplierDebt();
        }
    }

    // 4. Đóng gợi ý autocomplete khi click ra ngoài
    document.addEventListener('click', function (e) {
        const box = document.getElementById('ncc-suggestions');
        const input = document.getElementById('f-chi-doi-tuong');
        const arrowBtn = document.getElementById('btn-toggle-ncc-dropdown');
        if (box && input && !box.contains(e.target) && e.target !== input && (!arrowBtn || !arrowBtn.contains(e.target))) {
            box.classList.add('d-none');
        }
    });
});

// ── Mã Phiếu Chi Tự Động ───────────────────────────────────────────────────

async function fetchNextCodeChi() {
    try {
        const loaiQuy = document.getElementById('f-chi-loai-quy')?.value || 'TIEN_MAT';
        const ngay = document.getElementById('f-chi-ngay')?.value || '';
        const res = await apiRequest(`/api/phieu-chi/next-code?loai_quy=${loaiQuy}&ngay=${ngay}`);
        if (res.success && res.ma_phieu) {
            const badge = document.getElementById('badge-ma-phieu');
            if (badge) badge.innerText = res.ma_phieu;
        }
    } catch (e) {
        console.warn('Lỗi lấy mã phiếu chi tiếp theo:', e);
    }
}

function onLoaiQuyChange() {
    fetchNextCodeChi();
}

function onNgayChange() {
    fetchNextCodeChi();
}

// ── Danh Sách & Autocomplete Đối Tác / Nhà Cung Cấp ────────────────────────

async function loadSuppliers() {
    try {
        let res = await apiRequest('/api/doi-tuong');
        if (res && res.success && Array.isArray(res.data)) {
            suppliersList = res.data;
        } else {
            res = await apiRequest('/api/nha-cung-cap');
            if (res && res.success && Array.isArray(res.data)) {
                suppliersList = res.data;
            }
        }
    } catch (e) {
        console.warn('Lỗi tải danh mục đối tác/NCC:', e);
    }
}

function filterSuppliers(query) {
    if (!suppliersList || !suppliersList.length) return [];
    if (!query) {
        return suppliersList.slice(0, 60);
    }
    const q = query.toLowerCase().trim();
    return suppliersList.filter(c => {
        const name = (c.ten || c.ten_ncc || c.ten_kh || '').toLowerCase();
        const code = (c.id || '').toLowerCase();
        const phone = (c.dien_thoai || '').toLowerCase();
        const mst = (c.ma_so_thue || '').toLowerCase();
        const addr = (c.dia_chi || '').toLowerCase();
        return name.includes(q) || code.includes(q) || phone.includes(q) || mst.includes(q) || addr.includes(q);
    }).slice(0, 50);
}

function renderSupplierSuggestions(matches) {
    const box = document.getElementById('ncc-suggestions');
    if (!box) return;

    if (!matches || !matches.length) {
        box.innerHTML = '<div class="p-2 text-muted small text-center">Không tìm thấy đối tác phù hợp</div>';
        box.classList.remove('d-none');
        return;
    }

    box.innerHTML = matches.map(c => {
        const name = c.ten || c.ten_ncc || c.ten_kh || 'Chưa đặt tên';
        const type = c.phan_loai || 'CA_HAI';
        let badge = '<span class="badge bg-primary-subtle text-primary border small ms-1">Đối tác</span>';
        if (type === 'NHA_CUNG_CAP') badge = '<span class="badge bg-info-subtle text-info border small ms-1">Nhà Cung Cấp</span>';
        else if (type === 'KHACH_HANG') badge = '<span class="badge bg-success-subtle text-success border small ms-1">Khách Hàng</span>';

        const codePart = (c.id && c.id !== name) ? `<span class="badge bg-light text-secondary border font-monospace me-1">${escapeHtml(c.id)}</span>` : '';
        const mstPart = c.ma_so_thue ? `<span class="badge bg-warning-subtle text-dark border font-monospace me-1">MST: ${escapeHtml(c.ma_so_thue)}</span>` : '';
        const phonePart = c.dien_thoai ? `<span class="me-2"><i class="bi bi-telephone text-primary me-1"></i>${escapeHtml(c.dien_thoai)}</span>` : '';
        const addrPart = c.dia_chi ? `<span><i class="bi bi-geo-alt text-danger me-1"></i>${escapeHtml(c.dia_chi)}</span>` : '';

        return `
            <div class="autocomplete-item py-2 px-3 border-bottom cursor-pointer" onclick="selectSupplier('${escapeHtml(String(c.id))}')" style="cursor: pointer;">
                <div class="d-flex justify-content-between align-items-center">
                    <div>
                        ${codePart}
                        <span class="fw-semibold text-danger">${escapeHtml(name)}</span>
                    </div>
                    <div>
                        ${mstPart}
                        ${badge}
                    </div>
                </div>
                <div class="small text-muted mt-1 text-truncate">
                    ${phonePart}
                    ${addrPart}
                </div>
            </div>
        `;
    }).join('');
    box.classList.remove('d-none');
}

function onNccSearchInput(input) {
    const query = input.value.trim();
    const idEl = document.getElementById('f-ncc-id');
    if (idEl) idEl.value = '';

    const box = document.getElementById('ncc-suggestions');
    if (!query) {
        if (box) box.classList.add('d-none');
        return;
    }

    const matches = filterSuppliers(query);
    renderSupplierSuggestions(matches);
}

function toggleSupplierDropdown() {
    const box = document.getElementById('ncc-suggestions');
    if (!box) return;
    if (!box.classList.contains('d-none')) {
        box.classList.add('d-none');
        return;
    }
    const input = document.getElementById('f-chi-doi-tuong');
    const query = input ? input.value.trim() : '';
    const matches = filterSuppliers(query);
    renderSupplierSuggestions(matches);
}

function selectSupplier(id) {
    const c = suppliersList.find(x => String(x.id) === String(id));
    if (!c) return;

    const name = c.ten || c.ten_ncc || c.ten_kh || '';
    document.getElementById('f-chi-doi-tuong').value = name;
    const idEl = document.getElementById('f-ncc-id');
    if (idEl) idEl.value = c.id || '';
    document.getElementById('f-chi-sdt').value = c.dien_thoai || '';
    document.getElementById('f-chi-dia-chi').value = c.dia_chi || '';

    const box = document.getElementById('ncc-suggestions');
    if (box) box.classList.add('d-none');

    // Tự động kiểm tra công nợ phiếu nhập của nhà cung cấp này
    checkSupplierDebt(true);
}

// ── Kiểm Tra Công Nợ Phiếu Nhập Kho ─────────────────────────────────────────

let checkDebtTimer = null;
let lastCheckedDebtKey = '';
let currentSelectedSoPhieu = '';

function checkSupplierDebt(force = false) {
    if (checkDebtTimer) clearTimeout(checkDebtTimer);
    checkDebtTimer = setTimeout(() => _executeCheckSupplierDebt(force), 150);
}

async function _executeCheckSupplierDebt(force = false) {
    const tenNcc = document.getElementById('f-chi-doi-tuong')?.value.trim() || '';
    const nccId = document.getElementById('f-ncc-id')?.value.trim() || '';
    const sdt = document.getElementById('f-chi-sdt')?.value.trim() || '';

    const currentKey = `${tenNcc}|${nccId}|${sdt}`;
    if (!force && currentKey === lastCheckedDebtKey) {
        return;
    }
    lastCheckedDebtKey = currentKey;

    const selectEl = document.getElementById('f-phieu-nhap-select');
    const badgeEl = document.getElementById('debt-status-badge');
    const helpEl = document.getElementById('debt-help-text');

    if (!tenNcc && !sdt) {
        if (selectEl) selectEl.innerHTML = '<option value="">-- Chưa chọn đối tác / Hoặc chi tự do --</option>';
        if (badgeEl) {
            badgeEl.className = 'badge bg-secondary';
            badgeEl.innerText = 'Chưa chọn đối tác';
        }
        currentSelectedSoPhieu = '';
        return;
    }

    if (badgeEl) {
        badgeEl.className = 'badge bg-info text-dark';
        badgeEl.innerText = 'Đang kiểm tra nợ...';
    }

    try {
        const queryParams = new URLSearchParams({ ten_ncc: tenNcc, ncc_id: nccId, sdt: sdt });
        const res = await apiRequest(`/api/nha-cung-cap/unpaid-invoices?${queryParams}`);

        if (res.success && res.has_debt && res.invoices.length > 0) {
            unpaidInvoicesList = res.invoices;

            if (badgeEl) {
                badgeEl.className = 'badge bg-danger';
                badgeEl.innerText = `Công ty đang nợ ${res.count} phiếu nhập kho`;
            }

            let optionsHtml = '<option value="">-- Chọn phiếu nhập kho cần thanh toán --</option>';
            res.invoices.forEach(inv => {
                const ngayFormatted = formatDate(inv.ngay_nhap);
                const debtStr = formatVND(inv.tong_no);
                optionsHtml += `<option value="${inv.so_phieu}">Phiếu ${inv.so_phieu} (Ngày ${ngayFormatted}) - Còn nợ: ${debtStr}</option>`;
            });
            if (selectEl) selectEl.innerHTML = optionsHtml;

            // Nếu chỉ có 1 phiếu nợ duy nhất, tự động chọn luôn phiếu đó
            if (res.invoices.length === 1 && selectEl) {
                selectEl.value = res.invoices[0].so_phieu;
                onPhieuNhapSelectChange(true);
            } else {
                currentSelectedSoPhieu = '';
                if (helpEl) {
                    helpEl.classList.remove('d-none');
                    helpEl.innerHTML = `<span class="text-danger fw-semibold">Công ty đang nợ ${res.count} đơn nhập hàng của đối tác này. Hãy chọn phiếu nhập để tự động điền tiền và lý do chi.</span>`;
                }
            }
        } else {
            // Không có nợ
            unpaidInvoicesList = [];
            currentSelectedSoPhieu = '';
            if (selectEl) selectEl.innerHTML = '<option value="">-- Không có phiếu nhập nào còn nợ --</option>';
            if (badgeEl) {
                badgeEl.className = 'badge bg-success';
                badgeEl.innerText = 'Không nợ';
            }
            if (helpEl) {
                helpEl.classList.remove('d-none');
                helpEl.innerHTML = '<span class="text-muted">Đối tác hiện không có phiếu nhập nào còn nợ. Bạn có thể tự nhập số tiền và nội dung chi thủ công.</span>';
            }

            document.getElementById('f-chi-so-tien').value = '';
            document.getElementById('f-chi-ly-do').value = '';
        }
    } catch (e) {
        console.warn('Lỗi kiểm tra nợ nhà cung cấp:', e);
        if (badgeEl) {
            badgeEl.className = 'badge bg-warning text-dark';
            badgeEl.innerText = 'Không thể kiểm tra nợ';
        }
    }
}

function onPhieuNhapSelectChange(notify = true) {
    const selectEl = document.getElementById('f-phieu-nhap-select');
    const selectedSoPhieu = selectEl?.value;

    if (!selectedSoPhieu) {
        currentSelectedSoPhieu = '';
        return;
    }

    const matchedInv = unpaidInvoicesList.find(x => x.so_phieu === selectedSoPhieu);
    if (matchedInv) {
        // Tự động điền số tiền nợ
        document.getElementById('f-chi-so-tien').value = matchedInv.tong_no;

        // Tự động điền nội dung lý do chi
        const ngayStr = formatDate(matchedInv.ngay_nhap);
        document.getElementById('f-chi-ly-do').value = `Thanh toán tiền nhập hàng theo phiếu ${matchedInv.so_phieu} ngày ${ngayStr}`;

        if (notify && currentSelectedSoPhieu !== selectedSoPhieu) {
            showToast(`Đã chọn phiếu ${matchedInv.so_phieu}, còn nợ ${formatVND(matchedInv.tong_no)}`, 'info');
        }
        currentSelectedSoPhieu = selectedSoPhieu;
    }
}

// ── Lưu Phiếu Chi ──────────────────────────────────────────────────────────

async function savePhieuChi() {
    const loaiQuy = document.getElementById('f-chi-loai-quy').value;
    const ngay = document.getElementById('f-chi-ngay').value;
    const doiTuong = document.getElementById('f-chi-doi-tuong').value.trim();
    const sdt = document.getElementById('f-chi-sdt').value.trim();
    const diaChi = document.getElementById('f-chi-dia-chi').value.trim();
    const nccId = document.getElementById('f-ncc-id')?.value.trim() || '';
    const soTien = parseFloat(document.getElementById('f-chi-so-tien').value || 0);
    const ghiChu = document.getElementById('f-chi-ly-do').value.trim();
    const phieuLq = document.getElementById('f-phieu-nhap-select')?.value || '';

    if (!ngay) {
        showToast('Vui lòng chọn ngày chi tiền', 'error');
        return;
    }
    if (!doiTuong) {
        showToast('Vui lòng nhập Tên Người / Đơn Vị Nhận Tiền', 'error');
        document.getElementById('f-chi-doi-tuong').focus();
        return;
    }
    if (isNaN(soTien) || soTien <= 0) {
        showToast('Số tiền chi phải lớn hơn 0', 'error');
        document.getElementById('f-chi-so-tien').focus();
        return;
    }

    const btn = document.getElementById('btn-save-phieu-chi');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Đang lưu phiếu...';

    try {
        const payload = {
            loai_quy: loaiQuy,
            ngay: ngay,
            doi_tuong: doiTuong,
            dien_thoai: sdt,
            dia_chi: diaChi,
            doi_tuong_id: nccId,
            nha_cung_cap_id: nccId,
            so_tien: soTien,
            phieu_lien_quan: phieuLq,
            ghi_chu: ghiChu
        };

        const res = await apiRequest('/api/phieu-chi', 'POST', payload);
        if (res.success) {
            const maPhieu = res.data?.ma_phieu || '';
            showToast(`Lưu phiếu chi ${maPhieu} thành công!`, 'success');
            resetFormPhieuChi();
            await fetchNextCodeChi();
            await loadRecentChi();
        }
    } catch (e) {
        showToast(`Lỗi: ${e.message}`, 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="bi bi-check2-circle me-1"></i> Lưu Phiếu Chi Tiền';
    }
}

function resetFormPhieuChi() {
    lastCheckedDebtKey = '';
    currentSelectedSoPhieu = '';
    document.getElementById('f-chi-doi-tuong').value = '';
    const idEl = document.getElementById('f-ncc-id');
    if (idEl) idEl.value = '';
    document.getElementById('f-chi-sdt').value = '';
    document.getElementById('f-chi-dia-chi').value = '';
    const selectEl = document.getElementById('f-phieu-nhap-select');
    if (selectEl) selectEl.innerHTML = '<option value="">-- Chưa chọn đối tác / Hoặc chi tự do --</option>';
    const badgeEl = document.getElementById('debt-status-badge');
    if (badgeEl) {
        badgeEl.className = 'badge bg-secondary';
        badgeEl.innerText = 'Chưa chọn đối tác';
    }
    document.getElementById('f-chi-so-tien').value = '';
    document.getElementById('f-chi-ly-do').value = '';
    const helpEl = document.getElementById('debt-help-text');
    if (helpEl) {
        helpEl.innerHTML = 'Hệ thống sẽ tự động quét phiếu nhập kho mà công ty còn nợ tiền để tự động điền số tiền & nội dung.';
    }
}

// ── Tải Phiếu Chi Gần Đây ───────────────────────────────────────────────────

async function loadRecentChi() {
    const tbody = document.getElementById('tbody-recent-chi');
    if (!tbody) return;

    try {
        const res = await apiRequest('/api/phieu-chi');
        if (res.success && Array.isArray(res.data)) {
            if (res.data.length === 0) {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="5" class="text-center py-4 text-muted">
                            <i class="bi bi-inbox fs-3 d-block mb-1"></i> Chưa có phiếu chi nào
                        </td>
                    </tr>
                `;
                return;
            }

            tbody.innerHTML = res.data.slice(0, 30).map(r => {
                const loaiBadge = r.loai_quy === 'TIEN_MAT'
                    ? '<span class="badge bg-danger-subtle text-danger border border-danger">CM</span>'
                    : '<span class="badge bg-warning-subtle text-dark border border-warning">CG</span>';

                return `
                    <tr>
                        <td>
                            <div class="fw-bold font-monospace text-danger">${escapeHtml(r.ma_phieu || '')}</div>
                            ${loaiBadge}
                        </td>
                        <td class="small text-muted">${formatDate(r.ngay)}</td>
                        <td>
                            <div class="fw-semibold">${escapeHtml(r.doi_tuong || '')}</div>
                            <small class="text-muted">${r.dien_thoai ? '📞 ' + escapeHtml(r.dien_thoai) : ''}</small>
                        </td>
                        <td class="text-end fw-bold text-danger">
                            ${formatVND(r.so_tien)}
                        </td>
                        <td class="text-center">
                            <button class="btn btn-sm btn-outline-info p-1 px-2" title="Xem chi tiết" onclick="viewDetailChi('${r.id}')">
                                <i class="bi bi-eye"></i>
                            </button>
                        </td>
                    </tr>
                `;
            }).join('');
        }
    } catch (e) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5" class="text-center py-3 text-danger">
                    Lỗi tải phiếu chi gần đây: ${e.message}
                </td>
            </tr>
        `;
    }
}

async function viewDetailChi(recordId) {
    try {
        const res = await apiRequest('/api/phieu-chi');
        const item = res.data.find(x => String(x.id) === String(recordId));
        if (!item) return;

        document.getElementById('detail-phieu-title').innerText = `Chi Tiết Phiếu Chi: ${item.ma_phieu}`;
        const modalBody = document.getElementById('detail-phieu-body');

        const loaiStr = item.loai_quy === 'TIEN_MAT' ? 'Tiền mặt' : 'Tiền gửi ngân hàng (Chuyển khoản)';

        modalBody.innerHTML = `
            <div class="p-2" id="printable-phieu-chi">
                <div class="d-flex justify-content-between border-bottom pb-2 mb-2">
                    <span class="text-muted">Mã Phiếu Chi:</span>
                    <strong class="font-monospace text-danger fs-6">${escapeHtml(item.ma_phieu)}</strong>
                </div>
                <div class="d-flex justify-content-between border-bottom pb-2 mb-2">
                    <span class="text-muted">Ngày Chi:</span>
                    <strong>${formatDate(item.ngay)}</strong>
                </div>
                <div class="d-flex justify-content-between border-bottom pb-2 mb-2">
                    <span class="text-muted">Nguồn Tiền:</span>
                    <strong>${loaiStr}</strong>
                </div>
                <div class="d-flex justify-content-between border-bottom pb-2 mb-2">
                    <span class="text-muted">Người / Đơn Vị Nhận:</span>
                    <strong>${escapeHtml(item.doi_tuong)}</strong>
                </div>
                <div class="d-flex justify-content-between border-bottom pb-2 mb-2">
                    <span class="text-muted">Số Điện Thoại:</span>
                    <strong>${escapeHtml(item.dien_thoai || 'Không có')}</strong>
                </div>
                <div class="d-flex justify-content-between border-bottom pb-2 mb-2">
                    <span class="text-muted">Phiếu Nhập Liên Quan:</span>
                    <strong class="text-primary font-monospace">${escapeHtml(item.phieu_lien_quan || 'Chi tự do')}</strong>
                </div>
                <div class="d-flex justify-content-between border-bottom pb-2 mb-2">
                    <span class="text-muted">Số Tiền Chi:</span>
                    <strong class="text-danger fs-5">${formatVND(item.so_tien)}</strong>
                </div>
                <div class="border-bottom pb-2 mb-2">
                    <div class="text-muted mb-1">Nội Dung / Lý Do Chi:</div>
                    <div class="p-2 bg-light rounded">${escapeHtml(item.ghi_chu || 'Không có')}</div>
                </div>
            </div>
            <div class="d-flex justify-content-between align-items-center mt-3 pt-2 border-top">
                <button type="button" class="btn btn-outline-danger btn-sm" onclick="confirmDeletePhieuChi('${item.id}', '${item.ma_phieu}')">
                    <i class="bi bi-trash3 me-1"></i> Xóa phiếu
                </button>
                <button type="button" class="btn btn-primary btn-sm px-3" onclick="printReceiptModal('printable-phieu-chi', 'Phiếu Chi Tiền')">
                    <i class="bi bi-printer me-1"></i> In phiếu chi
                </button>
            </div>
        `;

        openModal('modal-detail-phieu-chi');
    } catch (e) {
        showToast('Lỗi xem chi tiết phiếu chi', 'error');
    }
}

async function confirmDeletePhieuChi(recordId, maPhieu) {
    if (!confirm(`Bạn có chắc chắn muốn xóa phiếu chi ${maPhieu}?\nNếu phiếu có liên quan đến phiếu nhập kho, số tiền nợ sẽ được hoàn lại.`)) {
        return;
    }

    try {
        const res = await apiRequest(`/api/so-quy/${encodeURIComponent(recordId)}`, 'DELETE');
        if (res.success) {
            showToast(`Đã xóa thành công phiếu chi ${maPhieu}`, 'success');
            const modalEl = document.getElementById('modal-detail-phieu-chi');
            if (modalEl) {
                const bsModal = bootstrap.Modal.getInstance(modalEl);
                if (bsModal) bsModal.hide();
            }
            await fetchNextCodeChi();
            await loadRecentChi();
        }
    } catch (e) {
        showToast('Lỗi xóa phiếu chi: ' + e.message, 'error');
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
