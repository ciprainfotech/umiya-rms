require('dotenv').config(); // MUST BE ON TOP
const express = require('express');
const cors = require('cors');
const db = require('./config/db'); // Your PostgreSQL connection


// Import Route Files
const authController = require('./controllers/authController');
const orderRoutes = require('./routes/orderRoutes');
const printRoutes = require('./routes/printRoutes');

const app = express();

// --- MIDDLEWARES ---
app.use(cors()); // Allows Frontend to communicate with Backend
app.use(express.json()); // Allows Backend to process JSON data

// --- DATABASE CONNECTION TEST ---
// This ensures that whenever you start the server, it checks the DB first.
const checkConnection = async () => {
    try {
        await db.query('SELECT NOW()');
        console.log('✅ Database Connected Successfully to PostgreSQL');
    } catch (err) {
        console.error('❌ Database Connection Failed!', err.message);
        process.exit(1); // Stop the server if DB is not reachable
    }
};
checkConnection();

// --- ROUTES ---

// 1. Authentication Route (Login)
// This handles: POST http://localhost:5001/api/auth/login
app.post('/api/auth/login', authController.login);

// 2. Order & Table Management Routes
// This handles: 
// GET  http://localhost:5001/api/orders/tables
// POST http://localhost:5001/api/orders/add-item
app.use('/api/orders', orderRoutes);
app.use('/api/print', printRoutes);

// --- SERVER INITIALIZATION ---
const PORT = process.env.PORT || 5001;
app.listen(PORT, () => {
    console.log(`🚀 CIPRA RMS Terminal is running on port ${PORT}`);
    console.log(`🔗 Local URL: http://localhost:${PORT}`);
});