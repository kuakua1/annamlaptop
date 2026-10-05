/**
 * bao_cao.js - Reports & Charts page logic
 * Hỗ trợ lọc theo ngày đầu - ngày cuối, Xuất Excel S16-DNN và In Báo Cáo Tài Chính
 */

let revenueChart = null;
let currentFromDate = '';
let currentToDate = '';
let currentReportData = null;

/**
 * Tải dữ liệu tổng quan theo khoảng ngày
 */
async function loadStats(from_date = '', to_date = '') {
    try {
        let url = `/api/bao-cao/tong-quan?period=custom&from_date=${encodeURIComponent(from_date)}&to_date=${encodeURIComponent(to_date)}`;
        const res = await apiRequest(url);
        currentReportData = res.data || {};
        const d = currentReportData;

        document.getElementById('stat-doanh-thu').textContent = formatVND(d.doanh_thu || 0);
        document.getElementById('stat-gia-von').textContent = formatVND(d.gia_von || 0);
        document.getElementById('stat-loi-nhuan').textContent = formatVND(d.loi_nhuan || 0);
        document.getElementById('stat-bien').textContent = (d.bien_loi_nhuan || 0).toFixed(1) + '%';
        document.getElementById('stat-loi-nhuan').className =
            (d.loi_nhuan || 0) >= 0 ? 'fs-4 fw-bold text-success' : 'fs-4 fw-bold text-danger';
    } catch (e) {
        showToast(e.message || 'Lỗi tải số liệu báo cáo', 'error');
    }
}

/**
 * Tải biểu đồ doanh thu
 */
async function loadChart() {
    try {
        const res = await apiRequest('/api/bao-cao/doanh-thu');
        const d = res.data;
        const ctx = document.getElementById('revenue-chart').getContext('2d');
        if (revenueChart) revenueChart.destroy();
        revenueChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: d.dates,
                datasets: [
                    {
                        label: 'Doanh thu',
                        data: d.revenue,
                        borderColor: '#4f8ef7',
                        backgroundColor: 'rgba(79,142,247,0.1)',
                        fill: true,
                        tension: 0.4,
                    },
                    {
                        label: 'Giá vốn',
                        data: d.cost,
                        borderColor: '#fc5c7d',
                        backgroundColor: 'rgba(252,92,125,0.08)',
                        fill: true,
                        tension: 0.4,
                    },
                    {
                        label: 'Lợi nhuận',
                        data: d.profit,
                        borderColor: '#48bb78',
                        backgroundColor: 'rgba(72,187,120,0.08)',
                        fill: true,
                        tension: 0.4,
                    },
                ]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: { position: 'top' },
                    tooltip: {
                        callbacks: {
                            label: ctx => `${ctx.dataset.label}: ${formatVND(ctx.parsed.y)}`
                        }
                    }
                },
                scales: {
                    y: {
                        ticks: { callback: v => formatVND(v) }
                    }
                }
            }
        });
    } catch (e) {}
}

/**
 * Tải danh sách bán chạy
 */
async function loadTopProducts() {
    try {
        const res = await apiRequest('/api/bao-cao/hang-ban-chay');
        const { theo_so_luong, theo_doanh_thu } = res.data;

        const renderTable = (items, valueKey, valueFn) => items.map((p, i) => `
            <tr>
                <td>${i + 1}</td>
                <td><strong>${escapeHtml(p.ten_hang)}</strong><br><small class="text-muted">${escapeHtml(p.ma_hang)}</small></td>
                <td class="text-end">${valueFn(p[valueKey])}</td>
            </tr>
        `).join('');

        document.getElementById('top-qty-body').innerHTML =
            renderTable(theo_so_luong, 'so_luong', v => formatNumber(v) + ' cái');
        document.getElementById('top-rev-body').innerHTML =
            renderTable(theo_doanh_thu, 'doanh_thu', formatVND);
    } catch (e) {}
}

/**
 * Tải bảng tồn kho
 */
