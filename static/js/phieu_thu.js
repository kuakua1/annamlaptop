/**
 * phieu_thu.js - Logic tạo phiếu thu tiền, kiểm tra công nợ phiếu xuất kho và quản lý phiếu thu gần đây
 */

let customersList = [];
let unpaidInvoicesList = [];

document.addEventListener('DOMContentLoaded', async function () {
    // 1. Gán ngày mặc định hôm nay
    const today = new Date().toISOString().split('T')[0];
    const ngayEl = document.getElementById('f-thu-ngay');
    if (ngayEl) ngayEl.value = today;

    // 2. Tải mã phiếu dự kiến & danh sách khách hàng & phiếu thu gần đây
    await fetchNextCode();
    await loadCustomers();
    await loadRecentReceipts();

    // 3. Kiểm tra tham số URL (kh_id, kh_ten, sdt) để tự động điền khách hàng
    const urlParams = new URLSearchParams(window.location.search);
    const paramKhId = urlParams.get('kh_id');
    const paramKhTen = urlParams.get('kh_ten');
    const paramSdt = urlParams.get('sdt');

    if (paramKhId || paramKhTen) {
        if (paramKhId) {
            const found = customersList.find(c => String(c.id).trim() === String(paramKhId).trim());
            if (found) {
                selectKh(found.id);
            } else {
                document.getElementById('f-kh-id').value = paramKhId;
                if (paramKhTen) document.getElementById('f-kh-ten').value = paramKhTen;
                if (paramSdt) document.getElementById('f-kh-sdt').value = paramSdt;
                checkCustomerDebt();
            }
        } else if (paramKhTen) {
            document.getElementById('f-kh-ten').value = paramKhTen;
            if (paramSdt) document.getElementById('f-kh-sdt').value = paramSdt;
            checkCustomerDebt();
        }
    }

    // 4. Đóng gợi ý autocomplete khi click ra ngoài
    document.addEventListener('click', function (e) {
        const box = document.getElementById('kh-suggestions');
        const input = document.getElementById('f-kh-ten');
        if (box && input && !box.contains(e.target) && e.target !== input) {
            box.classList.add('d-none');
        }
    });
});

// ── Mã Phiếu Tự Động ─────────────────────────────────────────────────────────

async function fetchNextCode() {
    try {
        const loaiQuy = document.getElementById('f-thu-loai-quy')?.value || 'TIEN_MAT';
        const ngay = document.getElementById('f-thu-ngay')?.value || '';
        const res = await apiRequest(`/api/phieu-thu/next-code?loai_quy=${loaiQuy}&ngay=${ngay}`);
        if (res.success && res.ma_phieu) {
            const badge = document.getElementById('badge-ma-phieu');
            if (badge) badge.innerText = res.ma_phieu;
        }
    } catch (e) {
        console.warn('Lỗi lấy mã phiếu tiếp theo:', e);
    }
}

function onLoaiQuyChange() {
    fetchNextCode();
}

function onNgayChange() {
    fetchNextCode();
}

// ── Danh Sách & Autocomplete Khách Hàng ──────────────────────────────────────

async function loadCustomers() {
    try {
        const res = await apiRequest('/api/khach-hang');
        if (res.success && Array.isArray(res.data)) {
            customersList = res.data;
        }
    } catch (e) {
        console.warn('Lỗi tải danh mục khách hàng:', e);
    }
}

function onKhSearchInput(input) {
    const query = input.value.trim().toLowerCase();
    const box = document.getElementById('kh-suggestions');
    document.getElementById('f-kh-id').value = '';

    if (!query || !customersList.length) {
        box.classList.add('d-none');
        return;
    }

    const matches = customersList.filter(c =>
        (c.ten_kh || '').toLowerCase().includes(query) ||
        (c.dien_thoai || '').includes(query)
    ).slice(0, 8);

    if (!matches.length) {
        box.classList.add('d-none');
        return;
    }

    box.innerHTML = matches.map(c => `
        <div class="autocomplete-item py-2 px-3 border-bottom cursor-pointer" onclick="selectKh('${c.id}')" style="cursor: pointer;">
            <div class="fw-semibold text-primary">${escapeHtml(c.ten_kh)}</div>
            <div class="small text-muted">
                ${c.dien_thoai ? '📞 ' + escapeHtml(c.dien_thoai) : 'Chưa có SĐT'}
                ${c.dia_chi ? ' · 📍 ' + escapeHtml(c.dia_chi) : ''}
            </div>
        </div>
    `).join('');
    box.classList.remove('d-none');
}

