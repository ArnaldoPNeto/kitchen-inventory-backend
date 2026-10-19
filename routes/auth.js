const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { verifyToken, isManager } = require('../middleware/authMiddleware');

// Register endpoint
// POST /api/auth/register
router.post('/register', authController.register);

// Login endpoint
// POST /api/auth/login
router.post('/login', authController.login);

// Current user profile (any logged-in user)
// GET /api/auth/me
router.get('/me', verifyToken, authController.getMe);

// Manager-only test route
// GET /api/auth/manager-test
router.get('/manager-test', verifyToken, isManager, (req, res) => {
  res.json({ message: `Welcome manager! Your user id is ${req.user.userId}` });
});

module.exports = router;
