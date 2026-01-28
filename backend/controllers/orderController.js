const db = require('../config/db');
const bcrypt = require('bcrypt');
const SALT_ROUNDS = 12;

// --- CENTRALIZED ERROR HANDLER ---
const handleError = (res, err, customMsg = "Server Error") => {
    console.error(`[System Error] ${customMsg} | Timestamp: ${new Date().toISOString()}`);
    console.error(err.message);
    if (err.stack) console.error(err.stack);

    if (err.code === '23505') return res.status(409).json({ message: "Conflict: Record already exists." });
    if (err.code === '23503') return res.status(400).json({ message: "Integrity Error: This record is currently in use/linked." });
    
    // Don't send stack trace to client in production
    res.status(500).json({ message: customMsg, error: err.message });
};

// ==========================================
// TABLE MANAGEMENT
// ==========================================

exports.getTables = async (req, res) => {
    try {
        // Natural sort for table numbers (1, 2, 10 instead of 1, 10, 2)
        const result = await db.query(`
            SELECT rt.*, o.id as active_order_id, o.customer_name, o.created_at
            FROM restaurant_tables rt 
            LEFT JOIN orders o ON rt.id = o.table_id AND o.is_paid = false 
            ORDER BY NULLIF(regexp_replace(rt.table_no, '\\D', '', 'g'), '')::int ASC, rt.table_no
        `);
        res.json(result.rows);
    } catch (err) { handleError(res, err, "Failed to fetch tables"); }
};

exports.addTable = async (req, res) => {
    const { table_no, is_ac } = req.body;
    try {
        await db.query(
            "INSERT INTO restaurant_tables (table_no, is_ac) VALUES ($1, $2)", 
            [table_no, is_ac || false]
        );
        res.json({ success: true });
    } catch (err) { handleError(res, err, "Failed to add table"); }
};

exports.deleteTable = async (req, res) => {
    try {
        // Check if table has active orders
        const check = await db.query("SELECT id FROM orders WHERE table_id = $1 AND is_paid = false", [req.params.id]);
        if (check.rows.length > 0) {
            return res.status(400).json({ message: "Cannot delete: Table is currently occupied." });
        }
        await db.query("DELETE FROM restaurant_tables WHERE id = $1", [req.params.id]);
        res.json({ success: true });
    } catch (err) { handleError(res, err, "Failed to delete table"); }
};

// ==========================================
// CATEGORY MANAGEMENT
// ==========================================

exports.getCategories = async (req, res) => {
    try {
        const r = await db.query("SELECT * FROM categories ORDER BY name ASC");
        res.json(r.rows);
    } catch (err) { handleError(res, err, "Failed to fetch categories"); }
};

exports.addCategory = async (req, res) => {
    try {
        if (!req.body.name) return res.status(400).json({ message: "Category name required" });
        await db.query("INSERT INTO categories (name) VALUES ($1)", [req.body.name]);
        res.json({ success: true });
    } catch (err) { handleError(res, err, "Failed to add category"); }
};

exports.deleteCategory = async (req, res) => {
    try {
        await db.query("DELETE FROM categories WHERE id = $1", [req.params.id]);
        res.json({ success: true });
    } catch (err) { handleError(res, err, "Failed to delete category"); }
};

// ==========================================
// ORDER LOGIC (HIGH CONCURRENCY)
// ==========================================

