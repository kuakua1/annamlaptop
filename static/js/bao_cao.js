/**
 * bao_cao.js - Reports & Charts page logic
 * Hỗ trợ lọc theo ngày đầu - ngày cuối:
 * 1. Bảng Tổng Hợp Nhập - Xuất - Tồn (Chuẩn Kế toán Kho ERP & Xuất Excel / In A4 Ngang)
 * 2. Sổ Chi Tiết Bán Hàng (Mẫu S16-DNN theo TT 133/2016/TT-BTC)
 * 3. Biểu đồ doanh thu & Thống kê kinh doanh
 */

let revenueChart = null;
let currentFromDate = '';
let currentToDate = '';
let currentReportData = null;

// Biến lưu trữ bảng Nhập Xuất Tồn
let nhapXuatTonData = [];
let nhapXuatTonSummary = null;

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
window.formatVNDClean = formatVNDClean;

function formatISODate(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

/**
 * Tải dữ liệu tổng quan theo khoảng ngày
 */
async function loadStats(from_date = '', to_date = '') {
    try {
        let url = `/api/bao-cao/tong-quan?period=custom&from_date=${encodeURIComponent(from_date)}&to_date=${encodeURIComponent(to_date)}`;
        const res = await apiRequest(url);
        currentReportData = res.data || {};
        const d = currentReportData;

        // Cập nhật các thẻ tóm tắt
        const elDT = document.getElementById('stat-doanh-thu');
        const elGV = document.getElementById('stat-gia-von');
        const elLN = document.getElementById('stat-loi-nhuan');
        const elB = document.getElementById('stat-bien');
        if (elDT) elDT.textContent = formatVND(d.doanh_thu || 0);
        if (elGV) elGV.textContent = formatVND(d.gia_von || 0);
        if (elLN) {
            elLN.textContent = formatVND(d.loi_nhuan || 0);
            elLN.className = (d.loi_nhuan || 0) >= 0 ? 'fs-4 fw-bold text-success' : 'fs-4 fw-bold text-danger';
        }
        if (elB) elB.textContent = (d.bien_loi_nhuan || 0).toFixed(1) + '%';

        // Cập nhật bảng Chi tiết bán hàng (Tab 2)
        const bhBody = document.getElementById('ban-hang-detail-body');
        if (bhBody) {
            const items = d.chi_tiet_ban_hang || [];
            if (items.length) {
                bhBody.innerHTML = items.map((it, idx) => `
                    <tr>
                        <td class="text-center">${idx + 1}</td>
                        <td class="text-center font-monospace fw-semibold">${escapeHtml(it.so_phieu)}</td>
                        <td class="text-center">${escapeHtml(it.ngay_xuat)}</td>
                        <td><strong>${escapeHtml(it.ten_hang)}</strong><br><small class="text-muted font-monospace">${escapeHtml(it.ma_hang)}</small></td>
                        <td class="text-center">${escapeHtml(it.tk_du || '131')}</td>
                        <td class="text-end">${formatNumber(it.so_luong)}</td>
                        <td class="text-end">${formatVNDClean(it.don_gia)}</td>
                        <td class="text-end fw-semibold text-primary">${formatVNDClean(it.thanh_tien)}</td>
                        <td class="text-end text-danger">${formatVNDClean(it.gia_von)}</td>
                        <td class="text-end fw-bold text-success">${formatVNDClean(it.loi_nhuan)}</td>
                    </tr>
                `).join('');
            } else {
                bhBody.innerHTML = '<tr><td colspan="10" class="text-center text-muted py-4">Không có giao dịch bán hàng trong khoảng thời gian này</td></tr>';
            }
        }
    } catch (e) {
        showToast(e.message || 'Lỗi tải số liệu báo cáo', 'error');
    }
}

/**
 * Tải dữ liệu Bảng Tổng Hợp Nhập - Xuất - Tồn (Tab 1)
 */
async function loadNhapXuatTon(from_date = '', to_date = '') {
    const tableBody = document.getElementById('nxt-table-body');
    if (tableBody) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="12" class="text-center text-muted py-5">
                    <div class="spinner-border spinner-border-sm text-primary me-2"></div>Đang tổng hợp dữ liệu nhập - xuất - tồn...
                </td>
            </tr>
        `;
    }

    try {
        let url = `/api/bao-cao/nhap-xuat-ton?from_date=${encodeURIComponent(from_date)}&to_date=${encodeURIComponent(to_date)}`;
        const res = await apiRequest(url);
        nhapXuatTonData = res.data || [];
        nhapXuatTonSummary = res.summary || {};

        // Cập nhật nhãn kỳ báo cáo trên bảng
        const badge = document.getElementById('nxt-period-badge');
        if (badge) {
            badge.textContent = getPeriodDisplayText();
        }

        // Đổ danh mục vào select bộ lọc nếu chưa có
        const catSelect = document.getElementById('nxt-filter-category');
        if (catSelect) {
            const currentVal = catSelect.value;
            const categories = Array.from(new Set(nhapXuatTonData.map(d => d.danh_muc).filter(Boolean))).sort();
            catSelect.innerHTML = '<option value="">-- Tất cả nhóm hàng --</option>' +
                categories.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
            if (currentVal && categories.includes(currentVal)) {
                catSelect.value = currentVal;
            }
        }

        renderNhapXuatTonTable();
    } catch (e) {
        if (tableBody) {
            tableBody.innerHTML = `<tr><td colspan="12" class="text-center text-danger py-4">Lỗi tải dữ liệu nhập xuất tồn: ${escapeHtml(e.message || 'Không thể kết nối máy chủ')}</td></tr>`;
        }
    }
}

/**
 * Xử lý khi người dùng gõ tìm kiếm hoặc đổi danh mục ở bảng NXT
 */
function onNxtFilterChanged() {
    renderNhapXuatTonTable();
}

/**
 * Hiển thị dữ liệu bảng Nhập Xuất Tồn lên giao diện
 */
function renderNhapXuatTonTable() {
    const tableBody = document.getElementById('nxt-table-body');
    if (!tableBody) return;

    const query = (document.getElementById('nxt-search-input')?.value || '').toLowerCase().trim();
    const category = document.getElementById('nxt-filter-category')?.value || '';
    const hideZero = document.getElementById('nxt-toggle-zero')?.checked;

    const filtered = nhapXuatTonData.filter(item => {
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

    const countEl = document.getElementById('nxt-row-count');
    if (countEl) {
        countEl.textContent = `Hiển thị: ${filtered.length} / ${nhapXuatTonData.length} mặt hàng`;
    }

    if (!filtered.length) {
        tableBody.innerHTML = '<tr><td colspan="12" class="text-center text-muted py-5">Không tìm thấy mặt hàng nào phù hợp với bộ lọc</td></tr>';
        resetNxtFooterTotals();
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
                <td>
                    <strong class="text-dark">${escapeHtml(p.ten_hang)}</strong>
                    <br><small class="text-muted font-monospace">${escapeHtml(p.ma_hang)}</small>
                    ${p.danh_muc ? `<span class="badge bg-light text-secondary border ms-1">${escapeHtml(p.danh_muc)}</span>` : ''}
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
            </tr>
        `;
    }).join('');

    // Cập nhật số liệu chân bảng Tổng cộng
    const setF = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    };
    setF('nxt-tot-luong-dau', formatNumber(totLD));
    setF('nxt-tot-tien-dau', formatVNDClean(totTD));
    setF('nxt-tot-luong-nhap', formatNumber(totLN));
    setF('nxt-tot-tien-nhap', formatVNDClean(totTN));
    setF('nxt-tot-luong-xuat', formatNumber(totLX));
    setF('nxt-tot-tien-xuat', formatVNDClean(totTX));
    setF('nxt-tot-luong-ton', formatNumber(totLT));
    setF('nxt-tot-tien-ton', formatVNDClean(totTT));
}

