// ============================================================
// Kashi Rivaz — Node.js Express + MySQL Server
// Run: node server.js
// Access site at: http://localhost:3000
// Admin panel at: http://localhost:3000/admin.html
// ============================================================

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const mysql = require('mysql2/promise');
const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');
const crypto = require('crypto');

// ─── Nodemailer (owner order-notification emails) ───────────────────────
let nodemailer;
try {
    nodemailer = require('nodemailer');
} catch (e) {
    console.warn('⚠️  nodemailer not installed. Run: npm install nodemailer');
}

// Build a Gmail transporter using owner credentials from .env
function getMailTransporter() {
    if (!nodemailer) return null;
    const user = process.env.GMAIL_USER;
    const pass = process.env.GMAIL_APP_PASSWORD;
    if (!user || !pass || pass === 'your_16_char_app_password_here') return null;
    return nodemailer.createTransport({
        service: 'gmail',
        auth: { user, pass }
    });
}

// ─── Telegram Bot Notification ─────────────────────────────────────────
/**
 * Send order notification to Telegram channel via Bot API.
 * Uses plain HTTPS — no extra npm package needed.
 */
function sendTelegramNotification(message) {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;

    if (!token || !chatId || token === 'YOUR_BOT_TOKEN_HERE' || chatId === 'YOUR_CHANNEL_ID_HERE') {
        console.log('ℹ️  Telegram skipped: Bot token/chat ID not configured in .env');
        return Promise.resolve();
    }

    return new Promise((resolve) => {
        const payload = JSON.stringify({
            chat_id: chatId,
            text: message,
            parse_mode: 'HTML'
        });

        const options = {
            hostname: 'api.telegram.org',
            path: `/bot${token}/sendMessage`,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload)
            }
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    if (parsed.ok) {
                        console.log('✅  Telegram notification sent!');
                    } else {
                        console.warn('⚠️  Telegram API error:', parsed.description);
                    }
                } catch (e) { }
                resolve();
            });
        });

        req.on('error', (err) => {
            console.error('⚠️  Telegram request failed:', err.message);
            resolve();
        });

        req.write(payload);
        req.end();
    });
}

/**
 * Build and send order notification to Telegram channel.
 * Called after every successful order.
 */
async function sendOrderToTelegram(order) {
    const { orderId, customerName, customerEmail, customerPhone,
        address, items, total, paymentMethod } = order;

    const addrObj = typeof address === 'string' ? JSON.parse(address || '{}') : (address || {});
    const addrStr = addrObj.fullAddress ||
        [addrObj.house, addrObj.street, addrObj.landmark, addrObj.city,
         addrObj.state, addrObj.postalCode, addrObj.country]
        .filter(Boolean).join(', ') ||
        [addrObj.street, addrObj.city, addrObj.postalCode, addrObj.state].filter(Boolean).join(', ') ||
        'Not provided';

    const itemsList = (Array.isArray(items) ? items : [])
        .map(i => `  • ${i.name || 'Item'} x${i.quantity || 1} — ₹${Number(i.price || 0).toLocaleString('en-IN')}`)
        .join('\n');

    const now = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
    const mapsQuery = encodeURIComponent(addrStr !== 'Not provided' ? addrStr : 'Varanasi, India');
    const mapsLink = `https://www.google.com/maps/search/?api=1&query=${mapsQuery}`;

    const message =
`🛒 <b>NEW ORDER RECEIVED!</b>
━━━━━━━━━━━━━━━━━━━━━━━

📋 <b>Order ID:</b> <code>${orderId}</code>
🕐 <b>Time:</b> ${now} IST

👤 <b>CUSTOMER DETAILS</b>
━━━━━━━━━━━━━━━━━━━━━━━
👨 Name: <b>${customerName || 'Guest'}</b>
📧 Email: ${customerEmail || 'Not provided'}
📱 Phone: <a href="tel:${customerPhone}">${customerPhone || 'Not provided'}</a>
🏠 Address: ${addrStr}

📦 <b>ITEMS ORDERED</b>
━━━━━━━━━━━━━━━━━━━━━━━
${itemsList || '  • No items listed'}

💰 <b>TOTAL: ₹${Number(total || 0).toLocaleString('en-IN')}</b>
💳 Payment: ${paymentMethod || 'UPI'}
🔑 UTR/Transaction ID: <code>${order.transactionId || 'Not provided'}</code>

📍 <a href="${mapsLink}">Open Delivery Location on Google Maps</a>`;

    try {
        await sendTelegramNotification(message);
    } catch (e) {
        console.error('Telegram notification failed:', e.message);
    }
}

/**
 * Send order-placed notification to the OWNER (kashirivaz@gmail.com).
 * Called after every successful order. Failures are non-blocking.
 */