exports.addItem = async (req, res) => {
    const { table_id, item_code, quantity, special_instruction } = req.body;
    const client = await db.getClient(); // Get dedicated client for transaction
    
    try {
        await client.query('BEGIN');

        // 1. Fetch Item Details
        const itemRes = await client.query('SELECT * FROM items WHERE item_code = $1 AND is_active = true', [item_code]);
        if (itemRes.rows.length === 0) throw new Error("Item not found or inactive");
        const item = itemRes.rows[0];

        // 2. LOCK TABLE ROW (Concurrency Fix)
        // This ensures that if 2 waiters add items to the same table simultaneously, 
        // they are processed one after another, preventing duplicate active orders.
        const tableRes = await client.query('SELECT is_ac, status FROM restaurant_tables WHERE id = $1 FOR UPDATE', [table_id]);
        if (tableRes.rows.length === 0) throw new Error("Table not found");
        
        const price = tableRes.rows[0].is_ac ? item.price_ac : item.price_non_ac;

        // 3. Get or Create Active Order
        let orderId;
        const orderRes = await client.query('SELECT id FROM orders WHERE table_id = $1 AND is_paid = false', [table_id]);
        
        if (orderRes.rows.length > 0) {
            orderId = orderRes.rows[0].id;
        } else {
            const newOrder = await client.query('INSERT INTO orders (table_id) VALUES ($1) RETURNING id', [table_id]);
            orderId = newOrder.rows[0].id;
            // Update table status
            await client.query("UPDATE restaurant_tables SET status = 'occupied' WHERE id = $1", [table_id]);
        }

        // 4. Insert Order Item
        // Note: price_at_time safeguards against future menu price changes affecting old bills
        await client.query(
            `INSERT INTO order_items (order_id, item_id, quantity, price_at_time, special_instruction) 
             VALUES ($1, $2, $3, $4, $5)`, 
            [orderId, item.id, quantity, price, special_instruction || '']
        );

        await client.query('COMMIT');
        res.json({ success: true, orderId });

    } catch (err) {
        await client.query('ROLLBACK');
        handleError(res, err, "Failed to add item");
    } finally {
        client.release(); // CRITICAL: Always release client back to pool
    }
};

exports.getOrderDetails = async (req, res) => {
    try {
        const r = await db.query(`
            SELECT oi.*, i.name, i.item_code 
            FROM order_items oi 
            JOIN items i ON oi.item_id = i.id 
            WHERE oi.order_id = $1 
            ORDER BY oi.id ASC`, 
            [req.params.orderId]
        );
        res.json(r.rows);
    } catch (err) { handleError(res, err, "Failed to fetch order details"); }
};

exports.deleteByCode = async (req, res) => {
    const { table_id, item_code } = req.body;
    try {
        // Find active order for table
        const orderRes = await db.query("SELECT id FROM orders WHERE table_id = $1 AND is_paid = false", [table_id]);
        if (orderRes.rows.length === 0) return res.status(404).json({ message: "No active order found for this table" });
        const orderId = orderRes.rows[0].id;

        // Find item ID
        const itemRes = await db.query("SELECT id FROM items WHERE item_code = $1", [item_code]);
        if (itemRes.rows.length === 0) return res.status(404).json({ message: "Item code not found" });
        const itemId = itemRes.rows[0].id;

        // Delete the *most recent* entry of this item (LIFO logic)
        const deleteRes = await db.query(`
            DELETE FROM order_items 
            WHERE id = (
                SELECT id FROM order_items 
                WHERE order_id = $1 AND item_id = $2 
                ORDER BY id DESC LIMIT 1
            )`, 
            [orderId, itemId]
        );

        if (deleteRes.rowCount === 0) {
            return res.status(404).json({ message: "Item not found in current order" });
        }

        res.json({ success: true });
    } catch (err) { handleError(res, err, "Failed to remove item"); }
};

exports.settleBill = async (req, res) => {
    const { orderId, tableId, customer_name, customer_phone, customer_address } = req.body;
    const client = await db.getClient();
    
    try {
        await client.query('BEGIN');

        // Calculate total strictly from DB to avoid frontend manipulation
        const totalRes = await client.query('SELECT SUM(quantity * price_at_time) as total FROM order_items WHERE order_id = $1', [orderId]);
        const total = totalRes.rows[0].total || 0;

        await client.query(`
            UPDATE orders 
            SET is_paid = true, 
                total_amount = $1, 
                settled_at = NOW(), 
                customer_name = $2, 
                customer_phone = $3, 
                customer_address = $4 
            WHERE id = $5`,
            [total, customer_name, customer_phone, customer_address, orderId]
        );

        // Free up the table
        await client.query("UPDATE restaurant_tables SET status = 'empty' WHERE id = $1", [tableId]);

        await client.query('COMMIT');
        res.json({ success: true });
    } catch (err) {
        await client.query('ROLLBACK');
        handleError(res, err, "Failed to settle bill");
    } finally {
        client.release();
    }
};

