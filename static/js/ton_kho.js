/**
 * ton_kho.js - Logic cho trang Hàng Hóa Tồn Kho
 */

let allProducts = [];

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

let currentPeriodLabel = 'Tất cả';

function clearSearch() {
    const el = document.getElementById('search-input');
    if (el) {
        el.value = '';
        renderStockTable();
    }
}

function setQuickPeriod(type) {
    document.querySelectorAll('.date-range-presets .btn').forEach(btn => btn.classList.remove('active'));

    const range = typeof getPresetDateRange === 'function' ? getPresetDateRange(type) : { from: '', to: '' };
    const fromEl = document.getElementById('filter-from-date');
    const toEl = document.getElementById('filter-to-date');

    if (fromEl) fromEl.value = range.from || '';
    if (toEl) toEl.value = range.to || '';

    const map = {
        'today': 'Hôm nay',
        'week': 'Tuần này',
        'month': 'Tháng này',
        'year': 'Năm nay',
        'all': 'Tất cả'
    };
    currentPeriodLabel = map[type] || 'Tùy chọn';

    const clickedBtn = Array.from(document.querySelectorAll('.date-range-presets .btn'))
        .find(b => b.textContent.trim().toLowerCase() === (map[type] || '').toLowerCase());
    if (clickedBtn) {
        clickedBtn.classList.add('active');
    }

    loadStockData();
}

function onDateRangeChanged() {
    document.querySelectorAll('.date-range-presets .btn').forEach(btn => btn.classList.remove('active'));
    currentPeriodLabel = 'Tùy chọn';
}

function applyDateFilter() {
    loadStockData();
}

async function loadStockData(silent = false) {
    try {
        const tbody = document.getElementById('stock-tbody');
        if (!silent && tbody) {
            tbody.innerHTML = '<tr><td colspan="10" class="text-center text-muted py-4"><div class="spinner-border spinner-border-sm text-primary me-2"></div>Đang tải dữ liệu tồn kho...</td></tr>';
        }

        const fromDate = document.getElementById('filter-from-date')?.value || '';
        const toDate = document.getElementById('filter-to-date')?.value || '';

        let url = '/api/hang-hoa';
        const params = new URLSearchParams();
        if (fromDate) params.append('from_date', fromDate);
        if (toDate) params.append('to_date', toDate);
        const qStr = params.toString();
        if (qStr) url += `?${qStr}`;

        const res = await apiRequest(url);
        allProducts = res.data || [];
        renderStockTable();
    } catch (e) {
        if (!silent) {
            showToast('Lỗi khi tải dữ liệu tồn kho: ' + e.message, 'error');
        }
    }
}

let currentFiltered = [];

