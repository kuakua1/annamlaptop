/**
 * bang_nhap_xuat_ton.js - Logic Bảng Tổng Hợp Nhập - Xuất - Tồn (Tab Nghiệp vụ Hàng Hóa)
 * Mẫu biểu kế toán kho ERP chuẩn Thông tư 133/2016/TT-BTC
 */

let rawData = [];
let summaryData = null;
let currentFromDate = '';
let currentToDate = '';

const COMPANY_REPORT_INFO = window.COMPANY_INFO || {
    name: 'CÔNG TY CỔ PHẦN THIẾT BỊ VÀ CÔNG NGHỆ SỐ AN NAM',
    address: '454 Nguyễn Trãi, Hạc Thành, Thanh Hóa, Việt Nam',
    brand: 'KHO HÀNG AN NAM',
    hotline: '0386.539.555',
    email: 'contact@laptopannam.com'
};

function formatVNDClean(v) {
    if (!v || isNaN(v)) return '0';
    return Math.round(Number(v)).toLocaleString('vi-VN');
}

function formatISODate(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function getPeriodDisplayText() {
    if (!currentFromDate || !currentToDate) {
        const now = new Date();
        return `Tháng ${now.getMonth() + 1} năm ${now.getFullYear()}`;
    }
    const [fy, fm, fd] = currentFromDate.split('-');
    const [ty, tm, td] = currentToDate.split('-');
    if (fy === ty && fm === tm && fd === '01') {
        return `Tháng ${parseInt(fm)} năm ${fy}`;
    }
    return `Từ ngày ${fd}/${fm}/${fy} đến ngày ${td}/${tm}/${ty}`;
}

/**
 * Tải số liệu từ máy chủ
 */
async function loadData(from_date = '', to_date = '', silent = false) {
    const tableBody = document.getElementById('table-body');
    if (!silent && tableBody) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="13" class="text-center text-muted py-5">
                    <div class="spinner-border spinner-border-sm text-primary me-2"></div>Đang tổng hợp dữ liệu nhập - xuất - tồn...
                </td>
            </tr>
        `;
    }

    try {
        const url = `/api/bao-cao/nhap-xuat-ton?from_date=${encodeURIComponent(from_date)}&to_date=${encodeURIComponent(to_date)}`;
        const res = await apiRequest(url);
        rawData = res.data || [];
        summaryData = res.summary || {};

        // Cập nhật nhãn kỳ
        const badge = document.getElementById('period-display-badge');
        if (badge) badge.textContent = getPeriodDisplayText();

        // Cập nhật 4 thẻ stat
        const s = summaryData;
        const setVal = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.textContent = val;
        };
        setVal('card-luong-dau', formatNumber(s.tong_luong_dau || 0));
        setVal('card-tien-dau', formatVND(s.tong_tien_dau || 0));
        setVal('card-luong-nhap', formatNumber(s.tong_luong_nhap || 0));
        setVal('card-tien-nhap', formatVND(s.tong_tien_nhap || 0));
        setVal('card-luong-xuat', formatNumber(s.tong_luong_xuat || 0));
        setVal('card-tien-xuat', formatVND(s.tong_tien_xuat || 0));
        setVal('card-luong-ton', formatNumber(s.tong_luong_ton || 0));
        setVal('card-tien-ton', formatVND(s.tong_tien_ton || 0));

        // Cập nhật dropdown nhóm hàng
        const catSelect = document.getElementById('category-filter');
        if (catSelect) {
            const currentCat = catSelect.value;
            const cats = Array.from(new Set(rawData.map(d => d.danh_muc).filter(Boolean))).sort();
            catSelect.innerHTML = '<option value="">-- Tất cả nhóm hàng --</option>' +
                cats.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
            if (currentCat && cats.includes(currentCat)) {
                catSelect.value = currentCat;
            }
        }

        renderTable();
    } catch (e) {
        if (tableBody) {
            tableBody.innerHTML = `<tr><td colspan="13" class="text-center text-danger py-4">Lỗi kết nối máy chủ: ${escapeHtml(e.message || 'Không thể tải dữ liệu')}</td></tr>`;
        }
    }
}

function onFilterInputChanged() {
    renderTable();
}

/**
 * Hiển thị bảng
 */
function renderTable() {
    const tableBody = document.getElementById('table-body');
    if (!tableBody) return;

    const query = (document.getElementById('search-input')?.value || '').toLowerCase().trim();
    const category = document.getElementById('category-filter')?.value || '';
    const hideZero = document.getElementById('toggle-hide-zero')?.checked;

    const filtered = rawData.filter(item => {
        if (query) {
            const m = (item.ma_hang || '').toLowerCase();
            const t = (item.ten_hang || '').toLowerCase();
            if (!m.includes(query) && !t.includes(query)) return false;
        }
        if (category && item.danh_muc !== category) return false;
        if (hideZero) {
            if (item.luong_dau === 0 && item.luong_nhap === 0 && item.luong_xuat === 0 && item.luong_ton === 0) {
                return false;
            }
        }
        return true;
    });

    const countEl = document.getElementById('filtered-count');
    if (countEl) {
        countEl.textContent = `Hiển thị: ${filtered.length} / ${rawData.length} mặt hàng`;
    }

    if (!filtered.length) {
        tableBody.innerHTML = '<tr><td colspan="14" class="text-center text-muted py-5">Không có mặt hàng nào phù hợp với điều kiện lọc</td></tr>';
        resetFooterTotals();
        return;
    }

    let totLD = 0, totTD = 0, totLN = 0, totTN = 0, totLX = 0, totTX = 0, totLT = 0, totTT = 0;

    tableBody.innerHTML = filtered.map((p, i) => {
        totLD += p.luong_dau;
        totTD += p.tien_dau;
        totLN += p.luong_nhap;
        totTN += p.tien_nhap;
        totLX += p.luong_xuat;
        totTX += p.tien_xuat;
        totLT += p.luong_ton;
        totTT += p.tien_ton;

        return `
            <tr>
                <td class="text-center text-muted small">${i + 1}</td>
                <td class="text-center font-monospace small">
                    <a href="javascript:void(0)" onclick="viewHangHoaTransactions('${escapeHtml(p.ma_hang)}')" class="badge bg-light text-primary border badge-sku text-decoration-none" title="Xem biến động nhập/xuất">${escapeHtml(p.ma_hang)}</a>
                </td>
                <td class="col-ten-hang">
                    <span class="nxt-ten-hang-text cursor-pointer" role="button" onclick="viewHangHoaTransactions('${escapeHtml(p.ma_hang)}')" title="Xem biến động nhập/xuất">${escapeHtml(p.ten_hang)}</span>
                    ${p.danh_muc ? `<span class="badge bg-light text-secondary border nxt-badge-cat mt-1">${escapeHtml(p.danh_muc)}</span>` : ''}
                </td>
                <td class="text-center small">${escapeHtml(p.don_vi_tinh || 'Cái')}</td>
                <td class="text-end">${p.luong_dau > 0 ? formatNumber(p.luong_dau) : '0'}</td>
                <td class="text-end">${p.tien_dau > 0 ? formatVNDClean(p.tien_dau) : '0'}</td>
                <td class="text-end text-success fw-semibold">${p.luong_nhap > 0 ? formatNumber(p.luong_nhap) : '0'}</td>
                <td class="text-end text-success fw-semibold">${p.tien_nhap > 0 ? formatVNDClean(p.tien_nhap) : '0'}</td>
                <td class="text-end text-danger fw-semibold">${p.luong_xuat > 0 ? formatNumber(p.luong_xuat) : '0'}</td>
                <td class="text-end text-danger fw-semibold">${p.tien_xuat > 0 ? formatVNDClean(p.tien_xuat) : '0'}</td>
                <td class="text-end">${p.don_gia > 0 ? formatVNDClean(p.don_gia) : '0'}</td>
                <td class="text-end text-primary fw-bold">${p.luong_ton > 0 ? formatNumber(p.luong_ton) : '0'}</td>
                <td class="text-end text-primary fw-bold">${p.tien_ton > 0 ? formatVNDClean(p.tien_ton) : '0'}</td>
                <td class="text-center">
                    <button class="btn btn-sm btn-outline-primary py-0 px-2 text-nowrap" style="font-size: 0.78rem;" onclick="viewHangHoaTransactions('${escapeHtml(p.ma_hang)}')" title="Xem chi tiết các phiếu nhập/xuất trong kỳ">
                        <i class="bi bi-clock-history me-1"></i>Chi tiết
                    </button>
                </td>
            </tr>
        `;
    }).join('');

    const setF = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    };
    setF('tot-luong-dau', formatNumber(totLD));
    setF('tot-tien-dau', formatVNDClean(totTD));
    setF('tot-luong-nhap', formatNumber(totLN));
    setF('tot-tien-nhap', formatVNDClean(totTN));
    setF('tot-luong-xuat', formatNumber(totLX));
    setF('tot-tien-xuat', formatVNDClean(totTX));
    setF('tot-luong-ton', formatNumber(totLT));
    setF('tot-tien-ton', formatVNDClean(totTT));
}

function resetFooterTotals() {
    ['tot-luong-dau', 'tot-tien-dau', 'tot-luong-nhap', 'tot-tien-nhap',
     'tot-luong-xuat', 'tot-tien-xuat', 'tot-luong-ton', 'tot-tien-ton'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.textContent = '0';
    });
}

function setQuickPeriod(type) {
    const today = new Date();
    let fromDate = new Date();
    let toDate = new Date();

    document.querySelectorAll('.btn-group .btn').forEach(b => b.classList.remove('active'));

    if (type === 'today') {
        fromDate = today;
        toDate = today;
    } else if (type === 'week') {
        const day = today.getDay();
        const diff = today.getDate() - day + (day === 0 ? -6 : 1);
        fromDate = new Date(today.getFullYear(), today.getMonth(), diff);
        toDate = new Date(today.getFullYear(), today.getMonth(), diff + 6);
    } else if (type === 'month') {
        fromDate = new Date(today.getFullYear(), today.getMonth(), 1);
        toDate = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    } else if (type === 'year') {
        fromDate = new Date(today.getFullYear(), 0, 1);
        toDate = new Date(today.getFullYear(), 11, 31);
    } else if (type === 'all') {
        fromDate = null;
        toDate = null;
    }

    const fromISO = fromDate ? formatISODate(fromDate) : '';
    const toISO = toDate ? formatISODate(toDate) : '';

    const fromInput = document.getElementById('filter-from-date');
    const toInput = document.getElementById('filter-to-date');
    if (fromInput) fromInput.value = fromISO;
    if (toInput) toInput.value = toISO;
    currentFromDate = fromISO;
    currentToDate = toISO;

    const btn = event?.target;
    if (btn && btn.classList.contains('btn')) {
        btn.classList.add('active');
    }

    loadData(currentFromDate, currentToDate);
}

function onDateRangeChanged() {
    document.querySelectorAll('.btn-group .btn').forEach(b => b.classList.remove('active'));
    currentFromDate = document.getElementById('filter-from-date')?.value || '';
    currentToDate = document.getElementById('filter-to-date')?.value || '';
    if (currentFromDate && currentToDate && currentFromDate <= currentToDate) {
        loadData(currentFromDate, currentToDate);
    }
}

function clearSearch() {
    const input = document.getElementById('search-input');
    if (input) input.value = '';
    renderTable();
}

function applyCustomRange() {
    const from = document.getElementById('filter-from-date').value;
    const to = document.getElementById('filter-to-date').value;
    if (!from || !to) {
        showToast('Vui lòng chọn cả ngày bắt đầu và ngày kết thúc!', 'warning');
        return;
    }
    if (from > to) {
        showToast('Ngày bắt đầu không được lớn hơn ngày kết thúc!', 'warning');
        return;
    }
    currentFromDate = from;
    currentToDate = to;
    loadData(currentFromDate, currentToDate);
}

/**
 * Xuất file Excel Mẫu 01-VT
 */
async function exportNhapXuatTonToExcel() {
    if (!window.ExcelJS) {
        showToast('Đang tải bộ xuất Excel, vui lòng thử lại sau...', 'info');
        return;
    }

    if (!rawData || !rawData.length) {
        await loadData(currentFromDate, currentToDate);
    }

    const query = (document.getElementById('search-input')?.value || '').toLowerCase().trim();
    const category = document.getElementById('category-filter')?.value || '';
    const hideZero = document.getElementById('toggle-hide-zero')?.checked;

    const items = rawData.filter(item => {
        if (query) {
            const m = (item.ma_hang || '').toLowerCase();
            const t = (item.ten_hang || '').toLowerCase();
            if (!m.includes(query) && !t.includes(query)) return false;
        }
        if (category && item.danh_muc !== category) return false;
        if (hideZero) {
            if (item.luong_dau === 0 && item.luong_nhap === 0 && item.luong_xuat === 0 && item.luong_ton === 0) {
                return false;
            }
        }
        return true;
    });

    if (!items.length) {
        showToast('Không có dữ liệu nhập xuất tồn để xuất Excel!', 'warning');
        return;
    }

    const periodText = getPeriodDisplayText();
    const wb = new window.ExcelJS.Workbook();
    wb.creator = COMPANY_REPORT_INFO.name;
    wb.lastModifiedBy = COMPANY_REPORT_INFO.name;
    wb.created = new Date();

    const ws = wb.addWorksheet('TongHopNhapXuatTon', { views: [{ showGridLines: true }] });

    ws.columns = [
        { width: 6 },   // A: STT
        { width: 13 },  // B: Mã hàng
        { width: 38 },  // C: Tên mặt hàng
        { width: 8 },   // D: ĐVT
        { width: 12 },  // E: Lượng đầu
        { width: 16 },  // F: Tiền đầu
        { width: 12 },  // G: Lượng nhập
        { width: 16 },  // H: Tiền nhập
        { width: 12 },  // I: Lượng xuất
        { width: 16 },  // J: Tiền xuất
        { width: 15 },  // K: Đơn giá
        { width: 12 },  // L: Lượng tồn
        { width: 17 },  // M: Tiền tồn
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

    // Header góc trái
    ws.getCell('A1').value = `Đơn vị: ${COMPANY_REPORT_INFO.name}`;
    ws.getCell('A1').font = fontBold;
    ws.getCell('A2').value = `Địa chỉ: ${COMPANY_REPORT_INFO.address}`;
    ws.getCell('A2').font = fontBold;

    // Header góc phải
    ws.mergeCells('K1:M1');
    const mCell = ws.getCell('K1');
    mCell.value = 'Mẫu số 01 - VT';
    mCell.font = fontBold;
    mCell.alignment = { horizontal: 'center' };

    ws.mergeCells('J2:M2');
    const qdCell = ws.getCell('J2');
    qdCell.value = '(Ban hành theo TT 133/2016/TT-BTC';
    qdCell.font = fontItalic;
    qdCell.alignment = { horizontal: 'center' };

    ws.mergeCells('J3:M3');
    const qd2Cell = ws.getCell('J3');
    qd2Cell.value = 'ngày 26/08/2016 của Bộ Trưởng BTC)';
    qd2Cell.font = fontItalic;
    qd2Cell.alignment = { horizontal: 'center' };

    // Tiêu đề
    ws.mergeCells('A5:M5');
    const tCell = ws.getCell('A5');
    tCell.value = 'BẢNG TỔNG HỢP NHẬP - XUẤT - TỒN';
    tCell.font = fontTitle;
    tCell.alignment = { horizontal: 'center', vertical: 'middle' };

    // Kỳ báo cáo
    ws.mergeCells('A6:M6');
    const pCell = ws.getCell('A6');
    pCell.value = periodText;
    pCell.font = fontNormal;
    pCell.alignment = { horizontal: 'center', vertical: 'middle' };

    // Đơn vị tính
    ws.mergeCells('K8:M8');
    const uCell = ws.getCell('K8');
    uCell.value = 'Đơn vị tính: Đồng';
    uCell.font = fontBold;
    uCell.alignment = { horizontal: 'right', vertical: 'middle' };

    // Hàng 9 & 10: Tiêu đề bảng
    ws.mergeCells('A9:A10');
    ws.getCell('A9').value = 'STT';
    ws.mergeCells('B9:B10');
    ws.getCell('B9').value = 'Mã hàng';
    ws.mergeCells('C9:C10');
    ws.getCell('C9').value = 'Tên mặt hàng';
    ws.mergeCells('D9:D10');
    ws.getCell('D9').value = 'ĐVT';

    ws.mergeCells('E9:F9');
    ws.getCell('E9').value = 'Tồn đầu kỳ';
    ws.getCell('E10').value = 'Lượng đầu';
    ws.getCell('F10').value = 'Tiền đầu';

    ws.mergeCells('G9:H9');
    ws.getCell('G9').value = 'Nhập trong kỳ';
    ws.getCell('G10').value = 'Lượng nhập';
    ws.getCell('H10').value = 'Tiền nhập';

    ws.mergeCells('I9:J9');
    ws.getCell('I9').value = 'Xuất trong kỳ';
    ws.getCell('I10').value = 'Lượng xuất';
    ws.getCell('J10').value = 'Tiền xuất';

    ws.mergeCells('K9:K10');
    ws.getCell('K9').value = 'Đơn giá';

    ws.mergeCells('L9:M9');
    ws.getCell('L9').value = 'Tồn cuối kỳ';
    ws.getCell('L10').value = 'Lượng tồn';
    ws.getCell('M10').value = 'Tiền tồn';

    for (let r = 9; r <= 10; r++) {
        const row = ws.getRow(r);
        row.height = 24;
        for (let c = 1; c <= 13; c++) {
            const cell = row.getCell(c);
            cell.font = fontBold;
            cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } };
            cell.border = borderThinAll;
        }
    }

    let currentRow = 11;
    let totLD = 0, totTD = 0, totLN = 0, totTN = 0, totLX = 0, totTX = 0, totLT = 0, totTT = 0;

    items.forEach((item, idx) => {
        const row = ws.getRow(currentRow);
        row.height = 20;

        totLD += item.luong_dau;
        totTD += item.tien_dau;
        totLN += item.luong_nhap;
        totTN += item.tien_nhap;
        totLX += item.luong_xuat;
        totTX += item.tien_xuat;
        totLT += item.luong_ton;
        totTT += item.tien_ton;

        row.getCell(1).value = idx + 1;
        row.getCell(1).alignment = { horizontal: 'center' };

        row.getCell(2).value = item.ma_hang;
        row.getCell(2).alignment = { horizontal: 'center' };

        row.getCell(3).value = item.ten_hang;
        row.getCell(3).alignment = { horizontal: 'left' };

        row.getCell(4).value = item.don_vi_tinh || 'Cái';
        row.getCell(4).alignment = { horizontal: 'center' };

        row.getCell(5).value = item.luong_dau;
        row.getCell(5).numFmt = '#,##0';
        row.getCell(5).alignment = { horizontal: 'right' };

        row.getCell(6).value = item.tien_dau;
        row.getCell(6).numFmt = '#,##0';
        row.getCell(6).alignment = { horizontal: 'right' };

        row.getCell(7).value = item.luong_nhap;
        row.getCell(7).numFmt = '#,##0';
        row.getCell(7).alignment = { horizontal: 'right' };

        row.getCell(8).value = item.tien_nhap;
        row.getCell(8).numFmt = '#,##0';
        row.getCell(8).alignment = { horizontal: 'right' };

        row.getCell(9).value = item.luong_xuat;
        row.getCell(9).numFmt = '#,##0';
        row.getCell(9).alignment = { horizontal: 'right' };

        row.getCell(10).value = item.tien_xuat;
        row.getCell(10).numFmt = '#,##0';
        row.getCell(10).alignment = { horizontal: 'right' };

        row.getCell(11).value = item.don_gia;
        row.getCell(11).numFmt = '#,##0';
        row.getCell(11).alignment = { horizontal: 'right' };

        row.getCell(12).value = item.luong_ton;
        row.getCell(12).numFmt = '#,##0';
        row.getCell(12).alignment = { horizontal: 'right' };

        row.getCell(13).value = item.tien_ton;
        row.getCell(13).numFmt = '#,##0';
        row.getCell(13).alignment = { horizontal: 'right' };

        for (let c = 1; c <= 13; c++) {
            row.getCell(c).font = fontNormal;
            row.getCell(c).border = borderThinAll;
        }

        currentRow++;
    });

    // Hàng Tổng cộng
    const rTot = ws.getRow(currentRow);
    rTot.height = 24;
    ws.mergeCells(`A${currentRow}:D${currentRow}`);
    rTot.getCell(1).value = 'TỔNG CỘNG';
    rTot.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };

    rTot.getCell(5).value = totLD;
    rTot.getCell(5).numFmt = '#,##0';
    rTot.getCell(5).alignment = { horizontal: 'right', vertical: 'middle' };

    rTot.getCell(6).value = totTD;
    rTot.getCell(6).numFmt = '#,##0';
    rTot.getCell(6).alignment = { horizontal: 'right', vertical: 'middle' };

    rTot.getCell(7).value = totLN;
    rTot.getCell(7).numFmt = '#,##0';
    rTot.getCell(7).alignment = { horizontal: 'right', vertical: 'middle' };

    rTot.getCell(8).value = totTN;
    rTot.getCell(8).numFmt = '#,##0';
    rTot.getCell(8).alignment = { horizontal: 'right', vertical: 'middle' };

    rTot.getCell(9).value = totLX;
    rTot.getCell(9).numFmt = '#,##0';
    rTot.getCell(9).alignment = { horizontal: 'right', vertical: 'middle' };

    rTot.getCell(10).value = totTX;
    rTot.getCell(10).numFmt = '#,##0';
    rTot.getCell(10).alignment = { horizontal: 'right', vertical: 'middle' };

    rTot.getCell(11).value = '';

    rTot.getCell(12).value = totLT;
    rTot.getCell(12).numFmt = '#,##0';
    rTot.getCell(12).alignment = { horizontal: 'right', vertical: 'middle' };

    rTot.getCell(13).value = totTT;
    rTot.getCell(13).numFmt = '#,##0';
    rTot.getCell(13).alignment = { horizontal: 'right', vertical: 'middle' };

    for (let c = 1; c <= 13; c++) {
        const cell = rTot.getCell(c);
        cell.font = fontBold;
        cell.border = borderThinAll;
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDBEAFE' } };
    }
    currentRow++;

    // Phần ký tên
    const signRow = currentRow + 2;
    const now = new Date();
    ws.mergeCells(`J${signRow}:M${signRow}`);
    const dCell = ws.getCell(`J${signRow}`);
    dCell.value = `Ngày ${String(now.getDate()).padStart(2,'0')} tháng ${String(now.getMonth()+1).padStart(2,'0')} năm ${now.getFullYear()}`;
    dCell.font = fontItalic;
    dCell.alignment = { horizontal: 'center' };

    const rSignTitle = ws.getRow(signRow + 1);
    ws.mergeCells(`A${signRow + 1}:D${signRow + 1}`);
    rSignTitle.getCell(1).value = 'Người lập biểu';
    rSignTitle.getCell(1).font = fontBold;
    rSignTitle.getCell(1).alignment = { horizontal: 'center' };

    ws.mergeCells(`E${signRow + 1}:H${signRow + 1}`);
    rSignTitle.getCell(5).value = 'Kế toán trưởng';
    rSignTitle.getCell(5).font = fontBold;
    rSignTitle.getCell(5).alignment = { horizontal: 'center' };

    ws.mergeCells(`I${signRow + 1}:M${signRow + 1}`);
    rSignTitle.getCell(9).value = 'Giám đốc';
    rSignTitle.getCell(9).font = fontBold;
    rSignTitle.getCell(9).alignment = { horizontal: 'center' };

    const rSignNote = ws.getRow(signRow + 2);
    ws.mergeCells(`A${signRow + 2}:D${signRow + 2}`);
    rSignNote.getCell(1).value = '(Ký, họ tên)';
    rSignNote.getCell(1).font = fontItalic;
    rSignNote.getCell(1).alignment = { horizontal: 'center' };

    ws.mergeCells(`E${signRow + 2}:H${signRow + 2}`);
    rSignNote.getCell(5).value = '(Ký, họ tên)';
    rSignNote.getCell(5).font = fontItalic;
    rSignNote.getCell(5).alignment = { horizontal: 'center' };

    ws.mergeCells(`I${signRow + 2}:M${signRow + 2}`);
    rSignNote.getCell(9).value = '(Ký, họ tên, đóng dấu)';
    rSignNote.getCell(9).font = fontItalic;
    rSignNote.getCell(9).alignment = { horizontal: 'center' };

    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Bang_Tong_Hop_Nhap_Xuat_Ton_${currentFromDate || 'all'}_den_${currentToDate || 'all'}.xlsx`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
    }, 150);

    showToast('Đã xuất file Excel Bảng Tổng Hợp Nhập Xuất Tồn thành công!', 'success');
}