// ==========================================
// MENU MANAGEMENT
// ==========================================

exports.getMenu = async (req, res) => {
    try {
        const r = await db.query('SELECT * FROM items WHERE is_active = true ORDER BY category, name');
        res.json(r.rows);
    } catch (err) { handleError(res, err, "Failed to fetch menu"); }
};

exports.addMenuItem = async (req, res) => {
    const { item_code, name, price_non_ac, price_ac, category, is_half_available, is_jain_available } = req.body;
    try {
        await db.query(
            `INSERT INTO items (item_code, name, price_non_ac, price_ac, category, is_half_available, is_jain_available, is_active) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, true)`,
            [item_code, name, price_non_ac, price_ac, category, is_half_available || false, is_jain_available || false]
        );
        res.json({ success: true });
    } catch (err) { handleError(res, err, "Failed to add menu item"); }
};

exports.updateMenuItem = async (req, res) => {
    const { item_code, name, price_non_ac, price_ac, category, is_half_available, is_jain_available } = req.body;
    try {
        await db.query(
            `UPDATE items 
             SET item_code=$1, name=$2, price_non_ac=$3, price_ac=$4, category=$5, is_half_available=$6, is_jain_available=$7 
             WHERE id=$8`,
            [item_code, name, price_non_ac, price_ac, category, is_half_available, is_jain_available, req.params.id]
        );
        res.json({ success: true });
    } catch (err) { handleError(res, err, "Failed to update menu item"); }
};

exports.deleteMenuItem = async (req, res) => {
    try {
        // SOFT DELETE: Mark inactive and append timestamp to code so the code can be reused
        // Example: 'P101' becomes 'P101_del_17385411'
        const suffix = `_del_${Date.now()}`;
        await db.query(
            'UPDATE items SET is_active = false, item_code = item_code || $2 WHERE id = $1', 
            [req.params.id, suffix]
        );
        res.json({ success: true });
    } catch (err) { handleError(res, err, "Failed to delete menu item"); }
};

// ==========================================
// HISTORY & REPORTING
// ==========================================

exports.getHistory = async (req, res) => {
    try {
        const r = await db.query(`
            SELECT o.*, rt.table_no 
            FROM orders o 
            LEFT JOIN restaurant_tables rt ON o.table_id = rt.id 
            WHERE o.is_paid = true 
            ORDER BY o.settled_at DESC 
            LIMIT 500
        `);
        res.json(r.rows);
    } catch (err) { handleError(res, err, "Failed to fetch history"); }
};

exports.deleteHistoryOrder = async (req, res) => {
    const client = await db.getClient();
    try {
        await client.query('BEGIN');
        // Delete items first (FK constraint)
        await client.query('DELETE FROM order_items WHERE order_id = $1', [req.params.id]);
        await client.query('DELETE FROM orders WHERE id = $1', [req.params.id]);
        await client.query('COMMIT');
        res.json({ success: true });
    } catch (err) { 
        await client.query('ROLLBACK'); 
        handleError(res, err, "Failed to delete order history"); 
    } finally { client.release(); }
};