function renderStockTable() {
    const search = (document.getElementById('search-input')?.value || '').trim();
    const danhMuc = document.getElementById('filter-danh-muc')?.value || '';
    const stockStatus = document.getElementById('filter-stock-status')?.value || 'in_stock';

    const matcher = window.matchSearchKeywords || matchSearchKeywords || ((txt, q) => (txt || '').toLowerCase().includes((q || '').toLowerCase()));

    let filtered = allProducts.filter(p => {
        const ton = parseInt(p.ton_kho) || 0;
        if (stockStatus === 'in_stock' && ton <= 0) return false;
        if (stockStatus === 'low_stock' && (ton <= 0 || ton > 2)) return false;
        if (stockStatus === 'out_of_stock' && ton > 0) return false;
        if (danhMuc && p.danh_muc !== danhMuc) return false;
        if (search) {
            const text = `${p.ma_hang || ''} ${p.ten_hang || ''} ${p.danh_muc || ''} ${p.ghi_chu || ''}`;
            if (!matcher(text, search)) return false;
        }
        return true;
    });

    currentFiltered = filtered;

    // Thống kê tổng hợp
    const inStockItems = allProducts.filter(p => (parseInt(p.ton_kho) || 0) > 0);
    const totalInStockItemsCount = inStockItems.length;
    const totalQty = filtered.reduce((sum, p) => sum + (parseInt(p.ton_kho) || 0), 0);
    const totalVal = filtered.reduce((sum, p) => {
        if (p.thanh_tien_ton !== undefined) {
            return sum + p.thanh_tien_ton;
        }
        const sl = parseInt(p.ton_kho) || 0;
        const batches = p.batches || [];
        if (batches.length > 1) {
            return sum + batches.reduce((bSum, b) => bSum + (b.so_luong * b.gia_nhap), 0);
        }
        const gia = parseFloat(p.gia_nhap) || 0;
        return sum + Math.round(sl * gia);
    }, 0);

    // Cập nhật card trên đầu
    document.getElementById('stat-items').textContent = formatNumber(totalInStockItemsCount);
    document.getElementById('stat-items-sub').textContent = `trên tổng số ${allProducts.length} mặt hàng`;
    document.getElementById('stat-qty').textContent = formatNumber(totalQty);
    document.getElementById('stat-val').textContent = formatVND(totalVal);
    document.getElementById('total-count').textContent = filtered.length;

    // Cập nhật footer
    const tfoot = document.getElementById('stock-tfoot');
    if (filtered.length > 0) {
        tfoot.style.display = '';
        document.getElementById('tf-qty').textContent = formatNumber(totalQty);
        document.getElementById('tf-val').textContent = formatVND(totalVal);
    } else {
        tfoot.style.display = 'none';
    }

    const tbody = document.getElementById('stock-tbody');
    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="10" class="text-center text-muted py-5">
            <i class="bi bi-inbox fs-2 d-block text-secondary mb-2"></i>
            Không có hàng hóa nào phù hợp với bộ lọc
        </td></tr>`;
        return;
    }

    tbody.innerHTML = filtered.map((p, idx) => {
        const sl = parseInt(p.ton_kho) || 0;
        const giaNhap = parseFloat(p.gia_nhap) || 0;
        const giaBan = parseFloat(p.gia_ban) || 0;
        const batches = p.batches || [];
        const hasMulti = batches.length > 1;

        let giaTriTon = 0;
        if (p.thanh_tien_ton !== undefined) {
            giaTriTon = p.thanh_tien_ton;
        } else if (batches.length > 1) {
            giaTriTon = batches.reduce((bSum, b) => bSum + (b.so_luong * b.gia_nhap), 0);
        } else {
            giaTriTon = Math.round(sl * giaNhap);
        }

        const badgeClass = sl > 5 ? 'bg-success' : (sl > 0 ? 'bg-warning text-dark' : 'bg-danger');

        // Dropdown chi tiết lô giá
        let batchBadgeHtml = '';
        if (hasMulti) {
            batchBadgeHtml = `
                <div class="dropdown d-inline-block mt-1">
                    <button class="btn btn-xs btn-outline-info dropdown-toggle py-0 px-1" type="button" data-bs-toggle="dropdown" style="font-size:0.75rem;">
                        <i class="bi bi-layers-half me-1"></i>${batches.length} lô giá
                    </button>
                    <ul class="dropdown-menu dropdown-menu-end shadow-sm small p-2" style="min-width: 200px;">
                        <li class="dropdown-header py-1 text-uppercase text-muted" style="font-size: 0.7rem;">Chi tiết lô nhập FIFO:</li>
                        ${batches.map(b => `
                            <li class="d-flex justify-content-between py-1 border-bottom border-light">
                                <span><span class="badge bg-light text-dark border me-1">${b.so_luong} ${escapeHtml(p.don_vi_tinh || 'Cái')}</span></span>
                                <span class="fw-semibold text-primary font-monospace">${formatVND(b.gia_nhap)}</span>
                            </li>
                        `).join('')}
                    </ul>
                </div>
            `;
        }

        return `
            <tr>
                <td class="text-center text-muted small">${idx + 1}</td>
                <td><span class="badge bg-secondary font-monospace">${escapeHtml(p.ma_hang)}</span></td>
                <td>
                    <div class="fw-semibold text-dark">${escapeHtml(p.ten_hang)}</div>
                    ${p.ghi_chu ? `<small class="text-muted text-truncate d-block" style="max-width: 250px;">${escapeHtml(p.ghi_chu)}</small>` : ''}
                </td>
                <td><span class="badge bg-light text-secondary border">${escapeHtml(p.danh_muc || 'Khác')}</span></td>
                <td class="text-center text-muted small">${escapeHtml(p.don_vi_tinh || 'Cái')}</td>
                <td class="text-end text-muted font-monospace">${formatVND(giaNhap)}</td>
                <td class="text-center">
                    <div><span class="badge ${badgeClass} fs-6 px-2 py-1 font-monospace">${formatNumber(sl)}</span></div>
                    ${batchBadgeHtml}
                </td>
                <td class="text-end fw-bold text-primary font-monospace text-nowrap" style="white-space: nowrap; min-width: 165px;">${formatVND(giaTriTon)}</td>
                <td class="text-center no-print">
                    <div class="btn-group btn-group-sm">
                        <button class="btn btn-outline-secondary" onclick="openEditStockModal('${escapeHtml(p.id)}')" title="Chỉnh sửa kho hàng & giá lô">
                            <i class="bi bi-pencil-square"></i>
                        </button>
                        ${sl > 0 ? `
                            <a href="/xuat-hang?ma_hang=${encodeURIComponent(p.ma_hang)}" class="btn btn-outline-success" title="Xuất kho">
                                <i class="bi bi-box-arrow-up-right"></i>
                            </a>
                        ` : ''}
                    </div>
                </td>
            </tr>
        `;
    }).join('');
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
 * In Báo Cáo Hàng Hóa Tồn Kho chuẩn Thông tư 133/2016/TT-BTC
 * Format & Ngoại hình đồng bộ 100% với Bảng Nhập Xuất Tồn
 */
function printStockReport() {
    const items = currentFiltered && currentFiltered.length ? currentFiltered : allProducts;
    if (!items || !items.length) {
        showToast('Không có dữ liệu hàng tồn kho để in báo cáo!', 'warning');
        return;
    }

    const now = new Date();
    const dateCloseStr = `Ngày ${String(now.getDate()).padStart(2, '0')} tháng ${String(now.getMonth() + 1).padStart(2, '0')} năm ${now.getFullYear()}`;
    const fromDateVal = document.getElementById('filter-from-date')?.value || '';
    const toDateVal = document.getElementById('filter-to-date')?.value || '';
    let periodSubtitle = `Thời điểm: ${dateCloseStr}`;
    if (fromDateVal && toDateVal) {
        periodSubtitle = `Kỳ báo cáo: Từ ngày ${formatDate(fromDateVal)} đến ngày ${formatDate(toDateVal)}`;
    } else if (toDateVal) {
        periodSubtitle = `Tính đến ngày: ${formatDate(toDateVal)}`;
    } else if (fromDateVal) {
        periodSubtitle = `Từ ngày: ${formatDate(fromDateVal)}`;
    }

    let totQty = 0;
    let totVal = 0;

    const rowsHtml = items.map((p, idx) => {
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

        return `
            <tr>
                <td style="text-align: center; padding: 4px;">${idx + 1}</td>
                <td style="text-align: center; font-family: monospace; padding: 4px;">${escapeHtml(p.ma_hang || '')}</td>
                <td style="text-align: left; padding: 4px 6px;">${escapeHtml(p.ten_hang || '')}</td>
                <td style="text-align: left; padding: 4px 6px;">${escapeHtml(p.danh_muc || 'Khác')}</td>
                <td style="text-align: center; padding: 4px;">${escapeHtml(p.don_vi_tinh || 'Cái')}</td>
                <td style="text-align: right; padding: 4px 6px; font-weight: bold;">${formatNumber(sl)}</td>
                <td style="text-align: right; padding: 4px 6px;">${formatVNDClean(donGiaHienThi)}</td>
                <td style="text-align: right; padding: 4px 6px; font-weight: bold;">${formatVNDClean(giaTriTon)}</td>
                <td style="text-align: left; padding: 4px 6px;">${escapeHtml(p.ghi_chu || '')}</td>
            </tr>
        `;
    }).join('');

    const reportHtml = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <title>Báo Cáo Tổng Hợp Hàng Hóa Tồn Kho</title>
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
                <button class="btn-print" onclick="window.print()">🖨️ In Báo Cáo Tồn Kho (A4)</button>
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
                <h2 style="font-size: 15pt; margin: 0; text-transform: uppercase; font-weight: bold;">BẢNG TỔNG HỢP HÀNG HÓA TỒN KHO</h2>
                <div style="font-size: 10pt; margin-top: 3px;">${periodSubtitle}</div>
            </div>

            <div style="text-align: right; font-weight: bold; font-size: 9.5pt; margin-bottom: 4px;">
                Đơn vị tính: Đồng
            </div>

            <table>
                <thead>
                    <tr>
                        <th style="width: 35px; padding: 6px;">STT</th>
                        <th style="width: 85px; padding: 6px;">Mã hàng</th>
                        <th style="padding: 6px;">Tên vật tư, hàng hóa</th>
                        <th style="width: 130px; padding: 6px;">Danh mục</th>
                        <th style="width: 50px; padding: 6px;">ĐVT</th>
                        <th style="width: 80px; padding: 6px;">SL Tồn</th>
                        <th style="width: 105px; padding: 6px;">Đơn giá vốn</th>
                        <th style="width: 125px; padding: 6px;">Thành tiền tồn</th>
                        <th style="width: 110px; padding: 6px;">Ghi chú</th>
                    </tr>
                </thead>
                <tbody>
                    ${rowsHtml}
                    <tr style="font-weight: bold; background-color: #f0f7ff;">
                        <td colspan="5" style="text-align: center; padding: 5px;">TỔNG CỘNG</td>
                        <td style="text-align: right; padding: 5px;">${formatNumber(totQty)}</td>
                        <td style="text-align: center;">-</td>
                        <td style="text-align: right; padding: 5px;">${formatVNDClean(totVal)}</td>
                        <td></td>
                    </tr>
                </tbody>
            </table>

            <div style="margin-top: 15px; text-align: right; font-style: italic; font-size: 9.5pt; padding-right: 40px;">
                ${dateCloseStr}
            </div>

            <div style="display: flex; justify-content: space-around; text-align: center; margin-top: 10px; font-size: 9.5pt;">
                <div style="flex: 1;">
                    <strong>Người lập biểu</strong><br>
                    <span style="font-size: 8.5pt; font-style: italic;">(Ký, họ tên)</span>
                </div>
                <div style="flex: 1;">
                    <strong>Thủ kho</strong><br>
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
        </body>
        </html>
    `;

    executePrintHtml(reportHtml);
}

