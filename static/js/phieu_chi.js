/**
 * phieu_chi.js - Logic tạo phiếu chi tiền, kiểm tra công nợ phiếu nhập kho và quản lý phiếu chi gần đây
 */

let suppliersList = [];
let unpaidInvoicesList = [];
let companyBalances = { tien_mat: 0, tien_gui: 0, tong_quy: 0 };

document.addEventListener('DOMContentLoaded', async function () {
    // 1. Gán ngày mặc định hôm nay
    const today = new Date().toISOString().split('T')[0];
    const ngayEl = document.getElementById('f-chi-ngay');
    if (ngayEl) ngayEl.value = today;

    // 2. Tải song song số dư công ty, mã phiếu chi dự kiến, danh sách đối tác & phiếu chi gần đây
    await Promise.all([
        loadCompanyBalances(),
        fetchNextCodeChi(),
        loadSuppliers(),
        loadRecentChi()
    ]);

    // 3. Kiểm tra tham số URL (ncc_id, ncc_ten, sdt, so_tien, so_phieu) để tự động điền đối tác
    const urlParams = new URLSearchParams(window.location.search);
    const paramNccId = (urlParams.get('ncc_id') || '').trim();
    const paramNccTen = (urlParams.get('ncc_ten') || '').trim();
    const paramSdt = (urlParams.get('sdt') || '').trim();
    const paramSoTien = parseFloat(urlParams.get('so_tien') || 0);
    const paramSoPhieu = (urlParams.get('so_phieu') || '').trim();

    if (paramNccId || paramNccTen || paramSdt || paramSoPhieu) {
        // Tự động chuyển tab sang Chi Trả Nhà Cung Cấp
        switchLoaiChiMode('NHA_CUNG_CAP');

        let matched = null;
        if (paramNccId) {
            matched = suppliersList.find(c => String(c.id).trim() === String(paramNccId).trim());
        }
        if (!matched && paramSdt) {
            matched = suppliersList.find(c => String(c.dien_thoai || '').trim() === String(paramSdt).trim());
        }
        if (!matched && paramNccTen) {
            matched = suppliersList.find(c => (c.ten || c.ten_ncc || c.ten_kh || '').toLowerCase().trim() === paramNccTen.toLowerCase().trim());
        }

        if (matched) {
            selectSupplier(matched.id, paramSoPhieu, paramSoTien);
        } else {
            const idEl = document.getElementById('f-ncc-id');
            if (idEl) idEl.value = paramNccId;
            if (paramNccTen) document.getElementById('f-chi-doi-tuong').value = paramNccTen;
            if (paramSdt) document.getElementById('f-chi-sdt').value = paramSdt;
            if (paramSoTien > 0) {
                const tienEl = document.getElementById('f-chi-so-tien');
                if (tienEl) tienEl.value = paramSoTien;
            }
            const lyDoEl = document.getElementById('f-chi-ly-do');
            if (lyDoEl) {
                if (paramSoPhieu) {
                    lyDoEl.value = `Thanh toán công nợ theo phiếu ${paramSoPhieu}`;
                } else if (paramNccTen) {
                    lyDoEl.value = `Thanh toán công nợ cho ${paramNccTen}`;
                }
            }
            checkSupplierDebt(true, paramSoPhieu, paramSoTien);
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

// ── Quản Lý & Kiểm Tra Số Dư Công Ty (Tiền Mặt / Tiền Gửi) ───────────────────

async function loadCompanyBalances() {
    try {
        const res = await apiRequest('/api/so-quy/balances');
        if (res && res.success) {
            const src = (res.data && res.data.tien_mat !== undefined) ? res.data
                : (res.balances && res.balances.tien_mat !== undefined) ? res.balances
                : res;
            companyBalances = {
                tien_mat: parseFloat(src.tien_mat) || 0,
                tien_gui: parseFloat(src.tien_gui) || 0,
                tong_quy: parseFloat(src.tong_quy) || 0
            };
        }
    } catch (e) {
        console.warn('Lỗi lấy số dư công ty:', e);
    }
    updateBalanceUI();
}

function updateBalanceUI() {
    const loaiQuy = document.getElementById('f-chi-loai-quy')?.value || 'TIEN_MAT';
    const tm = companyBalances.tien_mat || 0;
    const tg = companyBalances.tien_gui || 0;

    const optTm = document.getElementById('opt-chi-tien-mat');
    if (optTm) {
        optTm.innerText = `Tiền mặt (Mã CMxxxx) - Dư: ${formatVND(tm)}`;
    }
    const optTg = document.getElementById('opt-chi-ngan-hang');
    if (optTg) {
        optTg.innerText = `Tiền gửi ngân hàng (Mã CGxxxx) - Dư: ${formatVND(tg)}`;
    }

    const currentBal = (loaiQuy === 'TIEN_MAT') ? tm : tg;
    const lbl = document.getElementById('lbl-so-du-quy');
    if (lbl) {
        lbl.innerText = formatVND(currentBal);
        if (currentBal <= 0) {
            lbl.className = 'text-danger font-monospace';
        } else {
            lbl.className = 'text-success font-monospace';
        }
    }

    checkSufficientBalance();
}

function checkSufficientBalance() {
    const loaiQuy = document.getElementById('f-chi-loai-quy')?.value || 'TIEN_MAT';
    const soTien = (window.parseCurrencyValue || parseCurrencyValue)(document.getElementById('f-chi-so-tien')?.value || 0);
    const availBal = (loaiQuy === 'TIEN_MAT') ? (companyBalances.tien_mat || 0) : (companyBalances.tien_gui || 0);
    const warnEl = document.getElementById('warn-so-du-khong-du');
    const inputSoTien = document.getElementById('f-chi-so-tien');

    if (soTien > availBal) {
        if (warnEl) {
            const quyTen = loaiQuy === 'TIEN_MAT' ? 'tiền mặt' : 'tiền gửi ngân hàng';
            warnEl.innerHTML = `<i class="bi bi-exclamation-triangle-fill me-1"></i>Số dư ${quyTen} không đủ! (Còn: ${formatVND(availBal)})`;
            warnEl.classList.remove('d-none');
        }
        if (inputSoTien) {
            inputSoTien.classList.add('is-invalid');
        }
        return false;
    } else {
        if (warnEl) {
            warnEl.classList.add('d-none');
        }
        if (inputSoTien) {
            inputSoTien.classList.remove('is-invalid');
        }
        return true;
    }
}

function onSoTienChiInput() {
    checkSufficientBalance();
}

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
    updateBalanceUI();
}

function onNgayChange() {
    fetchNextCodeChi();
}

// Lắng nghe cập nhật số dư từ các tab khác
try {
    if (typeof BroadcastChannel !== 'undefined') {
        const bc = new BroadcastChannel('inventory_sync');
        bc.onmessage = function (e) {
            if (e.data && (e.data.type === 'BALANCE_UPDATED' || e.data.type === 'DATA_UPDATED' || e.data.type === 'DEBT_UPDATED')) {
                loadCompanyBalances();
            }
        };
    }
} catch (err) {}

window.addEventListener('message', function (e) {
    if (e.data && (e.data.type === 'BALANCE_UPDATED' || e.data.type === 'DATA_UPDATED' || e.data.type === 'DEBT_UPDATED')) {
        loadCompanyBalances();
    }
});

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

function selectSupplier(id, targetSoPhieu = '', presetAmount = 0) {
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
    checkSupplierDebt(true, targetSoPhieu, presetAmount);
}

// ── Kiểm Tra Công Nợ Phiếu Nhập Kho ─────────────────────────────────────────

let checkDebtTimer = null;
let lastCheckedDebtKey = '';
let currentSelectedSoPhieu = '';

function checkSupplierDebt(force = false, targetSoPhieu = '', presetAmount = 0) {
    if (checkDebtTimer) clearTimeout(checkDebtTimer);
    checkDebtTimer = setTimeout(() => _executeCheckSupplierDebt(force, targetSoPhieu, presetAmount), 100);
}

async function _executeCheckSupplierDebt(force = false, targetSoPhieu = '', presetAmount = 0) {
    const tenNcc = document.getElementById('f-chi-doi-tuong')?.value.trim() || '';
    const nccId = document.getElementById('f-ncc-id')?.value.trim() || '';
    const sdt = document.getElementById('f-chi-sdt')?.value.trim() || '';

    const currentKey = `${tenNcc}|${nccId}|${sdt}`;
    if (!force && currentKey === lastCheckedDebtKey && !targetSoPhieu && !presetAmount) {
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

        if (res.success && res.has_debt && res.invoices && res.invoices.length > 0) {
            unpaidInvoicesList = res.invoices;
            const totalDebt = res.invoices.reduce((sum, inv) => sum + (parseFloat(inv.tong_no) || 0), 0);

            if (badgeEl) {
                badgeEl.className = 'badge bg-danger';
                badgeEl.innerText = `Công ty đang nợ ${res.count} phiếu (${formatVND(totalDebt)})`;
            }

            let optionsHtml = '<option value="">-- Chi tự do / Không theo phiếu --</option>';
            if (res.invoices.length > 1) {
                optionsHtml += `<option value="ALL">-- [Tất cả] Thanh toán toàn bộ nợ (${formatVND(totalDebt)}) --</option>`;
            }
            res.invoices.forEach(inv => {
                const ngayFormatted = formatDate(inv.ngay_nhap);
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
                document.getElementById('f-chi-so-tien').value = amt;
                document.getElementById('f-chi-ly-do').value = `Thanh toán tiền nhập hàng theo phiếu ${matchedTarget.so_phieu} ngày ${formatDate(matchedTarget.ngay_nhap)}`;
            } else if (res.invoices.length === 1 && selectEl) {
                selectEl.value = res.invoices[0].so_phieu;
                currentSelectedSoPhieu = res.invoices[0].so_phieu;
                const amt = (presetAmount > 0) ? presetAmount : res.invoices[0].tong_no;
                document.getElementById('f-chi-so-tien').value = amt;
                document.getElementById('f-chi-ly-do').value = `Thanh toán tiền nhập hàng theo phiếu ${res.invoices[0].so_phieu} ngày ${formatDate(res.invoices[0].ngay_nhap)}`;
            } else if (res.invoices.length > 1 && selectEl) {
                // Nhiều phiếu: Tự động chọn ALL (toàn bộ công nợ)
                selectEl.value = 'ALL';
                currentSelectedSoPhieu = 'ALL';
                const amt = (presetAmount > 0) ? presetAmount : totalDebt;
                document.getElementById('f-chi-so-tien').value = amt;
                document.getElementById('f-chi-ly-do').value = `Thanh toán toàn bộ công nợ cho ${tenNcc}`;
                if (helpEl) {
                    helpEl.classList.remove('d-none');
                    helpEl.innerHTML = `<span class="text-danger fw-semibold">Công ty đang nợ ${res.count} đơn nhập hàng (Tổng nợ: ${formatVND(totalDebt)}). Đã chọn thanh toán toàn bộ hoặc bạn có thể chọn từng phiếu ở ô trên.</span>`;
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
            if (presetAmount > 0) {
                document.getElementById('f-chi-so-tien').value = presetAmount;
            }
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
    const tenNcc = document.getElementById('f-chi-doi-tuong')?.value.trim() || 'đối tác';

    if (!selectedSoPhieu) {
        currentSelectedSoPhieu = '';
        return;
    }

    if (selectedSoPhieu === 'ALL') {
        const totalDebt = unpaidInvoicesList.reduce((sum, inv) => sum + (parseFloat(inv.tong_no) || 0), 0);
        document.getElementById('f-chi-so-tien').value = totalDebt;
        document.getElementById('f-chi-ly-do').value = `Thanh toán toàn bộ công nợ cho ${tenNcc}`;
        if (notify && currentSelectedSoPhieu !== 'ALL') {
            showToast(`Đã chọn thanh toán toàn bộ công nợ (${formatVND(totalDebt)})`, 'info');
        }
        currentSelectedSoPhieu = 'ALL';
        return;
    }

    const matchedInv = unpaidInvoicesList.find(x => x.so_phieu === selectedSoPhieu);
    if (matchedInv) {
        document.getElementById('f-chi-so-tien').value = matchedInv.tong_no;
        const ngayStr = formatDate(matchedInv.ngay_nhap);
        document.getElementById('f-chi-ly-do').value = `Thanh toán tiền nhập hàng theo phiếu ${matchedInv.so_phieu} ngày ${ngayStr}`;

        if (notify && currentSelectedSoPhieu !== selectedSoPhieu) {
            showToast(`Đã chọn phiếu ${matchedInv.so_phieu}, còn nợ ${formatVND(matchedInv.tong_no)}`, 'info');
        }
        currentSelectedSoPhieu = selectedSoPhieu;
    }
}

// ── Chuyển Đổi Mục Đích Chi: Cửa Hàng vs Nhà Cung Cấp ───────────────────────

function switchLoaiChiMode(type) {
    const hiddenEl = document.getElementById('f-chi-loai-chi');
    if (hiddenEl) hiddenEl.value = type;

    const btnCuaHang = document.getElementById('btn-tab-chi-cuahang');
    const btnNcc = document.getElementById('btn-tab-chi-ncc');
    const secCuaHang = document.getElementById('section-chi-cua-hang');
    const secNcc = document.getElementById('section-chi-ncc');
    const secDebt = document.getElementById('section-phieu-nhap-debt');

    if (type === 'CUA_HANG') {
        if (btnCuaHang) {
            btnCuaHang.className = 'btn btn-sm flex-fill py-1.5 fw-semibold rounded-2 transition-all bg-white text-dark shadow-sm border';
        }
        if (btnNcc) {
            btnNcc.className = 'btn btn-sm flex-fill py-1.5 fw-semibold rounded-2 transition-all text-secondary border-0';
        }
        if (secCuaHang) secCuaHang.classList.remove('d-none');
        if (secNcc) secNcc.classList.add('d-none');
        if (secDebt) secDebt.classList.add('d-none');
    } else {
        if (btnNcc) {
            btnNcc.className = 'btn btn-sm flex-fill py-1.5 fw-semibold rounded-2 transition-all bg-white text-dark shadow-sm border';
        }
        if (btnCuaHang) {
            btnCuaHang.className = 'btn btn-sm flex-fill py-1.5 fw-semibold rounded-2 transition-all text-secondary border-0';
        }
        if (secCuaHang) secCuaHang.classList.add('d-none');
        if (secNcc) secNcc.classList.remove('d-none');
        if (secDebt) secDebt.classList.remove('d-none');
        checkSupplierDebt();
    }
}
window.switchLoaiChiMode = switchLoaiChiMode;
window.onLoaiChiRadioChange = switchLoaiChiMode;

function onHangMucSelectChange() {
    const sel = document.getElementById('f-chi-hang-muc-select');
    const customInput = document.getElementById('f-chi-hang-muc-custom');
    const val = sel?.value || '';

    if (val === 'KHAC') {
        if (customInput) {
            customInput.classList.remove('d-none');
            customInput.focus();
        }
    } else {
        if (customInput) customInput.classList.add('d-none');

        const mapLyDo = {
            'Tiền ăn trưa / Tiếp khách': 'Chi tiền cơm trưa / tiếp khách',
            'Chạy quảng cáo (Ads)': 'Chi phí chạy quảng cáo Facebook/TikTok Ads',
            'Mua gói AI & Phần mềm': 'Thanh toán gói đăng ký AI (ChatGPT/Claude/Tool)',
            'Tiền điện, nước, internet': 'Thanh toán tiền điện/nước/mạng internet cửa hàng',
            'Tiền thuê mặt bằng': 'Thanh toán tiền thuê mặt bằng cửa hàng',
            'Bao bì, đóng gói & Ship COD': 'Chi phí bao bì, đóng gói và ship COD',
            'Sửa chữa, bảo trì, vật tư': 'Chi phí sửa chữa, bảo trì, mua sắm vật tư',
            'Lương, thưởng, phụ cấp': 'Chi lương / thưởng / phụ cấp nhân viên',
            'Sinh hoạt, mua sắm vặt': 'Chi phí sinh hoạt / mua sắm đồ dùng hằng ngày'
        };

        if (mapLyDo[val]) {
            const lyDoEl = document.getElementById('f-chi-ly-do');
            if (lyDoEl) lyDoEl.value = mapLyDo[val];
        }
    }
}
window.onHangMucSelectChange = onHangMucSelectChange;

function onCustomHangMucInput() {
    const customVal = document.getElementById('f-chi-hang-muc-custom')?.value.trim();
    if (customVal) {
        const lyDoEl = document.getElementById('f-chi-ly-do');
        if (lyDoEl && !lyDoEl.value) {
            lyDoEl.value = `Chi tiêu cửa hàng: ${customVal}`;
        }
    }
}
window.onCustomHangMucInput = onCustomHangMucInput;

function selectQuickExpenseTag(hangMuc, lyDo) {
    const sel = document.getElementById('f-chi-hang-muc-select');
    const customInput = document.getElementById('f-chi-hang-muc-custom');
    if (sel) sel.value = hangMuc;
    if (customInput) customInput.classList.add('d-none');

    const lyDoEl = document.getElementById('f-chi-ly-do');
    if (lyDoEl) lyDoEl.value = lyDo;

    const tienEl = document.getElementById('f-chi-so-tien');
    if (tienEl) {
        tienEl.focus();
        tienEl.select();
    }
}
window.selectQuickExpenseTag = selectQuickExpenseTag;

// ── Lưu Phiếu Chi ──────────────────────────────────────────────────────────

async function savePhieuChi() {
    const loaiQuy = document.getElementById('f-chi-loai-quy').value;
    const ngay = document.getElementById('f-chi-ngay').value;
    const loaiChi = document.getElementById('f-chi-loai-chi')?.value || 'NHA_CUNG_CAP';
    let doiTuong = '';
    let sdt = '';
    let diaChi = '';
    let nccId = '';
    let phieuLq = '';
    let hangMuc = '';

    if (loaiChi === 'CUA_HANG') {
        const selHangMuc = document.getElementById('f-chi-hang-muc-select')?.value || '';
        if (selHangMuc === 'KHAC') {
            hangMuc = document.getElementById('f-chi-hang-muc-custom')?.value.trim() || 'Hạng mục khác';
        } else {
            hangMuc = selHangMuc;
        }

        if (!hangMuc) {
            showToast('Vui lòng chọn hoặc nhập Hạng Mục Chi Cửa Hàng', 'error');
            document.getElementById('f-chi-hang-muc-select')?.focus();
            return;
        }

        doiTuong = document.getElementById('f-chi-nguoi-nhan-cuahang')?.value.trim() || 'Nội bộ Cửa Hàng An Nam';
        phieuLq = '';
    } else {
        doiTuong = document.getElementById('f-chi-doi-tuong').value.trim();
        sdt = document.getElementById('f-chi-sdt').value.trim();
        diaChi = document.getElementById('f-chi-dia-chi').value.trim();
        nccId = document.getElementById('f-ncc-id')?.value.trim() || '';
        phieuLq = document.getElementById('f-phieu-nhap-select')?.value || '';
        hangMuc = 'Chi trả nhà cung cấp';

        if (!doiTuong) {
            showToast('Vui lòng nhập Tên Người / Đơn Vị Nhận Tiền', 'error');
            document.getElementById('f-chi-doi-tuong').focus();
            return;
        }
    }

    const soTien = (window.parseCurrencyValue || parseCurrencyValue)(document.getElementById('f-chi-so-tien').value || 0);
    const ghiChu = document.getElementById('f-chi-ly-do').value.trim() || hangMuc;

    if (!ngay) {
        showToast('Vui lòng chọn ngày chi tiền', 'error');
        return;
    }
    if (isNaN(soTien) || soTien <= 0) {
        showToast('Số tiền chi phải lớn hơn 0', 'error');
        document.getElementById('f-chi-so-tien').focus();
        return;
    }

    // Kiểm tra số dư khả dụng của quỹ công ty
    const availBal = (loaiQuy === 'TIEN_MAT') ? (companyBalances.tien_mat || 0) : (companyBalances.tien_gui || 0);
    const fundName = loaiQuy === 'TIEN_MAT' ? 'tiền mặt' : 'tiền gửi ngân hàng';
    if (soTien > availBal) {
        showToast(`Số dư ${fundName} của công ty không đủ để chi! (Khả dụng: ${formatVND(availBal)}, Cần chi: ${formatVND(soTien)}). Vui lòng nạp thêm quỹ hoặc chọn nguồn tiền khác.`, 'error');
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
            loai_chi: loaiChi,
            hang_muc_chi: hangMuc,
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
            const loaiChiText = loaiChi === 'CUA_HANG' ? `chi cửa hàng (${hangMuc})` : 'chi trả NCC';
            showToast(`Lưu phiếu ${loaiChiText} [${maPhieu}] thành công! Đã khấu trừ ${formatVND(soTien)} vào ${fundName}.`, 'success');
            resetFormPhieuChi();
            await fetchNextCodeChi();
            await loadRecentChi();
            
            // Cập nhật lại số dư công ty tức thì
            await loadCompanyBalances();

            if (typeof broadcastDataUpdate === 'function') {
                broadcastDataUpdate('DEBT_UPDATED');
                broadcastDataUpdate('BALANCE_UPDATED');
            }
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
    const selHangMuc = document.getElementById('f-chi-hang-muc-select');
    if (selHangMuc) selHangMuc.value = '';
    const customHangMuc = document.getElementById('f-chi-hang-muc-custom');
    if (customHangMuc) {
        customHangMuc.value = '';
        customHangMuc.classList.add('d-none');
    }
    const nguoiNhanEl = document.getElementById('f-chi-nguoi-nhan-cuahang');
    if (nguoiNhanEl) nguoiNhanEl.value = 'Nội bộ Cửa Hàng An Nam';

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
    checkSufficientBalance();
}

// ── Receipts list & Pagination ────────────────────────────────────────────────

let allChiList = [];
let chiCurrentPage = 1;
const CHI_PAGE_SIZE = 5;

async function loadRecentChi() {
    try {
        const res = await apiRequest('/api/phieu-chi');
        const records = (res.success && Array.isArray(res.data)) ? res.data : [];

        // Sắp xếp: Phiếu mới nhất luôn ở trên đầu (theo ngày và mã phiếu giảm dần)
        allChiList = records.sort((a, b) => {
            const dateA = a.ngay || '';
            const dateB = b.ngay || '';
            if (dateB !== dateA) return dateB.localeCompare(dateA);
            return (b.ma_phieu || '').localeCompare(a.ma_phieu || '');
        });

        renderChiPage(1);
    } catch (e) {
        console.error('Lỗi tải phiếu chi:', e);
        const container = document.getElementById('receipts-list');
        if (container) container.innerHTML = `<p class="text-danger small text-center py-4">Lỗi tải dữ liệu: ${e.message}</p>`;
    }
}

function isChiCuaHang(r) {
    if (!r) return false;
    const phieuLq = String(r.phieu_lien_quan || '').trim().toUpperCase();
    if (phieuLq.startsWith('NH') || phieuLq === 'ALL' || phieuLq.includes('NH')) {
        return false;
    }
    if (r.nha_cung_cap_id || r.doi_tuong_id) {
        return false;
    }
    if (r.loai_chi === 'NHA_CUNG_CAP') {
        return false;
    }
    if (r.loai_chi === 'CUA_HANG') {
        return true;
    }
    if (r.hang_muc_chi && r.hang_muc_chi !== 'Chi trả nhà cung cấp') {
        return true;
    }
    const doiTuong = String(r.doi_tuong || '').toLowerCase();
    if (doiTuong.includes('cửa hàng') || doiTuong.includes('nội bộ')) {
        return true;
    }
    return false;
}

function renderChiPage(page) {
    if (page !== undefined) chiCurrentPage = page;
    const container = document.getElementById('receipts-list');
    const paginationContainer = document.getElementById('receipts-pagination');
    const summaryContainer = document.getElementById('receipts-page-summary');
    if (!container) return;

    if (!allChiList.length) {
        container.innerHTML = '<div class="text-center py-4 text-muted small"><i class="bi bi-inbox fs-3 d-block mb-1"></i>Chưa có phiếu chi nào</div>';
        if (paginationContainer) paginationContainer.innerHTML = '';
        if (summaryContainer) summaryContainer.textContent = '0 phiếu';
        return;
    }

    const totalPages = Math.ceil(allChiList.length / CHI_PAGE_SIZE);
    if (chiCurrentPage > totalPages) chiCurrentPage = totalPages;
    if (chiCurrentPage < 1) chiCurrentPage = 1;

    const startIdx = (chiCurrentPage - 1) * CHI_PAGE_SIZE;
    const pageItems = allChiList.slice(startIdx, startIdx + CHI_PAGE_SIZE);

    container.innerHTML = pageItems.map(r => {
        const loaiBadge = r.loai_quy === 'TIEN_MAT'
            ? '<span class="badge bg-danger-subtle text-danger border border-danger px-1.5 py-0.5 ms-1 font-monospace" style="font-size: 0.7rem;">CM</span>'
            : '<span class="badge bg-warning-subtle text-dark border border-warning px-1.5 py-0.5 ms-1 font-monospace" style="font-size: 0.7rem;">CG</span>';

        const isCuaHang = isChiCuaHang(r);
        const hangMucBadge = isCuaHang
            ? `<span class="badge bg-light text-dark border ms-1 text-truncate" style="font-size: 0.72rem; max-width: 150px;" title="${escapeHtml(r.hang_muc_chi || 'Chi Cửa Hàng')}"><i class="bi bi-shop me-1 text-secondary"></i>${escapeHtml(r.hang_muc_chi || 'Cửa hàng')}</span>`
            : `<span class="badge bg-light text-secondary border ms-1" style="font-size: 0.72rem;"><i class="bi bi-truck me-1 text-secondary"></i>Trả NCC</span>`;

        return `
            <div class="receipt-list-item px-3 py-2 mb-2 border rounded shadow-sm bg-white" onclick="viewDetailChi('${r.id}')" style="cursor: pointer; transition: all 0.2s ease;">
                <!-- Dòng 1: Ngày + ID phiếu + Quỹ + Hạng mục (trái) và Số tiền (phải) -->
                <div class="d-flex justify-content-between align-items-center mb-1">
                    <div class="d-flex align-items-center gap-1 flex-wrap">
                        <span class="badge bg-light text-secondary border px-1.5 py-0.5 font-monospace" style="font-size: 0.75rem;">
                            <i class="bi bi-calendar3 me-1"></i>${formatDate(r.ngay)}
                        </span>
                        <span class="fw-bold text-danger font-monospace ms-1" style="font-size: 0.85rem;">${escapeHtml(r.ma_phieu || '')}</span>
                        ${loaiBadge}
                        ${hangMucBadge}
                    </div>
                    <div class="text-end">
                        <span class="fw-bold text-danger font-monospace" style="font-size: 0.95rem;">${formatVND(r.so_tien)}</span>
                    </div>
                </div>

                <!-- Dòng 2: Người nhận / Lý do (trái) + Nút thao tác (phải) -->
                <div class="d-flex justify-content-between align-items-center pt-1 border-top border-light">
                    <div class="fw-semibold text-dark text-truncate pe-2" style="font-size: 0.85rem;" title="${escapeHtml(r.doi_tuong || (isCuaHang ? 'Nội bộ Cửa Hàng' : 'Nhà cung cấp'))}">
                        <i class="bi ${isCuaHang ? 'bi-shop' : 'bi-truck'} text-secondary me-1"></i>${escapeHtml(r.doi_tuong || (isCuaHang ? 'Nội bộ Cửa Hàng' : 'Nhà cung cấp'))}
                        ${r.ghi_chu ? `<span class="text-muted fw-normal ms-1 small">(${escapeHtml(r.ghi_chu)})</span>` : ''}
                    </div>
                    <div class="d-flex align-items-center gap-2 text-nowrap">
                        <button class="btn btn-xs btn-outline-danger py-0 px-1.5" style="font-size: 0.725rem; line-height: 1.4;" onclick="event.stopPropagation(); confirmDeletePhieuChi('${r.id}', '${r.ma_phieu}')" title="Xóa phiếu chi">
                            <i class="bi bi-trash"></i>
                        </button>
                        <span class="text-danger fw-semibold" style="font-size: 0.75rem;">Chi tiết <i class="bi bi-chevron-right" style="font-size: 0.65rem;"></i></span>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    if (summaryContainer) {
        summaryContainer.textContent = `Trang ${chiCurrentPage}/${totalPages} (${allChiList.length} phiếu)`;
    }
    renderPagination('receipts-pagination', chiCurrentPage, totalPages, renderChiPage);
}

async function viewDetailChi(recordId) {
    try {
        const res = await apiRequest('/api/phieu-chi');
        const item = res.data.find(x => String(x.id) === String(recordId));
        if (!item) return;

        document.getElementById('detail-phieu-title').innerText = `Chi Tiết Phiếu Chi: ${item.ma_phieu}`;
        const modalBody = document.getElementById('detail-phieu-body');

        const loaiStr = item.loai_quy === 'TIEN_MAT' ? 'Tiền mặt' : 'Tiền gửi ngân hàng (Chuyển khoản)';
        const isCuaHang = isChiCuaHang(item);

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
                    <span class="text-muted">Mục Đích Chi:</span>
                    <strong>${isCuaHang ? '<span class="badge bg-light text-dark border"><i class="bi bi-shop me-1 text-secondary"></i>Chi Tiêu Cửa Hàng</span>' : '<span class="badge bg-light text-secondary border"><i class="bi bi-truck me-1 text-secondary"></i>Chi Trả Nhà Cung Cấp</span>'}</strong>
                </div>
                ${isCuaHang && item.hang_muc_chi ? `
                <div class="d-flex justify-content-between border-bottom pb-2 mb-2">
                    <span class="text-muted">Hạng Mục Chi:</span>
                    <strong class="text-dark"><i class="bi bi-tag text-secondary me-1"></i>${escapeHtml(item.hang_muc_chi)}</strong>
                </div>` : ''}
                <div class="d-flex justify-content-between border-bottom pb-2 mb-2">
                    <span class="text-muted">Nguồn Tiền:</span>
                    <strong>${loaiStr}</strong>
                </div>
                <div class="d-flex justify-content-between border-bottom pb-2 mb-2">
                    <span class="text-muted">Người / Đơn Vị Nhận:</span>
                    <strong>${escapeHtml(item.doi_tuong || (isCuaHang ? 'Nội bộ Cửa Hàng' : 'Nhà cung cấp'))}</strong>
                </div>
                ${item.dien_thoai ? `
                <div class="d-flex justify-content-between border-bottom pb-2 mb-2">
                    <span class="text-muted">Số Điện Thoại:</span>
                    <strong>${escapeHtml(item.dien_thoai)}</strong>
                </div>` : ''}
                ${!isCuaHang ? `
                <div class="d-flex justify-content-between border-bottom pb-2 mb-2">
                    <span class="text-muted">Phiếu Nhập Liên Quan:</span>
                    <strong class="text-primary font-monospace">${escapeHtml(item.phieu_lien_quan || 'Chi tự do')}</strong>
                </div>` : ''}
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
    if (typeof confirmDeleteReceipt === 'function') {
        confirmDeleteReceipt(maPhieu, 'CHI', async () => {
            const modalEl = document.getElementById('modal-detail-phieu-chi');
            if (modalEl) {
                const bsModal = bootstrap.Modal.getInstance(modalEl);
                if (bsModal) bsModal.hide();
            }
            await fetchNextCodeChi();
            await loadRecentChi();
            if (typeof loadCompanyBalances === 'function') {
                await loadCompanyBalances();
            }
            if (typeof broadcastDataUpdate === 'function') {
                broadcastDataUpdate('DEBT_UPDATED');
                broadcastDataUpdate('BALANCE_UPDATED');
            }
        }, recordId);
        return;
    }

    if (!confirm(`Bạn có chắc chắn muốn xóa phiếu chi ${maPhieu}?\nNếu phiếu có liên quan đến phiếu nhập kho, số tiền nợ sẽ được hoàn lại và quỹ tiền sẽ được cộng lại.`)) {
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
            await loadCompanyBalances();
            if (typeof broadcastDataUpdate === 'function') {
                broadcastDataUpdate('DEBT_UPDATED');
                broadcastDataUpdate('BALANCE_UPDATED');
            }
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
