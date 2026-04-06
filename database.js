// ===================================
// CUSTOMER DATABASE MANAGEMENT
// localStorage-backed database for demo/offline use.
// In a real app, replace with server-side API calls.
// ===================================

// Order status constants
const ORDER_STATUS = {
    PENDING: 'pending',
    CONFIRMED: 'confirmed',
    SHIPPED: 'shipped',
    DELIVERED: 'delivered',
    CANCELLED: 'cancelled',
    REFUNDED: 'refunded'
};

class CustomerDatabase {
    constructor() {
        this.dbName = 'shivanshSareeDB';
        this.initializeDatabase();
    }

    initializeDatabase() {
        if (!localStorage.getItem(this.dbName)) {
            // Pre-populate from sampleUsers defined in userData.js
            const customers = Array.isArray(window.sampleUsers)
                ? window.sampleUsers.map(u => ({ ...u, cart: u.cart || [] }))
                : [];

            let lastId = 1000;
            if (customers.length) {
                lastId = customers.reduce((max, c) => Math.max(max, c.id), lastId);
            }

            const initialDB = {
                customers: customers,
                orders: [],
                lastCustomerId: lastId
            };
            localStorage.setItem(this.dbName, JSON.stringify(initialDB));
        }
    }

    getDatabase() {
        try {
            return JSON.parse(localStorage.getItem(this.dbName));
        } catch (e) {
            console.error('Database read error:', e);
            return { customers: [], orders: [], lastCustomerId: 1000 };
        }
    }

    saveDatabase(db) {
        localStorage.setItem(this.dbName, JSON.stringify(db));
    }

    // ===================================
    // CUSTOMER FUNCTIONS
    // ===================================

    registerCustomer(email, password, firstName, lastName, phone, address) {
        const db = this.getDatabase();

        // Validate inputs
        if (!email || !password || !firstName || !lastName) {
            return { success: false, message: 'All required fields must be filled.' };
        }

        if (db.customers.find(c => c.email === email.toLowerCase())) {
            return { success: false, message: 'This email is already registered.' };
        }

        if (password.length < 6) {
            return { success: false, message: 'Password must be at least 6 characters.' };
        }

        const customer = {
            id: ++db.lastCustomerId,
            email: email.toLowerCase().trim(),
            password: this._hashPassword(password),   // basic obfuscation for demo
            firstName: firstName.trim(),
            lastName: lastName.trim(),
            phone: phone ? phone.trim() : '',
            address: address ? address.trim() : '',
            createdAt: new Date().toISOString(),
            totalOrders: 0,
            totalSpent: 0,
            cart: []
        };

        db.customers.push(customer);
        this.saveDatabase(db);

        // Return the safe user object so the caller can set `currentUser` immediately
        // without needing a separate login round-trip.
        return {
            success: true,
            message: 'Registration successful!',
            customerId: customer.id,
            customer: {
                id: customer.id,
                email: customer.email,
                firstName: customer.firstName,
                lastName: customer.lastName,
                phone: customer.phone,
                address: customer.address
            }
        };
    }

    loginCustomer(email, password) {
        const db = this.getDatabase();
        const hashed = this._hashPassword(password);

        // Support both hashed and plain-text passwords (for seeded sample users)
        const customer = db.customers.find(
            c => c.email === email.toLowerCase() &&
                (c.password === hashed || c.password === password)
        );

        if (customer) {
            return {
                success: true,
                message: 'Login successful!',
                customer: {
                    id: customer.id,
                    email: customer.email,
                    firstName: customer.firstName,
                    lastName: customer.lastName,
                    phone: customer.phone,
                    address: customer.address
                }
            };
        }

        return { success: false, message: 'Invalid email or password. Please try again.' };
    }

    getCustomer(customerId) {
        return this.getDatabase().customers.find(c => c.id === customerId) || null;
    }

    updateCustomer(customerId, updatedData) {
        const db = this.getDatabase();
        const customer = db.customers.find(c => c.id === customerId);

        if (!customer) return { success: false, message: 'Customer not found.' };

        // Prevent overwriting sensitive fields directly
        const allowed = ['firstName', 'lastName', 'phone', 'address', 'email', 'city', 'postalCode'];
        allowed.forEach(key => {
            if (updatedData[key] !== undefined) customer[key] = updatedData[key];
        });

        this.saveDatabase(db);
        return { success: true, message: 'Profile updated successfully!' };
    }

    getAllCustomers() {
        return this.getDatabase().customers;
    }