/**
 * Trình kích hoạt in HTML an toàn (chống popup blocker)
 */
function executePrintHtml(htmlContent) {
    try {
        const printWindow = window.open('', '_blank', 'width=1100,height=800');
        if (printWindow) {
            printWindow.document.open();
            printWindow.document.write(htmlContent);
            printWindow.document.close();
            return;
        }
    } catch (e) {
        console.warn('Cửa sổ popup bị chặn, chuyển sang in qua iframe', e);
    }

    let frame = document.getElementById('report-print-hidden-frame');
    if (!frame) {
        frame = document.createElement('iframe');
        frame.id = 'report-print-hidden-frame';
        frame.style.position = 'fixed';
        frame.style.right = '0';
        frame.style.bottom = '0';
        frame.style.width = '0';
        frame.style.height = '0';
        frame.style.border = '0';
        frame.style.visibility = 'hidden';
        document.body.appendChild(frame);
    }
    const doc = frame.contentWindow.document;
    doc.open();
    doc.write(htmlContent);
    doc.close();
    setTimeout(() => {
        try {
            frame.contentWindow.focus();
            frame.contentWindow.print();
        } catch (err) {
            console.error('Lỗi khi kích hoạt in:', err);
            window.print();
        }
    }, 450);
}

/**
 * In Báo Cáo Nhập Xuất Tồn
 */
