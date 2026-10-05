// Import required packages
const express = require('express');
const cors = require('cors');
require('dotenv').config(); // Load environment variables from .env file

// Import your database connection
const db = require('./config/database');

// Initialize Express app
const app = express();

// Middleware - allow JSON requests and CORS
app.use(express.json());
app.use(cors());

// Test route to verify server is running
app.get('/api/health', (req, res) => {
  res.json({ message: 'Backend is running!' });
});

// Routes (we'll add these next)
// app.use('/api/auth', require('./routes/auth'));
// app.use('/api/inventory', require('./routes/inventory'));
// app.use('/api/orders', require('./routes/orders'));

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// Start the server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
});