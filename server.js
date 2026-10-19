const express = require('express');
const cors = require('cors');
require('dotenv').config();
const db = require('./config/database');

// Import routes
const authRoutes = require('./routes/auth');
const inventoryRoutes = require('./routes/inventory');

const app = express();

// Middleware
app.use(express.json());
app.use(cors());

// Test database connection
db.query('SELECT NOW()', (err, result) => {
  if (err) {
    console.error('❌ Database connection failed:', err.message);
  } else {
    console.log('✅ Database connected:', result.rows[0]);
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ message: 'Backend is running!' });
});

// Auth routes
app.use('/api/auth', authRoutes);

// Inventory routes
app.use('/api/inventory', inventoryRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, (error) => {
  if (error) {
    console.error(`❌ Could not start server on port ${PORT}:`, error.message);
    process.exit(1);
  }
  console.log(`✅ Server running on http://localhost:${PORT}`);
  console.log(`📝 Register: POST http://localhost:${PORT}/api/auth/register`);
  console.log(`🔓 Login: POST http://localhost:${PORT}/api/auth/login`);
});