async function printNhapXuatTonReport() {
    try {
        if (!rawData || !rawData.length) {
            await loadData(currentFromDate, currentToDate);
        }

        const query = (document.getElementById('search-input')?.value || '').toLowerCase().trim();
        const category = document.getElementById('category-filter')?.value || '';
        const hideZero = document.getElementById('toggle-hide-zero')?.checked;

        const items = rawData.filter(item => {
            if (query) {
                const m = (item.ma_hang || '').toLowerCase();
                const t = (item.ten_hang || '').toLowerCase();
                if (!m.includes(query) && !t.includes(query)) return false;
            }
            if (category && item.danh_muc !== category) return false;
            if (hideZero) {
                if (item.luong_dau === 0 && item.luong_nhap === 0 && item.luong_xuat === 0 && item.luong_ton === 0) {
                    return false;
                }
            }
            return true;
        });

        if (!items.length) {
            showToast('Không có dữ liệu nhập xuất tồn để in báo cáo!', 'warning');
            return;
        }

        const periodText = getPeriodDisplayText();
        let totLD = 0, totTD = 0, totLN = 0, totTN = 0, totLX = 0, totTX = 0, totLT = 0, totTT = 0;

        const rowsHtml = items.map((p, idx) => {
            totLD += p.luong_dau;
            totTD += p.tien_dau;
            totLN += p.luong_nhap;
            totTN += p.tien_nhap;
            totLX += p.luong_xuat;
            totTX += p.tien_xuat;
            totLT += p.luong_ton;
            totTT += p.tien_ton;

            return `
                <tr>
                    <td style="text-align: center; padding: 4px;">${idx + 1}</td>
                    <td style="text-align: center; font-family: monospace; padding: 4px;">${escapeHtml(p.ma_hang)}</td>
                    <td style="text-align: left; padding: 4px 6px;">${escapeHtml(p.ten_hang)}</td>
                    <td style="text-align: center; padding: 4px;">${escapeHtml(p.don_vi_tinh || 'Cái')}</td>
                    <td style="text-align: right; padding: 4px 6px;">${p.luong_dau ? formatNumber(p.luong_dau) : '0'}</td>
                    <td style="text-align: right; padding: 4px 6px;">${p.tien_dau ? formatVNDClean(p.tien_dau) : '0'}</td>
                    <td style="text-align: right; padding: 4px 6px;">${p.luong_nhap ? formatNumber(p.luong_nhap) : '0'}</td>
                    <td style="text-align: right; padding: 4px 6px;">${p.tien_nhap ? formatVNDClean(p.tien_nhap) : '0'}</td>
                    <td style="text-align: right; padding: 4px 6px;">${p.luong_xuat ? formatNumber(p.luong_xuat) : '0'}</td>
                    <td style="text-align: right; padding: 4px 6px;">${p.tien_xuat ? formatVNDClean(p.tien_xuat) : '0'}</td>
                    <td style="text-align: right; padding: 4px 6px;">${p.don_gia ? formatVNDClean(p.don_gia) : '0'}</td>
                    <td style="text-align: right; padding: 4px 6px; font-weight: bold;">${p.luong_ton ? formatNumber(p.luong_ton) : '0'}</td>
                    <td style="text-align: right; padding: 4px 6px; font-weight: bold;">${p.tien_ton ? formatVNDClean(p.tien_ton) : '0'}</td>
                </tr>
            `;
        }).join('');

        const now = new Date();
        const dateCloseStr = `Ngày ${String(now.getDate()).padStart(2,'0')} tháng ${String(now.getMonth()+1).padStart(2,'0')} năm ${now.getFullYear()}`;

        const reportHtml = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="utf-8">
                <title>Bảng Tổng Hợp Nhập - Xuất - Tồn</title>
                <style>
                    @page { size: A4 landscape; margin: 10mm 12mm; }
                    body {
                        font-family: "Times New Roman", Times, serif;
                        font-size: 9.5pt;
                        color: #000;
                        margin: 0;
                        padding: 8px;
                    }
                    .no-print-bar {
                        display: flex;
                        justify-content: flex-end;
                        margin-bottom: 10px;
                    }
                    .btn-print {
                        background: #0284c7;
                        color: #fff;
                        border: none;
                        padding: 7px 18px;
                        border-radius: 4px;
                        cursor: pointer;
                        font-size: 13px;
                        font-weight: bold;
                    }
                    @media print {
                        .no-print-bar { display: none !important; }
                        body { padding: 0; }
                    }
                    table {
                        width: 100%;
                        border-collapse: collapse;
                        margin-top: 8px;
                    }
                    th, td {
                        border: 1px solid #000;
                    }
                    th {
                        background-color: #f2f2f2;
                        font-weight: bold;
                        text-align: center;
                    }
                </style>
            </head>
            <body>
                <div class="no-print-bar">
                    <button class="btn-print" onclick="window.print()">🖨️ In Báo Cáo (A4)</button>
                </div>
                <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                    <div style="font-size: 9.5pt; line-height: 1.4;">
                        <strong>Đơn vị:</strong> ${COMPANY_REPORT_INFO.name}<br>
                        <strong>Địa chỉ:</strong> ${COMPANY_REPORT_INFO.address}
                    </div>
                    <div style="text-align: center; font-size: 9.5pt; line-height: 1.3;">
                        <strong>Mẫu số 01 - VT</strong><br>
                        <span style="font-style: italic; font-size: 8.5pt;">(Ban hành theo TT 133/2016/TT-BTC<br>ngày 26/08/2016 của Bộ Trưởng BTC)</span>
                    </div>
                </div>

                <div style="text-align: center; margin-bottom: 6px;">
                    <h2 style="font-size: 15pt; margin: 0; text-transform: uppercase; font-weight: bold;">BẢNG TỔNG HỢP NHẬP - XUẤT - TỒN</h2>
                    <div style="font-size: 10pt; margin-top: 3px;">${periodText}</div>
                </div>

                <div style="text-align: right; font-weight: bold; font-size: 9.5pt; margin-bottom: 4px;">
                    Đơn vị tính: Đồng
                </div>

                <table>
                    <thead>
                        <tr>
                            <th rowspan="2" style="width: 30px;">STT</th>
                            <th rowspan="2" style="width: 70px;">Mã hàng</th>
                            <th rowspan="2">Tên mặt hàng</th>
                            <th rowspan="2" style="width: 45px;">ĐVT</th>
                            <th colspan="2">Tồn đầu kỳ</th>
                            <th colspan="2">Nhập trong kỳ</th>
                            <th colspan="2">Xuất trong kỳ</th>
                            <th rowspan="2" style="width: 80px;">Đơn giá</th>
                            <th colspan="2">Tồn cuối kỳ</th>
                        </tr>
                        <tr>
                            <th style="width: 50px;">Lượng</th>
                            <th style="width: 80px;">Tiền</th>
                            <th style="width: 50px;">Lượng</th>
                            <th style="width: 80px;">Tiền</th>
                            <th style="width: 50px;">Lượng</th>
                            <th style="width: 80px;">Tiền</th>
                            <th style="width: 50px;">Lượng</th>
                            <th style="width: 85px;">Tiền</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rowsHtml}
                        <tr style="font-weight: bold; background-color: #f0f7ff;">
                            <td colspan="4" style="text-align: center; padding: 5px;">TỔNG CỘNG</td>
                            <td style="text-align: right; padding: 5px;">${formatNumber(totLD)}</td>
                            <td style="text-align: right; padding: 5px;">${formatVNDClean(totTD)}</td>
                            <td style="text-align: right; padding: 5px;">${formatNumber(totLN)}</td>
                            <td style="text-align: right; padding: 5px;">${formatVNDClean(totTN)}</td>
                            <td style="text-align: right; padding: 5px;">${formatNumber(totLX)}</td>
                            <td style="text-align: right; padding: 5px;">${formatVNDClean(totTX)}</td>
                            <td style="text-align: center;">-</td>
                            <td style="text-align: right; padding: 5px;">${formatNumber(totLT)}</td>
                            <td style="text-align: right; padding: 5px;">${formatVNDClean(totTT)}</td>
                        </tr>
                    </tbody>
                </table>

                <div style="margin-top: 15px; text-align: right; font-style: italic; font-size: 9.5pt; padding-right: 40px;">
                    ${dateCloseStr}
                </div>

                <div style="display: flex; justify-content: space-around; text-align: center; margin-top: 10px; font-size: 9.5pt;">
                    <div style="flex: 1;">
                        <strong>Người ghi sổ</strong><br>
                        <span style="font-size: 8.5pt; font-style: italic;">(Ký, họ tên)</span>
                    </div>
                    <div style="flex: 1;">
                        <strong>Kế toán trưởng</strong><br>
                        <span style="font-size: 8.5pt; font-style: italic;">(Ký, họ tên)</span>
                    </div>
                    <div style="flex: 1;">
                        <strong>Giám đốc</strong><br>
                        <span style="font-size: 8.5pt; font-style: italic;">(Ký, họ tên, đóng dấu)</span>
                    </div>
                </div>

                <script>
                    window.onload = function() {
                        setTimeout(function() { window.print(); }, 400);
                    };
                </script>
            </body>
            </html>
        `;

        executePrintHtml(reportHtml);
    } catch (err) {
        console.error('Lỗi khi in báo cáo NXT:', err);
        showToast('Có lỗi xảy ra khi chuẩn bị bản in: ' + (err.message || err), 'error');
    }
}

function initBangNhapXuatTon() {
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);

    const fromISO = formatISODate(firstDay);
    const toISO = formatISODate(lastDay);

    const fromInput = document.getElementById('filter-from-date');
    const toInput = document.getElementById('filter-to-date');
    if (fromInput) fromInput.value = fromISO;
    if (toInput) toInput.value = toISO;
    currentFromDate = fromISO;
    currentToDate = toISO;

    loadData(currentFromDate, currentToDate);

    // Tự động làm mới dữ liệu khi người dùng chuyển tab quay lại hoặc có nhập/xuất kho
    window.addEventListener('message', (e) => {
        if (e.data && (e.data.type === 'TAB_ACTIVATED' || e.data.type === 'PRODUCTS_UPDATED')) {
            loadData(currentFromDate, currentToDate, true);
        }
    });

    try {
        if (typeof BroadcastChannel !== 'undefined') {
            const bc = new BroadcastChannel('inventory_sync');
            bc.onmessage = (e) => {
                if (e.data && e.data.type === 'PRODUCTS_UPDATED') {
                    loadData(currentFromDate, currentToDate, true);
                }
            };
        }
    } catch (err) {}
}

// ── Xem chi tiết biến động phiếu nhập/xuất của mặt hàng trong kỳ ───────────

async function viewHangHoaTransactions(ma_hang) {
    if (!ma_hang) return;

    const tbody = document.getElementById('hh-trans-tbody');
    const titleEl = document.getElementById('hh-trans-title');
    const subTitleEl = document.getElementById('hh-trans-subtitle');

    if (titleEl) titleEl.textContent = `Lịch Sử Biến Động Nhập - Xuất: ${ma_hang}`;
    if (subTitleEl) subTitleEl.textContent = `Đang tải dữ liệu kỳ ${getPeriodDisplayText()}...`;

    if (tbody) {
        tbody.innerHTML = `
            <tr>
                <td colspan="10" class="text-center text-muted py-5">
                    <div class="spinner-border spinner-border-sm text-primary me-2"></div>Đang tải danh sách phiếu nhập / xuất của mã [${escapeHtml(ma_hang)}]...
                </td>
            </tr>
        `;
    }

    if (typeof openModal === 'function') {
        openModal('modal-hanghoa-transactions');
    }

    try {
        const url = `/api/bao-cao/hang-hoa-transactions?ma_hang=${encodeURIComponent(ma_hang)}&from_date=${encodeURIComponent(currentFromDate)}&to_date=${encodeURIComponent(currentToDate)}`;
        const res = await apiRequest(url);

        if (!res.success) {
            throw new Error(res.detail || 'Không thể lấy dữ liệu biến động');
        }

        if (titleEl) {
            titleEl.innerHTML = `<span class="badge bg-warning text-dark me-2">${escapeHtml(res.ma_hang)}</span>${escapeHtml(res.ten_hang)}`;
        }
        if (subTitleEl) {
            subTitleEl.textContent = `Kỳ báo cáo: ${getPeriodDisplayText()} | ĐVT: ${res.don_vi_tinh || 'Cái'}${res.danh_muc ? ' | Danh mục: ' + res.danh_muc : ''}`;
        }

        const s = res.summary || {};
        const countEl = document.getElementById('hh-stat-count');
        const nhapEl = document.getElementById('hh-stat-nhap');
        const tienNhapEl = document.getElementById('hh-stat-tien-nhap');
        const xuatEl = document.getElementById('hh-stat-xuat');
        const tienXuatEl = document.getElementById('hh-stat-tien-xuat');
        const diffEl = document.getElementById('hh-stat-diff');

        if (countEl) countEl.textContent = `${s.so_giao_dich || 0} phiếu`;
        if (nhapEl) nhapEl.textContent = formatNumber(s.tong_sl_nhap || 0);
        if (tienNhapEl) tienNhapEl.textContent = `${formatVNDClean(s.tong_tien_nhap || 0)} đ`;
        if (xuatEl) xuatEl.textContent = formatNumber(s.tong_sl_xuat || 0);
        if (tienXuatEl) tienXuatEl.textContent = `${formatVNDClean(s.tong_tien_xuat || 0)} đ`;

        const diff = (s.tong_sl_nhap || 0) - (s.tong_sl_xuat || 0);
        if (diffEl) {
            const diffPrefix = diff > 0 ? '+' : '';
            const diffClass = diff > 0 ? 'text-success' : (diff < 0 ? 'text-danger' : 'text-primary');
            diffEl.className = `fw-bold fs-6 ${diffClass}`;
            diffEl.textContent = `${diffPrefix}${formatNumber(diff)}`;
        }

        const transactions = res.transactions || [];
        if (!transactions.length) {
            if (tbody) {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="10" class="text-center text-muted py-5">
                            <i class="bi bi-inbox fs-3 d-block mb-2 text-secondary"></i>
                            Không có phát sinh giao dịch nhập kho hay xuất kho nào cho mặt hàng này trong kỳ lọc được chọn (${getPeriodDisplayText()}).
                        </td>
                    </tr>
                `;
            }
            return;
        }

        if (tbody) {
            tbody.innerHTML = transactions.map((t, idx) => {
                const isNhap = t.type === 'NHAP';
                const typeBadge = isNhap
                    ? `<span class="badge bg-success-subtle text-success border border-success-subtle px-2 py-1"><i class="bi bi-box-arrow-in-down me-1"></i>Nhập kho</span>`
                    : `<span class="badge bg-danger-subtle text-danger border border-danger-subtle px-2 py-1"><i class="bi bi-box-arrow-up-right me-1"></i>Xuất kho</span>`;

                const qtyFormatted = isNhap
                    ? `<span class="text-success fw-bold font-monospace">+${formatNumber(t.so_luong)}</span>`
                    : `<span class="text-danger fw-bold font-monospace">-${formatNumber(t.so_luong)}</span>`;

                let displayDate = t.ngay || '-';
                if (t.ngay && t.ngay.includes('-')) {
                    const parts = t.ngay.split('-');
                    if (parts.length === 3) displayDate = `${parts[2]}/${parts[1]}/${parts[0]}`;
                }

                return `
                    <tr>
                        <td class="text-center text-muted small">${idx + 1}</td>
                        <td class="text-center font-monospace small">${escapeHtml(displayDate)}</td>
                        <td class="text-center">${typeBadge}</td>
                        <td class="text-center">
                            <a href="javascript:void(0)" onclick="viewReceiptFromHistory('${t.type}', '${escapeHtml(t.so_phieu)}')" class="fw-bold font-monospace text-primary text-decoration-none" title="Xem chi tiết phiếu này">
                                ${escapeHtml(t.so_phieu)}
                            </a>
                        </td>
                        <td class="text-end">${qtyFormatted}</td>
                        <td class="text-end font-monospace">${formatVNDClean(t.don_gia)} đ</td>
                        <td class="text-end font-monospace fw-semibold">${formatVNDClean(t.thanh_tien)} đ</td>
                        <td>
                            <span class="d-inline-block text-truncate" style="max-width: 170px;" title="${escapeHtml(t.doi_tac_ten || '')}">
                                ${escapeHtml(t.doi_tac_ten || '-')}
                            </span>
                        </td>
                        <td class="small text-muted">
                            <span class="d-inline-block text-truncate" style="max-width: 140px;" title="${escapeHtml(t.ghi_chu || '')}">
                                ${escapeHtml(t.ghi_chu || '-')}
                            </span>
                        </td>
                        <td class="text-center">
                            <button class="btn btn-sm btn-primary py-1 px-2 text-nowrap" style="font-size: 0.78rem;" onclick="viewReceiptFromHistory('${t.type}', '${escapeHtml(t.so_phieu)}')" title="Xem chi tiết toàn bộ phiếu ${escapeHtml(t.so_phieu)}">
                                <i class="bi bi-eye me-1"></i>Xem phiếu
                            </button>
                        </td>
                    </tr>
                `;
            }).join('');
        }
    } catch (e) {
        if (tbody) {
            tbody.innerHTML = `<tr><td colspan="10" class="text-center text-danger py-4">Lỗi: ${escapeHtml(e.message || 'Không thể tải lịch sử biến động')}</td></tr>`;
        }
    }
}

