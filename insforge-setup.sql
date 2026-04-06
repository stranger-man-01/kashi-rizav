-- ============================================================
-- KASHI RIVAZ — InsForge PostgreSQL Database Setup
-- Platform: InsForge (https://insforge.dev)
-- Engine:   PostgreSQL (UTF-8)
--
-- Tables:
--   1. users                — registered customer accounts
--   2. login_sessions        — auth / session tracking
--   3. user_addresses        — saved delivery addresses per user
--   4. products              — product catalogue
--   5. cart_items            — shopping cart (per user)
--   6. orders                — placed orders
--   7. order_items           — individual line-items inside each order
--   8. delivery_tracking     — shipment / delivery status per order
--
-- Run once after creating your InsForge project and connecting
-- its PostgreSQL database URL to this file.
-- ============================================================


-- ─────────────────────────────────────────────────────────────
-- 1. USERS  (registered customer accounts)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
    id              SERIAL          PRIMARY KEY,
    first_name      VARCHAR(100)    NOT NULL,
    last_name       VARCHAR(100)    NOT NULL,
    email           VARCHAR(255)    NOT NULL UNIQUE,
    password_hash   VARCHAR(255)    NOT NULL,          -- bcrypt / argon2 hash; NEVER plain text
    phone           VARCHAR(20)     DEFAULT '',
    avatar_url      VARCHAR(500)    DEFAULT '',        -- profile picture URL (optional)
    role            VARCHAR(20)     NOT NULL DEFAULT 'customer',  -- 'customer' | 'admin'
    is_verified     BOOLEAN         NOT NULL DEFAULT FALSE,
    is_active       BOOLEAN         NOT NULL DEFAULT TRUE,
    total_orders    INTEGER         NOT NULL DEFAULT 0,
    total_spent     NUMERIC(14,2)   NOT NULL DEFAULT 0.00,
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

-- Fast look-up by email on every login
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);