/**
 * Xuất Báo Cáo Tồn Kho ra file Excel chuẩn Thông tư 133/2016/TT-BTC
 * Định dạng, font chữ, viền kẻ và chữ ký đồng bộ 100% với Bảng Nhập Xuất Tồn
 */
async function exportStockExcel() {
    const items = currentFiltered && currentFiltered.length ? currentFiltered : allProducts;
    if (!items || !items.length) {
        showToast('Không có dữ liệu hàng tồn kho để xuất Excel!', 'warning');
        return;
    }

    if (typeof window.ExcelJS === 'undefined') {
        showToast('Đang khởi tạo công cụ ExcelJS, vui lòng thử lại sau giây lát!', 'info');
        return;
    }

    const now = new Date();
    const dateCloseStr = `Ngày ${String(now.getDate()).padStart(2, '0')} tháng ${String(now.getMonth() + 1).padStart(2, '0')} năm ${now.getFullYear()}`;
    const fromDateVal = document.getElementById('filter-from-date')?.value || '';
    const toDateVal = document.getElementById('filter-to-date')?.value || '';
    let periodSubtitle = `Thời điểm: ${dateCloseStr}`;
    if (fromDateVal && toDateVal) {
        periodSubtitle = `Kỳ báo cáo: Từ ngày ${formatDate(fromDateVal)} đến ngày ${formatDate(toDateVal)}`;
    } else if (toDateVal) {
        periodSubtitle = `Tính đến ngày: ${formatDate(toDateVal)}`;
    } else if (fromDateVal) {
        periodSubtitle = `Từ ngày: ${formatDate(fromDateVal)}`;
    }
    const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;

    const wb = new window.ExcelJS.Workbook();
    wb.creator = COMPANY_REPORT_INFO.name;
    wb.lastModifiedBy = COMPANY_REPORT_INFO.name;
    wb.created = now;

    const ws = wb.addWorksheet('HangHoaTonKho', { views: [{ showGridLines: true }] });

    // Độ rộng các cột tương ứng
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
    tCell.value = 'BẢNG TỔNG HỢP HÀNG HÓA TỒN KHO';
    tCell.font = fontTitle;
    tCell.alignment = { horizontal: 'center', vertical: 'middle' };

    // Thời điểm báo cáo
    ws.mergeCells('A6:I6');
    const pCell = ws.getCell('A6');
    pCell.value = periodSubtitle;
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
        'Thành tiền tồn',
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

    items.forEach((p, idx) => {
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

    // Hàng Tổng cộng (nền xanh nhạt FFBDEAFE đồng bộ với Bảng Nhập Xuất Tồn)
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

    // Phần Ký Tên (4 chức danh chuẩn)
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
    a.download = `Bao_Cao_Tong_Hop_Ton_Kho_${dateStr}.xlsx`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
    }, 150);

    showToast('Đã xuất file Excel Báo Cáo Tồn Kho thành công!', 'success');
}