async function loadTonKho() {
    try {
        const res = await apiRequest('/api/bao-cao/ton-kho');
        const items = res.data || [];
        document.getElementById('total-ton-kho-value').textContent = formatVND(res.total_value);
        document.getElementById('ton-kho-body').innerHTML = items.map((p, i) => `
            <tr>
                <td>${i + 1}</td>
                <td><span class="badge bg-secondary font-monospace">${escapeHtml(p.ma_hang)}</span></td>
                <td><strong>${escapeHtml(p.ten_hang)}</strong></td>
                <td>${p.danh_muc ? `<span class="badge bg-light text-dark border">${escapeHtml(p.danh_muc)}</span>` : '-'}</td>
                <td class="text-center">${formatNumber(p.ton_kho)} ${escapeHtml(p.don_vi_tinh || 'Cái')}</td>
                <td class="text-end">${formatVND(p.gia_nhap)}</td>
                <td class="text-end fw-bold">${formatVND(p.gia_tri)}</td>
            </tr>
        `).join('') || '<tr><td colspan="7" class="text-center text-muted py-3">Không có dữ liệu</td></tr>';
    } catch (e) {}
}

function formatISODate(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

/**
 * Xử lý khi người dùng chọn nút lọc nhanh
 */
function setQuickPeriod(type) {
    const today = new Date();
    let fromDate = new Date();
    let toDate = new Date();

    // Bỏ active tất cả nút quick
    document.querySelectorAll('.btn-group .btn').forEach(b => b.classList.remove('active'));

    if (type === 'today') {
        fromDate = today;
        toDate = today;
    } else if (type === 'week') {
        const day = today.getDay();
        const diff = today.getDate() - day + (day === 0 ? -6 : 1); // Thứ 2 đầu tuần
        fromDate = new Date(today.getFullYear(), today.getMonth(), diff);
        toDate = new Date(today.getFullYear(), today.getMonth(), diff + 6);
    } else if (type === 'month') {
        fromDate = new Date(today.getFullYear(), today.getMonth(), 1);
        toDate = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    } else if (type === 'year') {
        fromDate = new Date(today.getFullYear(), 0, 1);
        toDate = new Date(today.getFullYear(), 11, 31);
    }

    const fromISO = formatISODate(fromDate);
    const toISO = formatISODate(toDate);

    document.getElementById('report-from-date').value = fromISO;
    document.getElementById('report-to-date').value = toISO;
    currentFromDate = fromISO;
    currentToDate = toISO;

    // Gắn active nút tương ứng
    const btn = event?.target;
    if (btn && btn.classList.contains('btn')) {
        btn.classList.add('active');
    }

    loadStats(currentFromDate, currentToDate);
}

function onDateRangeChanged() {
    // Bỏ active của các nút quick
    document.querySelectorAll('.btn-group .btn').forEach(b => b.classList.remove('active'));
    currentFromDate = document.getElementById('report-from-date')?.value || '';
    currentToDate = document.getElementById('report-to-date')?.value || '';
    if (currentFromDate && currentToDate && currentFromDate <= currentToDate) {
        loadStats(currentFromDate, currentToDate);
    }
}

function applyCustomRange() {
    const from = document.getElementById('report-from-date').value;
    const to = document.getElementById('report-to-date').value;
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
    loadStats(currentFromDate, currentToDate);
}

/**
 * Lấy nhãn hiển thị khoảng thời gian (VD: "Từ ngày 01/10/2026 đến ngày 31/10/2026" hoặc "Tháng 10 năm 2026")
 */
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
 * Xuất file Excel chuẩn Mẫu số S16-DNN (Bộ Tài chính)
 */
async function exportFinancialReportToExcel() {
    if (!window.ExcelJS) {
        showToast('Đang tải bộ xuất Excel, vui lòng thử lại sau...', 'info');
        return;
    }

    const fromInput = document.getElementById('report-from-date')?.value;
    const toInput = document.getElementById('report-to-date')?.value;
    if (fromInput) currentFromDate = fromInput;
    if (toInput) currentToDate = toInput;

    if (!currentReportData || !currentReportData.chi_tiet_ban_hang) {
        await loadStats(currentFromDate, currentToDate);
    }

    const items = currentReportData?.chi_tiet_ban_hang || [];
    if (!items.length) {
        showToast('Không có dữ liệu bán hàng trong khoảng thời gian này để xuất Excel!', 'warning');
        return;
    }

    const periodText = getPeriodDisplayText();
    const wb = new window.ExcelJS.Workbook();
    wb.creator = 'Kho Hàng An Nam';
    wb.lastModifiedBy = 'Kho Hàng An Nam';
    wb.created = new Date();

    const ws = wb.addWorksheet('SoChiTietBanHang', { views: [{ showGridLines: true }] });

    // Cấu hình chiều rộng các cột (STT, Số hiệu, Ngày tháng, Diễn giải, TK ĐƯ, Số lượng, Đơn giá, Thành tiền, Thuế, Khác)
    ws.columns = [
        { width: 7 },   // A: STT
        { width: 14 },  // B: Số hiệu
        { width: 12 },  // C: Ngày, tháng
        { width: 44 },  // D: Diễn giải
        { width: 10 },  // E: TK ĐƯ
        { width: 13 },  // F: Số lượng
        { width: 16 },  // G: Đơn giá
        { width: 18 },  // H: Thành tiền
        { width: 12 },  // I: Thuế
        { width: 12 },  // J: Khác
    ];

    const fontNormal = { name: 'Times New Roman', size: 10, color: { argb: 'FF000000' } };
    const fontBold = { name: 'Times New Roman', size: 10, bold: true, color: { argb: 'FF000000' } };
    const fontTitle = { name: 'Times New Roman', size: 15, bold: true, color: { argb: 'FF000000' } };
    const fontSubTitle = { name: 'Times New Roman', size: 10, color: { argb: 'FF000000' } };
    const fontItalic = { name: 'Times New Roman', size: 9.5, italic: true, color: { argb: 'FF000000' } };

    const borderThinAll = {
        top: { style: 'thin', color: { argb: 'FF000000' } },
        bottom: { style: 'thin', color: { argb: 'FF000000' } },
        left: { style: 'thin', color: { argb: 'FF000000' } },
        right: { style: 'thin', color: { argb: 'FF000000' } }
    };
    const borderDottedRow = {
        top: { style: 'dotted', color: { argb: 'FF000000' } },
        bottom: { style: 'dotted', color: { argb: 'FF000000' } },
        left: { style: 'thin', color: { argb: 'FF000000' } },
        right: { style: 'thin', color: { argb: 'FF000000' } }
    };

    // Header góc trái: Đơn vị, Địa chỉ
    ws.getCell('A1').value = `Đơn vị: ${COMPANY_INFO.name}`;
    ws.getCell('A1').font = fontBold;
    ws.getCell('A2').value = `Địa chỉ: ${COMPANY_INFO.address}`;
    ws.getCell('A2').font = fontBold;

    // Header góc phải: Mẫu số S16-DNN
    ws.mergeCells('H1:J1');
    const mCell = ws.getCell('H1');
    mCell.value = 'Mẫu số S16-DNN';
    mCell.font = fontBold;
    mCell.alignment = { horizontal: 'center' };

    ws.mergeCells('G2:J2');
    const qdCell = ws.getCell('G2');
    qdCell.value = '(Ban hành theo TT 133/2016/TT-BTC';
    qdCell.font = fontItalic;
    qdCell.alignment = { horizontal: 'center' };

    ws.mergeCells('G3:J3');
    const qd2Cell = ws.getCell('G3');
    qd2Cell.value = 'ngày 26/08/2016 của Bộ Trưởng BTC)';
    qd2Cell.font = fontItalic;
    qd2Cell.alignment = { horizontal: 'center' };

    // Tiêu đề SỔ CHI TIẾT BÁN HÀNG
    ws.mergeCells('A5:J5');
    const titleCell = ws.getCell('A5');
    titleCell.value = 'SỔ CHI TIẾT BÁN HÀNG';
    titleCell.font = fontTitle;
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };

    // Kỳ báo cáo
    ws.mergeCells('A6:J6');
    const periodCell = ws.getCell('A6');
    periodCell.value = periodText;
    periodCell.font = fontSubTitle;
    periodCell.alignment = { horizontal: 'center', vertical: 'middle' };

    // Tài khoản
    ws.mergeCells('A7:J7');
    const tkCell = ws.getCell('A7');
    tkCell.value = 'Tài khoản: 511 (Doanh thu bán hàng và cung cấp dịch vụ)';
    tkCell.font = fontSubTitle;
    tkCell.alignment = { horizontal: 'center', vertical: 'middle' };

    // Đơn vị tính
    ws.mergeCells('H9:J9');
    const uCell = ws.getCell('H9');
    uCell.value = 'Đơn vị tính: Đồng';
    uCell.font = fontBold;
    uCell.alignment = { horizontal: 'right', vertical: 'middle' };

    // Hàng tiêu đề bảng (2 hàng: dòng 10 và dòng 11)
    // Hàng 10:
    ws.mergeCells('A10:A11');
    ws.getCell('A10').value = 'STT';
    ws.mergeCells('B10:C10');
    ws.getCell('B10').value = 'Chứng từ';
    ws.mergeCells('D10:D11');
    ws.getCell('D10').value = 'Diễn giải';
    ws.mergeCells('E10:E11');
    ws.getCell('E10').value = 'TK\nĐƯ';
    ws.mergeCells('F10:H10');
    ws.getCell('F10').value = 'Doanh thu';
    ws.mergeCells('I10:J10');
    ws.getCell('I10').value = 'Các khoản tính trừ';

    // Hàng 11 con:
    ws.getCell('B11').value = 'Số hiệu';
    ws.getCell('C11').value = 'Ngày, tháng';
    ws.getCell('F11').value = 'Số lượng';
    ws.getCell('G11').value = 'Đơn giá';
    ws.getCell('H11').value = 'Thành tiền';
    ws.getCell('I11').value = 'Thuế';
    ws.getCell('J11').value = 'Khác';

    // Border & căn giữa cho hàng 10, 11
    for (let r = 10; r <= 11; r++) {
        const row = ws.getRow(r);
        row.height = 22;
        for (let c = 1; c <= 10; c++) {
            const cell = row.getCell(c);
            cell.font = fontBold;
            cell.border = borderThinAll;
            cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        }
    }

    // Hàng 12: Ký hiệu mã cột A, B, C, D, E, 1, 2, 3 = 1 x 2, 4, 5
    const row12 = ws.getRow(12);
    row12.height = 18;
    const colCodes = ['A', 'B', 'C', 'D', 'E', '1', '2', '3 = 1 x 2', '4', '5'];
    colCodes.forEach((code, idx) => {
        const cell = row12.getCell(idx + 1);
        cell.value = code;
        cell.font = fontBold;
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.border = borderThinAll;
    });

    // Dữ liệu từng dòng bán hàng
    let startRow = 13;
    let totalQty = 0;
    let totalRevenue = 0;

    items.forEach((it, idx) => {
        const rowNum = startRow + idx;
        const row = ws.getRow(rowNum);
        const sl = parseInt(it.so_luong) || 0;
        const donGia = parseFloat(it.don_gia) || 0;
        const thanhTien = parseFloat(it.thanh_tien) || (sl * donGia);

        totalQty += sl;
        totalRevenue += thanhTien;

        // Ngày dạng dd/mm
        let ngayDM = '';
        if (it.ngay_xuat) {
            const parts = it.ngay_xuat.split('-');
            ngayDM = parts.length === 3 ? `${parts[2]}/${parts[1]}` : it.ngay_xuat;
        }

        row.getCell(1).value = idx + 1; // STT
        row.getCell(2).value = it.so_phieu; // Số hiệu
        row.getCell(3).value = ngayDM; // Ngày tháng
        row.getCell(4).value = it.ten_hang; // Diễn giải
        row.getCell(5).value = it.tk_du || '131'; // TK ĐƯ
        
        row.getCell(6).value = sl; // SL
        row.getCell(6).numFmt = '#,##0.00';

        row.getCell(7).value = donGia > 0 ? donGia : ''; // Đơn giá
        if (donGia > 0) row.getCell(7).numFmt = '#,##0';

        row.getCell(8).value = thanhTien; // Thành tiền
        row.getCell(8).numFmt = '#,##0';

        row.getCell(9).value = ''; // Thuế
        row.getCell(10).value = ''; // Khác

        // Style
        for (let c = 1; c <= 10; c++) {
            const cell = row.getCell(c);
            cell.font = fontNormal;
            cell.border = borderDottedRow;
        }
        row.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
        row.getCell(2).alignment = { horizontal: 'center', vertical: 'middle' };
        row.getCell(3).alignment = { horizontal: 'center', vertical: 'middle' };
        row.getCell(4).alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
        row.getCell(5).alignment = { horizontal: 'center', vertical: 'middle' };
        row.getCell(6).alignment = { horizontal: 'right', vertical: 'middle' };
        row.getCell(7).alignment = { horizontal: 'right', vertical: 'middle' };
        row.getCell(8).alignment = { horizontal: 'right', vertical: 'middle' };
        row.getCell(9).alignment = { horizontal: 'center', vertical: 'middle' };
        row.getCell(10).alignment = { horizontal: 'center', vertical: 'middle' };
    });

    // Các dòng tổng kết (Ảnh 2: Tổng cộng số phát sinh, Doanh thu thuần, Giá vốn hàng bán, Lãi gộp)
    const curEndRow = startRow + items.length;
    const giaVon = currentReportData?.gia_von || 0;
    const laiGop = totalRevenue - giaVon;

    const summaryDefs = [
        { label: 'Tổng cộng số phát sinh', qty: totalQty, amount: totalRevenue, isBold: true },
        { label: '- Doanh thu thuần', qty: null, amount: totalRevenue, isBold: false },
        { label: '- Giá vốn hàng bán', qty: null, amount: giaVon, isBold: false },
        { label: '- Lãi gộp', qty: null, amount: laiGop, isBold: true },
    ];

    summaryDefs.forEach((s, sIdx) => {
        const rNum = curEndRow + sIdx;
        const row = ws.getRow(rNum);
        ws.mergeCells(`A${rNum}:E${rNum}`);
        row.getCell(1).value = s.label;
        row.getCell(1).font = s.isBold ? fontBold : fontNormal;
        row.getCell(1).alignment = { horizontal: s.label.startsWith('-') ? 'left' : 'center', vertical: 'middle' };

        if (s.qty !== null) {
            row.getCell(6).value = s.qty;
            row.getCell(6).numFmt = '#,##0.00';
            row.getCell(6).alignment = { horizontal: 'right', vertical: 'middle' };
            row.getCell(6).font = fontBold;
        }

        row.getCell(8).value = s.amount;
        row.getCell(8).numFmt = '#,##0';
        row.getCell(8).alignment = { horizontal: 'right', vertical: 'middle' };
        row.getCell(8).font = s.isBold ? fontBold : fontNormal;

        for (let c = 1; c <= 10; c++) {
            row.getCell(c).border = borderThinAll;
        }
        row.height = 22;
    });

    // Ngày mở sổ & chữ ký
    const now = new Date();
    const signStartRow = curEndRow + summaryDefs.length + 2;

    // Dòng ngày mở sổ & ngày ký
    const rDate = ws.getRow(signStartRow);
    const dateOpenStr = currentFromDate ? `Ngày mở sổ: ${currentFromDate.split('-').reverse().join('/')}` : `Ngày mở sổ: 01/${String(now.getMonth()+1).padStart(2,'0')}/${now.getFullYear()}`;
    const dateCloseStr = `Ngày ${String(now.getDate()).padStart(2,'0')} tháng ${String(now.getMonth()+1).padStart(2,'0')} năm ${now.getFullYear()}`;

    ws.mergeCells(`A${signStartRow}:D${signStartRow}`);
    rDate.getCell(1).value = dateOpenStr;
    rDate.getCell(1).font = fontItalic;

    ws.mergeCells(`G${signStartRow}:J${signStartRow}`);
    rDate.getCell(7).value = dateCloseStr;
    rDate.getCell(7).font = fontItalic;
    rDate.getCell(7).alignment = { horizontal: 'center' };

    // Hàng chức danh ký tên
    const rTitle = ws.getRow(signStartRow + 2);
    ws.mergeCells(`A${signStartRow + 2}:C${signStartRow + 2}`);
    rTitle.getCell(1).value = 'Người ghi sổ';
    rTitle.getCell(1).font = fontBold;
    rTitle.getCell(1).alignment = { horizontal: 'center' };

    ws.mergeCells(`D${signStartRow + 2}:F${signStartRow + 2}`);
    rTitle.getCell(4).value = 'Kế toán trưởng';
    rTitle.getCell(4).font = fontBold;
    rTitle.getCell(4).alignment = { horizontal: 'center' };

    ws.mergeCells(`G${signStartRow + 2}:J${signStartRow + 2}`);
    rTitle.getCell(7).value = 'Giám đốc';
    rTitle.getCell(7).font = fontBold;
    rTitle.getCell(7).alignment = { horizontal: 'center' };

    // Hàng ghi chú ký tên
    const rNote = ws.getRow(signStartRow + 3);
    ws.mergeCells(`A${signStartRow + 3}:C${signStartRow + 3}`);
    rNote.getCell(1).value = '(Ký, họ tên)';
    rNote.getCell(1).font = fontItalic;
    rNote.getCell(1).alignment = { horizontal: 'center' };

    ws.mergeCells(`D${signStartRow + 3}:F${signStartRow + 3}`);
    rNote.getCell(4).value = '(Ký, họ tên)';
    rNote.getCell(4).font = fontItalic;
    rNote.getCell(4).alignment = { horizontal: 'center' };

    ws.mergeCells(`G${signStartRow + 3}:J${signStartRow + 3}`);
    rNote.getCell(7).value = '(Ký, họ tên, đóng dấu)';
    rNote.getCell(7).font = fontItalic;
    rNote.getCell(7).alignment = { horizontal: 'center' };

    // Tải xuống file Excel
    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `So_Chi_Tiet_Ban_Hang_${currentFromDate || 'all'}_den_${currentToDate || 'all'}.xlsx`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
    }, 150);

    showToast('Đã xuất file Excel Sổ Chi Tiết Bán Hàng (S16-DNN) thành công!', 'success');
}

