// Import PostgreSQL client
const { Pool, types } = require('pg');

// Return NUMERIC columns (quantity, unit_cost...) as JS numbers instead of strings
types.setTypeParser(1700, (value) => parseFloat(value));
require('dotenv').config();

// Create connection pool to PostgreSQL database
const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

// Test the connection
pool.on('connect', () => {
  console.log('✅ Connected to PostgreSQL database');
});

pool.on('error', (err) => {
  console.error('❌ Unexpected error on idle client', err);
});

module.exports = pool;