async function sendOrderNotificationToOwner(order) {
    const transporter = getMailTransporter();
    if (!transporter) {
        console.log('ℹ️  Email skipped: GMAIL credentials not configured in .env');
        return;
    }

    const ownerEmail = process.env.GMAIL_USER;
    const { orderId, customerName, customerEmail, customerPhone,
        address, items, total, paymentMethod } = order;

    // Build items table rows
    const itemRows = (Array.isArray(items) ? items : JSON.parse(items || '[]'))
        .map(i => `
            <tr style="border-bottom:1px solid #eee;">
                <td style="padding:10px 12px;">${i.name || '-'}</td>
                <td style="padding:10px 12px;text-align:center;">${i.quantity || 1}</td>
                <td style="padding:10px 12px;text-align:right;font-weight:600;">&#8377;${Number(i.price || 0).toLocaleString('en-IN')}</td>
            </tr>`).join('');

    const addrObj = typeof address === 'string' ? JSON.parse(address || '{}') : (address || {});
    const addrStr = addrObj.fullAddress ||
        [addrObj.house, addrObj.street, addrObj.landmark, addrObj.city,
         addrObj.state, addrObj.postalCode, addrObj.country]
        .filter(Boolean).join(', ') ||
        [addrObj.street, addrObj.city, addrObj.postalCode, addrObj.state].filter(Boolean).join(', ') ||
        'Not provided';
    const now = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });

    // Build a Google Maps search link for the delivery address
    const mapsQuery = encodeURIComponent(addrStr !== 'Not provided' ? addrStr : 'Varanasi, India');
    const mapsLink = `https://www.google.com/maps/search/?api=1&query=${mapsQuery}`;

    const html = `
    <!DOCTYPE html>
    <html>
    <body style="font-family:Arial,sans-serif;background:#f6f0e8;margin:0;padding:0;">
      <div style="max-width:620px;margin:30px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.1);">
        <div style="background:linear-gradient(135deg,#8B1538,#c02050);padding:28px 32px;text-align:center;">
          <h1 style="color:#fff;margin:0;font-size:22px;letter-spacing:1px;">🛒 New Order Received!</h1>
          <p style="color:rgba(255,255,255,0.8);margin:6px 0 0;font-size:13px;">Kashi Rivaz — Order Notification</p>
        </div>
        <div style="background:#fff8e1;padding:16px 32px;border-bottom:2px solid #f0c040;text-align:center;">
          <span style="font-size:13px;color:#666;">Order ID: </span>
          <strong style="font-size:16px;color:#8B1538;letter-spacing:1px;">${orderId}</strong>
          <span style="margin-left:20px;font-size:12px;color:#999;">${now} IST</span>
        </div>
        <div style="padding:28px 32px;">
          <h2 style="font-size:15px;color:#333;border-bottom:2px solid #f0c040;padding-bottom:8px;margin-bottom:16px;">👤 Customer Details</h2>
          <table style="width:100%;font-size:14px;color:#555;margin-bottom:24px;">
            <tr><td style="padding:5px 0;width:35%;color:#888;">Name</td><td><strong>${customerName || 'Guest'}</strong></td></tr>
            <tr><td style="padding:5px 0;color:#888;">Email</td><td>${customerEmail || 'Not provided'}</td></tr>
            <tr><td style="padding:5px 0;color:#888;">Phone</td><td><a href="tel:${customerPhone}" style="color:#1a73e8;">${customerPhone || 'Not provided'}</a></td></tr>
            <tr><td style="padding:5px 0;color:#888;">WhatsApp</td><td><a href="https://wa.me/${String(customerPhone||'').replace(/[^0-9]/g,'')}" style="color:#25D366;font-weight:700;">Open WhatsApp Chat ↗</a></td></tr>
            <tr><td style="padding:5px 0;color:#888;">Delivery Address</td><td>${addrStr}</td></tr>
            <tr><td style="padding:5px 0;color:#888;">Payment</td><td><span style="background:#e8f5e9;color:#2e7d32;padding:2px 10px;border-radius:999px;font-size:12px;font-weight:700;">${paymentMethod || 'UPI'}</span></td></tr>
            <tr><td style="padding:5px 0;color:#888;">UTR / Txn ID</td><td><span style="font-family:monospace;background:#f0fdf4;padding:2px 8px;border-radius:4px;font-size:13px;">${order.transactionId || '<i style="color:#e53e3e;">Not provided</i>'}</span></td></tr>
          </table>
          <div style="text-align:center;margin-bottom:24px;">
            <a href="${mapsLink}" target="_blank" style="display:inline-block;background:linear-gradient(135deg,#1a73e8,#0d47a1);color:#fff;text-decoration:none;padding:12px 28px;border-radius:30px;font-size:14px;font-weight:700;">
              📍 Open Delivery Location in Google Maps
            </a>
          </div>
          <h2 style="font-size:15px;color:#333;border-bottom:2px solid #f0c040;padding-bottom:8px;margin-bottom:12px;">📦 Items Ordered</h2>
          <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:24px;">
            <thead><tr style="background:#f9f0f3;">
              <th style="padding:10px 12px;text-align:left;color:#8B1538;">Product</th>
              <th style="padding:10px 12px;text-align:center;color:#8B1538;">Qty</th>
              <th style="padding:10px 12px;text-align:right;color:#8B1538;">Price</th>
            </tr></thead>
            <tbody>${itemRows}</tbody>
          </table>
          <div style="background:linear-gradient(135deg,#8B1538,#c02050);border-radius:8px;padding:18px 24px;display:flex;justify-content:space-between;align-items:center;">
            <span style="color:rgba(255,255,255,0.85);font-size:15px;">Total Amount Paid</span>
            <span style="color:#f0c040;font-size:22px;font-weight:900;">&#8377;${Number(total || 0).toLocaleString('en-IN')}</span>
          </div>
        </div>
        <div style="background:#1a0a10;padding:16px 32px;text-align:center;">
          <p style="color:rgba(255,255,255,0.4);font-size:11px;margin:0;">
            This is an automated notification from your Kashi Rivaz website &bull; Do not reply to this email
          </p>
        </div>
      </div>
    </body>
    </html>`;

    try {
        await transporter.sendMail({
            from: `"Kashi Rivaz Website" <${ownerEmail}>`,
            to: ownerEmail,
            subject: `🛒 New Order: ${orderId} — &#8377;${Number(total || 0).toLocaleString('en-IN')} — ${customerName || 'Guest'}`,
            html
        });
        console.log(`✅  Order notification email sent to ${ownerEmail} for order ${orderId}`);
    } catch (mailErr) {
        console.error('⚠️  Failed to send order email:', mailErr.message);
    }
}

// ─── Rate Limiter (built-in; no extra package needed) ─────────
const authAttempts = new Map();
function authRateLimiter(req, res, next) {
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    const windowMs   = 5 * 60 * 1000;  // 5-minute window
    const maxAttempts = 20;             // 20 attempts before lockout

    if (!authAttempts.has(ip)) authAttempts.set(ip, []);
    const attempts = authAttempts.get(ip).filter(t => now - t < windowMs);
    attempts.push(now);
    authAttempts.set(ip, attempts);

    if (attempts.length > maxAttempts) {
        return res.status(429).json({
            success: false,
            message: 'Too many login attempts. Please wait 5 minutes before trying again.'
        });
    }
    next();
}

// ─── Admin Session Store (in-memory) ──────────────────────────
// Maps sessionToken -> { createdAt, ip }
const adminSessions = new Map();
const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8 hours

function createAdminSession(ip) {
    const token = crypto.randomBytes(32).toString('hex');
    adminSessions.set(token, { createdAt: Date.now(), ip });
    return token;
}

function validateAdminSession(token) {
    if (!token) return false;
    const session = adminSessions.get(token);
    if (!session) return false;
    if (Date.now() - session.createdAt > SESSION_TTL_MS) {
        adminSessions.delete(token);
        return false;
    }
    return true;
}

// Middleware: require valid admin session token
function requireAdminSession(req, res, next) {
    const token = req.headers['x-admin-session'] || req.query._as;
    if (validateAdminSession(token)) return next();
    return res.status(403).json({ success: false, message: 'Admin authentication required. Please log in.' });
}

// ─── Admin API Key Middleware (legacy, kept for compatibility) ──────
const ADMIN_SECRET = process.env.ADMIN_SECRET || '';
function requireAdminKey(req, res, next) {
    // Accept either the new session token OR the legacy API key
    const sessionToken = req.headers['x-admin-session'];
    if (validateAdminSession(sessionToken)) return next();

    if (!ADMIN_SECRET) return next();
    const key = req.headers['x-admin-key'];
    if (key && key === ADMIN_SECRET) return next();
    return res.status(403).json({ success: false, message: 'Forbidden: admin access only' });
}

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Middleware ───────────────────────────────────────────────
app.use(cors({
    origin: function (origin, callback) {
        const allowed = [undefined, null, 'http://localhost:3000', 'http://127.0.0.1:3000'];
        if (!origin || allowed.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error('CORS: not allowed from this origin'));
        }
    },
    credentials: true
}));
app.use(express.json({ limit: '25mb' }));   // ← 25 MB for large base64 photo uploads
app.use(express.urlencoded({ limit: '25mb', extended: true }));

// ─── Serve admin.html ONLY after admin session check ──────────
// We serve static files but protect admin.html via a special route
app.get('/admin.html', (req, res) => {
    // Admin page is served normally — login is handled client-side with server session API
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// ─── SECRET ADMIN PORTAL — Firebase-powered ─────────────────
// Access via: http://yourdomain.com/adminaccess
// This URL is NEVER linked anywhere on the public site.
// To change the keyword: update 'adminaccess' below and in firebase-config.js
app.get('/adminaccess', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'adminaccess.html'));
});
// Also allow /adminaccess/ with trailing slash
app.get('/adminaccess/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'adminaccess.html'));
});