function selectKh(id) {
    const c = customersList.find(x => x.id === id);
    if (!c) return;

    document.getElementById('f-kh-ten').value = c.ten_kh || '';
    document.getElementById('f-kh-id').value = c.id || '';
    document.getElementById('f-kh-sdt').value = c.dien_thoai || '';
    document.getElementById('f-kh-dia-chi').value = c.dia_chi || '';
    document.getElementById('kh-suggestions').classList.add('d-none');

    // Tự động kiểm tra công nợ phiếu xuất của khách
    checkCustomerDebt();
}

// ── Kiểm Tra Công Nợ Phiếu Xuất Kho ──────────────────────────────────────────

let checkDebtTimer = null;
let lastCheckedDebtKey = '';
let currentSelectedSoPhieu = '';

function checkCustomerDebt(force = false) {
    if (checkDebtTimer) clearTimeout(checkDebtTimer);
    checkDebtTimer = setTimeout(() => _executeCheckCustomerDebt(force), 150);
}

async function _executeCheckCustomerDebt(force = false) {
    const tenKh = document.getElementById('f-kh-ten')?.value.trim() || '';
    const khId = document.getElementById('f-kh-id')?.value.trim() || '';
    const sdt = document.getElementById('f-kh-sdt')?.value.trim() || '';

    const currentKey = `${tenKh}|${khId}|${sdt}`;
    if (!force && currentKey === lastCheckedDebtKey) {
        return; // Đã kiểm tra rồi, bỏ qua để tránh lặp lại thông báo
    }
    lastCheckedDebtKey = currentKey;

    const selectEl = document.getElementById('f-phieu-xuat-select');
    const badgeEl = document.getElementById('debt-status-badge');
    const helpEl = document.getElementById('debt-help-text');

    if (!tenKh && !sdt) {
        selectEl.innerHTML = '<option value="">-- Khách không nợ / Hoặc nhập thu tự do --</option>';
        badgeEl.className = 'badge bg-secondary';
        badgeEl.innerText = 'Chưa chọn khách';
        currentSelectedSoPhieu = '';
        return;
    }

    badgeEl.className = 'badge bg-info text-dark';
    badgeEl.innerText = 'Đang kiểm tra nợ...';

    try {
        const queryParams = new URLSearchParams({ ten_kh: tenKh, kh_id: khId, sdt: sdt });
        let res;
        try {
            res = await apiRequest(`/api/khach-hang/unpaid-invoices?${queryParams}`);
        } catch (err) {
            res = await apiRequest(`/api/cong-no/khach-hang/unpaid-invoices?${queryParams}`);
        }

        if (res.success && res.has_debt && res.invoices.length > 0) {
            unpaidInvoicesList = res.invoices;

            badgeEl.className = 'badge bg-danger';
            badgeEl.innerText = `Khách đang có ${res.count} phiếu xuất kho chưa thanh toán`;

            let optionsHtml = '<option value="">-- Chọn phiếu xuất kho cần thanh toán --</option>';
            res.invoices.forEach(inv => {
                const ngayFormatted = formatDate(inv.ngay_xuat);
                const debtStr = formatVND(inv.tong_no);
                optionsHtml += `<option value="${inv.so_phieu}">Phiếu ${inv.so_phieu} (Ngày ${ngayFormatted}) - Còn nợ: ${debtStr}</option>`;
            });
            selectEl.innerHTML = optionsHtml;

            // Nếu chỉ có 1 phiếu nợ duy nhất, tự động chọn luôn phiếu đó
            if (res.invoices.length === 1) {
                selectEl.value = res.invoices[0].so_phieu;
                onPhieuXuatSelectChange(true);
            } else {
                currentSelectedSoPhieu = '';
                helpEl.innerHTML = `<span class="text-danger fw-semibold">Khách đang có ${res.count} đơn hàng còn nợ tiền. Hãy chọn phiếu xuất phía trên để hệ thống tự động điền tiền và nội dung.</span>`;
            }
        } else {
            // Không có nợ
            unpaidInvoicesList = [];
            currentSelectedSoPhieu = '';
            selectEl.innerHTML = '<option value="">-- Khách hàng không có nợ tồn đọng --</option>';
            badgeEl.className = 'badge bg-success';
            badgeEl.innerText = 'Khách không nợ';
            helpEl.innerHTML = '<span class="text-muted">Khách hiện không có phiếu xuất nào nợ. Bạn có thể tự nhập số tiền và nội dung thu thủ công.</span>';

            // Không tự động điền số tiền & để trống cho người dùng nhập
            document.getElementById('f-thu-so-tien').value = '';
            document.getElementById('f-thu-ly-do').value = '';
        }
    } catch (e) {
        console.warn('Lỗi kiểm tra nợ khách hàng:', e);
        badgeEl.className = 'badge bg-warning text-dark';
        badgeEl.innerText = 'Không thể kiểm tra nợ';
    }
}