exports.deleteHistoryRange = async (req, res) => {
    const { startDate, endDate } = req.body;
    const client = await db.getClient();
    try {
        await client.query('BEGIN');
        // Ensure dates are valid to prevent deleting everything
        if (!startDate || !endDate) throw new Error("Start and End dates are required");

        // 1. Delete items linked to orders in range
        await client.query(`
            DELETE FROM order_items 
            WHERE order_id IN (
                SELECT id FROM orders 
                WHERE is_paid = true AND settled_at::date >= $1 AND settled_at::date <= $2
            )`, 
            [startDate, endDate]
        );

        // 2. Delete the orders
        await client.query(`
            DELETE FROM orders 
            WHERE is_paid = true AND settled_at::date >= $1 AND settled_at::date <= $2`, 
            [startDate, endDate]
        );

        await client.query('COMMIT');
        res.json({ success: true });
    } catch (err) { 
        await client.query('ROLLBACK'); 
        handleError(res, err, "Failed to bulk delete history"); 
    } finally { client.release(); }
};

exports.updateBill = async (req, res) => {
    const { id } = req.params;
    const { customer_name, customer_phone, customer_address, items } = req.body;
    const client = await db.getClient();
    
    try {
        await client.query('BEGIN');
        
        // Update Customer Info
        await client.query(
            "UPDATE orders SET customer_name=$1, customer_phone=$2, customer_address=$3 WHERE id=$4", 
            [customer_name, customer_phone, customer_address, id]
        );

        // Update Items (Full Replacement Strategy for Edit Mode)
        if (items && Array.isArray(items)) {
            await client.query("DELETE FROM order_items WHERE order_id = $1", [id]);
            
            for (let item of items) {
                // Ensure price_at_time is preserved from the editor logic
                await client.query(
                    "INSERT INTO order_items (order_id, item_id, quantity, price_at_time, special_instruction) VALUES ($1,$2,$3,$4,$5)", 
                    [id, item.item_id, item.quantity, item.price_at_time, item.special_instruction || '']
                );
            }

            // Recalculate Total
            const totalRes = await client.query('SELECT SUM(quantity * price_at_time) as total FROM order_items WHERE order_id = $1', [id]);
            const newTotal = totalRes.rows[0].total || 0;
            
            await client.query("UPDATE orders SET total_amount = $1 WHERE id = $2", [newTotal, id]);
        }
        
        await client.query('COMMIT');
        res.json({ success: true });
    } catch (err) { 
        await client.query('ROLLBACK'); 
        handleError(res, err, "Failed to update bill"); 
    } finally { client.release(); }
};

// ==========================================
// USER / WAITER MANAGEMENT
// ==========================================

exports.getWaiters = async (req, res) => {
    try {
        const r = await db.query("SELECT id, username, role FROM users WHERE role='waiter' ORDER BY username ASC");
        res.json(r.rows);
    } catch (err) { handleError(res, err, "Failed to fetch waiters"); }
};

exports.addWaiter = async (req, res) => {
    const { username, password } = req.body;
    try {
        if(!username || !password) return res.status(400).json({message: "Missing credentials"});
        const h = await bcrypt.hash(password, SALT_ROUNDS);
        await db.query("INSERT INTO users (username, password_hash, role) VALUES ($1, $2, 'waiter')", [username, h]);
        res.json({ success: true });
    } catch (err) { handleError(res, err, "Failed to add waiter"); }
};

exports.updateWaiter = async (req, res) => {
    const { username, password } = req.body;
    try {
        if (password) {
            const h = await bcrypt.hash(password, SALT_ROUNDS);
            await db.query('UPDATE users SET username=$1, password_hash=$2 WHERE id=$3', [username, h, req.params.id]);
        } else {
            await db.query('UPDATE users SET username=$1 WHERE id=$2', [username, req.params.id]);
        }
        res.json({ success: true });
    } catch (err) { handleError(res, err, "Failed to update waiter"); }
};

exports.deleteWaiter = async (req, res) => {
    try {
        await db.query('DELETE FROM users WHERE id=$1', [req.params.id]);
        res.json({ success: true });
    } catch (err) { handleError(res, err, "Failed to delete waiter"); }
};