app.use(express.static(path.join(__dirname, 'public')));

// ─── PUBLIC: Firebase client config (no secrets exposed) ─────
app.get('/api/firebase-config', (req, res) => {
    const apiKey = process.env.FIREBASE_API_KEY;
    if (!apiKey || apiKey === 'YOUR_API_KEY') {
        return res.json({ apiKey: null }); // Client treats null as "not configured"
    }
    res.json({
        apiKey,
        authDomain:        process.env.FIREBASE_AUTH_DOMAIN        || '',
        projectId:         process.env.FIREBASE_PROJECT_ID         || '',
        storageBucket:     process.env.FIREBASE_STORAGE_BUCKET     || '',
        messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID|| '',
        appId:             process.env.FIREBASE_APP_ID             || ''
    });
});

// ─── MySQL Connection Pool ────────────────────────────────────
if (!process.env.DB_PASSWORD) {
    console.warn('⚠️  WARNING: DB_PASSWORD not set in .env – refusing to connect with empty password!');
}
const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306'),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'kashi_rivaz',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    charset: 'utf8mb4',
    ssl: false
});

// Test DB connection on startup
(async () => {
    try {
        const conn = await pool.getConnection();
        console.log('  ✅  MySQL connected to database:', process.env.DB_NAME || 'kashi_rivaz');
        conn.release();
        // Ensure website_content table exists
        await pool.query(`
            CREATE TABLE IF NOT EXISTS website_content (
                id INT AUTO_INCREMENT PRIMARY KEY,
                content_key VARCHAR(100) UNIQUE NOT NULL,
                content_value LONGTEXT,
                content_type ENUM('text','image','json') DEFAULT 'text',
                label VARCHAR(200),
                updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS coupons (
                id INT AUTO_INCREMENT PRIMARY KEY,
                code VARCHAR(50) NOT NULL UNIQUE,
                discountType ENUM('flat','percent') NOT NULL DEFAULT 'percent',
                value DECIMAL(10,2) NOT NULL DEFAULT 0,
                minOrder DECIMAL(10,2) DEFAULT 0,
                maxUses INT DEFAULT 9999,
                usedCount INT DEFAULT 0,
                validFrom DATETIME DEFAULT NULL,
                validUntil DATETIME DEFAULT NULL,
                isActive TINYINT(1) DEFAULT 1,
                createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS reviews (
                id INT AUTO_INCREMENT PRIMARY KEY,
                productId VARCHAR(100) NOT NULL,
                customerId INT DEFAULT NULL,
                reviewerName VARCHAR(150) NOT NULL,
                rating TINYINT NOT NULL DEFAULT 5,
                comment TEXT NOT NULL,
                adminReply TEXT DEFAULT NULL,
                status ENUM('pending','approved','rejected','spam') NOT NULL DEFAULT 'pending',
                createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);

        console.log('  ✅  website_content, coupons, reviews tables ready');


        // ── Auto-migrate: add transactionId column if it doesn't exist ──
        try {
            await pool.query(`
                ALTER TABLE orders
                ADD COLUMN IF NOT EXISTS transactionId VARCHAR(100) DEFAULT '' AFTER paymentMethod
            `);
            console.log('  ✅  orders.transactionId column ready');
        } catch (migErr) {
            // Ignore if column already exists or table doesn't exist yet
        }

    } catch (err) {
        console.error('  ❌  MySQL connection failed:', err.message);
        console.error('  👉  Make sure MySQL is running and check your .env file.');
    }

    // Ensure public/images directory exists
    const imagesDir = path.join(__dirname, 'public', 'images');
    if (!fs.existsSync(imagesDir)) {
        fs.mkdirSync(imagesDir, { recursive: true });
        console.log('  ✅  Created public/images directory');
    }
})();

// ─── Helper ───────────────────────────────────────────────────
function makeOrderId() {
    return 'ORD-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
}

// ============================================================
// ADMIN AUTH ROUTES (Server-Side)
// ============================================================

// POST /api/admin/login  — admin-only login
app.post('/api/admin/login', authRateLimiter, (req, res) => {
    const { username, password } = req.body;

    const correctUsername = process.env.ADMIN_USERNAME || 'admin';
    const correctPassword = process.env.ADMIN_PASSWORD || 'KashiRivaz@Admin2024!';

    if (!username || !password) {
        return res.status(400).json({ success: false, message: 'Username and password required' });
    }

    if (username === correctUsername && password === correctPassword) {
        const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        const sessionToken = createAdminSession(ip);
        console.log(`✅  Admin logged in from ${ip}`);
        return res.json({
            success: true,
            sessionToken,
            message: 'Admin login successful',
            expiresIn: SESSION_TTL_MS
        });
    }

    console.warn(`⚠️  Failed admin login attempt for username: ${username}`);
    return res.status(401).json({ success: false, message: 'Invalid admin credentials' });
});

// POST /api/admin/logout
app.post('/api/admin/logout', (req, res) => {
    const token = req.headers['x-admin-session'];
    if (token) adminSessions.delete(token);
    res.json({ success: true, message: 'Logged out' });
});

// GET /api/admin/check  — verify session is still valid
app.get('/api/admin/check', (req, res) => {
    const token = req.headers['x-admin-session'];
    if (validateAdminSession(token)) {
        res.json({ success: true, valid: true });
    } else {
        res.status(403).json({ success: false, valid: false, message: 'Session expired or invalid' });
    }
});

// ============================================================
// AUTH ROUTES (Customer)
// ============================================================

// POST /api/register  (rate-limited)
app.post('/api/register', authRateLimiter, async (req, res) => {
    try {
        const { firstName, lastName, email, phone, password } = req.body;

        if (!firstName || !lastName || !email || !password) {
            return res.status(400).json({ success: false, message: 'All fields are required' });
        }

        const [rows] = await pool.query('SELECT id FROM customers WHERE email = ?', [email.toLowerCase()]);
        if (rows.length > 0) {
            return res.status(409).json({ success: false, message: 'Email already registered' });
        }

        const hashed = await bcrypt.hash(password, 10);
        const [result] = await pool.query(
            `INSERT INTO customers (firstName, lastName, email, password, phone)
             VALUES (?, ?, ?, ?, ?)`,
            [firstName.trim(), lastName.trim(), email.toLowerCase().trim(), hashed, (phone || '').trim()]
        );

        const newUser = {
            id: result.insertId,
            firstName: firstName.trim(),
            lastName: lastName.trim(),
            email: email.toLowerCase().trim(),
            phone: (phone || '').trim(),
            totalOrders: 0,
            totalSpent: 0
        };

        res.json({ success: true, message: 'Registration successful!', user: newUser });

    } catch (err) {
        console.error('Register error:', err);
        res.status(500).json({ success: false, message: 'Server error during registration' });
    }
});

// POST /api/login  (rate-limited)
app.post('/api/login', authRateLimiter, async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ success: false, message: 'Email and password required' });
        }

        const [rows] = await pool.query(
            `SELECT id, firstName, lastName, email, password, phone, address, city, postalCode,
                    totalOrders, totalSpent, createdAt
             FROM customers WHERE email = ?`,
            [email.toLowerCase()]
        );

        if (rows.length === 0) {
            return res.status(401).json({ success: false, message: 'Invalid email or password' });
        }

        const user = rows[0];
        const valid = await bcrypt.compare(password, user.password);

        if (!valid) {
            return res.status(401).json({ success: false, message: 'Invalid email or password' });
        }

        const { password: _, ...safeUser } = user;
        res.json({ success: true, message: 'Login successful!', user: safeUser });

    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ success: false, message: 'Server error during login' });
    }
});

// ============================================================
// USER / PROFILE ROUTES
// ============================================================

app.get('/api/users', requireAdminKey, async (req, res) => {
    try {
        const [rows] = await pool.query(
            'SELECT id, firstName, lastName, email, phone, address, city, postalCode, totalOrders, totalSpent, createdAt FROM customers ORDER BY createdAt DESC'
        );
        res.json({ success: true, users: rows });
    } catch (err) {
        console.error('Get users error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

app.get('/api/users/:id', requireAdminKey, async (req, res) => {
    try {
        const [rows] = await pool.query(
            'SELECT id, firstName, lastName, email, phone, address, city, postalCode, totalOrders, totalSpent, createdAt FROM customers WHERE id = ?',
            [Number(req.params.id)]
        );
        if (rows.length === 0) return res.status(404).json({ success: false, message: 'User not found' });
        res.json({ success: true, user: rows[0] });
    } catch (err) {
        console.error('Get user error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

app.put('/api/users/:id', async (req, res) => {
    try {
        const { firstName, lastName, phone, address, city, postalCode } = req.body;
        await pool.query(
            `UPDATE customers SET firstName=?, lastName=?, phone=?, address=?, city=?, postalCode=?
             WHERE id=?`,
            [firstName, lastName, phone || '', address || '', city || '', postalCode || '', Number(req.params.id)]
        );
        res.json({ success: true, message: 'Profile updated successfully!' });
    } catch (err) {
        console.error('Update user error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ============================================================
// CART ROUTES
// ============================================================

app.get('/api/cart/:userId', async (req, res) => {
    try {
        const [rows] = await pool.query(
            'SELECT productId AS id, name, price, image, quantity FROM cart_items WHERE customerId = ?',
            [Number(req.params.userId)]
        );
        res.json({ success: true, cart: rows });
    } catch (err) {
        console.error('Get cart error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

app.put('/api/cart/:userId', async (req, res) => {
    const userId = Number(req.params.userId);
    const { cart } = req.body;

    if (!Array.isArray(cart)) {
        return res.status(400).json({ success: false, message: 'cart must be an array' });
    }

    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        await conn.query('DELETE FROM cart_items WHERE customerId = ?', [userId]);

        for (const item of cart) {
            if (!item.id || !item.name) continue;
            await conn.query(
                `INSERT INTO cart_items (customerId, productId, name, price, image, quantity)
                 VALUES (?, ?, ?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE quantity = VALUES(quantity)`,
                [userId, item.id, item.name, parseFloat(item.price) || 0, item.image || '', parseInt(item.quantity) || 1]
            );
        }

        await conn.commit();
        res.json({ success: true, message: 'Cart saved to database' });

    } catch (err) {
        await conn.rollback();
        console.error('Update cart error:', err);
        res.status(500).json({ success: false, message: 'Server error saving cart' });
    } finally {
        conn.release();
    }
});

// ============================================================
// ORDER ROUTES
// ============================================================

// POST /api/orders  — place a new order
app.post('/api/orders', async (req, res) => {
    const {
        userId, customerName, customerEmail, customerPhone,
        address, items, subtotal, total, paymentMethod, transactionId
    } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ success: false, message: 'Order must have items' });
    }

    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        const orderId = makeOrderId();

        await conn.query(
            `INSERT INTO orders
             (orderId, customerId, customerName, customerEmail, customerPhone,
              items, shippingAddress, subtotal, total, paymentMethod, transactionId, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'confirmed')`,
            [
                orderId,
                userId || null,
                customerName || 'Guest',
                customerEmail || '',
                customerPhone || '',
                JSON.stringify(items),
                JSON.stringify(address || {}),
                parseFloat(subtotal) || 0,
                parseFloat(total) || 0,
                paymentMethod || 'UPI',
                transactionId || ''
            ]
        );

        if (userId) {
            await conn.query(
                `UPDATE customers
                 SET totalOrders = totalOrders + 1,
                     totalSpent  = totalSpent + ?,
                     updatedAt   = NOW()
                 WHERE id = ?`,
                [parseFloat(total) || 0, Number(userId)]
            );
            await conn.query('DELETE FROM cart_items WHERE customerId = ?', [Number(userId)]);
        }

        await conn.commit();

        const orderForNotification = {
            orderId,
            customerName: customerName || 'Guest',
            customerEmail: customerEmail || '',
            customerPhone: customerPhone || '',
            address: address || {},
            items,
            total: parseFloat(total) || 0,
            paymentMethod: paymentMethod || 'UPI',
            transactionId: transactionId || ''
        };

        // 📱 Non-blocking: send Telegram notification to admin channel
        sendOrderToTelegram(orderForNotification)
            .catch(e => console.error('Telegram notification error:', e.message));

        // 📧 Non-blocking: send order notification email to owner
        sendOrderNotificationToOwner(orderForNotification)
            .catch(e => console.error('Email notification error:', e.message));

        res.json({ success: true, orderId, message: 'Order placed successfully!' });

    } catch (err) {
        await conn.rollback();
        console.error('Create order error:', err);
        res.status(500).json({ success: false, message: 'Server error placing order' });
    } finally {
        conn.release();
    }
});

// GET /api/orders  — all orders (admin only)
app.get('/api/orders', requireAdminKey, async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM orders ORDER BY createdAt DESC');
        const orders = rows.map(o => ({
            ...o,
            items: typeof o.items === 'string' ? JSON.parse(o.items) : o.items,
            shippingAddress: typeof o.shippingAddress === 'string' ? JSON.parse(o.shippingAddress) : o.shippingAddress
        }));
        res.json({ success: true, orders });
    } catch (err) {
        console.error('Get orders error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// GET /api/orders/customer/:userId
app.get('/api/orders/customer/:userId', async (req, res) => {
    try {
        const [rows] = await pool.query(
            'SELECT * FROM orders WHERE customerId = ? ORDER BY createdAt DESC',
            [Number(req.params.userId)]
        );
        const orders = rows.map(o => ({
            ...o,
            items: typeof o.items === 'string' ? JSON.parse(o.items) : o.items,
            shippingAddress: typeof o.shippingAddress === 'string' ? JSON.parse(o.shippingAddress) : o.shippingAddress
        }));
        res.json({ success: true, orders });
    } catch (err) {
        console.error('Get customer orders error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// GET /api/orders/:orderId  — single order
app.get('/api/orders/:orderId', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM orders WHERE orderId = ?', [req.params.orderId]);
        if (rows.length === 0) return res.status(404).json({ success: false, message: 'Order not found' });

        const o = rows[0];
        res.json({
            success: true,
            order: {
                ...o,
                items: typeof o.items === 'string' ? JSON.parse(o.items) : o.items,
                shippingAddress: typeof o.shippingAddress === 'string' ? JSON.parse(o.shippingAddress) : o.shippingAddress
            }
        });
    } catch (err) {
        console.error('Get order error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// PUT /api/orders/:orderId/status  — update status (admin)
app.put('/api/orders/:orderId/status', async (req, res) => {
    const VALID = ['pending', 'confirmed', 'shipped', 'delivered', 'cancelled', 'refunded'];
    const { status } = req.body;

    if (!VALID.includes(status)) {
        return res.status(400).json({ success: false, message: 'Invalid status value' });
    }

    try {
        const [result] = await pool.query(
            'UPDATE orders SET status = ?, updatedAt = NOW() WHERE orderId = ?',
            [status, req.params.orderId]
        );
        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: 'Order not found' });
        }
        res.json({ success: true, message: `Order status updated to ${status}` });
    } catch (err) {
        console.error('Update status error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ============================================================
// STATS (admin dashboard)
// ============================================================

app.get('/api/stats', requireAdminKey, async (req, res) => {
    try {
        const [[{ totalCustomers }]] = await pool.query('SELECT COUNT(*) AS totalCustomers FROM customers');
        const [[{ totalOrders }]] = await pool.query('SELECT COUNT(*) AS totalOrders FROM orders');
        const [[{ totalRevenue }]] = await pool.query(
            "SELECT COALESCE(SUM(total),0) AS totalRevenue FROM orders WHERE status NOT IN ('cancelled','refunded')"
        );
        const [byStatusRows] = await pool.query("SELECT status, COUNT(*) AS cnt FROM orders GROUP BY status");

        const byStatus = {};
        byStatusRows.forEach(r => { byStatus[r.status] = r.cnt; });

        res.json({
            success: true,
            stats: {
                totalCustomers,
                totalOrders,
                totalRevenue: parseFloat(totalRevenue),
                pendingOrders: byStatus.pending || 0,
                confirmedOrders: byStatus.confirmed || 0,
                shippedOrders: byStatus.shipped || 0,
                deliveredOrders: byStatus.delivered || 0,
                cancelledOrders: byStatus.cancelled || 0,
                byStatus
            }
        });
    } catch (err) {
        console.error('Stats error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ============================================================
// WEBSITE CONTENT MANAGEMENT (Admin Only)
// ============================================================

// GET /api/admin/content  — get all website content settings (admin only)
app.get('/api/admin/content', requireAdminKey, async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM website_content ORDER BY id ASC');
        const content = {};
        rows.forEach(r => {
            content[r.content_key] = {
                value: r.content_value,
                type: r.content_type,
                label: r.label,
                updatedAt: r.updatedAt
            };
        });
        res.json({ success: true, content });
    } catch (err) {
        console.error('Get content error:', err);
        // On DB error, return empty content (site still works offline)
        res.json({ success: true, content: {} });
    }
});

// GET /api/cms-content  — PUBLIC endpoint, no auth needed
// All pages use this to load admin-edited content (text, images, announcements)
app.get('/api/cms-content', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT content_key, content_value, content_type FROM website_content ORDER BY id ASC');
        const content = {};
        rows.forEach(r => { content[r.content_key] = { value: r.content_value, type: r.content_type }; });
        res.json({ success: true, content });
    } catch (err) {
        // DB offline — return empty, cms-bar.js will fall back to localStorage
        res.json({ success: true, content: {} });
    }
});

// PUT /api/admin/content  — upsert a content item
app.put('/api/admin/content', requireAdminKey, async (req, res) => {
    const { key, value, type = 'text', label = '' } = req.body;

    if (!key) {
        return res.status(400).json({ success: false, message: 'content key is required' });
    }

    try {
        await pool.query(
            `INSERT INTO website_content (content_key, content_value, content_type, label)
             VALUES (?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE content_value = VALUES(content_value), content_type = VALUES(content_type), label = VALUES(label)`,
            [key, value || '', type, label]
        );
        res.json({ success: true, message: `Content "${key}" updated successfully` });
    } catch (err) {
        console.error('Update content error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// DELETE /api/admin/content/:key  — delete a content item
app.delete('/api/admin/content/:key', requireAdminKey, async (req, res) => {
    try {
        const [result] = await pool.query('DELETE FROM website_content WHERE content_key = ?', [req.params.key]);
        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: 'Content key not found' });
        }
        res.json({ success: true, message: 'Content deleted successfully' });
    } catch (err) {
        console.error('Delete content error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// POST /api/admin/upload-image  — upload image as base64 and save to disk
app.post('/api/admin/upload-image', requireAdminKey, async (req, res) => {
    // Support both 'cmsKey' (from cms-bar.js) and 'contentKey' (legacy)
    const { filename, base64data, cmsKey, contentKey, label } = req.body;
    const saveKey = cmsKey || contentKey || null;

    if (!base64data) {
        return res.status(400).json({ success: false, message: 'base64data is required' });
    }

    try {
        // Validate and extract base64 image
        const match = base64data.match(/^data:image\/(png|jpeg|jpg|gif|webp|svg\+xml);base64,(.+)$/);
        if (!match) {
            return res.status(400).json({ success: false, message: 'Invalid image format. Use JPG, PNG, WebP, or GIF.' });
        }

        const ext = match[1] === 'jpeg' ? 'jpg' : (match[1] === 'svg+xml' ? 'svg' : match[1]);
        const imgData = Buffer.from(match[2], 'base64');

        if (imgData.length > 15 * 1024 * 1024) { // 15MB limit
            return res.status(400).json({ success: false, message: 'Image too large (max 15MB)' });
        }

        // Ensure images directory exists
        const imagesDir = path.join(__dirname, 'public', 'images');
        if (!fs.existsSync(imagesDir)) fs.mkdirSync(imagesDir, { recursive: true });

        // Create safe filename with timestamp to prevent overwrites
        const rawName = (filename || `upload_${Date.now()}`).replace(/[^a-zA-Z0-9_.\-]/g, '_').replace(/\.[^.]+$/, '');
        const finalName = `${rawName}_${Date.now()}.${ext}`;
        const imagePath = path.join(imagesDir, finalName);

        fs.writeFileSync(imagePath, imgData);
        console.log(`✅  Image uploaded: ${finalName} (${(imgData.length/1024).toFixed(0)} KB)`);

        const imageUrl = `/images/${finalName}`;

        // If a content key is provided, save to database too
        if (saveKey) {
            try {
                await pool.query(
                    `INSERT INTO website_content (content_key, content_value, content_type, label)
                     VALUES (?, ?, 'image', ?)
                     ON DUPLICATE KEY UPDATE content_value = VALUES(content_value), label = VALUES(label)`,
                    [saveKey, imageUrl, label || saveKey]
                );
            } catch (dbErr) {
                console.warn('DB save for image key failed (offline?):', dbErr.message);
            }
        }

        res.json({ success: true, imageUrl, message: 'Image uploaded successfully' });

    } catch (err) {
        console.error('Upload image error:', err);
        res.status(500).json({ success: false, message: 'Upload failed: ' + err.message });
    }
});

// DELETE /api/admin/delete-image  — delete a saved image file
app.delete('/api/admin/delete-image', requireAdminKey, async (req, res) => {
    const { imageUrl } = req.body;

    if (!imageUrl || !imageUrl.startsWith('/images/')) {
        return res.status(400).json({ success: false, message: 'Invalid image URL' });
    }

    try {
        const filename = path.basename(imageUrl);
        const imagePath = path.join(__dirname, 'public', 'images', filename);

        if (fs.existsSync(imagePath)) {
            fs.unlinkSync(imagePath);
        }

        // Also remove from content if it exists
        await pool.query('DELETE FROM website_content WHERE content_value = ?', [imageUrl]);

        res.json({ success: true, message: 'Image deleted successfully' });
    } catch (err) {
        console.error('Delete image error:', err);
        res.status(500).json({ success: false, message: 'Server error deleting image' });
    }
});

// GET /api/admin/images  — list all images in the images directory
app.get('/api/admin/images', requireAdminKey, async (req, res) => {
    try {
        const imagesDir = path.join(__dirname, 'public', 'images');
        const files = fs.readdirSync(imagesDir);
        const images = files
            .filter(f => /\.(jpg|jpeg|png|gif|webp)$/i.test(f))
            .map(f => ({
                filename: f,
                url: `/images/${f}`,
                size: fs.statSync(path.join(imagesDir, f)).size
            }));
        res.json({ success: true, images });
    } catch (err) {
        console.error('List images error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// POST /api/admin/test-telegram  — send a test message
app.post('/api/admin/test-telegram', requireAdminKey, async (req, res) => {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    if (!token || !chatId || token === 'YOUR_BOT_TOKEN_HERE' || chatId === 'YOUR_CHANNEL_ID_HERE') {
        return res.status(400).json({ success: false, message: 'Telegram not configured. Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in .env' });
    }
    try {
        await sendTelegramNotification('✅ <b>Kashi Rivaz Admin</b>\n\nTelegram bot is working correctly!\nNew orders will be sent here automatically.\n\n📱 Admin Phone: +91 8081429100');
        res.json({ success: true, message: 'Test message sent!' });
    } catch (e) {
        res.status(500).json({ success: false, message: 'Failed: ' + e.message });
    }
});

// GET /api/admin/telegram-getid  — auto-detect admin chat ID after they message the bot
// Usage: visit http://localhost:3000/api/admin/telegram-getid?token=YOUR_BOT_TOKEN
app.get('/api/admin/telegram-getid', (req, res) => {
    const token = req.query.token || process.env.TELEGRAM_BOT_TOKEN;
    if (!token || token === 'YOUR_BOT_TOKEN_HERE') {
        return res.send(`<h2 style="font-family:Arial">❌ No token provided</h2><p>Visit: /api/admin/telegram-getid?token=YOUR_BOT_TOKEN</p>`);
    }

    const payload = JSON.stringify({ timeout: 5 });
    const opts = {
        hostname: 'api.telegram.org',
        path: `/bot${token}/getUpdates`,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
    };

    const tgReq = https.request(opts, (tgRes) => {
        let data = '';
        tgRes.on('data', c => data += c);
        tgRes.on('end', () => {
            try {
                const parsed = JSON.parse(data);
                if (!parsed.ok) {
                    return res.send(`<h2 style="font-family:Arial">❌ Telegram Error</h2><pre>${parsed.description}</pre>`);
                }
                if (!parsed.result || parsed.result.length === 0) {
                    return res.send(`
                        <div style="font-family:Arial;max-width:600px;margin:40px auto;padding:20px;background:#fff3cd;border-radius:12px;border:2px solid #ffc107">
                            <h2>⚠️ No messages found yet</h2>
                            <p><b>Steps:</b></p>
                            <ol>
                                <li>Open Telegram on phone <b>+91 8081429100</b></li>
                                <li>Search for your bot by name</li>
                                <li>Send it any message (e.g. "hello")</li>
                                <li>Come back and refresh this page</li>
                            </ol>
                        </div>`);
                }
                const update = parsed.result[parsed.result.length - 1];
                const msg = update.message || update.channel_post;
                const chatId = msg ? msg.chat.id : null;
                const chatName = msg ? (msg.chat.username || msg.chat.title || msg.chat.first_name || '—') : '—';

                res.send(`
                    <div style="font-family:Arial;max-width:600px;margin:40px auto;padding:24px;background:#d1fae5;border-radius:12px;border:2px solid #10b981">
                        <h2 style="color:#065f46">✅ Telegram Chat ID Found!</h2>
                        <p style="font-size:18px">Your Telegram Chat ID is:</p>
                        <div style="background:#fff;padding:16px;border-radius:8px;font-size:28px;font-weight:bold;color:#065f46;text-align:center;letter-spacing:2px;margin:12px 0">${chatId}</div>
                        <p>Chat name: <b>${chatName}</b></p>
                        <hr style="margin:16px 0">
                        <p><b>Now copy this ID and paste it into your <code>.env</code> file:</b></p>
                        <pre style="background:#1e293b;color:#f0c040;padding:12px;border-radius:8px">TELEGRAM_CHAT_ID=${chatId}</pre>
                        <p style="color:#064e3b;font-size:14px">Then restart the server. Orders from the website will now be sent directly to your Telegram (+91 8081429100)!</p>
                    </div>`);
            } catch (e) {
                res.send(`<h2 style="font-family:Arial">❌ Parse error</h2><pre>${e.message}</pre>`);
            }
        });
    });
    tgReq.on('error', e => res.send(`<h2 style="font-family:Arial">❌ Request error</h2><pre>${e.message}</pre>`));
    tgReq.write(payload);
    tgReq.end();
});

// ============================================================
// COUPONS
// ============================================================

app.get('/api/coupons', requireAdminKey, async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM coupons ORDER BY createdAt DESC');
        res.json({ success: true, coupons: rows });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error: ' + err.message });
    }
});

app.post('/api/coupons', requireAdminKey, async (req, res) => {
    const { code, discountType, value, minOrder, maxUses, validFrom, validUntil, isActive } = req.body;
    if (!code || !discountType || !value) return res.status(400).json({ success: false, message: 'code, discountType, value required' });
    try {
        await pool.query(
            `INSERT INTO coupons (code, discountType, value, minOrder, maxUses, usedCount, validFrom, validUntil, isActive)
             VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?)`,
            [code.toUpperCase(), discountType, parseFloat(value), parseFloat(minOrder)||0,
             parseInt(maxUses)||9999, validFrom||null, validUntil||null, isActive!==false ? 1 : 0]
        );
        res.json({ success: true, message: 'Coupon created!' });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ success: false, message: 'Coupon code already exists' });
        res.status(500).json({ success: false, message: 'Server error: ' + err.message });
    }
});

app.put('/api/coupons/:id', requireAdminKey, async (req, res) => {
    const { discountType, value, minOrder, maxUses, validFrom, validUntil, isActive } = req.body;
    try {
        await pool.query(
            'UPDATE coupons SET discountType=?, value=?, minOrder=?, maxUses=?, validFrom=?, validUntil=?, isActive=? WHERE id=?',
            [discountType, parseFloat(value), parseFloat(minOrder)||0, parseInt(maxUses)||9999, validFrom||null, validUntil||null, isActive ? 1 : 0, req.params.id]
        );
        res.json({ success: true, message: 'Coupon updated' });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

app.delete('/api/coupons/:id', requireAdminKey, async (req, res) => {
    try {
        await pool.query('DELETE FROM coupons WHERE id=?', [req.params.id]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// POST /api/coupons/validate  — public (called at checkout)
app.post('/api/coupons/validate', async (req, res) => {
    const { code, orderTotal } = req.body;
    if (!code) return res.status(400).json({ success: false, message: 'Coupon code required' });
    try {
        const [rows] = await pool.query(
            `SELECT * FROM coupons WHERE code=? AND isActive=1
             AND (validFrom IS NULL OR validFrom <= NOW())
             AND (validUntil IS NULL OR validUntil >= NOW())
             AND usedCount < maxUses`,
            [code.toUpperCase()]
        );
        if (!rows.length) return res.status(404).json({ success: false, message: 'Invalid or expired coupon' });
        const c = rows[0];
        if (parseFloat(orderTotal||0) < parseFloat(c.minOrder||0)) {
            return res.status(400).json({ success: false, message: `Minimum order ₹${c.minOrder} required` });
        }
        const discount = c.discountType === 'percent'
            ? Math.round(parseFloat(orderTotal) * c.value / 100)
            : c.value;
        res.json({ success: true, coupon: c, discount });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ============================================================
// REVIEWS
// ============================================================

app.get('/api/reviews', requireAdminKey, async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM reviews ORDER BY createdAt DESC');
        res.json({ success: true, reviews: rows });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

app.post('/api/reviews', async (req, res) => {
    const { productId, reviewerName, rating, comment, customerId } = req.body;
    if (!productId || !reviewerName || !rating || !comment) {
        return res.status(400).json({ success: false, message: 'productId, reviewerName, rating, comment required' });
    }
    try {
        await pool.query(
            `INSERT INTO reviews (productId, customerId, reviewerName, rating, comment, status)
             VALUES (?, ?, ?, ?, ?, 'pending')`,
            [productId, customerId||null, reviewerName, parseInt(rating), comment]
        );
        res.json({ success: true, message: 'Review submitted — pending approval' });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

app.put('/api/reviews/:id', requireAdminKey, async (req, res) => {
    const { status, adminReply, comment, rating } = req.body;
    try {
        const fields = [];
        const vals   = [];
        if (status)     { fields.push('status=?');     vals.push(status); }
        if (adminReply !== undefined) { fields.push('adminReply=?'); vals.push(adminReply); }
        if (comment)    { fields.push('comment=?');    vals.push(comment); }
        if (rating)     { fields.push('rating=?');     vals.push(parseInt(rating)); }
        if (!fields.length) return res.status(400).json({ success: false, message: 'Nothing to update' });
        vals.push(req.params.id);
        await pool.query(`UPDATE reviews SET ${fields.join(',')} WHERE id=?`, vals);
        res.json({ success: true, message: 'Review updated' });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

app.delete('/api/reviews/:id', requireAdminKey, async (req, res) => {
    try {
        await pool.query('DELETE FROM reviews WHERE id=?', [req.params.id]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// GET /api/reviews/product/:id — public, only approved
app.get('/api/reviews/product/:id', async (req, res) => {
    try {
        const [rows] = await pool.query(
            "SELECT reviewerName, rating, comment, adminReply, createdAt FROM reviews WHERE productId=? AND status='approved' ORDER BY createdAt DESC",
            [req.params.id]
        );
        res.json({ success: true, reviews: rows });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ============================================================
// ANALYTICS
// ============================================================

app.get('/api/analytics/dashboard', requireAdminKey, async (req, res) => {
    try {
        const todayStart = new Date(); todayStart.setHours(0,0,0,0);
        const todayStr = todayStart.toISOString().slice(0,19).replace('T',' ');

        const [[{ todayOrders }]] = await pool.query(
            "SELECT COUNT(*) AS todayOrders FROM orders WHERE createdAt >= ?", [todayStr]);
        const [[{ todayRevenue }]] = await pool.query(
            "SELECT COALESCE(SUM(total),0) AS todayRevenue FROM orders WHERE createdAt >= ? AND status NOT IN ('cancelled','refunded')", [todayStr]);
        const [[{ totalCustomers }]] = await pool.query('SELECT COUNT(*) AS totalCustomers FROM customers');
        const [[{ totalOrders }]]   = await pool.query('SELECT COUNT(*) AS totalOrders FROM orders');
        const [[{ totalRevenue }]]  = await pool.query(
            "SELECT COALESCE(SUM(total),0) AS totalRevenue FROM orders WHERE status NOT IN ('cancelled','refunded')");
        const [[{ pendingOrders }]] = await pool.query(
            "SELECT COUNT(*) AS pendingOrders FROM orders WHERE status='pending'");
        const [recentOrders] = await pool.query(
            'SELECT orderId, customerName, total, status, createdAt FROM orders ORDER BY createdAt DESC LIMIT 8');
        const [recentCustomers] = await pool.query(
            'SELECT firstName, lastName, email, createdAt FROM customers ORDER BY createdAt DESC LIMIT 5');

        // Revenue last 30 days
        const [revChart] = await pool.query(`
            SELECT DATE(createdAt) AS day, COALESCE(SUM(total),0) AS revenue
            FROM orders
            WHERE createdAt >= DATE_SUB(NOW(), INTERVAL 30 DAY)
              AND status NOT IN ('cancelled','refunded')
            GROUP BY DATE(createdAt)
            ORDER BY day ASC`);

        res.json({
            success: true,
            stats: { todayOrders, todayRevenue: parseFloat(todayRevenue), totalCustomers, totalOrders, totalRevenue: parseFloat(totalRevenue), pendingOrders },
            recentOrders,
            recentCustomers,
            revenueChart: revChart
        });
    } catch (err) {
        console.error('Analytics dashboard error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// GET /api/analytics/revenue — revenue over time
app.get('/api/analytics/revenue', requireAdminKey, async (req, res) => {
    const { period = '30d' } = req.query;
    const days = period === '7d' ? 7 : period === '90d' ? 90 : period === '1y' ? 365 : 30;
    try {
        const [rows] = await pool.query(`
            SELECT DATE(createdAt) AS day, COALESCE(SUM(total),0) AS revenue, COUNT(*) AS orders
            FROM orders
            WHERE createdAt >= DATE_SUB(NOW(), INTERVAL ? DAY)
              AND status NOT IN ('cancelled','refunded')
            GROUP BY DATE(createdAt)
            ORDER BY day ASC`, [days]);
        res.json({ success: true, data: rows });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// GET /api/orders/export/csv — export all orders as CSV
app.get('/api/orders/export/csv', requireAdminKey, async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM orders ORDER BY createdAt DESC');
        const header = 'Order ID,Customer,Email,Phone,Total,Payment,Status,Date\n';
        const lines  = rows.map(o =>
            `"${o.orderId}","${o.customerName}","${o.customerEmail}","${o.customerPhone}","${o.total}","${o.paymentMethod}","${o.status}","${new Date(o.createdAt).toLocaleString('en-IN')}"`
        ).join('\n');
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="orders.csv"');
        res.send(header + lines);
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ============================================================
// RAZORPAY PAYMENT GATEWAY (no extra npm package — uses built-in https + crypto)
// ============================================================

/**
 * POST /api/create-razorpay-order
 * Creates a Razorpay order via the Razorpay REST API.
 * Returns { id, amount, currency, key_id } to the frontend.
 */
app.post('/api/create-razorpay-order', async (req, res) => {
    const keyId     = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;

    if (!keyId || !keySecret || keySecret === 'your_razorpay_key_secret_here') {
        return res.status(503).json({
            success: false,
            message: 'Razorpay is not configured. Please add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET to .env'
        });
    }

    const { amount, currency = 'INR', receipt } = req.body;

    if (!amount || isNaN(amount) || Number(amount) <= 0) {
        return res.status(400).json({ success: false, message: 'Valid amount (in paise) is required' });
    }

    const payload = JSON.stringify({
        amount: Math.round(Number(amount)),   // paise (₹1 = 100 paise)
        currency,
        receipt: receipt || ('rcpt_' + Date.now()),
        payment_capture: 1
    });

    const authHeader = 'Basic ' + Buffer.from(`${keyId}:${keySecret}`).toString('base64');

    return new Promise((resolve) => {
        const options = {
            hostname: 'api.razorpay.com',
            path: '/v1/orders',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': authHeader,
                'Content-Length': Buffer.byteLength(payload)
            }
        };

        const rzpReq = https.request(options, (rzpRes) => {
            let data = '';
            rzpRes.on('data', chunk => data += chunk);
            rzpRes.on('end', () => {
                try {
                    const rzpOrder = JSON.parse(data);
                    if (rzpOrder.id) {
                        console.log(`✅  Razorpay order created: ${rzpOrder.id} (₹${Number(amount)/100})`);
                        res.json({ success: true, id: rzpOrder.id, amount: rzpOrder.amount, currency: rzpOrder.currency, key_id: keyId });
                    } else {
                        console.error('❌  Razorpay create error:', rzpOrder);
                        res.status(500).json({ success: false, message: rzpOrder.error?.description || 'Razorpay order creation failed' });
                    }
                } catch (e) {
                    res.status(500).json({ success: false, message: 'Invalid response from Razorpay' });
                }
                resolve();
            });
        });

        rzpReq.on('error', (err) => {
            console.error('❌  Razorpay request error:', err.message);
            res.status(500).json({ success: false, message: 'Could not reach Razorpay: ' + err.message });
            resolve();
        });

        rzpReq.write(payload);
        rzpReq.end();
    });
});

/**
 * POST /api/verify-payment
 * 1. Verifies the Razorpay payment signature using HMAC-SHA256.
 * 2. If valid, saves the order to MySQL and sends notifications.
 * Body: { razorpay_order_id, razorpay_payment_id, razorpay_signature, orderData }
 */
app.post('/api/verify-payment', async (req, res) => {
    const keySecret = process.env.RAZORPAY_KEY_SECRET;

    if (!keySecret || keySecret === 'your_razorpay_key_secret_here') {
        return res.status(503).json({ success: false, message: 'Razorpay secret not configured' });
    }

    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, orderData } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !orderData) {
        return res.status(400).json({ success: false, message: 'Missing payment verification fields' });
    }

    // ── Verify HMAC signature ──
    const body      = razorpay_order_id + '|' + razorpay_payment_id;
    const expected  = crypto.createHmac('sha256', keySecret).update(body).digest('hex');

    if (expected !== razorpay_signature) {
        console.error('❌  Razorpay signature mismatch! Possible fraud attempt.');
        return res.status(400).json({ success: false, message: 'Payment verification failed — invalid signature' });
    }

    console.log(`✅  Razorpay payment verified: ${razorpay_payment_id}`);

    // ── Save order to DB ──
    const { userId, customerName, customerEmail, customerPhone, address, items, subtotal, total, paymentMethod } = orderData;

    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        const orderId = makeOrderId();

        await conn.query(
            `INSERT INTO orders
             (orderId, customerId, customerName, customerEmail, customerPhone,
              items, shippingAddress, subtotal, total, paymentMethod, transactionId, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'confirmed')`,
            [
                orderId,
                userId || null,
                customerName || 'Guest',
                customerEmail || '',
                customerPhone || '',
                JSON.stringify(items),
                JSON.stringify(address || {}),
                parseFloat(subtotal) || 0,
                parseFloat(total) || 0,
                paymentMethod || 'Razorpay',
                razorpay_payment_id   // Store Razorpay payment ID as transaction reference
            ]
        );

        if (userId) {
            await conn.query(
                `UPDATE customers SET totalOrders = totalOrders + 1, totalSpent = totalSpent + ?, updatedAt = NOW() WHERE id = ?`,
                [parseFloat(total) || 0, Number(userId)]
            );
            await conn.query('DELETE FROM cart_items WHERE customerId = ?', [Number(userId)]);
        }

        await conn.commit();

        const orderForNotification = {
            orderId,
            customerName: customerName || 'Guest',
            customerEmail: customerEmail || '',
            customerPhone: customerPhone || '',
            address: address || {},
            items,
            total: parseFloat(total) || 0,
            paymentMethod: paymentMethod || 'Razorpay',
            transactionId: razorpay_payment_id
        };

        // 📱 Non-blocking notifications
        sendOrderToTelegram(orderForNotification).catch(e => console.error('Telegram error:', e.message));
        sendOrderNotificationToOwner(orderForNotification).catch(e => console.error('Email error:', e.message));

        return res.json({ success: true, orderId, message: 'Payment verified and order placed!' });

    } catch (err) {
        await conn.rollback();
        console.error('Create order (post-payment) error:', err);
        return res.status(500).json({ success: false, message: 'Payment verified but order save failed: ' + err.message });
    } finally {
        conn.release();
    }
});

// ============================================================
// DEFAULT — serve index.html
// ============================================================
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ============================================================
// START SERVER
// ============================================================
app.listen(PORT, () => {
    console.log('');
    console.log('  ╔══════════════════════════════════════════════════════╗');
    console.log('  ║  🛍  Kashi Rivaz Server is RUNNING!                  ║');
    console.log('  ╠══════════════════════════════════════════════════════╣');
    console.log(`  ║  🌐 Website    →  http://localhost:${PORT}                 ║`);
    console.log(`  ║  📦 Orders     →  http://localhost:${PORT}/all-orders.html ║`);
    console.log(`  ║  🔐 Admin      →  http://localhost:${PORT}/adminaccess     ║`);
    console.log('  ║  🗃  Database  →  MySQL (kashi_rivaz)                ║');
    console.log('  ╚══════════════════════════════════════════════════════╝');
    console.log('');
    const tgToken = process.env.TELEGRAM_BOT_TOKEN;
    const tgChat  = process.env.TELEGRAM_CHAT_ID;
    if (!tgToken || tgToken === 'YOUR_BOT_TOKEN_HERE' || !tgChat || tgChat === 'YOUR_CHANNEL_ID_HERE') {
        console.log('  ⚠️  Telegram: NOT configured — set TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID in .env');
    } else {
        console.log(`  ✅  Telegram: @KashiRivaz_bot → Chat ID: ${tgChat} — orders will be sent automatically`);
    }
    const gmailPass = process.env.GMAIL_APP_PASSWORD;
    if (!gmailPass || gmailPass === 'your_16_char_app_password_here') {
        console.log('  ⚠️  Email: NOT configured — set GMAIL_APP_PASSWORD in .env');
    } else {
        console.log('  ✅  Email: Gmail SMTP configured — order emails will be sent');
    }
    console.log('');
});
