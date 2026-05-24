// ============================================================
// api.js — Frontend API Client for Kashi Rivaz
// Replaces database.js calls. Talks to Node.js server.
// Falls back to localStorage if server is unreachable.
// ============================================================

// Use current origin for relative requests if server is served from same host
const API_BASE = window.location.origin.includes('localhost') ? 'http://localhost:3000/api' : '/api';

// Admin session token — set by admin portal login, stored in sessionStorage
function getAdminSessionToken() {
    return sessionStorage.getItem('adminSession') || '';
}

// Legacy admin key (for backward compat with old pages)
const ADMIN_API_KEY = 'KR_Admin_Secret_K9x2pLmQ8vRnWt4j';

// ─── Helper ─────────────────────────────────────────────────
async function apiFetch(method, path, body = null) {
    const sessionToken = getAdminSessionToken();
    const options = {
        method,
        headers: {
            'Content-Type': 'application/json',
            'X-Admin-Key': ADMIN_API_KEY,
            ...(sessionToken ? { 'X-Admin-Session': sessionToken } : {})
        }
    };
    if (body) options.body = JSON.stringify(body);

    try {
        const res = await fetch(API_BASE + path, options);
        const data = await res.json();
        return data;
    } catch (err) {
        console.warn('[API] Server unreachable, using localStorage fallback:', err.message);
        return null;
    }
}

// ============================================================
// AUTH
// ============================================================

async function apiRegister(firstName, lastName, email, phone, password, address = '') {
    const result = await apiFetch('POST', '/register', { firstName, lastName, email, phone, password, address });

    // If server responded (success OR failure), trust the server response.
    // Only use localStorage fallback when server is completely unreachable (result === null).
    if (result !== null) return result;

    // Fallback: localStorage (when server is offline / not running)
    if (typeof customerDB !== 'undefined') {
        return customerDB.registerCustomer(email, password, firstName, lastName, phone, address);
    }

    return { success: false, message: 'Server offline and localStorage not available.' };
}

async function apiLogin(email, password) {
    const result = await apiFetch('POST', '/login', { email, password });
    // Only short-circuit if server responded AND login succeeded
    if (result && result.success) return result;

    // Fallback: localStorage (handles accounts registered before server was set up,
    // OR when server is offline)
    // SECURITY: Only accept properly hashed passwords in localStorage fallback
    if (typeof customerDB !== 'undefined') {
        const fallback = customerDB.loginCustomer(email, password);
        if (fallback && fallback.success) return fallback;
    }

    // Return server error if we have one, otherwise generic message
    return result || { success: false, message: 'Login failed. Please check your email and password.' };
}

// ============================================================
// CART
// ============================================================

async function apiGetCart(userId) {
    const result = await apiFetch('GET', `/cart/${userId}`);
    if (result && result.success) return result.cart;

    // Fallback: localStorage
    if (typeof customerDB !== 'undefined') {
        return customerDB.getCustomerCart(userId) || [];
    }
    return [];
}

async function apiUpdateCart(userId, cart) {
    const result = await apiFetch('PUT', `/cart/${userId}`, { cart });
    if (result) return result;

    // Fallback: localStorage
    if (typeof customerDB !== 'undefined') {
        return customerDB.updateCustomerCart(userId, cart);
    }
    return { success: false };
}

// ============================================================
// ORDERS
// ============================================================

async function apiPlaceOrder(orderData) {
    const result = await apiFetch('POST', '/orders', orderData);
    if (result) return result;

    // Fallback: localStorage
    if (typeof customerDB !== 'undefined') {
        return customerDB.createOrder(orderData);
    }
    return { success: false, message: 'Server offline' };
}

async function apiGetOrders() {
    const result = await apiFetch('GET', '/orders');
    if (result && result.success) return result.orders;

    // Fallback: localStorage
    if (typeof customerDB !== 'undefined') {
        return customerDB.getAllOrders();
    }
    return [];
}

async function apiGetOrdersByStatus(status) {
    const result = await apiFetch('GET', `/orders/status/${status}`);
    if (result && result.success) return result.orders;

    // Fallback: localStorage
    if (typeof customerDB !== 'undefined') {
        return customerDB.getOrdersByStatus(status);
    }
    return [];
}

async function apiUpdateOrderStatus(orderId, status) {
    const result = await apiFetch('PUT', `/orders/${orderId}/status`, { status });
    if (result) return result;

    // Fallback: localStorage
    if (typeof customerDB !== 'undefined') {
        return customerDB.updateOrderStatus(orderId, status);
    }
    return { success: false };
}

// ============================================================
// USERS (admin)
// ============================================================

async function apiGetUsers() {
    const result = await apiFetch('GET', '/users');
    if (result && result.success) return result.users;

    // Fallback: localStorage
    if (typeof customerDB !== 'undefined') {
        return customerDB.getAllCustomers();
    }
    return [];
}

async function apiUpdateProfile(userId, data) {
    const result = await apiFetch('PUT', `/users/${userId}`, data);
    if (result) return result;
    // Fallback: localStorage
    if (typeof customerDB !== 'undefined') {
        return customerDB.updateCustomer(userId, data);
    }
    return { success: false };
}

async function apiGetCustomerOrders(userId) {
    const result = await apiFetch('GET', `/orders/customer/${userId}`);
    if (result && result.success) return result.orders;
    // Fallback: localStorage
    if (typeof customerDB !== 'undefined') {
        return customerDB.getCustomerOrders(userId);
    }
    return [];
}

// ============================================================
// STATS (admin dashboard)
// ============================================================

async function apiGetStats() {
    const result = await apiFetch('GET', '/stats');
    if (result && result.success) return result.stats;

    // Fallback: localStorage
    if (typeof customerDB !== 'undefined') {
        return customerDB.getDatabaseStats();
    }
    return {
        totalCustomers: 0, totalOrders: 0, totalRevenue: 0,
        pendingOrders: 0, deliveredOrders: 0
    };
}

// ============================================================
// SERVER STATUS CHECK
// ============================================================

async function checkServerOnline() {
    try {
        const res = await fetch(API_BASE + '/stats', { signal: AbortSignal.timeout(2000) });
        return res.ok;
    } catch {
        return false;
    }
}

// Show a banner if server is offline
(async () => {
    const online = await checkServerOnline();
    if (!online) {
        console.warn(
            '%c[Kashi Rivaz] Server is offline — using localStorage fallback.\n' +
            'Run: node server.js  to start the server.',
            'color: orange; font-weight: bold;'
        );
    } else {
        console.log('%c[Kashi Rivaz] ✅ Live MySQL database connected!', 'color: green; font-weight: bold;');
    }
})();
