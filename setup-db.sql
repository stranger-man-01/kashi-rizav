-- ============================================================
-- Kashi Rivaz — MySQL Database Setup Script
-- Run once: mysql -u root -p < setup-db.sql
-- ============================================================

CREATE DATABASE IF NOT EXISTS kashi_rivaz CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE kashi_rivaz;

-- ─── Customers ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS customers (
    id            INT           NOT NULL AUTO_INCREMENT PRIMARY KEY,
    firstName     VARCHAR(100)  NOT NULL,
    lastName      VARCHAR(100)  NOT NULL,
    email         VARCHAR(255)  NOT NULL UNIQUE,
    password      VARCHAR(255)  NOT NULL,
    phone         VARCHAR(20)   DEFAULT '',
    address       VARCHAR(500)  DEFAULT '',
    city          VARCHAR(100)  DEFAULT '',
    postalCode    VARCHAR(20)   DEFAULT '',
    totalOrders   INT           DEFAULT 0,
    totalSpent    DECIMAL(12,2) DEFAULT 0.00,
    createdAt     DATETIME      DEFAULT CURRENT_TIMESTAMP,
    updatedAt     DATETIME      DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- ─── Cart Items ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cart_items (
    id          INT           NOT NULL AUTO_INCREMENT PRIMARY KEY,
    customerId  INT           NOT NULL,
    productId   INT           NOT NULL,
    name        VARCHAR(255)  NOT NULL,
    price       DECIMAL(10,2) NOT NULL DEFAULT 0,
    image       VARCHAR(255)  DEFAULT '',
    quantity    INT           NOT NULL DEFAULT 1,
    addedAt     DATETIME      DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (customerId) REFERENCES customers(id) ON DELETE CASCADE,
    UNIQUE KEY uq_customer_product (customerId, productId)
);

-- ─── Orders ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS orders (
    id              INT           NOT NULL AUTO_INCREMENT PRIMARY KEY,
    orderId         VARCHAR(50)   NOT NULL UNIQUE,
    customerId      INT           DEFAULT NULL,
    customerName    VARCHAR(255)  NOT NULL DEFAULT 'Guest',
    customerEmail   VARCHAR(255)  DEFAULT '',
    customerPhone   VARCHAR(20)   DEFAULT '',
    items           JSON          NOT NULL,
    shippingAddress JSON          DEFAULT NULL,
    subtotal        DECIMAL(12,2) DEFAULT 0.00,
    total           DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    paymentMethod   VARCHAR(50)   DEFAULT 'UPI',
    transactionId   VARCHAR(100)  DEFAULT '',
    status          ENUM('pending','confirmed','shipped','delivered','cancelled','refunded')
                                  NOT NULL DEFAULT 'pending',
    createdAt       DATETIME      DEFAULT CURRENT_TIMESTAMP,
    updatedAt       DATETIME      DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (customerId) REFERENCES customers(id) ON DELETE SET NULL
);

-- ─── Add transactionId to existing databases (safe migration) ────────
-- Run this if your database was created before transactionId was added:
ALTER TABLE orders ADD COLUMN IF NOT EXISTS transactionId VARCHAR(100) DEFAULT '' AFTER paymentMethod;

-- ─── Indexes for fast lookups ─────────────────────────────────
CREATE INDEX idx_orders_customerId ON orders(customerId);
CREATE INDEX idx_orders_status     ON orders(status);
CREATE INDEX idx_cart_customerId   ON cart_items(customerId);

-- ─── Done ─────────────────────────────────────────────────────
SELECT 'Kashi Rivaz database setup complete!' AS Message;