function onPhieuXuatSelectChange(notify = true) {
    const selectEl = document.getElementById('f-phieu-xuat-select');
    const selectedSoPhieu = selectEl?.value;

    if (!selectedSoPhieu) {
        currentSelectedSoPhieu = '';
        return;
    }

    const matchedInv = unpaidInvoicesList.find(x => x.so_phieu === selectedSoPhieu);
    if (matchedInv) {
        // Tự động điền số tiền nợ
        document.getElementById('f-thu-so-tien').value = matchedInv.tong_no;

        // Tự động điền nội dung lý do thu
        const ngayStr = formatDate(matchedInv.ngay_xuat);
        document.getElementById('f-thu-ly-do').value = `Thanh toán đơn hàng ${matchedInv.so_phieu} ngày ${ngayStr}`;

        // Chỉ thông báo khi có sự thay đổi lựa chọn (không thông báo lặp lại)
        if (notify && currentSelectedSoPhieu !== selectedSoPhieu) {
            showToast(`Đã tự động chọn phiếu ${matchedInv.so_phieu}, còn nợ ${formatVND(matchedInv.tong_no)}`, 'info');
        }
        currentSelectedSoPhieu = selectedSoPhieu;
    }
}

// ── Lưu Phiếu Thu ────────────────────────────────────────────────────────────

