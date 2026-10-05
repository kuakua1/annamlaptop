/**
 * bao_cao.js - Reports & Charts page logic
 */

let revenueChart = null;
let currentPeriod = 'today';

async function loadStats(period = 'today', from_date = '', to_date = '') {
    try {
        let url = `/api/bao-cao/tong-quan?period=${period}`;
        if (period === 'custom') {
            url += `&from_date=${from_date}&to_date=${to_date}`;
        }
        const res = await apiRequest(url);
        const d = res.data;
        document.getElementById('stat-doanh-thu').textContent = formatVND(d.doanh_thu);
        document.getElementById('stat-gia-von').textContent = formatVND(d.gia_von);
        document.getElementById('stat-loi-nhuan').textContent = formatVND(d.loi_nhuan);
        document.getElementById('stat-bien').textContent = d.bien_loi_nhuan.toFixed(1) + '%';
        document.getElementById('stat-loi-nhuan').className =
            d.loi_nhuan >= 0 ? 'fs-4 fw-bold text-success' : 'fs-4 fw-bold text-danger';
    } catch (e) {
        showToast(e.message, 'error');
    }
}

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

function selectPeriod(period) {
    currentPeriod = period;
    document.querySelectorAll('.period-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.period === period);
    });
    const customRange = document.getElementById('custom-range');
    if (period === 'custom') {
        customRange.style.display = 'flex';
    } else {
        customRange.style.display = 'none';
        loadStats(period);
    }
}

function applyCustomRange() {
    const from = document.getElementById('custom-from').value;
    const to = document.getElementById('custom-to').value;
    if (!from || !to) { showToast('Vui lòng chọn khoảng thời gian', 'error'); return; }
    loadStats('custom', from, to);
}

document.addEventListener('DOMContentLoaded', async () => {
    document.getElementById('custom-from').value = todayISO();
    document.getElementById('custom-to').value = todayISO();
    await Promise.all([
        loadStats('today'),
        loadChart(),
        loadTopProducts(),
        loadTonKho(),
    ]);
});