// ── Stock Edit Modal Logic ────────────────────────────────────────────────────

let currentEditingProduct = null;
let editStockModalInstance = null;

function openEditStockModal(productId) {
    const p = allProducts.find(x => String(x.id) === String(productId));
    if (!p) {
        showToast('Không tìm thấy thông tin hàng hóa!', 'error');
        return;
    }
    currentEditingProduct = p;

    document.getElementById('edit-prod-id').value = p.id;
    document.getElementById('edit-prod-ma').value = p.ma_hang || '';
    document.getElementById('edit-prod-ten').value = p.ten_hang || '';
    document.getElementById('edit-prod-danh-muc').value = p.danh_muc || 'Khác';
    document.getElementById('edit-prod-dvt').value = p.don_vi_tinh || 'Cái';
    document.getElementById('edit-prod-ton-kho').value = p.ton_kho || 0;
    document.getElementById('edit-prod-gia-nhap').value = p.gia_nhap || 0;
    document.getElementById('edit-prod-ghi-chu').value = p.ghi_chu || '';

    // Render các lô hàng
    const tbody = document.getElementById('edit-batches-tbody');
    tbody.innerHTML = '';
    const batches = (p.batches && p.batches.length > 0) ? p.batches : [
        { so_luong: p.ton_kho || 1, gia_nhap: p.gia_nhap || 0 }
    ];

    batches.forEach((b, idx) => {
        addBatchRow(b.so_luong, b.gia_nhap);
    });
    calcBatchTotals();

    // Lắng nghe thay đổi của ô giá nhập / tồn kho đơn để cập nhật lô nếu chỉ có 1 lô
    const singleQtyInput = document.getElementById('edit-prod-ton-kho');
    const singleGiaInput = document.getElementById('edit-prod-gia-nhap');
    singleQtyInput.oninput = () => {
        const rows = document.querySelectorAll('#edit-batches-tbody tr');
        if (rows.length === 1) {
            const slInput = rows[0].querySelector('.batch-sl');
            if (slInput) slInput.value = singleQtyInput.value;
            calcBatchTotals(false);
        }
    };
    singleGiaInput.oninput = () => {
        const rows = document.querySelectorAll('#edit-batches-tbody tr');
        if (rows.length === 1) {
            const giaInput = rows[0].querySelector('.batch-gia');
            if (giaInput) giaInput.value = singleGiaInput.value;
            calcBatchTotals(false);
        }
    };

    const modalEl = document.getElementById('modal-edit-stock');
    if (!editStockModalInstance) {
        editStockModalInstance = new bootstrap.Modal(modalEl);
    }
    editStockModalInstance.show();
}

