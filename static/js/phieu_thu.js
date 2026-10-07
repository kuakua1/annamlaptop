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

    // 2. Tải song song mã phiếu dự kiến & danh sách khách hàng & phiếu thu gần đây
    await Promise.all([
        fetchNextCode(),
        loadCustomers(),
        loadRecentReceipts()
    ]);

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

// ── Receipts list & Pagination ────────────────────────────────────────────────

let allReceiptsList = [];
let receiptsCurrentPage = 1;
const RECEIPTS_PAGE_SIZE = 5;

async function loadRecentReceipts() {
    try {
        const res = await apiRequest('/api/phieu-thu');
        const records = (res.success && Array.isArray(res.data)) ? res.data : [];

        // Sắp xếp: Phiếu mới nhất luôn ở trên đầu (theo ngày và mã phiếu giảm dần)
        allReceiptsList = records.sort((a, b) => {
            const dateA = a.ngay || '';
            const dateB = b.ngay || '';
            if (dateB !== dateA) return dateB.localeCompare(dateA);
            return (b.ma_phieu || '').localeCompare(a.ma_phieu || '');
        });

        renderReceiptsPage(1);
    } catch (e) {
        console.error('Lỗi tải phiếu thu:', e);
        const container = document.getElementById('receipts-list');
        if (container) container.innerHTML = `<p class="text-danger small text-center py-4">Lỗi tải dữ liệu: ${e.message}</p>`;
    }
}