    deleteCustomer(customerId) {
        const db = this.getDatabase();
        const idx = db.customers.findIndex(c => c.id === customerId);
        if (idx === -1) return { success: false, message: 'Customer not found.' };
        db.customers.splice(idx, 1);
        this.saveDatabase(db);
        return { success: true, message: 'Customer deleted.' };
    }

    searchCustomers(query) {
        const q = query.toLowerCase();
        return this.getDatabase().customers.filter(c =>
            c.firstName?.toLowerCase().includes(q) ||
            c.lastName?.toLowerCase().includes(q) ||
            c.email?.toLowerCase().includes(q) ||
            c.phone?.includes(q)
        );
    }

    // ===================================
    // CART HELPERS
    // ===================================

    getCustomerCart(customerId) {
        const customer = this.getCustomer(customerId);
        return customer ? (customer.cart || []) : [];
    }

    updateCustomerCart(customerId, cart) {
        const db = this.getDatabase();
        const customer = db.customers.find(c => c.id === customerId);
        if (!customer) return { success: false, message: 'Customer not found.' };

        customer.cart = cart;
        customer.cartTotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        this.saveDatabase(db);
        return { success: true };
    }

    clearCustomerCart(customerId) {
        return this.updateCustomerCart(customerId, []);
    }

    // ===================================
    // ORDER FUNCTIONS
    // ===================================

    createOrder(customerId, items, total, status = ORDER_STATUS.PENDING, shippingInfo = {}) {
        const db = this.getDatabase();
        const customer = db.customers.find(c => c.id === customerId);

        if (!customer) return { success: false, message: 'Customer not found.' };

        const order = {
            orderId: 'ORD-' + Date.now(),
            customerId: customerId,
            customerName: customer.firstName + ' ' + customer.lastName,
            items: items,
            total: total,
            status: status,
            shipping: shippingInfo,
            paymentMethod: shippingInfo.paymentMethod || 'COD',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        db.orders.push(order);
        customer.totalOrders += 1;
        customer.totalSpent += total;

        this.saveDatabase(db);
        return { success: true, orderId: order.orderId, message: 'Order created successfully!' };
    }

    getCustomerOrders(customerId) {
        return this.getDatabase().orders.filter(o => o.customerId === customerId);
    }

    getOrder(orderId) {
        return this.getDatabase().orders.find(o => o.orderId === orderId) || null;
    }

    updateOrderStatus(orderId, status) {
        if (!Object.values(ORDER_STATUS).includes(status)) {
            return { success: false, message: 'Invalid status value.' };
        }

        const db = this.getDatabase();
        const order = db.orders.find(o => o.orderId === orderId);

        if (!order) return { success: false, message: 'Order not found.' };

        order.status = status;
        order.updatedAt = new Date().toISOString();
        this.saveDatabase(db);
        return { success: true, message: 'Order status updated!' };
    }

    deleteOrder(orderId) {
        const db = this.getDatabase();
        const idx = db.orders.findIndex(o => o.orderId === orderId);
        if (idx === -1) return { success: false, message: 'Order not found.' };
        db.orders.splice(idx, 1);
        this.saveDatabase(db);
        return { success: true };
    }

    getAllOrders() {
        return this.getDatabase().orders;
    }

    getOrdersByStatus(status) {
        return this.getDatabase().orders.filter(o => o.status === status);
    }

    // ===================================
    // STATISTICS
    // ===================================

    getDatabaseStats() {
        const db = this.getDatabase();
        const totalRevenue = db.orders
            .filter(o => o.status !== ORDER_STATUS.CANCELLED && o.status !== ORDER_STATUS.REFUNDED)
            .reduce((sum, o) => sum + o.total, 0);

        return {
            totalCustomers: db.customers.length,
            totalOrders: db.orders.length,
            totalRevenue: totalRevenue,
            pendingOrders: db.orders.filter(o => o.status === ORDER_STATUS.PENDING).length,
            deliveredOrders: db.orders.filter(o => o.status === ORDER_STATUS.DELIVERED).length
        };
    }

    // ===================================
    // DATABASE RESET (for testing)
    // ===================================

    resetDatabase() {
        localStorage.removeItem(this.dbName);
        this.initializeDatabase();
        return { success: true, message: 'Database reset.' };
    }

    // ===================================
    // PRIVATE HELPERS
    // ===================================

    _hashPassword(password) {
        // Basic base64 obfuscation for demo – NOT secure for production.
        // In production use bcrypt or Argon2 on the server.
        try {
            return btoa(unescape(encodeURIComponent(password)));
        } catch (e) {
            return password; // fallback
        }
    }
}

// Initialize global database instance
const customerDB = new CustomerDatabase();