function resetNxtFooterTotals() {
    ['nxt-tot-luong-dau', 'nxt-tot-tien-dau', 'nxt-tot-luong-nhap', 'nxt-tot-tien-nhap',
     'nxt-tot-luong-xuat', 'nxt-tot-tien-xuat', 'nxt-tot-luong-ton', 'nxt-tot-tien-ton'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.textContent = '0';
    });
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
 * Xuất file Excel Bảng Tổng Hợp Nhập - Xuất - Tồn (Mẫu 01-VT)
 */
async function exportNhapXuatTonToExcel() {
    if (!window.ExcelJS) {
        showToast('Đang tải bộ xuất Excel, vui lòng thử lại sau...', 'info');
        return;
    }

    if (!nhapXuatTonData || !nhapXuatTonData.length) {
        await loadNhapXuatTon(currentFromDate, currentToDate);
    }

    const query = (document.getElementById('nxt-search-input')?.value || '').toLowerCase().trim();
    const category = document.getElementById('nxt-filter-category')?.value || '';
    const hideZero = document.getElementById('nxt-toggle-zero')?.checked;

    let items = nhapXuatTonData.filter(item => {
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

    // Điền dữ liệu
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

    // Tải xuống file Excel
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
 * In Bảng Tổng Hợp Nhập - Xuất - Tồn (Khổ A4 ngang)
 */
async function printNhapXuatTonReport() {
    try {
        if (!nhapXuatTonData || !nhapXuatTonData.length) {
            await loadNhapXuatTon(currentFromDate, currentToDate);
        }

        const query = (document.getElementById('nxt-search-input')?.value || '').toLowerCase().trim();
        const category = document.getElementById('nxt-filter-category')?.value || '';
        const hideZero = document.getElementById('nxt-toggle-zero')?.checked;

        let items = nhapXuatTonData.filter(item => {
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
    wb.creator = COMPANY_REPORT_INFO.name;
    wb.lastModifiedBy = COMPANY_REPORT_INFO.name;
    wb.created = new Date();

    const ws = wb.addWorksheet('SoChiTietBanHang', { views: [{ showGridLines: true }] });

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
    ws.getCell('A1').value = `Đơn vị: ${COMPANY_REPORT_INFO.name}`;
    ws.getCell('A1').font = fontBold;
    ws.getCell('A2').value = `Địa chỉ: ${COMPANY_REPORT_INFO.address}`;
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

    ws.getCell('B11').value = 'Số hiệu';
    ws.getCell('C11').value = 'Ngày, tháng';
    ws.getCell('F11').value = 'Số lượng';
    ws.getCell('G11').value = 'Đơn giá';
    ws.getCell('H11').value = 'Thành tiền';
    ws.getCell('I11').value = 'Thuế GTGT';
    ws.getCell('J11').value = 'Khác';

    for (let r = 10; r <= 11; r++) {
        const row = ws.getRow(r);
        row.height = 24;
        for (let c = 1; c <= 10; c++) {
            const cell = row.getCell(c);
            cell.font = fontBold;
            cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } };
            cell.border = borderThinAll;
        }
    }

    // Hàng 12: Đánh số thứ tự cột (A, B, C, D, E, 1, 2, 3 = 1x2, 4, 5)
    const row12 = ws.getRow(12);
    row12.height = 18;
    const colLabels = ['A', 'B', 'C', 'D', 'E', '1', '2', '3 = 1 x 2', '4', '5'];
    colLabels.forEach((lbl, idx) => {
        const cell = row12.getCell(idx + 1);
        cell.value = lbl;
        cell.font = fontItalic;
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFAFAFA' } };
        cell.border = borderThinAll;
    });

    let curRow = 13;
    let totalQty = 0;
    let totalRev = 0;

    items.forEach((it, idx) => {
        const sl = parseInt(it.so_luong) || 0;
        const donGia = parseFloat(it.don_gia) || 0;
        const thanhTien = parseFloat(it.thanh_tien) || 0;
        totalQty += sl;
        totalRev += thanhTien;

        let ngayDM = '';
        if (it.ngay_xuat) {
            const p = it.ngay_xuat.split('-');
            ngayDM = p.length === 3 ? `${p[2]}/${p[1]}` : it.ngay_xuat;
        }

        const row = ws.getRow(curRow);
        row.height = 20;

        row.getCell(1).value = idx + 1;
        row.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };

        row.getCell(2).value = it.so_phieu;
        row.getCell(2).alignment = { horizontal: 'center', vertical: 'middle' };

        row.getCell(3).value = ngayDM;
        row.getCell(3).alignment = { horizontal: 'center', vertical: 'middle' };

        row.getCell(4).value = it.ten_hang;
        row.getCell(4).alignment = { horizontal: 'left', vertical: 'middle' };

        row.getCell(5).value = it.tk_du || '131';
        row.getCell(5).alignment = { horizontal: 'center', vertical: 'middle' };

        row.getCell(6).value = sl;
        row.getCell(6).numFmt = '#,##0';
        row.getCell(6).alignment = { horizontal: 'right', vertical: 'middle' };

        row.getCell(7).value = donGia > 0 ? donGia : '';
        row.getCell(7).numFmt = '#,##0';
        row.getCell(7).alignment = { horizontal: 'right', vertical: 'middle' };

        row.getCell(8).value = thanhTien;
        row.getCell(8).numFmt = '#,##0';
        row.getCell(8).alignment = { horizontal: 'right', vertical: 'middle' };

        row.getCell(9).value = '';
        row.getCell(10).value = '';

        for (let c = 1; c <= 10; c++) {
            row.getCell(c).font = fontNormal;
            row.getCell(c).border = borderDottedRow;
        }

        curRow++;
    });

    const curEndRow = curRow;
    const giaVon = currentReportData?.gia_von || 0;
    const laiGop = totalRev - giaVon;

    const summaryDefs = [
        { label: 'Tổng cộng số phát sinh', qty: totalQty, rev: totalRev, isBold: true },
        { label: '- Doanh thu thuần', qty: '', rev: totalRev, isBold: false },
        { label: '- Giá vốn hàng bán', qty: '', rev: giaVon, isBold: false },
        { label: '- Lãi gộp', qty: '', rev: laiGop, isBold: true },
    ];

    summaryDefs.forEach((s, sIdx) => {
        const row = ws.getRow(curEndRow + sIdx);
        ws.mergeCells(`A${curEndRow + sIdx}:E${curEndRow + sIdx}`);
        const c1 = row.getCell(1);
        c1.value = s.label;
        c1.font = s.isBold ? fontBold : fontNormal;
        c1.alignment = { horizontal: s.isBold ? 'center' : 'left', vertical: 'middle' };

        const c6 = row.getCell(6);
        c6.value = s.qty;
        c6.font = s.isBold ? fontBold : fontNormal;
        c6.alignment = { horizontal: 'right', vertical: 'middle' };
        if (s.qty !== '') c6.numFmt = '#,##0';

        row.getCell(7).value = '';

        const c8 = row.getCell(8);
        c8.value = s.rev;
        c8.font = s.isBold ? fontBold : fontNormal;
        c8.alignment = { horizontal: 'right', vertical: 'middle' };
        c8.numFmt = '#,##0';

        row.getCell(9).value = '';
        row.getCell(10).value = '';

        for (let c = 1; c <= 10; c++) {
            row.getCell(c).border = borderThinAll;
        }
        row.height = 22;
    });

    // Ngày mở sổ & chữ ký
    const now = new Date();
    const signStartRow = curEndRow + summaryDefs.length + 2;

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

    // Fallback: In qua hidden iframe nội trang
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
 * In Báo Cáo Tài Chính / Sổ Chi Tiết Bán Hàng chuẩn Thông tư 133
 */
async function printFinancialReport() {
    try {
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

        const reportHtml = `
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
                    .no-print-bar {
                        display: flex;
                        justify-content: flex-end;
                        margin-bottom: 12px;
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
                <div class="no-print-bar">
                    <button class="btn-print" onclick="window.print()">🖨️ In Báo Cáo (A4)</button>
                </div>
                <div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
                    <div style="font-size: 10pt; line-height: 1.4;">
                        <strong>Đơn vị:</strong> ${COMPANY_REPORT_INFO.name}<br>
                        <strong>Địa chỉ:</strong> ${COMPANY_REPORT_INFO.address}
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
        `;

        executePrintHtml(reportHtml);
    } catch (err) {
        console.error('Lỗi khi in báo cáo:', err);
        showToast('Có lỗi xảy ra khi chuẩn bị bản in: ' + (err.message || err), 'error');
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    // Mặc định chọn cả tháng hiện tại theo ngày địa phương
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);

    const fromISO = formatISODate(firstDay);
    const toISO = formatISODate(lastDay);

    const fromInput = document.getElementById('report-from-date');
    const toInput = document.getElementById('report-to-date');
    if (fromInput) fromInput.value = fromISO;
    if (toInput) toInput.value = toISO;
    currentFromDate = fromISO;
    currentToDate = toISO;

    await Promise.all([
        loadStats(currentFromDate, currentToDate),
        loadChart(),
        loadTopProducts(),
        loadTonKho(),
    ]);

    const refreshReports = () => {
        Promise.all([
            loadStats(currentFromDate, currentToDate),
            loadChart(),
            loadTopProducts(),
            loadTonKho(),
        ]);
    };

    window.addEventListener('message', (e) => {
        if (e.data && (e.data.type === 'TAB_ACTIVATED' || e.data.type === 'PRODUCTS_UPDATED')) {
            refreshReports();
        }
    });

    try {
        if (typeof BroadcastChannel !== 'undefined') {
            const bc = new BroadcastChannel('inventory_sync');
            bc.onmessage = (e) => {
                if (e.data && e.data.type === 'PRODUCTS_UPDATED') {
                    refreshReports();
                }
            };
        }
    } catch (err) {}
});
