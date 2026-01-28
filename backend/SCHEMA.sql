-- 1. CLEANUP (Optional: Only run if resetting DB)
DROP TABLE IF EXISTS order_items CASCADE;
DROP TABLE IF EXISTS orders CASCADE;
DROP TABLE IF EXISTS restaurant_tables CASCADE;
DROP TABLE IF EXISTS items CASCADE;
DROP TABLE IF EXISTS categories CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- 2. USERS (Waiters, Managers)
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL CHECK (role IN ('admin', 'manager', 'waiter')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. CATEGORIES (For Menu Grouping)
CREATE TABLE categories (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL
);

-- 4. RESTAURANT TABLES (Floor Map)
CREATE TABLE restaurant_tables (
    id SERIAL PRIMARY KEY,
    table_no VARCHAR(20) UNIQUE NOT NULL,
    is_ac BOOLEAN DEFAULT FALSE,
    status VARCHAR(20) DEFAULT 'empty' CHECK (status IN ('empty', 'occupied')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 5. ITEMS (The Menu - Supports Soft Delete)
CREATE TABLE items (
    id SERIAL PRIMARY KEY,
    item_code VARCHAR(20) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    category VARCHAR(100) NOT NULL, -- Stored as string for redundant quick access
    price_non_ac NUMERIC(10, 2) NOT NULL,
    price_ac NUMERIC(10, 2) NOT NULL,
    is_half_available BOOLEAN DEFAULT FALSE,
    is_jain_available BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE, -- Soft Delete Flag
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 6. ORDERS (Bill Header)
CREATE TABLE orders (
    id SERIAL PRIMARY KEY,
    table_id INTEGER REFERENCES restaurant_tables(id) ON DELETE SET NULL,
    customer_name VARCHAR(100),
    customer_phone VARCHAR(20),
    customer_address TEXT,
    total_amount NUMERIC(10, 2) DEFAULT 0,
    is_paid BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    settled_at TIMESTAMP
);

-- 7. ORDER ITEMS (Bill Lines - The Redundant Table)
CREATE TABLE order_items (
    id SERIAL PRIMARY KEY,
    order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
    item_id INTEGER REFERENCES items(id), -- Links to item, even if soft deleted
    quantity NUMERIC(5, 1) NOT NULL, -- Supports 0.6, 1.0, 2.0
    price_at_time NUMERIC(10, 2) NOT NULL, -- SNAPSHOT: Saves price at the moment of order
    special_instruction TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 8. INDEXES (For Performance)
CREATE INDEX idx_orders_is_paid ON orders(is_paid);
CREATE INDEX idx_orders_created_at ON orders(created_at);
CREATE INDEX idx_items_item_code ON items(item_code);
CREATE INDEX idx_order_items_order_id ON order_items(order_id);

-- 9. INITIAL SEED DATA (Default Admin)
-- Password is 'admin123' (hashed)
INSERT INTO users (username, password_hash, role) 
VALUES ('admin', '$2b$12$7Q/s...HASH_PLACEHOLDER.../u', 'admin');

-- Seed Categories
INSERT INTO categories (name) VALUES 
('Kathiyawadi'), ('Punjabi'), ('Roti'), ('Rice'), ('Dal'), ('Drinks'), ('Other');