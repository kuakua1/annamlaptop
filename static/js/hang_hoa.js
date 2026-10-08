/**
 * hang_hoa.js - Products management page logic
 */

// ── Danh mục cố định ──────────────────────────────────────────────────────────
const DANH_MUC_LIST = ['Laptop', 'Linh Kiện Laptop', 'Linh Kiện PC', 'Phụ Kiện', 'Khác'];


let allProducts = [];
let editingId = null;

function populateDanhMucDropdowns() {
    // Populate modal dropdown
    const modalSel = document.getElementById('f-danh-muc');
    if (modalSel) {
        modalSel.innerHTML = '<option value="">-- Chọn danh mục --</option>';
        DANH_MUC_LIST.forEach(dm => {
            modalSel.innerHTML += `<option value="${dm}">${dm}</option>`;
        });
    }

    // Populate filter dropdown
    const filterSel = document.getElementById('filter-danh-muc');
    if (filterSel) {
        filterSel.innerHTML = '<option value="">Tất cả danh mục</option>';
        DANH_MUC_LIST.forEach(dm => {
            filterSel.innerHTML += `<option value="${dm}">${dm}</option>`;
        });
    }
}

let allProductsCache = [];

async function loadProducts(silent = false) {
    try {
        if (!silent) showLoading();
        const res = await apiRequest('/api/hang-hoa');
        allProductsCache = res.data || [];
        applyFilters();
    } catch (e) {
        if (!silent) showToast(e.message, 'error');
    } finally {
        if (!silent) hideLoading();
    }
}

function applyFilters() {
    const search = (document.getElementById('search-input')?.value || '').trim();
    const danhMuc = document.getElementById('filter-danh-muc')?.value || '';

    let filtered = allProductsCache;
    if (danhMuc) {
        filtered = filtered.filter(p => p.danh_muc === danhMuc);
    }
    if (search) {
        const matcher = window.matchSearchKeywords || matchSearchKeywords || ((txt, q) => (txt || '').toLowerCase().includes((q || '').toLowerCase()));
        filtered = filtered.filter(p => {
            const targetText = `${p.ma_hang || ''} ${p.ten_hang || ''} ${p.danh_muc || ''} ${p.ghi_chu || ''}`;
            return matcher(targetText, search);
        });
    }

    allProducts = filtered;
    renderTable(allProducts);
    const countEl = document.getElementById('total-count');
    if (countEl) countEl.textContent = allProducts.length;
}

function renderTonKhoCell(p) {
    if (p.ton_kho <= 0) {
        return `<span class="badge bg-danger fs-6 px-2 py-1">0</span>`;
    }
    const batches = p.batches || [];
    if (batches.length <= 1) {
        return `<span class="badge ${p.ton_kho <= 10 ? 'bg-warning text-dark' : 'bg-success'} fs-6 px-2 py-1" title="Đơn giá nhập: ${formatVND(p.gia_nhap)}">${formatNumber(p.ton_kho)}</span>`;
    }
    // Multiple price batches!
    return `
        <div class="dropdown d-inline-block">
            <button class="btn btn-sm btn-outline-primary dropdown-toggle py-0 px-2 fw-bold" type="button" data-bs-toggle="dropdown" aria-expanded="false" title="Bấm để xem chi tiết ${batches.length} lô giá khác nhau">
                ${formatNumber(p.ton_kho)} <span class="badge bg-primary ms-1">${batches.length} lô</span>
            </button>
            <ul class="dropdown-menu dropdown-menu-end shadow py-2" style="min-width: 250px;">
                <li class="dropdown-header text-uppercase fw-bold text-muted small pb-1 border-bottom">
                    <i class="bi bi-layers me-1 text-primary"></i>Chi Tiết Các Lô Giá
                </li>
                ${batches.map((b, idx) => `
                    <li class="dropdown-item-text py-1 px-3 d-flex justify-content-between align-items-center">
                        <span><span class="badge bg-secondary me-1">Lô ${idx + 1}</span> <strong>${formatNumber(b.so_luong)}</strong> ${escapeHtml(p.don_vi_tinh)}</span>
                        <span class="text-primary fw-semibold ms-2">${formatVND(b.gia_nhap)}</span>
                    </li>
                `).join('')}
                <li class="dropdown-divider my-1"></li>
                <li class="dropdown-item-text text-muted small px-3 d-flex justify-content-between">
                    <span>Tổng vốn tồn:</span>
                    <strong class="text-dark">${formatVND(batches.reduce((sum, b) => sum + b.so_luong * b.gia_nhap, 0))}</strong>
                </li>
            </ul>
        </div>
    `;
}