async function savePhieuThu() {
    const loaiQuy = document.getElementById('f-thu-loai-quy').value;
    const ngay = document.getElementById('f-thu-ngay').value;
    const doiTuong = document.getElementById('f-thu-doi-tuong')?.value.trim() || document.getElementById('f-kh-ten')?.value.trim();
    const sdt = document.getElementById('f-kh-sdt')?.value.trim();
    const diaChi = document.getElementById('f-kh-dia-chi')?.value.trim();
    const khId = document.getElementById('f-kh-id')?.value.trim();
    const soTien = parseFloat(document.getElementById('f-thu-so-tien')?.value || 0);
    const phieuLienQuan = document.getElementById('f-phieu-xuat-select')?.value.trim();
    const ghiChu = document.getElementById('f-thu-ly-do')?.value.trim();

    // Validate
    if (!doiTuong) {
        showToast('Vui lòng nhập hoặc chọn Tên Khách Hàng', 'error');
        document.getElementById('f-kh-ten')?.focus();
        return;
    }
    if (!sdt) {
        showToast('Vui lòng nhập Số Điện Thoại Khách Hàng', 'error');
        document.getElementById('f-kh-sdt')?.focus();
        return;
    }
    if (!soTien || soTien <= 0) {
        showToast('Vui lòng nhập số tiền thu hợp lệ (> 0)', 'error');
        document.getElementById('f-thu-so-tien')?.focus();
        return;
    }

    const payload = {
        loai_quy: loaiQuy,
        ngay: ngay,
        doi_tuong: doiTuong,
        dien_thoai: sdt,
        dia_chi: diaChi,
        khach_hang_id: khId,
        so_tien: soTien,
        phieu_lien_quan: phieuLienQuan,
        ghi_chu: ghiChu
    };

    const btn = document.getElementById('btn-save-phieu-thu');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Đang lưu...';

    try {
        const res = await apiRequest('/api/phieu-thu', 'POST', payload);
        if (res.success) {
            showToast(`Tạo phiếu thu ${res.data.ma_phieu} thành công!`, 'success');
            resetFormPhieuThu();
            await fetchNextCode();
            await loadRecentReceipts();
        }
    } catch (e) {
        showToast(`Lỗi: ${e.message}`, 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="bi bi-check2-circle me-1"></i> Lưu Phiếu Thu Tiền';
    }
}

function resetFormPhieuThu() {
    lastCheckedDebtKey = '';
    currentSelectedSoPhieu = '';
    document.getElementById('f-kh-ten').value = '';
    document.getElementById('f-kh-id').value = '';
    document.getElementById('f-kh-sdt').value = '';
    document.getElementById('f-kh-dia-chi').value = '';
    document.getElementById('f-phieu-xuat-select').innerHTML = '<option value="">-- Khách không nợ / Hoặc nhập thu tự do --</option>';
    document.getElementById('debt-status-badge').className = 'badge bg-secondary';
    document.getElementById('debt-status-badge').innerText = 'Chưa chọn khách';
    document.getElementById('f-thu-so-tien').value = '';
    document.getElementById('f-thu-ly-do').value = '';
    document.getElementById('debt-help-text').innerHTML = 'Hệ thống sẽ tự động quét phiếu xuất kho mà khách hàng này còn nợ tiền để tự động điền số tiền & nội dung.';
}

// ── Tải Phiếu Thu Gần Đây ───────────────────────────────────────────────────

async function loadRecentReceipts() {
    const tbody = document.getElementById('tbody-recent-receipts');
    if (!tbody) return;

    try {
        const res = await apiRequest('/api/phieu-thu');
        if (res.success && Array.isArray(res.data)) {
            if (res.data.length === 0) {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="5" class="text-center py-4 text-muted">
                            <i class="bi bi-inbox fs-3 d-block mb-1"></i> Chưa có phiếu thu nào
                        </td>
                    </tr>
                `;
                return;
            }

            tbody.innerHTML = res.data.slice(0, 30).map(r => {
                const loaiBadge = r.loai_quy === 'TIEN_MAT'
                    ? '<span class="badge bg-success-subtle text-success border border-success">TM</span>'
                    : '<span class="badge bg-primary-subtle text-primary border border-primary">TG</span>';

                return `
                    <tr>
                        <td>
                            <div class="fw-bold font-monospace text-primary">${escapeHtml(r.ma_phieu || '')}</div>
                            ${loaiBadge}
                        </td>
                        <td class="small text-muted">${formatDate(r.ngay)}</td>
                        <td>
                            <div class="fw-semibold">${escapeHtml(r.doi_tuong || '')}</div>
                            <small class="text-muted">${r.dien_thoai ? '📞 ' + escapeHtml(r.dien_thoai) : ''}</small>
                        </td>
                        <td class="text-end fw-bold text-success">
                            ${formatVND(r.so_tien)}
                        </td>
                        <td class="text-center">
                            <button class="btn btn-sm btn-outline-info p-1 px-2" title="Xem chi tiết" onclick="viewDetailReceipt('${r.id}')">
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
                    Lỗi tải phiếu thu gần đây: ${e.message}
                </td>
            </tr>
        `;
    }
}

async function viewDetailReceipt(recordId) {
    try {
        const res = await apiRequest('/api/phieu-thu');
        const item = res.data.find(x => String(x.id) === String(recordId));
        if (!item) return;

        document.getElementById('detail-phieu-title').innerText = `Chi Tiết Phiếu Thu: ${item.ma_phieu}`;
        const modalBody = document.getElementById('detail-phieu-body');

        const loaiStr = item.loai_quy === 'TIEN_MAT' ? 'Tiền mặt' : 'Tiền gửi ngân hàng (Chuyển khoản)';

        modalBody.innerHTML = `
            <div class="p-2">
                <div class="d-flex justify-content-between border-bottom pb-2 mb-2">
                    <span class="text-muted">Mã Phiếu:</span>
                    <strong class="font-monospace text-primary">${escapeHtml(item.ma_phieu)}</strong>
                </div>
                <div class="d-flex justify-content-between border-bottom pb-2 mb-2">
                    <span class="text-muted">Ngày Thu:</span>
                    <strong>${formatDate(item.ngay)}</strong>
                </div>
                <div class="d-flex justify-content-between border-bottom pb-2 mb-2">
                    <span class="text-muted">Hình Thức:</span>
                    <strong>${loaiStr}</strong>
                </div>
                <div class="d-flex justify-content-between border-bottom pb-2 mb-2">
                    <span class="text-muted">Khách Hàng Nộp:</span>
                    <strong>${escapeHtml(item.doi_tuong)}</strong>
                </div>
                <div class="d-flex justify-content-between border-bottom pb-2 mb-2">
                    <span class="text-muted">Số Điện Thoại:</span>
                    <strong>${escapeHtml(item.dien_thoai || 'Không có')}</strong>
                </div>
                <div class="d-flex justify-content-between border-bottom pb-2 mb-2">
                    <span class="text-muted">Phiếu Xuất Liên Quan:</span>
                    <strong class="text-danger">${escapeHtml(item.phieu_lien_quan || 'Thu tự do')}</strong>
                </div>
                <div class="d-flex justify-content-between border-bottom pb-2 mb-2">
                    <span class="text-muted">Số Tiền Thu:</span>
                    <strong class="text-success fs-5">${formatVND(item.so_tien)}</strong>
                </div>
                <div class="border-bottom pb-2 mb-2">
                    <div class="text-muted mb-1">Nội Dung / Ghi Chú:</div>
                    <div class="p-2 bg-light rounded">${escapeHtml(item.ghi_chu || 'Không có')}</div>
                </div>
            </div>
        `;

        openModal('modal-detail-phieu-thu');
    } catch (e) {
        showToast('Lỗi xem chi tiết phiếu thu', 'error');
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