-- ─────────────────────────────────────────────────────────────
-- 2. LOGIN SESSIONS  (token-based auth logs)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS login_sessions (
    id              SERIAL          PRIMARY KEY,
    user_id         INTEGER         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_token   VARCHAR(512)    NOT NULL UNIQUE,   -- JWT or random UUID stored here
    ip_address      VARCHAR(45)     DEFAULT '',        -- IPv4 / IPv6
    user_agent      TEXT            DEFAULT '',
    is_active       BOOLEAN         NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    expires_at      TIMESTAMPTZ     NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
    revoked_at      TIMESTAMPTZ     DEFAULT NULL       -- set when the session is logged out
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id      ON login_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_token        ON login_sessions(session_token);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at   ON login_sessions(expires_at);


-- ─────────────────────────────────────────────────────────────
-- 3. USER ADDRESSES  (saved delivery addresses per user)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_addresses (
    id              SERIAL          PRIMARY KEY,
    user_id         INTEGER         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    label           VARCHAR(50)     DEFAULT 'Home',    -- 'Home' | 'Work' | 'Other'
    full_name       VARCHAR(200)    NOT NULL,
    phone           VARCHAR(20)     DEFAULT '',
    address_line1   VARCHAR(300)    NOT NULL,
    address_line2   VARCHAR(300)    DEFAULT '',
    city            VARCHAR(100)    NOT NULL,
    state           VARCHAR(100)    DEFAULT '',
    postal_code     VARCHAR(20)     NOT NULL,
    country         VARCHAR(100)    NOT NULL DEFAULT 'India',
    is_default      BOOLEAN         NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_addresses_user_id ON user_addresses(user_id);


-- ─────────────────────────────────────────────────────────────
-- 4. PRODUCTS  (website product catalogue)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS products (
    id              SERIAL          PRIMARY KEY,
    name            VARCHAR(300)    NOT NULL,
    slug            VARCHAR(300)    NOT NULL UNIQUE,   -- URL-friendly identifier
    description     TEXT            DEFAULT '',
    category        VARCHAR(100)    NOT NULL DEFAULT 'saree',  -- 'saree' | 'suit' | etc.
    sub_category    VARCHAR(100)    DEFAULT '',
    price           NUMERIC(12,2)   NOT NULL DEFAULT 0.00,
    original_price  NUMERIC(12,2)   DEFAULT 0.00,      -- before discount
    stock           INTEGER         NOT NULL DEFAULT 0,
    sku             VARCHAR(100)    DEFAULT '',
    image_url       VARCHAR(500)    DEFAULT '',
    images          JSONB           DEFAULT '[]',      -- array of additional image URLs
    tags            JSONB           DEFAULT '[]',      -- e.g. ["new","bestseller","discount"]
    is_active       BOOLEAN         NOT NULL DEFAULT TRUE,
    is_featured     BOOLEAN         NOT NULL DEFAULT FALSE,
    rating          NUMERIC(3,2)    DEFAULT 0.00,
    review_count    INTEGER         DEFAULT 0,
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_products_category   ON products(category);
CREATE INDEX IF NOT EXISTS idx_products_is_active  ON products(is_active);
CREATE INDEX IF NOT EXISTS idx_products_slug       ON products(slug);


-- ─────────────────────────────────────────────────────────────
-- 5. CART ITEMS  (shopping cart — one row per user+product)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cart_items (
    id              SERIAL          PRIMARY KEY,
    user_id         INTEGER         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    product_id      INTEGER         NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    product_name    VARCHAR(300)    NOT NULL,
    product_image   VARCHAR(500)    DEFAULT '',
    price           NUMERIC(12,2)   NOT NULL DEFAULT 0.00,  -- price locked at time of add
    quantity        INTEGER         NOT NULL DEFAULT 1,
    added_at        TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, product_id)                           -- one row per product per user
);

CREATE INDEX IF NOT EXISTS idx_cart_user_id ON cart_items(user_id);


-- ─────────────────────────────────────────────────────────────
-- 6. ORDERS  (placed orders — header / summary)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS orders (
    id                  SERIAL          PRIMARY KEY,
    order_ref           VARCHAR(60)     NOT NULL UNIQUE,    -- e.g. "ORD-1714900000000-42"
    user_id             INTEGER         REFERENCES users(id) ON DELETE SET NULL,
    -- Snapshot of customer details at order-time (guest-friendly)
    customer_name       VARCHAR(255)    NOT NULL DEFAULT 'Guest',
    customer_email      VARCHAR(255)    DEFAULT '',
    customer_phone      VARCHAR(20)     DEFAULT '',
    -- Address snapshot (JSON so no FK required; always stored even when user updates address later)
    shipping_address    JSONB           NOT NULL DEFAULT '{}',
    billing_address     JSONB           DEFAULT NULL,
    -- Financials
    subtotal            NUMERIC(14,2)   NOT NULL DEFAULT 0.00,
    shipping_charge     NUMERIC(10,2)   NOT NULL DEFAULT 0.00,
    discount_amount     NUMERIC(10,2)   NOT NULL DEFAULT 0.00,
    total               NUMERIC(14,2)   NOT NULL DEFAULT 0.00,
    -- Payment
    payment_method      VARCHAR(50)     NOT NULL DEFAULT 'UPI',   -- 'UPI' | 'COD' | 'Card' | 'Net Banking'
    payment_status      VARCHAR(30)     NOT NULL DEFAULT 'pending',  -- 'pending' | 'paid' | 'failed' | 'refunded'
    payment_ref         VARCHAR(200)    DEFAULT '',               -- transaction / UTR reference
    -- Order lifecycle
    order_status        VARCHAR(30)     NOT NULL DEFAULT 'confirmed',
    -- Allowed values: 'pending' | 'confirmed' | 'processing' | 'shipped' | 'out_for_delivery' | 'delivered' | 'cancelled' | 'refunded'
    notes               TEXT            DEFAULT '',
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orders_user_id       ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_order_status  ON orders(order_status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at    ON orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_order_ref     ON orders(order_ref);


-- ─────────────────────────────────────────────────────────────
-- 7. ORDER ITEMS  (line-items inside each order)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS order_items (
    id              SERIAL          PRIMARY KEY,
    order_id        INTEGER         NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id      INTEGER         REFERENCES products(id) ON DELETE SET NULL,
    product_name    VARCHAR(300)    NOT NULL,          -- snapshot — stays correct even if product deleted
    product_image   VARCHAR(500)    DEFAULT '',
    sku             VARCHAR(100)    DEFAULT '',
    unit_price      NUMERIC(12,2)   NOT NULL DEFAULT 0.00,
    quantity        INTEGER         NOT NULL DEFAULT 1,
    line_total      NUMERIC(14,2)   GENERATED ALWAYS AS (unit_price * quantity) STORED,
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);


-- ─────────────────────────────────────────────────────────────
-- 8. DELIVERY TRACKING  (shipment status per order)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS delivery_tracking (
    id                  SERIAL          PRIMARY KEY,
    order_id            INTEGER         NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    courier_name        VARCHAR(150)    DEFAULT '',        -- e.g. "Delhivery", "DTDC", "Blue Dart"
    tracking_number     VARCHAR(200)    DEFAULT '',        -- AWB / consignment number
    tracking_url        VARCHAR(500)    DEFAULT '',        -- courier tracking link
    dispatch_date       DATE            DEFAULT NULL,
    estimated_delivery  DATE            DEFAULT NULL,
    actual_delivery     DATE            DEFAULT NULL,
    -- Delivery status progression
    current_status      VARCHAR(50)     NOT NULL DEFAULT 'processing',
    -- Allowed values: 'processing' | 'packed' | 'dispatched' | 'in_transit'
    --                 | 'out_for_delivery' | 'delivered' | 'failed_delivery' | 'returned'
    delivery_notes      TEXT            DEFAULT '',
    -- Full event log (array of {timestamp, location, event} objects)
    tracking_events     JSONB           DEFAULT '[]',
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_delivery_order_id    ON delivery_tracking(order_id);
CREATE INDEX IF NOT EXISTS idx_delivery_tracking_no ON delivery_tracking(tracking_number);


-- ─────────────────────────────────────────────────────────────
-- AUTO-UPDATE TRIGGERS  (keep updated_at fresh automatically)
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to every table that has an updated_at column
DO $$
DECLARE
    tbl TEXT;
BEGIN
    FOREACH tbl IN ARRAY ARRAY[
        'users',
        'user_addresses',
        'products',
        'cart_items',
        'orders',
        'delivery_tracking'
    ]
    LOOP
        EXECUTE format(
            'DROP TRIGGER IF EXISTS trg_%s_updated_at ON %I;
             CREATE TRIGGER trg_%s_updated_at
             BEFORE UPDATE ON %I
             FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();',
            tbl, tbl, tbl, tbl
        );
    END LOOP;
END;
$$;


-- ─────────────────────────────────────────────────────────────
-- SAMPLE SEED DATA  (safe to delete in production)
-- ─────────────────────────────────────────────────────────────

-- Admin user (password: Admin@123 — CHANGE BEFORE GOING LIVE)
INSERT INTO users (first_name, last_name, email, password_hash, role, is_verified, is_active)
VALUES (
    'Kashi', 'Admin',
    'admin@kashirivaz.com',
    '$2b$10$PLACEHOLDER_CHANGE_THIS_HASH_NOW',   -- replace with real bcrypt hash
    'admin', TRUE, TRUE
)
ON CONFLICT (email) DO NOTHING;

-- Done
SELECT 'InsForge / Kashi Rivaz PostgreSQL setup complete!' AS status;
