const db = require('../config/db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

/**
 * Handles User Authentication
 * Role-based access: Manager, Waiter, Owner
 */
exports.login = async (req, res) => {
    const { username, password } = req.body;

    // 1. Basic Validation
    if (!username || !password) {
        return res.status(400).json({ 
            message: "Username and Security Key are required." 
        });
    }

    try {
        // 2. Fetch User from Database (Case-Insensitive)
        // We use LOWER() to ensure 'Admin1' and 'admin1' are treated the same
        const userQuery = await db.query(
            'SELECT id, username, password_hash, role FROM users WHERE LOWER(username) = LOWER($1)', 
            [username]
        );

        // 3. Check if User exists
        if (userQuery.rows.length === 0) {
            return res.status(404).json({ 
                message: "Authorized ID not found in the system." 
            });
        }

        const user = userQuery.rows[0];

        // 4. Verify Password Hash
        const isMatch = await bcrypt.compare(password, user.password_hash);
        
        if (!isMatch) {
            return res.status(401).json({ 
                message: "Security Key mismatch. Please try again." 
            });
        }

        // 5. Generate Secure JWT Token
        // This token will expire in 24 hours
        const token = jwt.sign(
            { 
                id: user.id, 
                role: user.role, 
                username: user.username 
            },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );

        // 6. Success Response
        // We log the success for server-side monitoring
        console.log(`✅ [AUTH] User logged in: ${user.username} (${user.role})`);

        return res.status(200).json({
            success: true,
            message: `Welcome back, ${user.username}`,
            token,
            role: user.role, // manager, waiter, or owner
            user: {
                id: user.id,
                username: user.username
            }
        });

    } catch (err) {
        // 7. Critical Error Handling
        console.error("❌ [AUTH ERROR]:", err.message);
        return res.status(500).json({ 
            message: "Terminal connection error. Please contact Cipra Infotech." 
        });
    }
};