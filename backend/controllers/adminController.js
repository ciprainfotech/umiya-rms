const db = require('../config/db');
const bcrypt = require('bcrypt');
const SALT_ROUNDS = 12;

// 1. GET ANALYTICS
exports.getAnalytics = async (req, res) => {
    const { startDate, endDate, shift } = req.query; 
    const client = await db.getClient();

    try {
        let query = `
            SELECT 
                COUNT(*) as total_orders,
                COALESCE(SUM(total_amount), 0) as total_revenue,
                COALESCE(AVG(total_amount), 0) as avg_order_value
            FROM orders 
            WHERE is_paid = TRUE 
            AND created_at BETWEEN $1 AND $2
        `;
        
        const start = startDate ? `${startDate} 00:00:00` : new Date().toISOString().split('T')[0] + ' 00:00:00';
        const end = endDate ? `${endDate} 23:59:59` : new Date().toISOString().split('T')[0] + ' 23:59:59';
        const values = [start, end];

        if (shift === 'Noon') {
            query += ` AND EXTRACT(HOUR FROM created_at) BETWEEN 11 AND 15`;
        } else if (shift === 'Evening') {
            query += ` AND EXTRACT(HOUR FROM created_at) >= 18`; 
        }

        const stats = await client.query(query, values);

        let trendQuery = `
            SELECT DATE(created_at) as date, SUM(total_amount) as sales 
            FROM orders 
            WHERE is_paid = TRUE 
            AND created_at BETWEEN $1 AND $2
        `;
        
        if (shift === 'Noon') trendQuery += ` AND EXTRACT(HOUR FROM created_at) BETWEEN 11 AND 15`;
        else if (shift === 'Evening') trendQuery += ` AND EXTRACT(HOUR FROM created_at) >= 18`;

        trendQuery += ` GROUP BY DATE(created_at) ORDER BY date ASC`;

        const trend = await client.query(trendQuery, values);

        const safeStats = {
            total_orders: parseInt(stats.rows[0]?.total_orders || 0),
            total_revenue: parseFloat(stats.rows[0]?.total_revenue || 0),
            avg_order_value: parseFloat(stats.rows[0]?.avg_order_value || 0)
        };

        res.json({ stats: safeStats, trend: trend.rows });
    } catch (err) {
        console.error("Analytics Error:", err);
        res.status(500).json({ message: "Analytics failed" });
    } finally {
        client.release();
    }
};

// 2. MANAGER CRUD

// Get all managers
exports.getManagers = async (req, res) => {
    try {
        const result = await db.query("SELECT id, username, created_at FROM users WHERE role = 'manager' ORDER BY id ASC");
        res.json(result.rows);
    } catch (e) { res.status(500).json({ message: "Fetch failed" }); }
};

// Add new manager
exports.addManager = async (req, res) => {
    const { username, password } = req.body;
    try {
        if(!username || !password) return res.status(400).json({message: "Missing info"});
        const h = await bcrypt.hash(password, SALT_ROUNDS);
        await db.query("INSERT INTO users (username, password_hash, role) VALUES ($1, $2, 'manager')", [username, h]);
        res.json({ success: true, message: "Manager added" });
    } catch (e) { 
        if (e.code === '23505') return res.status(400).json({ message: "Username exists" });
        res.status(500).json({ message: "Create failed" }); 
    }
};

// Delete manager
exports.deleteManager = async (req, res) => {
    try {
        await db.query("DELETE FROM users WHERE id = $1 AND role = 'manager'", [req.params.id]);
        res.json({ success: true, message: "Manager deleted" });
    } catch (e) { res.status(500).json({ message: "Delete failed" }); }
};

// ✅ THIS WAS MISSING - FIXES THE CRASH
exports.resetManagerPassword = async (req, res) => {
    const { password } = req.body;
    const { id } = req.params;
    try {
        if (!password) return res.status(400).json({ message: "New password required" });
        
        const h = await bcrypt.hash(password, SALT_ROUNDS);
        const result = await db.query(
            "UPDATE users SET password_hash = $1 WHERE id = $2 AND role = 'manager' RETURNING id", 
            [h, id]
        );

        if (result.rowCount === 0) return res.status(404).json({ message: "Manager not found" });
        
        res.json({ success: true, message: "Password updated successfully" });
    } catch (e) { 
        console.error(e);
        res.status(500).json({ message: "Update failed" }); 
    }
};