function renderReceiptsPage(page) {
    receiptsCurrentPage = page;
    const container = document.getElementById('receipts-list');
    const paginationContainer = document.getElementById('receipts-pagination');
    const summaryContainer = document.getElementById('receipts-page-summary');
    if (!container) return;

    if (!allReceiptsList.length) {
        container.innerHTML = '<p class="text-muted small text-center py-4">Chưa có phiếu thu nào</p>';
        if (paginationContainer) paginationContainer.innerHTML = '';
        if (summaryContainer) summaryContainer.textContent = '';
        return;
    }

    const totalPages = Math.ceil(allReceiptsList.length / RECEIPTS_PAGE_SIZE);
    if (receiptsCurrentPage > totalPages) receiptsCurrentPage = totalPages;
    if (receiptsCurrentPage < 1) receiptsCurrentPage = 1;

    const startIdx = (receiptsCurrentPage - 1) * RECEIPTS_PAGE_SIZE;
    const pageItems = allReceiptsList.slice(startIdx, startIdx + RECEIPTS_PAGE_SIZE);

    container.innerHTML = pageItems.map(r => {
        const loaiBadge = r.loai_quy === 'TIEN_MAT'
            ? '<span class="badge bg-success-subtle text-success border border-success px-1.5 py-0.5 ms-2 font-monospace" style="font-size: 0.7rem;">TM</span>'
            : '<span class="badge bg-primary-subtle text-primary border border-primary px-1.5 py-0.5 ms-2 font-monospace" style="font-size: 0.7rem;">TG</span>';

        return `
            <div class="receipt-list-item px-3 py-2 mb-2 border rounded shadow-sm bg-white" onclick="viewDetailReceipt('${r.id}')" style="cursor: pointer; transition: all 0.2s ease;">
                <!-- Dòng 1: Ngày + ID phiếu + Quỹ (trái) và Số tiền (phải) -->
                <div class="d-flex justify-content-between align-items-center mb-1">
                    <div class="d-flex align-items-center gap-2 flex-wrap">
                        <span class="badge bg-primary-subtle text-primary border border-primary-subtle px-1.5 py-0.5 font-monospace" style="font-size: 0.75rem;">
                            <i class="bi bi-calendar3 me-1"></i>${formatDate(r.ngay)}
                        </span>
                        <span class="fw-bold text-primary font-monospace ms-1" style="font-size: 0.85rem;">${escapeHtml(r.ma_phieu || '')}</span>
                        ${loaiBadge}
                    </div>
                    <div class="text-end">
                        <span class="fw-bold text-success font-monospace" style="font-size: 0.95rem;">${formatVND(r.so_tien)}</span>
                    </div>
                </div>

                <!-- Dòng 2: Người nộp (trái) + Nút thao tác (phải) -->
                <div class="d-flex justify-content-between align-items-center pt-1 border-top border-light">
                    <div class="fw-semibold text-dark text-truncate pe-2" style="font-size: 0.85rem;" title="${escapeHtml(r.doi_tuong || 'Khách lẻ')}">
                        <i class="bi bi-person text-secondary me-1"></i>${escapeHtml(r.doi_tuong || 'Khách lẻ')}
                    </div>
                    <div class="d-flex align-items-center gap-2 text-nowrap">
                        <button class="btn btn-xs btn-outline-danger py-0 px-1.5" style="font-size: 0.725rem; line-height: 1.4;" onclick="event.stopPropagation(); confirmDeletePhieuThu('${r.id}', '${r.ma_phieu}')" title="Xóa phiếu thu">
                            <i class="bi bi-trash"></i>
                        </button>
                        <span class="text-primary fw-semibold" style="font-size: 0.75rem;">Chi tiết <i class="bi bi-chevron-right" style="font-size: 0.65rem;"></i></span>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    if (summaryContainer) {
        summaryContainer.textContent = `Trang ${receiptsCurrentPage}/${totalPages} (${allReceiptsList.length} phiếu)`;
    }
    renderPagination('receipts-pagination', receiptsCurrentPage, totalPages, renderReceiptsPage);
}

async function confirmDeletePhieuThu(recordId, maPhieu) {
    if (typeof confirmDeleteReceipt === 'function') {
        confirmDeleteReceipt(maPhieu, 'THU', async () => {
            const modalEl = document.getElementById('modal-detail-phieu-thu');
            if (modalEl) {
                const bsModal = bootstrap.Modal.getInstance(modalEl);
                if (bsModal) bsModal.hide();
            }
            await fetchNextCode();
            await loadRecentReceipts();
            if (typeof broadcastDataUpdate === 'function') {
                broadcastDataUpdate('DEBT_UPDATED');
                broadcastDataUpdate('BALANCE_UPDATED');
            }
        }, recordId);
        return;
    }

    if (!confirm(`Bạn có chắc chắn muốn xóa phiếu thu ${maPhieu}?\nNếu phiếu có liên quan đến phiếu xuất kho, số tiền nợ sẽ được hoàn lại và quỹ tiền sẽ được khấu trừ lại.`)) {
        return;
    }

    try {
        const res = await apiRequest(`/api/so-quy/${encodeURIComponent(recordId)}`, 'DELETE');
        if (res.success) {
            showToast(`Đã xóa thành công phiếu thu ${maPhieu}`, 'success');
            const modalEl = document.getElementById('modal-detail-phieu-thu');
            if (modalEl) {
                const bsModal = bootstrap.Modal.getInstance(modalEl);
                if (bsModal) bsModal.hide();
            }
            await fetchNextCode();
            await loadRecentReceipts();
            if (typeof broadcastDataUpdate === 'function') {
                broadcastDataUpdate('DEBT_UPDATED');
                broadcastDataUpdate('BALANCE_UPDATED');
            }
        }
    } catch (e) {
        showToast('Lỗi xóa phiếu thu: ' + e.message, 'error');
    }
}

window.currentPhieuThuDetail = null;
window.initialPhieuThuDetail = null;
window.isPhieuThuDetailDirty = false;

async function viewDetailReceipt(recordId) {
    try {
        const res = await apiRequest('/api/phieu-thu');
        const item = res.data.find(x => String(x.id) === String(recordId));
        if (!item) return;

        window.currentPhieuThuDetail = { ...item };
        window.initialPhieuThuDetail = { ...item };
        resetPhieuThuDetailClean();

        document.getElementById('detail-phieu-title').innerText = `Chi Tiết Phiếu Thu: ${item.ma_phieu}`;
        const modalBody = document.getElementById('detail-phieu-body');

        modalBody.innerHTML = `
            <div class="card bg-light border-0 mb-3 shadow-none">
                <div class="card-body p-3">
                    <div class="d-flex justify-content-between align-items-center flex-wrap gap-2 pb-2 border-bottom">
                        <div class="d-flex align-items-center gap-2">
                            <span class="badge bg-success fs-6 px-3 py-1 font-monospace">
                                ${escapeHtml(item.ma_phieu)}
                            </span>
                            <span class="badge bg-success-subtle text-success border border-success">
                                PHIẾU THU TIỀN
                            </span>
                        </div>
                        <div class="text-end">
                            <span class="text-muted small me-1">Số tiền:</span>
                            <span class="fs-4 fw-bold text-success font-monospace" id="edit-pt-so-tien-preview">
                                ${formatVND(item.so_tien)}
                            </span>
                        </div>
                    </div>

                    <div class="row g-2 pt-2">
                        <div class="col-md-6">
                            <label class="form-label small fw-semibold text-muted mb-1">
                                <i class="bi bi-calendar3 me-1"></i>Ngày Thu <span class="text-danger">*</span>
                            </label>
                            <input type="date" id="edit-pt-ngay" class="form-control form-control-sm font-monospace fw-semibold" value="${item.ngay || ''}" onchange="checkPhieuThuDetailDirty()">
                        </div>
                        <div class="col-md-6">
                            <label class="form-label small fw-semibold text-muted mb-1">
                                <i class="bi bi-credit-card me-1"></i>Hình Thức Thu <span class="text-danger">*</span>
                            </label>
                            <select id="edit-pt-loai-quy" class="form-select form-select-sm" onchange="checkPhieuThuDetailDirty()">
                                <option value="TIEN_MAT" ${item.loai_quy === 'TIEN_MAT' ? 'selected' : ''}>Tiền mặt (Két tiền)</option>
                                <option value="NGAN_HANG" ${item.loai_quy === 'NGAN_HANG' ? 'selected' : ''}>Tiền gửi ngân hàng (Chuyển khoản)</option>
                            </select>
                        </div>

                        <div class="col-md-7">
                            <label class="form-label small fw-semibold text-muted mb-1">
                                <i class="bi bi-person me-1"></i>Người / Đơn Vị Nộp Tiền <span class="text-danger">*</span>
                            </label>
                            <input type="text" id="edit-pt-doi-tuong" class="form-control form-control-sm fw-bold text-dark" value="${escapeHtml(item.doi_tuong || '')}" placeholder="Tên khách hàng..." oninput="checkPhieuThuDetailDirty()">
                        </div>
                        <div class="col-md-5">
                            <label class="form-label small fw-semibold text-muted mb-1">
                                <i class="bi bi-telephone me-1"></i>Số Điện Thoại
                            </label>
                            <input type="text" id="edit-pt-dien-thoai" class="form-control form-control-sm font-monospace" value="${escapeHtml(item.dien_thoai || '')}" placeholder="Số điện thoại..." oninput="checkPhieuThuDetailDirty()">
                        </div>

                        <div class="col-md-6">
                            <label class="form-label small fw-semibold text-muted mb-1">
                                <i class="bi bi-receipt me-1"></i>Phiếu Xuất Liên Quan
                            </label>
                            <input type="text" id="edit-pt-phieu-lq" class="form-control form-control-sm font-monospace fw-semibold text-danger" value="${escapeHtml(item.phieu_lien_quan || '')}" placeholder="Ví dụ: XH1003/10 (hoặc để trống)" oninput="checkPhieuThuDetailDirty()">
                        </div>
                        <div class="col-md-6">
                            <label class="form-label small fw-semibold text-muted mb-1">
                                <i class="bi bi-cash-coin me-1"></i>Số Tiền Thu (VNĐ) <span class="text-danger">*</span>
                            </label>
                            <input type="number" min="1" step="1000" id="edit-pt-so-tien" class="form-control form-control-sm fs-6 fw-bold font-monospace text-success" value="${item.so_tien || 0}" oninput="onEditPtSoTienInput(this)">
                        </div>

                        <div class="col-12">
                            <label class="form-label small fw-semibold text-muted mb-1">
                                <i class="bi bi-chat-left-text me-1"></i>Nội Dung / Ghi Chú
                            </label>
                            <textarea id="edit-pt-ghi-chu" class="form-control form-control-sm" rows="2" placeholder="Ghi chú nội dung thu tiền..." oninput="checkPhieuThuDetailDirty()">${escapeHtml(item.ghi_chu || '')}</textarea>
                        </div>
                    </div>
                </div>
            </div>
            <div class="d-none" id="printable-pt-slip"></div>
        `;

        const btnDel = document.getElementById('btn-modal-delete-phieu-thu');
        if (btnDel) {
            btnDel.onclick = () => confirmDeletePhieuThu(item.id, item.ma_phieu);
        }

        const btnPrint = document.getElementById('btn-modal-print-phieu-thu');
        if (btnPrint) {
            btnPrint.onclick = () => printCurrentPtSlip();
        }

        setupPhieuThuModalUnsavedHook('modal-detail-phieu-thu');
        openModal('modal-detail-phieu-thu');
    } catch (e) {
        showToast('Lỗi xem chi tiết phiếu thu: ' + e.message, 'error');
    }
}

function onEditPtSoTienInput(input) {
    const val = parseFloat(input.value || 0) || 0;
    const previewEl = document.getElementById('edit-pt-so-tien-preview');
    if (previewEl) previewEl.innerText = formatVND(val);
    checkPhieuThuDetailDirty();
}

function checkPhieuThuDetailDirty() {
    if (!window.initialPhieuThuDetail) return;
    const init = window.initialPhieuThuDetail;

    const curNgay = document.getElementById('edit-pt-ngay')?.value || '';
    const curLoaiQuy = document.getElementById('edit-pt-loai-quy')?.value || '';
    const curDoiTuong = document.getElementById('edit-pt-doi-tuong')?.value.trim() || '';
    const curSdt = document.getElementById('edit-pt-dien-thoai')?.value.trim() || '';
    const curPhieuLq = document.getElementById('edit-pt-phieu-lq')?.value.trim() || '';
    const curSoTien = parseFloat(document.getElementById('edit-pt-so-tien')?.value || 0) || 0;
    const curGhiChu = document.getElementById('edit-pt-ghi-chu')?.value.trim() || '';

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
        markPhieuThuDetailDirty();
    } else {
        resetPhieuThuDetailClean();
    }
}

function markPhieuThuDetailDirty() {
    window.isPhieuThuDetailDirty = true;
    const btn = document.getElementById('btn-save-detail-phieu-thu');
    if (btn) {
        btn.className = 'btn btn-success btn-sm fw-bold shadow px-3';
        btn.disabled = false;
        btn.innerHTML = '<i class="bi bi-floppy2-fill me-1"></i>Lưu thay đổi';
    }
}

function resetPhieuThuDetailClean() {
    window.isPhieuThuDetailDirty = false;
    const btn = document.getElementById('btn-save-detail-phieu-thu');
    if (btn) {
        btn.className = 'btn btn-secondary btn-sm opacity-50 px-3';
        btn.disabled = true;
        btn.innerHTML = '<i class="bi bi-floppy2 me-1"></i>Lưu thay đổi';
    }
}

async function savePhieuThuDetail(shouldCloseAfterSave = false) {
    if (!window.currentPhieuThuDetail) return;
    const item = window.currentPhieuThuDetail;

    const curNgay = document.getElementById('edit-pt-ngay')?.value || '';
    const curLoaiQuy = document.getElementById('edit-pt-loai-quy')?.value || '';
    const curDoiTuong = document.getElementById('edit-pt-doi-tuong')?.value.trim() || '';
    const curSdt = document.getElementById('edit-pt-dien-thoai')?.value.trim() || '';
    const curPhieuLq = document.getElementById('edit-pt-phieu-lq')?.value.trim() || '';
    const curSoTien = parseFloat(document.getElementById('edit-pt-so-tien')?.value || 0) || 0;
    const curGhiChu = document.getElementById('edit-pt-ghi-chu')?.value.trim() || '';

    if (!curDoiTuong) {
        showToast('Vui lòng nhập tên người nộp tiền!', 'warning');
        return;
    }
    if (curSoTien <= 0) {
        showToast('Số tiền thu phải lớn hơn 0!', 'warning');
        return;
    }
    if (!curNgay) {
        showToast('Vui lòng chọn ngày thu tiền!', 'warning');
        return;
    }

    const saveBtn = document.getElementById('btn-save-detail-phieu-thu');
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
            showToast(res.message || `Đã lưu cập nhật phiếu thu ${item.ma_phieu} thành công!`, 'success');

            const updatedData = res.data || { ...item, ...payload };
            window.initialPhieuThuDetail = { ...updatedData };
            window.currentPhieuThuDetail = { ...updatedData };
            resetPhieuThuDetailClean();

            await loadRecentReceipts();
            await fetchNextCode();
            if (typeof broadcastDataUpdate === 'function') {
                broadcastDataUpdate('BALANCE_UPDATED');
                broadcastDataUpdate('DEBT_UPDATED');
            }

            if (shouldCloseAfterSave) {
                closeModal('confirm-unsaved-receipt-modal');
                closeModal('modal-detail-phieu-thu');
            }
        }
    } catch (e) {
        showToast('Lỗi khi lưu phiếu thu: ' + (e.message || 'Không thể lưu'), 'error');
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.innerHTML = origHtml;
        }
    } finally {
        hideLoading();
    }
}

function safeClosePhieuThuDetailModal() {
    if (window.isPhieuThuDetailDirty) {
        const unsavedModalEl = document.getElementById('confirm-unsaved-receipt-modal');
        if (unsavedModalEl) {
            const btnSave = document.getElementById('btn-unsaved-save');
            const btnDiscard = document.getElementById('btn-unsaved-discard');
            const btnCancel = document.getElementById('btn-unsaved-cancel');

            if (btnSave) {
                btnSave.onclick = () => savePhieuThuDetail(true);
            }
            if (btnDiscard) {
                btnDiscard.onclick = () => {
                    window.isPhieuThuDetailDirty = false;
                    closeModal('confirm-unsaved-receipt-modal');
                    closeModal('modal-detail-phieu-thu');
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
    closeModal('modal-detail-phieu-thu');
}

function setupPhieuThuModalUnsavedHook(modalId) {
    const el = document.getElementById(modalId);
    if (!el || el._unsavedHooked) return;
    el._unsavedHooked = true;

    el.addEventListener('hide.bs.modal', function(e) {
        if (window.isPhieuThuDetailDirty) {
            e.preventDefault();
            safeClosePhieuThuDetailModal();
        }
    });
}

function printCurrentPtSlip() {
    if (!window.currentPhieuThuDetail) return;
    const item = window.currentPhieuThuDetail;

    const curNgay = document.getElementById('edit-pt-ngay')?.value || item.ngay;
    const curLoaiQuy = document.getElementById('edit-pt-loai-quy')?.value || item.loai_quy;
    const curDoiTuong = document.getElementById('edit-pt-doi-tuong')?.value || item.doi_tuong;
    const curSdt = document.getElementById('edit-pt-dien-thoai')?.value || item.dien_thoai;
    const curPhieuLq = document.getElementById('edit-pt-phieu-lq')?.value || item.phieu_lien_quan;
    const curSoTien = parseFloat(document.getElementById('edit-pt-so-tien')?.value || item.so_tien) || 0;
    const curGhiChu = document.getElementById('edit-pt-ghi-chu')?.value || item.ghi_chu;

    const loaiStr = curLoaiQuy === 'TIEN_MAT' ? 'Tiền mặt' : 'Tiền gửi ngân hàng (Chuyển khoản)';
    const printContainer = document.getElementById('printable-pt-slip');
    if (!printContainer) return;

    printContainer.innerHTML = `
        <div class="p-3">
            <div class="text-center mb-3 border-bottom pb-2">
                <h5 class="fw-bold text-uppercase mb-1 text-success">PHIẾU THU TIỀN</h5>
                <div class="font-monospace text-muted small">
                    Mã số: <strong>${escapeHtml(item.ma_phieu)}</strong> | Ngày: <strong>${formatDate(curNgay)}</strong>
                </div>
            </div>
            <div class="row g-2 mb-2">
                <div class="col-sm-4 text-muted">Người / Đơn Vị Nộp Tiền:</div>
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
                <div class="col-sm-4 text-muted">Phiếu Xuất Liên Quan:</div>
                <div class="col-sm-8 font-monospace fw-bold text-danger">
                    ${escapeHtml(curPhieuLq)}
                </div>
            </div>` : ''}
            <div class="row g-2 mb-2">
                <div class="col-sm-4 text-muted">Số tiền thu:</div>
                <div class="col-sm-8 fs-4 fw-bold font-monospace text-success">
                    ${formatVND(curSoTien)}
                </div>
            </div>
            <div class="row g-2 mb-2">
                <div class="col-sm-4 text-muted">Nội dung / Ghi chú:</div>
                <div class="col-sm-8 p-2 bg-light rounded">${escapeHtml(curGhiChu || 'Không có')}</div>
            </div>
        </div>
    `;

    printReceiptModal('printable-pt-slip', 'Phiếu Thu Tiền');
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