/**
 * In Báo Cáo Tài Chính / Sổ Chi Tiết Bán Hàng chuẩn Thông tư 133
 */
async function printFinancialReport() {
    const fromInput = document.getElementById('report-from-date')?.value;
    const toInput = document.getElementById('report-to-date')?.value;
    if (fromInput) currentFromDate = fromInput;
    if (toInput) currentToDate = toInput;

    if (!currentReportData || !currentReportData.chi_tiet_ban_hang) {
        await loadStats(currentFromDate, currentToDate);
    }
    const items = currentReportData?.chi_tiet_ban_hang || [];
    if (!items.length) {
        showToast('Không có dữ liệu để in báo cáo trong khoảng thời gian này!', 'warning');
        return;
    }

    const periodText = getPeriodDisplayText();
    const totalRev = currentReportData?.doanh_thu || 0;
    const giaVon = currentReportData?.gia_von || 0;
    const laiGop = totalRev - giaVon;
    let totalQty = 0;

    const rowsHtml = items.map((it, idx) => {
        const sl = parseInt(it.so_luong) || 0;
        totalQty += sl;
        const donGia = parseFloat(it.don_gia) || 0;
        const thanhTien = parseFloat(it.thanh_tien) || 0;
        let ngayDM = '';
        if (it.ngay_xuat) {
            const p = it.ngay_xuat.split('-');
            ngayDM = p.length === 3 ? `${p[2]}/${p[1]}` : it.ngay_xuat;
        }

        return `
            <tr>
                <td style="text-align: center; padding: 4px;">${idx + 1}</td>
                <td style="text-align: center; padding: 4px; font-weight: 500;">${escapeHtml(it.so_phieu)}</td>
                <td style="text-align: center; padding: 4px;">${escapeHtml(ngayDM)}</td>
                <td style="text-align: left; padding: 4px 6px;">${escapeHtml(it.ten_hang)}</td>
                <td style="text-align: center; padding: 4px;">${escapeHtml(it.tk_du || '131')}</td>
                <td style="text-align: right; padding: 4px 6px;">${formatNumber(sl)}</td>
                <td style="text-align: right; padding: 4px 6px;">${donGia > 0 ? formatVNDClean(donGia) : ''}</td>
                <td style="text-align: right; padding: 4px 6px; font-weight: 500;">${formatVNDClean(thanhTien)}</td>
                <td style="text-align: center; padding: 4px;"></td>
                <td style="text-align: center; padding: 4px;"></td>
            </tr>
        `;
    }).join('');

    const now = new Date();
    const dateOpenStr = currentFromDate ? `Ngày mở sổ: ${currentFromDate.split('-').reverse().join('/')}` : `Ngày mở sổ: 01/${String(now.getMonth()+1).padStart(2,'0')}/${now.getFullYear()}`;
    const dateCloseStr = `Ngày ${String(now.getDate()).padStart(2,'0')} tháng ${String(now.getMonth()+1).padStart(2,'0')} năm ${now.getFullYear()}`;

    const printWindow = window.open('', '_blank', 'width=1100,height=800');
    if (!printWindow) {
        showToast('Trình duyệt đã chặn pop-up in, vui lòng cho phép để tiếp tục!', 'warning');
        return;
    }

    printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <title>Sổ Chi Tiết Bán Hàng - Mẫu S16-DNN</title>
            <style>
                @page { size: A4 landscape; margin: 12mm 15mm; }
                body {
                    font-family: "Times New Roman", Times, serif;
                    font-size: 10pt;
                    color: #000;
                    margin: 0;
                    padding: 10px;
                }
                table {
                    width: 100%;
                    border-collapse: collapse;
                    margin-top: 10px;
                }
                th, td {
                    border: 1px solid #000;
                }
                th {
                    background-color: #f7f7f7;
                    font-weight: bold;
                    text-align: center;
                }
                .no-border { border: none !important; }
            </style>
        </head>
        <body>
            <div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
                <div style="font-size: 10pt; line-height: 1.4;">
                    <strong>Đơn vị:</strong> ${COMPANY_INFO.name}<br>
                    <strong>Địa chỉ:</strong> ${COMPANY_INFO.address}
                </div>
                <div style="text-align: center; font-size: 10pt; line-height: 1.3;">
                    <strong>Mẫu số S16-DNN</strong><br>
                    <span style="font-style: italic; font-size: 9pt;">(Ban hành theo TT 133/2016/TT-BTC<br>ngày 26/08/2016 của Bộ Trưởng BTC)</span>
                </div>
            </div>

            <div style="text-align: center; margin-bottom: 8px;">
                <h2 style="font-size: 16pt; margin: 0; text-transform: uppercase; font-weight: bold;">SỔ CHI TIẾT BÁN HÀNG</h2>
                <div style="font-size: 10.5pt; margin-top: 3px;">${periodText}</div>
                <div style="font-size: 10pt; margin-top: 2px;">Tài khoản: 511 (Doanh thu bán hàng và cung cấp dịch vụ)</div>
            </div>

            <div style="text-align: right; font-weight: bold; font-size: 10pt; margin-bottom: 5px;">
                Đơn vị tính: Đồng
            </div>

            <table>
                <thead>
                    <tr>
                        <th rowspan="2" style="width: 35px;">STT</th>
                        <th colspan="2">Chứng từ</th>
                        <th rowspan="2">Diễn giải</th>
                        <th rowspan="2" style="width: 45px;">TK<br>ĐƯ</th>
                        <th colspan="3">Doanh thu</th>
                        <th colspan="2">Các khoản tính trừ</th>
                    </tr>
                    <tr>
                        <th style="width: 85px;">Số hiệu</th>
                        <th style="width: 65px;">Ngày, tháng</th>
                        <th style="width: 65px;">Số lượng</th>
                        <th style="width: 95px;">Đơn giá</th>
                        <th style="width: 115px;">Thành tiền</th>
                        <th style="width: 60px;">Thuế</th>
                        <th style="width: 60px;">Khác</th>
                    </tr>
                    <tr style="background-color: #fafafa; font-size: 9pt;">
                        <th>A</th>
                        <th>B</th>
                        <th>C</th>
                        <th>D</th>
                        <th>E</th>
                        <th>1</th>
                        <th>2</th>
                        <th>3 = 1 x 2</th>
                        <th>4</th>
                        <th>5</th>
                    </tr>
                </thead>
                <tbody>
                    ${rowsHtml}
                    <tr style="font-weight: bold;">
                        <td colspan="5" style="text-align: center; padding: 5px;">Tổng cộng số phát sinh</td>
                        <td style="text-align: right; padding: 5px;">${formatNumber(totalQty)}</td>
                        <td></td>
                        <td style="text-align: right; padding: 5px;">${formatVNDClean(totalRev)}</td>
                        <td></td>
                        <td></td>
                    </tr>
                    <tr>
                        <td colspan="5" style="padding: 5px; text-indent: 10px;">- Doanh thu thuần</td>
                        <td></td>
                        <td></td>
                        <td style="text-align: right; padding: 5px;">${formatVNDClean(totalRev)}</td>
                        <td></td>
                        <td></td>
                    </tr>
                    <tr>
                        <td colspan="5" style="padding: 5px; text-indent: 10px;">- Giá vốn hàng bán</td>
                        <td></td>
                        <td></td>
                        <td style="text-align: right; padding: 5px;">${formatVNDClean(giaVon)}</td>
                        <td></td>
                        <td></td>
                    </tr>
                    <tr style="font-weight: bold;">
                        <td colspan="5" style="padding: 5px; text-indent: 10px;">- Lãi gộp</td>
                        <td></td>
                        <td></td>
                        <td style="text-align: right; padding: 5px;">${formatVNDClean(laiGop)}</td>
                        <td></td>
                        <td></td>
                    </tr>
                </tbody>
            </table>

            <div style="margin-top: 15px; display: flex; justify-content: space-between; font-size: 10pt;">
                <div style="font-style: italic;">${dateOpenStr}</div>
                <div style="font-style: italic;">${dateCloseStr}</div>
            </div>

            <div style="display: flex; justify-content: space-around; text-align: center; margin-top: 10px; font-size: 10pt;">
                <div style="flex: 1;">
                    <strong>Người ghi sổ</strong><br>
                    <span style="font-size: 9pt; font-style: italic;">(Ký, họ tên)</span>
                </div>
                <div style="flex: 1;">
                    <strong>Kế toán trưởng</strong><br>
                    <span style="font-size: 9pt; font-style: italic;">(Ký, họ tên)</span>
                </div>
                <div style="flex: 1;">
                    <strong>Giám đốc</strong><br>
                    <span style="font-size: 9pt; font-style: italic;">(Ký, họ tên, đóng dấu)</span>
                </div>
            </div>

            <script>
                window.onload = function() {
                    setTimeout(function() { window.print(); }, 400);
                };
            </script>
        </body>
        </html>
    `);
    printWindow.document.close();
}

document.addEventListener('DOMContentLoaded', async () => {
    // Mặc định chọn cả tháng hiện tại theo ngày địa phương
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);

    const fromISO = formatISODate(firstDay);
    const toISO = formatISODate(lastDay);

    document.getElementById('report-from-date').value = fromISO;
    document.getElementById('report-to-date').value = toISO;
    currentFromDate = fromISO;
    currentToDate = toISO;

    await Promise.all([
        loadStats(currentFromDate, currentToDate),
        loadChart(),
        loadTopProducts(),
        loadTonKho(),
    ]);
});