function renderTable(products) {
    const tbody = document.getElementById('products-tbody');
    if (!products.length) {
        tbody.innerHTML = '<tr><td colspan="9" class="text-center text-muted py-4">Không có dữ liệu</td></tr>';
        return;
    }
    tbody.innerHTML = products.map((p, i) => `
        <tr>
            <td>${i + 1}</td>
            <td><span class="badge bg-secondary">${escapeHtml(p.ma_hang)}</span></td>
            <td><strong>${escapeHtml(p.ten_hang)}</strong></td>
            <td>${p.danh_muc ? `<span class="badge bg-info bg-opacity-75 text-dark">${escapeHtml(p.danh_muc)}</span>` : '-'}</td>
            <td>${escapeHtml(p.don_vi_tinh)}</td>
            <td class="text-end">${formatVND(p.gia_nhap)}</td>
            <td class="text-end">${formatVND(p.gia_ban)}</td>
            <td class="text-center">
                ${renderTonKhoCell(p)}
            </td>
            <td>
                <button class="btn btn-sm btn-outline-primary btn-icon me-1" onclick="openEdit('${p.id}')">
                    <i class="bi bi-pencil"></i>
                </button>
                <button class="btn btn-sm btn-outline-danger btn-icon" onclick="deleteProduct('${p.id}')">
                    <i class="bi bi-trash"></i>
                </button>
            </td>
        </tr>
    `).join('');
}

function openAdd(prefill = {}) {
    editingId = null;
    document.getElementById('modal-title').textContent = 'Thêm Hàng Hóa';
    document.getElementById('product-form').reset();
    // Pre-fill fields if provided (called from nhap_hang quick-create)
    if (prefill.ten_hang) document.getElementById('f-ten-hang').value = prefill.ten_hang;
    if (prefill.danh_muc) document.getElementById('f-danh-muc').value = prefill.danh_muc;
    if (prefill.gia_nhap) document.getElementById('f-gia-nhap').value = prefill.gia_nhap;
    if (prefill.gia_ban) document.getElementById('f-gia-ban').value = prefill.gia_ban;
    openModal('product-modal');
}

function openEdit(id) {
    editingId = String(id);
    const p = allProductsCache.find(x => String(x.id) === String(id)) || allProducts.find(x => String(x.id) === String(id));
    if (!p) {
        showToast('Không tìm thấy thông tin hàng hóa!', 'error');
        return;
    }
    document.getElementById('modal-title').textContent = 'Chỉnh Sửa Hàng Hóa';
    document.getElementById('f-ten-hang').value = p.ten_hang || '';
    document.getElementById('f-danh-muc').value = p.danh_muc || '';
    document.getElementById('f-dvt').value = p.don_vi_tinh || 'Cái';
    document.getElementById('f-gia-nhap').value = (p.gia_nhap !== undefined && p.gia_nhap !== null) ? p.gia_nhap : 0;
    document.getElementById('f-gia-ban').value = (p.gia_ban !== undefined && p.gia_ban !== null) ? p.gia_ban : 0;
    document.getElementById('f-ton-kho').value = (p.ton_kho !== undefined && p.ton_kho !== null) ? p.ton_kho : 0;
    document.getElementById('f-ghi-chu').value = p.ghi_chu || '';
    openModal('product-modal');
}