function addBatchRow(so_luong = 1, gia_nhap = 0) {
    const tbody = document.getElementById('edit-batches-tbody');
    const rowIdx = tbody.querySelectorAll('tr').length + 1;
    const tr = document.createElement('tr');
    tr.innerHTML = `
        <td class="text-center text-muted batch-stt">${rowIdx}</td>
        <td>
            <input type="number" class="form-control form-control-sm font-monospace batch-sl" value="${so_luong}" min="0" oninput="calcBatchTotals()">
        </td>
        <td>
            <input type="text" inputmode="numeric" autocomplete="off" class="form-control form-control-sm font-monospace batch-gia" value="${gia_nhap}" oninput="calcBatchTotals()">
        </td>
        <td class="text-end font-monospace fw-semibold batch-subtotal">0 đ</td>
        <td class="text-center">
            <button type="button" class="btn btn-outline-danger btn-xs py-0 px-2" onclick="deleteBatchRow(this)" title="Xóa lô này">
                <i class="bi bi-trash"></i>
            </button>
        </td>
    `;
    tbody.appendChild(tr);
    calcBatchTotals();
}

function deleteBatchRow(btn) {
    const tbody = document.getElementById('edit-batches-tbody');
    if (tbody.querySelectorAll('tr').length <= 1) {
        showToast('Hàng hóa phải có ít nhất một lô thông số tồn!', 'warning');
        return;
    }
    btn.closest('tr').remove();
    // Đánh lại số thứ tự
    tbody.querySelectorAll('tr').forEach((row, i) => {
        row.querySelector('.batch-stt').textContent = i + 1;
    });
    calcBatchTotals();
}

