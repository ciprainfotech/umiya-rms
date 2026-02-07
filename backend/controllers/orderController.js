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

exports.updateCategory = async (req, res) => {
    const client = await db.getClient(); // Use a client for transaction
    try {
        const { id } = req.params;
        const { name } = req.body;
        if (!name) return res.status(400).json({ message: "Category name required" });

        await client.query('BEGIN');

        // 1. Get the OLD name first before updating
        const oldCatRes = await client.query("SELECT name FROM categories WHERE id = $1", [id]);
        if (oldCatRes.rows.length === 0) throw new Error("Category not found");
        const oldName = oldCatRes.rows[0].name;

        // 2. Update the Category table
        await client.query("UPDATE categories SET name = $1 WHERE id = $2", [name, id]);

        // 3. Update all Items that were using the old name
        // This fixes the "disappearing items" issue
        await client.query("UPDATE items SET category = $1 WHERE category = $2", [name, oldName]);

        await client.query('COMMIT');
        res.json({ success: true, message: "Category and items updated" });
    } catch (err) {
        await client.query('ROLLBACK');
        handleError(res, err, "Failed to update category and items");
    } finally {
        client.release();
    }
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
    // 1. ROBUST INPUT HANDLING (Fixes "items is not iterable")
    let { items, table_id, customer_name, customer_phone } = req.body;

    // If 'items' is missing, check if it's a Legacy Singular Request
    if (!items || !Array.isArray(items)) {
        const { item_code, quantity, special_instruction } = req.body;
        if (item_code) {
            // Convert singular request to array format automatically
            items = [{ item_code, quantity, special_instruction }];
        } else {
            return res.status(400).json({ success: false, message: "Invalid payload: 'items' array is missing." });
        }
    }

    const client = await db.getClient();
    
    try {
        await client.query('BEGIN');

        // 2. VALIDATE TABLE & LOCK
        const tableRes = await client.query(
            'SELECT is_ac, status FROM restaurant_tables WHERE id = $1 FOR UPDATE', 
            [table_id]
        );
        if (tableRes.rows.length === 0) throw new Error("Table not found");
        
        const isAc = tableRes.rows[0].is_ac;

        // 3. GET OR CREATE ACTIVE ORDER
        let orderId;
        const orderRes = await client.query(
            'SELECT id FROM orders WHERE table_id = $1 AND is_paid = false', 
            [table_id]
        );
        
        if (orderRes.rows.length > 0) {
            orderId = orderRes.rows[0].id;
            // Update customer info if provided
            if (customer_name || customer_phone) {
                await client.query(
                    'UPDATE orders SET customer_name = COALESCE($1, customer_name), customer_phone = COALESCE($2, customer_phone) WHERE id = $3',
                    [customer_name, customer_phone, orderId]
                );
            }
        } else {
            const newOrder = await client.query(
                'INSERT INTO orders (table_id, customer_name, customer_phone) VALUES ($1, $2, $3) RETURNING id', 
                [table_id, customer_name, customer_phone]
            );
            orderId = newOrder.rows[0].id;
            await client.query("UPDATE restaurant_tables SET status = 'occupied' WHERE id = $1", [table_id]);
        }

        // 4. PROCESS ITEMS LOOP
        for (const itemData of items) {
            const { item_code, quantity, special_instruction } = itemData;
            
            // Validate Inputs
            if (!item_code) continue; 

            // Find Item
            // FIX: Use TRIM(item_code) to match "7" even if DB has "7 "
            const cleanCode = String(item_code).trim();
            const itemRes = await client.query(
                'SELECT * FROM items WHERE TRIM(item_code) = TRIM($1) AND is_active = true', 
                [cleanCode]
            );
            
            if (itemRes.rows.length === 0) {
                throw new Error(`Item code '${item_code}' not found.`);
            }
            
            const item = itemRes.rows[0];
            const price = isAc ? item.price_ac : item.price_non_ac;
            const cleanInstruction = special_instruction || '';

            // Upsert Logic
            const existingItemRes = await client.query(
                `SELECT id, quantity FROM order_items 
                 WHERE order_id = $1 AND item_id = $2 AND special_instruction = $3`,
                [orderId, item.id, cleanInstruction]
            );

            if (existingItemRes.rows.length > 0) {
                // Update existing
                const currentQty = Number(existingItemRes.rows[0].quantity);
                const newQty = currentQty + Number(quantity);

                if (newQty <= 0) {
                    await client.query('DELETE FROM order_items WHERE id = $1', [existingItemRes.rows[0].id]);
                } else {
                    await client.query(
                        'UPDATE order_items SET quantity = $1 WHERE id = $2',
                        [newQty, existingItemRes.rows[0].id]
                    );
                }
            } else {
                // Insert new
                if (Number(quantity) > 0) {
                    await client.query(
                        `INSERT INTO order_items (order_id, item_id, quantity, price_at_time, special_instruction) 
                         VALUES ($1, $2, $3, $4, $5)`, 
                        [orderId, item.id, quantity, price, cleanInstruction]
                    );
                }
            }
        }

        await client.query('COMMIT');
        res.json({ success: true, orderId });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error("Batch Transaction Failed:", err.message);
        res.status(500).json({ success: false, message: err.message });
    } finally {
        client.release();
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
        const query = `
            SELECT 
                i.*, 
                c.name AS category 
            FROM items i
            LEFT JOIN categories c ON i.category_id = c.id
            WHERE i.is_active = true 
            ORDER BY c.name, i.name
        `;
        const r = await db.query(query);
        res.json(r.rows);
    } catch (err) { 
        handleError(res, err, "Failed to fetch menu"); 
    }
};