async function saveProduct() {
    const tenHang = document.getElementById('f-ten-hang')?.value.trim() || '';
    if (!tenHang) { 
        showToast('Vui lòng nhập tên hàng', 'error'); 
        return; 
    }

    const parseMoney = window.parseCurrencyValue || parseCurrencyValue || (v => parseFloat(String(v).replace(/\./g, '').replace(/,/g, '')) || 0);
    const body = {
        ten_hang: tenHang,
        danh_muc: document.getElementById('f-danh-muc')?.value.trim() || '',
        don_vi_tinh: document.getElementById('f-dvt')?.value.trim() || 'Cái',
        gia_nhap: parseMoney(document.getElementById('f-gia-nhap')?.value),
        gia_ban: parseMoney(document.getElementById('f-gia-ban')?.value),
        ton_kho: parseInt(document.getElementById('f-ton-kho')?.value) || 0,
        ghi_chu: document.getElementById('f-ghi-chu')?.value.trim() || '',
    };

    const saveBtn = document.getElementById('btn-save-product') || document.querySelector('#product-modal .btn-primary');
    if (saveBtn) {
        if (saveBtn.disabled) return;
        saveBtn.disabled = true;
    }
    const origHtml = saveBtn ? saveBtn.innerHTML : '';
    if (saveBtn) {
        saveBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Đang lưu...';
    }

    try {
        showLoading();
        if (editingId) {
            await apiRequest(`/api/hang-hoa/${editingId}`, 'PUT', body);
            showToast('Cập nhật hàng hóa thành công', 'success');
        } else {
            await apiRequest('/api/hang-hoa', 'POST', body);
            showToast('Thêm hàng hóa thành công', 'success');
        }
        
        closeModal('product-modal');
        editingId = null;
        
        // Tải lại dữ liệu ngay lập tức
        await loadProducts(true);

        // Phát tín hiệu đồng bộ sang các tab khác
        if (typeof broadcastDataUpdate === 'function') {
            broadcastDataUpdate('PRODUCTS_UPDATED');
        } else if (typeof window.broadcastDataUpdate === 'function') {
            window.broadcastDataUpdate('PRODUCTS_UPDATED');
        }
        try {
            if (typeof BroadcastChannel !== 'undefined') {
                const bc = new BroadcastChannel('inventory_sync');
                bc.postMessage({ type: 'PRODUCTS_UPDATED' });
            }
        } catch (bcErr) {}
    } catch (e) {
        showToast(e.message || 'Lỗi khi lưu hàng hóa', 'error');
    } finally {
        hideLoading();
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.innerHTML = origHtml;
        }
    }
}

async function deleteProduct(id) {
    const p = allProducts.find(x => x.id === id);
    const name = p ? p.ten_hang : 'này';
    if (!confirmDelete(`Xóa hàng hóa "${name}"?`)) return;
    try {
        showLoading();
        await apiRequest(`/api/hang-hoa/${id}`, 'DELETE');
        showToast('Đã xóa hàng hóa');
        await loadProducts();
    } catch (e) {
        showToast(e.message, 'error');
    } finally {
        hideLoading();
    }
}

const COMPANY_REPORT_INFO = window.COMPANY_INFO || {
    name: 'CÔNG TY CỔ PHẦN THIẾT BỊ VÀ CÔNG NGHỆ SỐ AN NAM',
    address: '454 Nguyễn Trãi, Hạc Thành, Thanh Hóa, Việt Nam',
    brand: 'KHO HÀNG AN NAM',
    hotline: '0386.539.555',
    email: 'contact@laptopannam.com'
};

