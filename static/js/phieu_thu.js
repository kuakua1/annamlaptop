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

    // 3. Kiểm tra tham số URL (kh_id, kh_ten, sdt, so_tien, so_phieu) để tự động điền khách hàng
    const urlParams = new URLSearchParams(window.location.search);
    const paramKhId = (urlParams.get('kh_id') || '').trim();
    const paramKhTen = (urlParams.get('kh_ten') || '').trim();
    const paramSdt = (urlParams.get('sdt') || '').trim();
    const paramSoTien = parseFloat(urlParams.get('so_tien') || 0);
    const paramSoPhieu = (urlParams.get('so_phieu') || '').trim();

    if (paramKhId || paramKhTen || paramSdt) {
        let found = null;
        if (paramKhId) {
            found = customersList.find(c => String(c.id).trim() === String(paramKhId).trim());
        }
        if (!found && paramSdt) {
            found = customersList.find(c => String(c.dien_thoai || '').trim() === String(paramSdt).trim());
        }
        if (!found && paramKhTen) {
            found = customersList.find(c => (c.ten || c.ten_kh || '').toLowerCase().trim() === paramKhTen.toLowerCase().trim());
        }

        if (found) {
            selectKh(found.id, paramSoPhieu, paramSoTien);
        } else {
            const idEl = document.getElementById('f-kh-id');
            if (idEl) idEl.value = paramKhId;
            if (paramKhTen) document.getElementById('f-kh-ten').value = paramKhTen;
            if (paramSdt) document.getElementById('f-kh-sdt').value = paramSdt;
            if (paramSoTien > 0) {
                const tienEl = document.getElementById('f-thu-so-tien');
                if (tienEl) tienEl.value = paramSoTien;
            }
            const lyDoEl = document.getElementById('f-thu-ly-do');
            if (lyDoEl) {
                if (paramSoPhieu) {
                    lyDoEl.value = `Thu tiền đơn hàng ${paramSoPhieu}`;
                } else if (paramKhTen) {
                    lyDoEl.value = `Thu tiền công nợ khách hàng ${paramKhTen}`;
                }
            }
            checkCustomerDebt(true, paramSoPhieu, paramSoTien);
        }
    }

    // 4. Đóng gợi ý autocomplete khi click ra ngoài
    document.addEventListener('click', function (e) {
        const box = document.getElementById('kh-suggestions');
        const input = document.getElementById('f-kh-ten');
        const arrowBtn = document.getElementById('btn-toggle-kh-dropdown');
        if (box && input && !box.contains(e.target) && e.target !== input && (!arrowBtn || !arrowBtn.contains(e.target))) {
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
        let res = null;
        try {
            res = await apiRequest('/api/doi-tuong');
        } catch (err) {
            res = null;
        }
        if (res && res.success && Array.isArray(res.data) && res.data.length) {
            customersList = res.data;
        } else {
            res = await apiRequest('/api/khach-hang');
            if (res && res.success && Array.isArray(res.data)) {
                customersList = res.data;
            }
        }
    } catch (e) {
        console.warn('Lỗi tải danh mục khách hàng/đối tác:', e);
    }
}

function filterCustomers(query) {
    if (!customersList || !customersList.length) return [];
    if (!query) return customersList.slice(0, 60);
    const q = query.toLowerCase().trim();
    return customersList.filter(c => {
        const name = (c.ten || c.ten_kh || c.ten_ncc || '').toLowerCase();
        const code = String(c.id || '').toLowerCase();
        const phone = String(c.dien_thoai || '').toLowerCase();
        const mst = String(c.ma_so_thue || '').toLowerCase();
        const addr = String(c.dia_chi || '').toLowerCase();
        return name.includes(q) || code.includes(q) || phone.includes(q) || mst.includes(q) || addr.includes(q);
    }).slice(0, 50);
}

function renderKhSuggestions(matches) {
    const box = document.getElementById('kh-suggestions');
    if (!box) return;

    if (!matches || !matches.length) {
        box.innerHTML = '<div class="p-2 text-muted small text-center">Không tìm thấy đối tác phù hợp</div>';
        box.classList.remove('d-none');
        return;
    }

    box.innerHTML = matches.map(c => {
        const name = c.ten || c.ten_kh || c.ten_ncc || 'Chưa đặt tên';
        const type = c.phan_loai || '';
        let badge = '';
        if (type === 'NHA_CUNG_CAP') badge = '<span class="badge bg-info-subtle text-info border small ms-1">Nhà Cung Cấp</span>';
        else if (type === 'KHACH_HANG') badge = '<span class="badge bg-success-subtle text-success border small ms-1">Khách Hàng</span>';
        else if (type) badge = '<span class="badge bg-primary-subtle text-primary border small ms-1">Đối tác</span>';

        const codePart = (c.id && c.id !== name) ? `<span class="badge bg-light text-secondary border font-monospace me-1">${escapeHtml(String(c.id))}</span>` : '';
        const mstPart = c.ma_so_thue ? `<span class="badge bg-warning-subtle text-dark border font-monospace me-1">MST: ${escapeHtml(c.ma_so_thue)}</span>` : '';
        const phonePart = c.dien_thoai ? `<span class="me-2"><i class="bi bi-telephone text-primary me-1"></i>${escapeHtml(c.dien_thoai)}</span>` : '';
        const addrPart = c.dia_chi ? `<span><i class="bi bi-geo-alt text-danger me-1"></i>${escapeHtml(c.dia_chi)}</span>` : '';

        return `
            <div class="autocomplete-item py-2 px-3 border-bottom" onclick="selectKh('${escapeHtml(String(c.id))}')" style="cursor: pointer;">
                <div class="d-flex justify-content-between align-items-center">
                    <div>
                        ${codePart}
                        <span class="fw-semibold text-primary">${escapeHtml(name)}</span>
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

function onKhSearchInput(input) {
    const query = input.value.trim();
    const idEl = document.getElementById('f-kh-id');
    if (idEl) idEl.value = '';

    const box = document.getElementById('kh-suggestions');
    if (!query) {
        if (box) box.classList.add('d-none');
        return;
    }
    renderKhSuggestions(filterCustomers(query));
}

function toggleKhDropdown() {
    const box = document.getElementById('kh-suggestions');
    if (!box) return;
    if (!box.classList.contains('d-none')) {
        box.classList.add('d-none');
        return;
    }
    const input = document.getElementById('f-kh-ten');
    const query = input ? input.value.trim() : '';
    renderKhSuggestions(filterCustomers(query));
}

function selectKh(id, targetSoPhieu = '', presetAmount = 0) {
    const c = customersList.find(x => String(x.id) === String(id));
    if (!c) return;

    document.getElementById('f-kh-ten').value = c.ten || c.ten_kh || c.ten_ncc || '';
    document.getElementById('f-kh-id').value = c.id || '';
    document.getElementById('f-kh-sdt').value = c.dien_thoai || '';
    document.getElementById('f-kh-dia-chi').value = c.dia_chi || '';
    document.getElementById('kh-suggestions').classList.add('d-none');

    // Tự động kiểm tra công nợ phiếu xuất của khách
    checkCustomerDebt(true, targetSoPhieu, presetAmount);
}

// ── Kiểm Tra Công Nợ Phiếu Xuất Kho ──────────────────────────────────────────

let checkDebtTimer = null;
let lastCheckedDebtKey = '';
let currentSelectedSoPhieu = '';

function checkCustomerDebt(force = false, targetSoPhieu = '', presetAmount = 0) {
    if (checkDebtTimer) clearTimeout(checkDebtTimer);
    checkDebtTimer = setTimeout(() => _executeCheckCustomerDebt(force, targetSoPhieu, presetAmount), 100);
}

async function _executeCheckCustomerDebt(force = false, targetSoPhieu = '', presetAmount = 0) {
    const tenKh = document.getElementById('f-kh-ten')?.value.trim() || '';
    const khId = document.getElementById('f-kh-id')?.value.trim() || '';
    const sdt = document.getElementById('f-kh-sdt')?.value.trim() || '';

    const currentKey = `${tenKh}|${khId}|${sdt}`;
    if (!force && currentKey === lastCheckedDebtKey && !targetSoPhieu && !presetAmount) {
        return;
    }
    lastCheckedDebtKey = currentKey;

    const selectEl = document.getElementById('f-phieu-xuat-select');
    const badgeEl = document.getElementById('debt-status-badge');
    const helpEl = document.getElementById('debt-help-text');

    if (!tenKh && !sdt) {
        if (selectEl) selectEl.innerHTML = '<option value="">-- Khách không nợ / Hoặc nhập thu tự do --</option>';
        if (badgeEl) {
            badgeEl.className = 'badge bg-secondary';
            badgeEl.innerText = 'Chưa chọn khách';
        }
        currentSelectedSoPhieu = '';
        return;
    }

    if (badgeEl) {
        badgeEl.className = 'badge bg-info text-dark';
        badgeEl.innerText = 'Đang kiểm tra nợ...';
    }

    try {
        const queryParams = new URLSearchParams({ ten_kh: tenKh, kh_id: khId, sdt: sdt });
        let res;
        try {
            res = await apiRequest(`/api/khach-hang/unpaid-invoices?${queryParams}`);
        } catch (err) {
            res = await apiRequest(`/api/cong-no/khach-hang/unpaid-invoices?${queryParams}`);
        }

        if (res.success && res.has_debt && res.invoices && res.invoices.length > 0) {
            unpaidInvoicesList = res.invoices;
            const totalDebt = res.invoices.reduce((sum, inv) => sum + (parseFloat(inv.tong_no) || 0), 0);

            if (badgeEl) {
                badgeEl.className = 'badge bg-danger';
                badgeEl.innerText = `Khách nợ ${res.count} phiếu (${formatVND(totalDebt)})`;
            }

            let optionsHtml = '<option value="">-- Thu tự do / Không theo phiếu --</option>';
            if (res.invoices.length > 1) {
                optionsHtml += `<option value="ALL">-- [Tất cả] Thu toàn bộ công nợ (${formatVND(totalDebt)}) --</option>`;
            }
            res.invoices.forEach(inv => {
                const ngayFormatted = formatDate(inv.ngay_xuat);
                const debtStr = formatVND(inv.tong_no);
                optionsHtml += `<option value="${inv.so_phieu}">Phiếu ${inv.so_phieu} (Ngày ${ngayFormatted}) - Còn nợ: ${debtStr}</option>`;
            });
            if (selectEl) selectEl.innerHTML = optionsHtml;

            // Xử lý tự động chọn phiếu & số tiền:
            const matchedTarget = targetSoPhieu ? res.invoices.find(x => x.so_phieu === targetSoPhieu) : null;
            if (matchedTarget && selectEl) {
                selectEl.value = targetSoPhieu;
                currentSelectedSoPhieu = targetSoPhieu;
                const amt = (presetAmount > 0) ? presetAmount : matchedTarget.tong_no;
                document.getElementById('f-thu-so-tien').value = amt;
                document.getElementById('f-thu-ly-do').value = `Thanh toán đơn hàng ${matchedTarget.so_phieu} ngày ${formatDate(matchedTarget.ngay_xuat)}`;
            } else if (res.invoices.length === 1 && selectEl) {
                selectEl.value = res.invoices[0].so_phieu;
                currentSelectedSoPhieu = res.invoices[0].so_phieu;
                const amt = (presetAmount > 0) ? presetAmount : res.invoices[0].tong_no;
                document.getElementById('f-thu-so-tien').value = amt;
                document.getElementById('f-thu-ly-do').value = `Thanh toán đơn hàng ${res.invoices[0].so_phieu} ngày ${formatDate(res.invoices[0].ngay_xuat)}`;
            } else if (res.invoices.length > 1 && selectEl) {
                selectEl.value = 'ALL';
                currentSelectedSoPhieu = 'ALL';
                const amt = (presetAmount > 0) ? presetAmount : totalDebt;
                document.getElementById('f-thu-so-tien').value = amt;
                document.getElementById('f-thu-ly-do').value = `Thu toàn bộ công nợ khách hàng ${tenKh}`;
                if (helpEl) {
                    helpEl.innerHTML = `<span class="text-danger fw-semibold">Khách đang có ${res.count} đơn hàng còn nợ tiền (Tổng nợ: ${formatVND(totalDebt)}). Đã chọn thu toàn bộ hoặc bạn có thể chọn từng phiếu ở ô trên.</span>`;
                }
            }
        } else {
            // Không có nợ
            unpaidInvoicesList = [];
            currentSelectedSoPhieu = '';
            if (selectEl) selectEl.innerHTML = '<option value="">-- Khách hàng không có nợ tồn đọng --</option>';
            if (badgeEl) {
                badgeEl.className = 'badge bg-success';
                badgeEl.innerText = 'Khách không nợ';
            }
            if (helpEl) {
                helpEl.innerHTML = '<span class="text-muted">Khách hiện không có phiếu xuất nào nợ. Bạn có thể tự nhập số tiền và nội dung thu thủ công.</span>';
            }
            if (presetAmount > 0) {
                document.getElementById('f-thu-so-tien').value = presetAmount;
            }
        }
    } catch (e) {
        console.warn('Lỗi kiểm tra nợ khách hàng:', e);
        if (badgeEl) {
            badgeEl.className = 'badge bg-warning text-dark';
            badgeEl.innerText = 'Không thể kiểm tra nợ';
        }
    }
}

function onPhieuXuatSelectChange(notify = true) {
    const selectEl = document.getElementById('f-phieu-xuat-select');
    const selectedSoPhieu = selectEl?.value;
    const tenKh = document.getElementById('f-kh-ten')?.value.trim() || 'khách hàng';

    if (!selectedSoPhieu) {
        currentSelectedSoPhieu = '';
        return;
    }

    if (selectedSoPhieu === 'ALL') {
        const totalDebt = unpaidInvoicesList.reduce((sum, inv) => sum + (parseFloat(inv.tong_no) || 0), 0);
        document.getElementById('f-thu-so-tien').value = totalDebt;
        document.getElementById('f-thu-ly-do').value = `Thu toàn bộ công nợ khách hàng ${tenKh}`;
        if (notify && currentSelectedSoPhieu !== 'ALL') {
            showToast(`Đã chọn thu toàn bộ công nợ (${formatVND(totalDebt)})`, 'info');
        }
        currentSelectedSoPhieu = 'ALL';
        return;
    }

    const matchedInv = unpaidInvoicesList.find(x => x.so_phieu === selectedSoPhieu);
    if (matchedInv) {
        document.getElementById('f-thu-so-tien').value = matchedInv.tong_no;
        const ngayStr = formatDate(matchedInv.ngay_xuat);
        document.getElementById('f-thu-ly-do').value = `Thanh toán đơn hàng ${matchedInv.so_phieu} ngày ${ngayStr}`;

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
        showToast('Vui lòng nhập Tên Người / Đơn Vị Nộp Tiền', 'error');
        document.getElementById('f-kh-ten')?.focus();
        return;
    }
    if (!ngay) {
        showToast('Vui lòng chọn ngày thu tiền', 'error');
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
            if (typeof broadcastDataUpdate === 'function') {
                broadcastDataUpdate('DEBT_UPDATED');
            }
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
    document.getElementById('f-phieu-xuat-select').innerHTML = '<option value="">-- Chưa chọn đối tác / Hoặc thu tự do --</option>';
    document.getElementById('debt-status-badge').className = 'badge bg-secondary';
    document.getElementById('debt-status-badge').innerText = 'Chưa chọn đối tác';
    document.getElementById('f-thu-so-tien').value = '';
    document.getElementById('f-thu-ly-do').value = '';
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
