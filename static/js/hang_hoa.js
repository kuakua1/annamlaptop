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
    const search = (document.getElementById('search-input')?.value || '').toLowerCase().trim();
    const danhMuc = document.getElementById('filter-danh-muc')?.value || '';

    let filtered = allProductsCache;
    if (danhMuc) {
        filtered = filtered.filter(p => p.danh_muc === danhMuc);
    }
    if (search) {
        filtered = filtered.filter(p => {
            const m = (p.ma_hang || '').toLowerCase();
            const t = (p.ten_hang || '').toLowerCase();
            return m.includes(search) || t.includes(search);
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
    editingId = id;
    const p = allProducts.find(x => x.id === id);
    if (!p) return;
    document.getElementById('modal-title').textContent = 'Chỉnh Sửa Hàng Hóa';
    document.getElementById('f-ten-hang').value = p.ten_hang;
    document.getElementById('f-danh-muc').value = p.danh_muc || '';
    document.getElementById('f-dvt').value = p.don_vi_tinh;
    document.getElementById('f-gia-nhap').value = p.gia_nhap;
    document.getElementById('f-gia-ban').value = p.gia_ban;
    document.getElementById('f-ton-kho').value = p.ton_kho;
    document.getElementById('f-ghi-chu').value = p.ghi_chu;
    openModal('product-modal');
}

async function saveProduct() {
    const body = {
        ten_hang: document.getElementById('f-ten-hang').value.trim(),
        danh_muc: document.getElementById('f-danh-muc').value.trim(),
        don_vi_tinh: document.getElementById('f-dvt').value.trim() || 'Cái',
        gia_nhap: parseFloat(document.getElementById('f-gia-nhap').value) || 0,
        gia_ban: parseFloat(document.getElementById('f-gia-ban').value) || 0,
        ton_kho: parseInt(document.getElementById('f-ton-kho').value) || 0,
        ghi_chu: document.getElementById('f-ghi-chu').value.trim(),
    };

    if (!body.ten_hang) { showToast('Vui lòng nhập tên hàng', 'error'); return; }

    try {
        showLoading();
        if (editingId) {
            await apiRequest(`/api/hang-hoa/${editingId}`, 'PUT', body);
            showToast('Cập nhật thành công');
        } else {
            await apiRequest('/api/hang-hoa', 'POST', body);
            showToast('Thêm hàng hóa thành công');
        }
        closeModal('product-modal');
        await loadProducts();
    } catch (e) {
        showToast(e.message, 'error');
    } finally {
        hideLoading();
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

function exportProductsExcel() {
    if (!allProducts || !allProducts.length) {
        showToast('Không có dữ liệu hàng hóa để xuất Excel!', 'info');
        return;
    }

    let totalQty = 0;
    let totalVal = 0;

    const rows = allProducts.map((p, idx) => {
        const sl = parseInt(p.ton_kho) || 0;
        const giaNhap = parseFloat(p.gia_nhap) || 0;
        const thanhTienTon = sl * giaNhap;

        totalQty += sl;
        totalVal += thanhTienTon;

        return [
            idx + 1,
            p.ma_hang,
            p.ten_hang,
            p.don_vi_tinh || 'Cái',
            sl,
            giaNhap,
            thanhTienTon
        ];
    });

    const summaryRow = ['Tổng cộng', '', '', '-', totalQty, '-', totalVal];

    const now = new Date();
    const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
    const monthText = `Tháng ${now.getMonth() + 1} năm ${now.getFullYear()}`;

    exportAccountingReportToExcel({
        title: 'BÁO CÁO BẢNG GIÁ & DANH MỤC HÀNG HÓA',
        monthText,
        accountText: 'Tài khoản: 156 (Hàng hoá)',
        unitText: 'Đơn vị tính : Đồng',
        columns: [
            { header: 'STT', code: 'A', width: 8, align: 'center' },
            { header: 'Mã hàng', code: 'B', width: 14, align: 'center' },
            { header: 'Tên vật tư, hàng hóa', code: 'C', width: 45, align: 'left', wrapText: true },
            { header: 'ĐVT', code: 'D', width: 10, align: 'center' },
            { header: 'Số lượng tồn', code: '1', width: 14, align: 'right', isNumber: true },
            { header: 'Đơn giá vốn', code: '2', width: 16, align: 'right', isNumber: true },
            { header: 'Thành tiền vốn', code: '3', width: 20, align: 'right', isNumber: true }
        ],
        rows,
        summaryRow,
        fileName: `Danh_Muc_Hang_Hoa_${dateStr}.xlsx`,
        sheetName: 'HangHoa'
    });
}

// Init
document.addEventListener('DOMContentLoaded', async () => {
    populateDanhMucDropdowns();
    await loadProducts();

    document.getElementById('search-input')?.addEventListener('input', applyFilters);
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
