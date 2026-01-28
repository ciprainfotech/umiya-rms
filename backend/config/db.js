const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_DATABASE,
  // Force the password to be a string, or an empty string if undefined
  password: String(process.env.DB_PASSWORD || ''), 
  port: process.env.DB_PORT,
});

// Test the connection immediately on startup
pool.connect((err, client, release) => {
  if (err) {
    return console.error('❌ Error acquiring client:', err.stack);
  }
  console.log('✅ Database connected successfully to PostgreSQL');
  release();
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  getClient: () => pool.connect(),
};