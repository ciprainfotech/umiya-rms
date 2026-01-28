const jwt = require('jsonwebtoken');

// Change this to your actual secret key (store in .env in production)
const JWT_SECRET = process.env.JWT_SECRET || 'your_super_secret_key';

const authMiddleware = (req, res, next) => {
    try {
        // 1. Get the token from the header
        const authHeader = req.headers.authorization; // Expecting: "Bearer <token>"
        
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ message: 'Authentication required. No token provided.' });
        }

        const token = authHeader.split(' ')[1];

        // 2. Verify the token
        const decoded = jwt.verify(token, JWT_SECRET);

        // 3. Attach user info to the request object
        // Assuming your login logic signs the token with { id: 1, username: 'Raj' }
        req.user = decoded; 

        next();
    } catch (error) {
        console.error("Auth Error:", error.message);
        return res.status(403).json({ message: 'Invalid or expired token.' });
    }
};

module.exports = authMiddleware;