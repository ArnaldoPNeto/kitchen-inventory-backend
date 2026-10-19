const express = require('express');
const router = express.Router();
const inventoryController = require('../controllers/inventoryController');
const { verifyToken, isManager } = require('../middleware/authMiddleware');

// Every inventory route requires a logged-in user
router.use(verifyToken);

// Anyone logged in
router.get('/', inventoryController.getItems);                     // GET    /api/inventory
router.get('/:id', inventoryController.getItemById);               // GET    /api/inventory/:id
router.patch('/:id/quantity', inventoryController.updateQuantity); // PATCH  /api/inventory/:id/quantity

// Managers only
router.post('/', isManager, inventoryController.createItem);       // POST   /api/inventory
router.put('/:id', isManager, inventoryController.updateItem);     // PUT    /api/inventory/:id
router.delete('/:id', isManager, inventoryController.deleteItem);  // DELETE /api/inventory/:id

module.exports = router;