exports.addMenuItem = async (req, res) => {
    const { item_code, name, price_non_ac, price_ac, category_id, is_half_available, is_jain_available } = req.body;
    try {
        await db.query(
            `INSERT INTO items (item_code, name, price_non_ac, price_ac, category_id, is_half_available, is_jain_available, is_active) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, true)`,
            [item_code, name, price_non_ac, price_ac, category_id, is_half_available || false, is_jain_available || false]
        );
        res.json({ success: true });
    } catch (err) { handleError(res, err, "Failed to add menu item"); }
};

exports.updateMenuItem = async (req, res) => {
    const { item_code, name, price_non_ac, price_ac, category_id, is_half_available, is_jain_available } = req.body;
    console.log(category_id);
    try {
        await db.query(
            `UPDATE items 
             SET item_code=$1, name=$2, price_non_ac=$3, price_ac=$4, category_id=$5, is_half_available=$6, is_jain_available=$7 
             WHERE id=$8`,
            [item_code, name, price_non_ac, price_ac, category_id, is_half_available, is_jain_available, req.params.id]
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


exports.getPresets = async (req, res) => {
    try {
        const result = await db.query("SELECT * FROM instruction_presets ORDER BY name ASC");
        res.json(result.rows);
    } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.addPreset = async (req, res) => {
    try {
        const { name } = req.body;
        await db.query("INSERT INTO instruction_presets (name) VALUES ($1)", [name]);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: "Preset exists or invalid" }); }
};

exports.deletePreset = async (req, res) => {
    try {
        await db.query("DELETE FROM instruction_presets WHERE id = $1", [req.params.id]);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
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

exports.updateOrder = async (req, res) => {
    const { id } = req.params;
    const { customer_name, customer_phone, customer_address, items } = req.body; 
    const client = await db.getClient();

    try {
        await client.query('BEGIN');

        // 🚨 NEW LOGIC: If items array is empty, DELETE the whole bill
        if (!items || items.length === 0) {
            // 1. Delete all items linked to this order
            await client.query("DELETE FROM order_items WHERE order_id = $1", [id]);
            
            // 2. Delete the order itself
            await client.query("DELETE FROM orders WHERE id = $1", [id]);
            
            await client.query('COMMIT');
            return res.json({ success: true, message: "Bill Deleted Successfully (Empty)" });
        }

        // --- STANDARD UPDATE LOGIC (If items exist) ---

        // 1. Update Header
        await client.query(
            `UPDATE orders 
             SET customer_name = $1, customer_phone = $2, customer_address = $3 
             WHERE id = $4`,
            [customer_name, customer_phone, customer_address, id]
        );

        // 2. Remove OLD items
        await client.query("DELETE FROM order_items WHERE order_id = $1", [id]);

        let newTotal = 0;
        
        // 3. Insert NEW items
        for (const item of items) {
            if (item.quantity > 0) {
                const price = Number(item.price_at_time);
                const qty = Number(item.quantity);
                newTotal += (price * qty);

                await client.query(
                    `INSERT INTO order_items (order_id, item_id, quantity, price_at_time, special_instruction)
                     VALUES ($1, $2, $3, $4, $5)`,
                    [id, item.item_id, qty, price, item.special_instruction || '']
                );
            }
        }
        
        // 4. Update Grand Total
        await client.query("UPDATE orders SET total_amount = $1 WHERE id = $2", [newTotal, id]);

        await client.query('COMMIT');
        res.json({ success: true, message: "Bill Updated Successfully" });

    } catch (e) {
        await client.query('ROLLBACK');
        console.error("Update Order Failed:", e);
        res.status(500).json({ message: "Update Failed: " + e.message });
    } finally {
        client.release();
    }
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


// 1. GET WAITING QUEUE (Updated for Filtering)
exports.getWaitingQueue = async (req, res) => {
    const client = await db.getClient();
    const { date, status } = req.query; 

    try {
        let query = `SELECT * FROM waiting_queue`;
        const values = [];
        const conditions = [];

        if (date) {
            conditions.push(`DATE(created_at) = $${values.length + 1}`);
            values.push(date);
        }

        if (status) {
            const statusList = status.split(',').map(s => s.trim());
            const placeholders = statusList.map((_, i) => `$${values.length + 1 + i}`).join(', ');
            conditions.push(`status IN (${placeholders})`);
            values.push(...statusList);
        }

        if (conditions.length > 0) {
            query += ` WHERE ` + conditions.join(' AND ');
        }

        // Sort: History = Newest First | Queue = Oldest First (FCFS)
        const isHistory = status && (status.includes('seated') || status.includes('cancelled'));
        query += ` ORDER BY created_at ${isHistory ? 'DESC' : 'ASC'}`;

        const result = await client.query(query, values);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ message: "Failed to fetch queue", error: err.message });
    } finally {
        client.release();
    }
};

// 2. ADD TO QUEUE (Updated to ensure default status)
exports.addToWaitingQueue = async (req, res) => {
    const { customer_name, person_count, preference } = req.body;
    const client = await db.getClient();
    
    try {
        // We explicitly set 'waiting' just to be safe, though DB default handles it
        const query = `
            INSERT INTO waiting_queue (customer_name, person_count, preference, status) 
            VALUES ($1, $2, $3, 'waiting') 
            RETURNING *
        `;
        const values = [customer_name, person_count, preference || 'None'];
        const result = await client.query(query, values);
        
        res.status(201).json(result.rows[0]);
    } catch (err) {
        handleError(res, err, "Failed to add to waitlist");
    } finally {
        client.release();
    }
};

// 3. UPDATE STATUS (New Logic: "Soft Delete")
exports.updateQueueStatus = async (req, res) => {
    const { id } = req.params;
    // Extract fields exactly as they appear in the database
    const { status, customer_name, person_count, preference } = req.body;

    console.log(`📝 EDIT REQUEST for ID ${id}`);
    console.log("📦 Received Data:", req.body); // Check your terminal for this!

    const client = await db.getClient();

    try {
        let query = `UPDATE waiting_queue SET updated_at = NOW()`;
        const values = [];
        let index = 1;

        // Dynamic Update Logic
        if (status !== undefined) { 
            query += `, status = $${index++}`; 
            values.push(status); 
        }
        if (customer_name !== undefined) { 
            query += `, customer_name = $${index++}`; 
            values.push(customer_name); 
        }
        if (person_count !== undefined) { 
            query += `, person_count = $${index++}`; 
            values.push(person_count); 
        }
        if (preference !== undefined) { 
            query += `, preference = $${index++}`; 
            values.push(preference); 
        }

        query += ` WHERE id = $${index} RETURNING *`;
        values.push(id);

        // Debug: Print the query being generated
        console.log("🚀 Running SQL:", query);
        console.log("📎 With Values:", values);

        // If only ID is in values, it means no other fields were provided
        if (values.length === 1) { 
             client.release();
             console.log("⚠️ No fields matched. Update skipped.");
             return res.json({ success: true, message: "No valid fields provided to update" });
        }

        const result = await client.query(query, values);

        if (result.rowCount === 0) {
            return res.status(404).json({ message: "Customer ID not found" });
        }

        console.log("✅ DB Update Success");
        res.json({ success: true, message: "Updated successfully", data: result.rows[0] });
    } catch (err) {
        console.error("🔥 Error:", err);
        handleError(res, err, "Update failed");
    } finally {
        client.release();
    }
};
// 4. HARD DELETE (Optional: Keep this for correcting mistakes)
exports.removeFromWaitingQueue = async (req, res) => {
    const { id } = req.params;
    const client = await db.getClient();
    
    try {
        const result = await client.query('DELETE FROM waiting_queue WHERE id = $1', [id]);
        if (result.rowCount === 0) return res.status(404).json({ message: "Not found" });
        res.json({ success: true, message: "Deleted permanently" });
    } catch (err) {
        handleError(res, err, "Delete failed");
    } finally {
        client.release();
    }
};