function calcBatchTotals(updateMainInputs = true) {
    const rows = document.querySelectorAll('#edit-batches-tbody tr');
    let totalQty = 0;
    let totalVal = 0;

    rows.forEach(row => {
        const sl = parseInt(row.querySelector('.batch-sl')?.value) || 0;
        const gia = (window.parseCurrencyValue || parseCurrencyValue)(row.querySelector('.batch-gia')?.value);
        const sub = Math.round(sl * gia);
        row.querySelector('.batch-subtotal').textContent = formatVND(sub);
        totalQty += sl;
        totalVal += sub;
    });

    const qtySpan = document.getElementById('batch-total-qty');
    const valSpan = document.getElementById('batch-total-val');
    if (qtySpan) qtySpan.textContent = formatNumber(totalQty);
    if (valSpan) valSpan.textContent = formatVND(totalVal);

    if (updateMainInputs) {
        const mainQty = document.getElementById('edit-prod-ton-kho');
        if (mainQty) mainQty.value = totalQty;
        if (rows.length > 0) {
            const firstGia = (window.parseCurrencyValue || parseCurrencyValue)(rows[0].querySelector('.batch-gia')?.value);
            const mainGia = document.getElementById('edit-prod-gia-nhap');
            if (mainGia && rows.length === 1) mainGia.value = firstGia;
        }
    }
}

