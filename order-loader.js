// =============================================================
// Kashi Rivaz — Admin Order Loader
// Fetches orders from server API (MySQL), falls back to localStorage
// Auto-injects itself into all-orders.html
// =============================================================
(function () {
    const ADMIN_KEY = localStorage.getItem('adminKey') || 'KR_Admin_Secret_K9x2pLmQ8vRnWt4j';

    let allOrders = [];
    let filteredOrders = [];
    let currentOrderId = null;

    // ── Wait for DOM ──────────────────────────────────────────
    document.addEventListener('DOMContentLoaded', init);

    function init() {
        // Intercept the old loadAllOrders if it exists
        window.loadAllOrders      = loadAllOrders;
        window.filterOrders       = filterOrders;
        window.resetFilters       = resetFilters;
        window.viewOrderDetails   = viewOrder;
        window.viewOrder          = viewOrder;
        window.updateOrderStatus  = updateOrderStatus;
        window.deleteOrder        = deleteOrder;
        window.exportOrdersToCSV  = exportOrdersToCSV;
        window.closeOrderModal    = closeOrderModal;
        loadAllOrders();
        // Auto-refresh every 60 seconds
        setInterval(loadAllOrders, 60000);
    }

    // ── Load Orders ────────────────────────────────────────────
    async function loadAllOrders() {
        showBanner('⏳ Loading orders…', '#667eea');
        try {
            const resp = await fetch('/api/orders', {
                headers: { 'x-admin-key': ADMIN_KEY }
            });
            if (!resp.ok) throw new Error('HTTP ' + resp.status);
            const data = await resp.json();
            if (!data.success) throw new Error(data.message);

            allOrders = (data.orders || []).map(normaliseServerOrder);
            showBanner(
                allOrders.length
                    ? `✅ ${allOrders.length} order${allOrders.length !== 1 ? 's' : ''} loaded from database`
                    : '📭 No orders yet — new orders will appear here automatically',
                allOrders.length ? '#22c55e' : '#f59e0b'
            );
        } catch (err) {
            console.warn('[order-loader] Server API failed:', err.message);
            // Fallback → localStorage
            try {
                const raw = localStorage.getItem('kr_orders')
                    || localStorage.getItem('orders') || '[]';
                allOrders = JSON.parse(raw).map(o => ({ ...normaliseLocalOrder(o), _source: 'local' }));
                showBanner(
                    allOrders.length
                        ? `⚠️ Server offline — showing ${allOrders.length} saved orders (browser storage)`
                        : '⚠️ Server offline. Start server: node server.js',
                    '#f59e0b'
                );
            } catch (e) {
                allOrders = [];
                showBanner('❌ Cannot load orders. Make sure server is running.', '#ef4444');
            }
        }

        filteredOrders = sortByDate(allOrders);
        renderTable();
        renderStats();
    }

    // ── Normalise formats ─────────────────────────────────────
    function normaliseServerOrder(o) {
        return {
            orderId: o.orderId,
            customerName: o.customerName || 'Guest',
            customerEmail: o.customerEmail || '—',
            customerPhone: o.customerPhone || '—',
            address: parseJSON(o.shippingAddress, {}),
            items: parseJSON(o.items, []),
            total: parseFloat(o.total) || 0,
            status: o.status || 'confirmed',
            paymentMethod: o.paymentMethod || 'UPI',
            createdAt: o.createdAt || new Date().toISOString(),
            _source: 'server'
        };
    }

    function normaliseLocalOrder(o) {
        return {
            orderId: o.orderId || ('ORD-' + Date.now()),
            customerName: o.customerName || (o.customer ? o.customer.name : 'Guest'),
            customerEmail: o.customerEmail || (o.customer ? o.customer.email : '—'),
            customerPhone: o.customerPhone || (o.customer ? o.customer.phone : '—'),
            address: o.address || o.shippingAddress || {},
            items: o.items || [],
            total: parseFloat(o.total) || 0,
            status: o.status || 'confirmed',
            paymentMethod: o.paymentMethod || 'UPI',
            createdAt: o.createdAt || o.date || new Date().toISOString()
        };
    }

    function parseJSON(val, fallback) {
        if (!val) return fallback;
        if (typeof val === 'object') return val;
        try { return JSON.parse(val); } catch (e) { return fallback; }
    }

    function sortByDate(arr) {
        return [...arr].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }

    // ── Render Table ──────────────────────────────────────────
    const STATUS_CLASS = {
        confirmed: 'status-confirmed', pending: 'status-pending',
        shipped: 'status-shipped', delivered: 'status-delivered', cancelled: 'status-cancelled'
    };

    function renderTable() {
        const tbody = document.getElementById('orders-tbody');
        const noEl  = document.getElementById('no-orders');
        if (!tbody) return;
        if (!filteredOrders.length) {
            tbody.innerHTML = '';
            if (noEl) noEl.style.display = 'block';
            return;
        }
        if (noEl) noEl.style.display = 'none';

        tbody.innerHTML = filteredOrders.map(o => {
            const date = new Date(o.createdAt).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' });
            const srcTag = o._source === 'local'
                ? `<span style="font-size:.6rem;background:#fff3cd;color:#856404;padding:1px 4px;border-radius:3px;margin-left:4px">LOCAL</span>` : '';
            const sc = STATUS_CLASS[o.status] || 'status-confirmed';
            return `<tr>
                <td class="order-id">${o.orderId}${srcTag}</td>
                <td class="customer-name">${o.customerName}</td>
                <td>${o.customerEmail}</td>
                <td>${(o.items || []).length} item(s)</td>
                <td class="order-total">₹${Number(o.total).toLocaleString('en-IN')}</td>
                <td><span class="order-status ${sc}">${o.status.toUpperCase()}</span></td>
                <td>${date}</td>
                <td><button class="action-btn" onclick="viewOrder('${o.orderId}')">View</button></td>
            </tr>`;
        }).join('');
    }

    // ── Render Stats ──────────────────────────────────────────
    function renderStats() {
        const rev  = filteredOrders.reduce((s, o) => s + (parseFloat(o.total) || 0), 0);
        const uniq = new Set(filteredOrders.map(o => o.customerEmail || o.customerPhone)).size;
        const pend = filteredOrders.filter(o => o.status === 'pending').length;
        setText('total-orders',    filteredOrders.length);
        setText('total-revenue',   '₹' + rev.toLocaleString('en-IN'));
        setText('total-customers', uniq);
        setText('pending-orders',  pend);
    }

    function setText(id, val) {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    }

    // ── View Order Modal ──────────────────────────────────────
    function viewOrder(orderId) {
        currentOrderId = orderId;
        const o = filteredOrders.find(x => x.orderId === orderId);
        if (!o) return;

        const addrStr = a => {
            if (!a) return '—';
            if (typeof a === 'string') return a;
            return [a.fullAddress, a.house, a.street, a.city, a.state, a.postalCode]
                .filter(Boolean).join(', ') || '—';
        };

        setText('modal-order-id',       o.orderId);
        setText('modal-order-status',   o.status.toUpperCase());
        setText('modal-order-date',     new Date(o.createdAt).toLocaleString('en-IN'));
        setText('modal-order-total',    '₹' + Number(o.total || 0).toLocaleString('en-IN'));
        setText('modal-customer-name',  o.customerName);
        setText('modal-customer-email', o.customerEmail);
        setText('modal-customer-phone', o.customerPhone);
        setText('modal-customer-address', addrStr(o.address));

        const sel = document.getElementById('modal-status-select');
        if (sel) sel.value = o.status || 'confirmed';

        const items = Array.isArray(o.items) ? o.items : [];
        const itemsEl = document.getElementById('modal-items-list');
        if (itemsEl) {
            itemsEl.innerHTML = items.length
                ? items.map(i =>
                    `<div class="item">
                        <span class="item-name">${i.name || 'Item'} x${i.quantity || 1}</span>
                        <span class="item-price">₹${Number((i.price || 0) * (i.quantity || 1)).toLocaleString('en-IN')}</span>
                    </div>`).join('')
                : '<p style="color:#999;font-size:.85rem">No item details</p>';
        }

        const shipSec = document.getElementById('shipping-section');
        if (shipSec) shipSec.style.display = 'none';

        const modal = document.getElementById('order-modal');
        if (modal) modal.classList.add('active');
    }

    // ── Update Status ─────────────────────────────────────────
    async function updateOrderStatus() {
        const sel = document.getElementById('modal-status-select');
        if (!sel || !currentOrderId) return;
        const newStatus = sel.value;
        try {
            const resp = await fetch(`/api/orders/${currentOrderId}/status`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', 'x-admin-key': ADMIN_KEY },
                body: JSON.stringify({ status: newStatus })
            });
            if (resp.ok) {
                alert('✅ Status updated!');
                loadAllOrders();
                closeOrderModal();
                return;
            }
        } catch (e) { /* server offline */ }
        // Local fallback
        const o = allOrders.find(x => x.orderId === currentOrderId);
        if (o) { o.status = newStatus; filteredOrders = sortByDate(allOrders); renderTable(); }
        alert('Updated locally (server offline)');
        closeOrderModal();
    }

    // ── Delete ────────────────────────────────────────────────
    function deleteOrder() {
        if (!confirm('Delete this order permanently?')) return;
        allOrders = allOrders.filter(o => o.orderId !== currentOrderId);
        filteredOrders = filteredOrders.filter(o => o.orderId !== currentOrderId);
        renderTable(); renderStats(); closeOrderModal();
    }

    // ── Close Modal ───────────────────────────────────────────
    function closeOrderModal() {
        const modal = document.getElementById('order-modal');
        if (modal) modal.classList.remove('active');
        currentOrderId = null;
    }

    // ── Filter / Reset ────────────────────────────────────────
    function filterOrders() {
        const s  = (document.getElementById('search-input')?.value || '').toLowerCase();
        const st = document.getElementById('status-filter')?.value || '';
        filteredOrders = sortByDate(allOrders.filter(o =>
            (!s  || (o.orderId + o.customerName + o.customerPhone).toLowerCase().includes(s)) &&
            (!st || o.status === st)
        ));
        renderTable(); renderStats();
    }

    function resetFilters() {
        const si = document.getElementById('search-input');
        const sf = document.getElementById('status-filter');
        if (si) si.value = '';
        if (sf) sf.value = '';
        filteredOrders = sortByDate(allOrders);
        renderTable(); renderStats();
    }

    // ── Export CSV ────────────────────────────────────────────
    function exportOrdersToCSV() {
        if (!filteredOrders.length) { alert('No orders to export'); return; }
        let csv = 'Order ID,Customer,Email,Phone,Items,Total,Status,Payment,Date\n';
        filteredOrders.forEach(o => {
            csv += `"${o.orderId}","${o.customerName}","${o.customerEmail}","${o.customerPhone}","${(o.items||[]).length}","₹${o.total}","${o.status}","${o.paymentMethod}","${new Date(o.createdAt).toLocaleString('en-IN')}"\n`;
        });
        const a = document.createElement('a');
        a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
        a.download = 'kashi-rivaz-orders-' + Date.now() + '.csv';
        a.click();
    }

    // ── Status Banner ─────────────────────────────────────────
    function showBanner(msg, color) {
        let bar = document.getElementById('kr-order-status');
        if (!bar) {
            bar = document.createElement('div');
            bar.id = 'kr-order-status';
            bar.style.cssText = 'margin-bottom:16px;padding:10px 16px;border-radius:8px;font-size:.84rem;font-weight:600;border-left:4px solid #667eea;background:#f8fafc;display:flex;align-items:center;justify-content:space-between;gap:12px;';
            const ref = document.getElementById('stats-container') || document.querySelector('.orders-container > *');
            if (ref) ref.parentNode.insertBefore(bar, ref);
        }
        bar.style.borderLeftColor = color;
        bar.innerHTML = `<span>${msg}</span>
            <button onclick="loadAllOrders()" style="padding:4px 14px;background:${color};color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:.75rem;font-weight:700;white-space:nowrap;flex-shrink:0;">↻ Refresh</button>`;
    }
})();