/**
 * Mở modal xem toàn bộ thông tin chi tiết một phiếu nhập hoặc xuất
 */
async function viewReceiptFromHistory(type, so_phieu) {
    if (!so_phieu) return;
    const isNhap = (type || '').toUpperCase() === 'NHAP';
    const apiUrl = isNhap
        ? `/api/nhap-hang/${encodeURIComponent(so_phieu)}`
        : `/api/xuat-hang/${encodeURIComponent(so_phieu)}`;

    const modalTitle = document.getElementById('detail-modal-title');
    if (modalTitle) {
        modalTitle.textContent = `Chi Tiết Phiếu ${isNhap ? 'Nhập Kho' : 'Xuất Kho'}: ${so_phieu}`;
    }

    const modalBody = document.getElementById('detail-modal-body');
    if (modalBody) {
        modalBody.innerHTML = `
            <div class="text-center py-5">
                <div class="spinner-border spinner-border-sm text-primary me-2"></div>Đang tải dữ liệu phiếu ${escapeHtml(so_phieu)}...
            </div>
        `;
    }

    if (typeof openModal === 'function') {
        openModal('detail-modal');
    }

    try {
        const res = await apiRequest(apiUrl);
        if (typeof renderEditableReceiptDetail === 'function') {
            await renderEditableReceiptDetail(res, isNhap ? 'nhap' : 'xuat', 'detail-modal-body', () => {
                loadData(currentFromDate, currentToDate, true);
            });
        } else {
            if (modalBody) {
                modalBody.innerHTML = `
                    <div class="p-3">
                        <h6>Số phiếu: ${escapeHtml(res.so_phieu)}</h6>
                        <p>Ngày: ${escapeHtml(res.ngay_nhap || res.ngay_xuat)}</p>
                        <p>Tổng tiền: ${formatVNDClean(res.tong_tien)} đ</p>
                    </div>
                `;
            }
        }
    } catch (e) {
        if (modalBody) {
            modalBody.innerHTML = `<div class="alert alert-danger">Lỗi khi tải chi tiết phiếu: ${escapeHtml(e.message || 'Không tìm thấy phiếu')}</div>`;
        }
        if (typeof showToast === 'function') {
            showToast(e.message || 'Không tìm thấy phiếu', 'error');
        }
    }
}

window.viewHangHoaTransactions = viewHangHoaTransactions;
window.viewReceiptFromHistory = viewReceiptFromHistory;

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initBangNhapXuatTon);
} else {
    initBangNhapXuatTon();
}