async function saveStockEdit() {
    if (!currentEditingProduct) return;
    const id = document.getElementById('edit-prod-id').value;
    const ten_hang = document.getElementById('edit-prod-ten').value.trim();
    const danh_muc = document.getElementById('edit-prod-danh-muc').value;
    const don_vi_tinh = document.getElementById('edit-prod-dvt').value.trim() || 'Cái';
    const ghi_chu = document.getElementById('edit-prod-ghi-chu').value.trim();

    if (!ten_hang) {
        showToast('Vui lòng nhập tên hàng hóa!', 'warning');
        return;
    }

    // Thu thập các lô
    const rows = document.querySelectorAll('#edit-batches-tbody tr');
    const batches = [];
    rows.forEach(row => {
        const sl = parseInt(row.querySelector('.batch-sl')?.value) || 0;
        const gia = (window.parseCurrencyValue || parseCurrencyValue)(row.querySelector('.batch-gia')?.value);
        if (sl > 0) {
            batches.push({ so_luong: sl, gia_nhap: gia });
        }
    });

    let ton_kho = parseInt(document.getElementById('edit-prod-ton-kho').value) || 0;
    let gia_nhap = (window.parseCurrencyValue || parseCurrencyValue)(document.getElementById('edit-prod-gia-nhap').value);

    if (batches.length > 0) {
        ton_kho = batches.reduce((sum, b) => sum + b.so_luong, 0);
        gia_nhap = batches[0].gia_nhap;
    } else if (ton_kho > 0) {
        batches.push({ so_luong: ton_kho, gia_nhap: gia_nhap });
    }

    try {
        showLoading('Đang lưu thông số kho hàng...');
        const res = await apiRequest(`/api/hang-hoa/${id}`, 'PUT', {
            ten_hang,
            danh_muc,
            don_vi_tinh,
            ton_kho,
            gia_nhap,
            ghi_chu,
            batches
        });

        hideLoading();
        showToast('Cập nhật thông số hàng tồn kho thành công!', 'success');
        if (editStockModalInstance) {
            editStockModalInstance.hide();
        }

        // Tải lại bảng tồn kho ngay lập tức
        await loadStockData();

        // Đồng bộ các tab khác
        try {
            if (typeof BroadcastChannel !== 'undefined') {
                new BroadcastChannel('inventory_sync').postMessage({ type: 'PRODUCTS_UPDATED' });
            }
            if (window.parent && window.parent !== window) {
                window.parent.postMessage({ type: 'PRODUCTS_UPDATED' }, '*');
            }
        } catch (err) {}
    } catch (e) {
        hideLoading();
        showToast(`Lỗi cập nhật: ${e.message}`, 'error');
    }
}

// ── Bind Events ───────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    // Check URL param ?status=low_stock
    const urlParams = new URLSearchParams(window.location.search);
    const paramStatus = urlParams.get('status');
    const statusSelect = document.getElementById('filter-stock-status');
    if (paramStatus && statusSelect) {
        statusSelect.value = paramStatus;
    }

    loadStockData();

    const searchHandler = typeof debounce === 'function' ? debounce(renderStockTable, 200) : renderStockTable;
    document.getElementById('search-input')?.addEventListener('input', searchHandler);
    document.getElementById('filter-danh-muc')?.addEventListener('change', renderStockTable);
    document.getElementById('filter-stock-status')?.addEventListener('change', renderStockTable);

    // Tự động làm mới dữ liệu khi người dùng chuyển tab quay lại hoặc có nhập/xuất kho
    window.addEventListener('message', (e) => {
        if (e.data && (e.data.type === 'TAB_ACTIVATED' || e.data.type === 'PRODUCTS_UPDATED')) {
            loadStockData(true);
        }
    });

    try {
        if (typeof BroadcastChannel !== 'undefined') {
            const bc = new BroadcastChannel('inventory_sync');
            bc.onmessage = (e) => {
                if (e.data && e.data.type === 'PRODUCTS_UPDATED') {
                    loadStockData(true);
                }
            };
        }
    } catch (err) {}
});