async function exportProductsExcel() {
    if (!allProducts || !allProducts.length) {
        showToast('Không có dữ liệu hàng hóa để xuất Excel!', 'info');
        return;
    }

    if (typeof window.ExcelJS === 'undefined') {
        showToast('Đang khởi tạo công cụ ExcelJS, vui lòng thử lại sau giây lát!', 'info');
        return;
    }

    const now = new Date();
    const dateCloseStr = `Ngày ${String(now.getDate()).padStart(2, '0')} tháng ${String(now.getMonth() + 1).padStart(2, '0')} năm ${now.getFullYear()}`;
    const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;

    const wb = new window.ExcelJS.Workbook();
    wb.creator = COMPANY_REPORT_INFO.name;
    wb.lastModifiedBy = COMPANY_REPORT_INFO.name;
    wb.created = now;

    const ws = wb.addWorksheet('DanhSachHangHoa', { views: [{ showGridLines: true }] });

    ws.columns = [
        { width: 6 },   // A: STT
        { width: 14 },  // B: Mã hàng
        { width: 42 },  // C: Tên hàng hóa
        { width: 18 },  // D: Danh mục
        { width: 10 },  // E: ĐVT
        { width: 14 },  // F: Số lượng tồn
        { width: 18 },  // G: Đơn giá vốn
        { width: 22 },  // H: Thành tiền tồn
        { width: 22 },  // I: Ghi chú
    ];

    const fontNormal = { name: 'Times New Roman', size: 10, color: { argb: 'FF000000' } };
    const fontBold = { name: 'Times New Roman', size: 10, bold: true, color: { argb: 'FF000000' } };
    const fontTitle = { name: 'Times New Roman', size: 15, bold: true, color: { argb: 'FF000000' } };
    const fontItalic = { name: 'Times New Roman', size: 9.5, italic: true, color: { argb: 'FF000000' } };

    const borderThinAll = {
        top: { style: 'thin', color: { argb: 'FF000000' } },
        bottom: { style: 'thin', color: { argb: 'FF000000' } },
        left: { style: 'thin', color: { argb: 'FF000000' } },
        right: { style: 'thin', color: { argb: 'FF000000' } }
    };

    // Header góc trái (Đơn vị & Địa chỉ)
    ws.getCell('A1').value = `Đơn vị: ${COMPANY_REPORT_INFO.name}`;
    ws.getCell('A1').font = fontBold;
    ws.getCell('A2').value = `Địa chỉ: ${COMPANY_REPORT_INFO.address}`;
    ws.getCell('A2').font = fontBold;

    // Header góc phải (Mẫu số TT 133)
    ws.mergeCells('G1:I1');
    const mCell = ws.getCell('G1');
    mCell.value = 'Mẫu số 01 - VT';
    mCell.font = fontBold;
    mCell.alignment = { horizontal: 'center' };

    ws.mergeCells('G2:I2');
    const qdCell = ws.getCell('G2');
    qdCell.value = '(Ban hành theo TT 133/2016/TT-BTC';
    qdCell.font = fontItalic;
    qdCell.alignment = { horizontal: 'center' };

    ws.mergeCells('G3:I3');
    const qd2Cell = ws.getCell('G3');
    qd2Cell.value = 'ngày 26/08/2016 của Bộ Trưởng BTC)';
    qd2Cell.font = fontItalic;
    qd2Cell.alignment = { horizontal: 'center' };

    // Tiêu đề bảng
    ws.mergeCells('A5:I5');
    const tCell = ws.getCell('A5');
    tCell.value = 'BÁO CÁO DANH MỤC & TỒN KHO HÀNG HÓA';
    tCell.font = fontTitle;
    tCell.alignment = { horizontal: 'center', vertical: 'middle' };

    // Thời điểm báo cáo
    ws.mergeCells('A6:I6');
    const pCell = ws.getCell('A6');
    pCell.value = `Thời điểm: ${dateCloseStr}`;
    pCell.font = fontNormal;
    pCell.alignment = { horizontal: 'center', vertical: 'middle' };

    // Đơn vị tính
    ws.mergeCells('G8:I8');
    const uCell = ws.getCell('G8');
    uCell.value = 'Đơn vị tính: Đồng';
    uCell.font = fontBold;
    uCell.alignment = { horizontal: 'right', vertical: 'middle' };

    // Hàng 9: Tiêu đề các cột
    const headers = [
        'STT',
        'Mã hàng',
        'Tên vật tư, hàng hóa',
        'Danh mục',
        'ĐVT',
        'Số lượng tồn',
        'Đơn giá vốn',
        'Thành tiền vốn',
        'Ghi chú'
    ];

    const hRow = ws.getRow(9);
    hRow.height = 25;
    headers.forEach((h, idx) => {
        const cell = hRow.getCell(idx + 1);
        cell.value = h;
        cell.font = fontBold;
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } };
        cell.border = borderThinAll;
    });

    let currentRow = 10;
    let totQty = 0;
    let totVal = 0;

    allProducts.forEach((p, idx) => {
        const row = ws.getRow(currentRow);
        row.height = 20;

        const sl = parseInt(p.ton_kho) || 0;
        const giaNhap = parseFloat(p.gia_nhap) || 0;
        const batches = p.batches || [];
        let giaTriTon = 0;
        if (p.thanh_tien_ton !== undefined) {
            giaTriTon = p.thanh_tien_ton;
        } else if (batches.length > 1) {
            giaTriTon = batches.reduce((bSum, b) => bSum + (b.so_luong * b.gia_nhap), 0);
        } else {
            giaTriTon = Math.round(sl * giaNhap);
        }

        const donGiaHienThi = (sl > 0 && batches.length > 1) ? Math.round(giaTriTon / sl) : giaNhap;

        totQty += sl;
        totVal += giaTriTon;

        row.getCell(1).value = idx + 1;
        row.getCell(1).alignment = { horizontal: 'center' };

        row.getCell(2).value = p.ma_hang || '';
        row.getCell(2).alignment = { horizontal: 'center' };

        row.getCell(3).value = p.ten_hang || '';
        row.getCell(3).alignment = { horizontal: 'left' };

        row.getCell(4).value = p.danh_muc || 'Khác';
        row.getCell(4).alignment = { horizontal: 'left' };

        row.getCell(5).value = p.don_vi_tinh || 'Cái';
        row.getCell(5).alignment = { horizontal: 'center' };

        row.getCell(6).value = sl;
        row.getCell(6).numFmt = '#,##0';
        row.getCell(6).alignment = { horizontal: 'right' };

        row.getCell(7).value = donGiaHienThi;
        row.getCell(7).numFmt = '#,##0';
        row.getCell(7).alignment = { horizontal: 'right' };

        row.getCell(8).value = giaTriTon;
        row.getCell(8).numFmt = '#,##0';
        row.getCell(8).alignment = { horizontal: 'right' };

        row.getCell(9).value = p.ghi_chu || '';
        row.getCell(9).alignment = { horizontal: 'left' };

        for (let c = 1; c <= 9; c++) {
            row.getCell(c).font = fontNormal;
            row.getCell(c).border = borderThinAll;
        }

        currentRow++;
    });

    // Hàng Tổng cộng
    const rTot = ws.getRow(currentRow);
    rTot.height = 24;
    ws.mergeCells(`A${currentRow}:E${currentRow}`);
    rTot.getCell(1).value = 'TỔNG CỘNG';
    rTot.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };

    rTot.getCell(6).value = totQty;
    rTot.getCell(6).numFmt = '#,##0';
    rTot.getCell(6).alignment = { horizontal: 'right', vertical: 'middle' };

    rTot.getCell(7).value = '';
    rTot.getCell(7).alignment = { horizontal: 'center', vertical: 'middle' };

    rTot.getCell(8).value = totVal;
    rTot.getCell(8).numFmt = '#,##0';
    rTot.getCell(8).alignment = { horizontal: 'right', vertical: 'middle' };

    rTot.getCell(9).value = '';

    for (let c = 1; c <= 9; c++) {
        const cell = rTot.getCell(c);
        cell.font = fontBold;
        cell.border = borderThinAll;
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDBEAFE' } };
    }
    currentRow++;

    // Phần Ký Tên
    const signRow = currentRow + 2;
    ws.mergeCells(`G${signRow}:I${signRow}`);
    const dCell = ws.getCell(`G${signRow}`);
    dCell.value = dateCloseStr;
    dCell.font = fontItalic;
    dCell.alignment = { horizontal: 'center' };

    const rSignTitle = ws.getRow(signRow + 1);
    ws.mergeCells(`A${signRow + 1}:B${signRow + 1}`);
    rSignTitle.getCell(1).value = 'Người lập biểu';
    rSignTitle.getCell(1).font = fontBold;
    rSignTitle.getCell(1).alignment = { horizontal: 'center' };

    ws.mergeCells(`C${signRow + 1}:D${signRow + 1}`);
    rSignTitle.getCell(3).value = 'Thủ kho';
    rSignTitle.getCell(3).font = fontBold;
    rSignTitle.getCell(3).alignment = { horizontal: 'center' };

    ws.mergeCells(`E${signRow + 1}:F${signRow + 1}`);
    rSignTitle.getCell(5).value = 'Kế toán trưởng';
    rSignTitle.getCell(5).font = fontBold;
    rSignTitle.getCell(5).alignment = { horizontal: 'center' };

    ws.mergeCells(`G${signRow + 1}:I${signRow + 1}`);
    rSignTitle.getCell(7).value = 'Giám đốc';
    rSignTitle.getCell(7).font = fontBold;
    rSignTitle.getCell(7).alignment = { horizontal: 'center' };

    const rSignNote = ws.getRow(signRow + 2);
    ws.mergeCells(`A${signRow + 2}:B${signRow + 2}`);
    rSignNote.getCell(1).value = '(Ký, họ tên)';
    rSignNote.getCell(1).font = fontItalic;
    rSignNote.getCell(1).alignment = { horizontal: 'center' };

    ws.mergeCells(`C${signRow + 2}:D${signRow + 2}`);
    rSignNote.getCell(3).value = '(Ký, họ tên)';
    rSignNote.getCell(3).font = fontItalic;
    rSignNote.getCell(3).alignment = { horizontal: 'center' };

    ws.mergeCells(`E${signRow + 2}:F${signRow + 2}`);
    rSignNote.getCell(5).value = '(Ký, họ tên)';
    rSignNote.getCell(5).font = fontItalic;
    rSignNote.getCell(5).alignment = { horizontal: 'center' };

    ws.mergeCells(`G${signRow + 2}:I${signRow + 2}`);
    rSignNote.getCell(7).value = '(Ký, họ tên, đóng dấu)';
    rSignNote.getCell(7).font = fontItalic;
    rSignNote.getCell(7).alignment = { horizontal: 'center' };

    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Danh_Muc_Hang_Hoa_${dateStr}.xlsx`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
    }, 150);

    showToast('Đã xuất file Excel Danh Mục Hàng Hóa thành công!', 'success');
}

// Init
document.addEventListener('DOMContentLoaded', async () => {
    populateDanhMucDropdowns();
    await loadProducts();

    const searchHandler = typeof debounce === 'function' ? debounce(applyFilters, 200) : applyFilters;
    document.getElementById('search-input')?.addEventListener('input', searchHandler);
    document.getElementById('filter-danh-muc')?.addEventListener('change', applyFilters);

    // Tự động làm mới dữ liệu khi người dùng chuyển tab quay lại hoặc có nhập/xuất kho
    window.addEventListener('message', (e) => {
        if (e.data && (e.data.type === 'TAB_ACTIVATED' || e.data.type === 'PRODUCTS_UPDATED')) {
            loadProducts(true);
        }
    });

    try {
        if (typeof BroadcastChannel !== 'undefined') {
            const bc = new BroadcastChannel('inventory_sync');
            bc.onmessage = (e) => {
                if (e.data && e.data.type === 'PRODUCTS_UPDATED') {
                    loadProducts(true);
                }
            };
        }
    } catch (err) {}
});
