const express = require('express');
const router = express.Router();
const controller = require('../controllers/orderController');
const authMiddleware = require('../middleware/authMiddleware');

router.use(authMiddleware);

// Tables
router.get('/tables', controller.getTables);
router.post('/tables', controller.addTable);
router.delete('/tables/:id', controller.deleteTable);

// Categories
router.get('/categories', controller.getCategories);
router.post('/categories', controller.addCategory);
router.put('/categories/:id', controller.updateCategory);
router.delete('/categories/:id', controller.deleteCategory);


// Billing
router.get('/details/:orderId', controller.getOrderDetails);
router.post('/add-item', controller.addItem);
router.post('/delete-by-code', controller.deleteByCode);
router.post('/settle', controller.settleBill);

// History
router.get('/history', controller.getHistory);
router.put('/:id', controller.updateOrder); // Ensure this PUT route exists
router.delete('/history/:id', controller.deleteHistoryOrder);
router.post('/history/delete-range', controller.deleteHistoryRange);

// Add these lines
router.get('/presets', controller.getPresets);
router.post('/presets', controller.addPreset);
router.delete('/presets/:id', controller.deletePreset);

// Menu & Staff
router.get('/menu', controller.getMenu);
router.post('/menu', controller.addMenuItem);
router.put('/menu/:id', controller.updateMenuItem);
router.delete('/menu/:id', controller.deleteMenuItem);

router.get('/waiters', controller.getWaiters);
router.post('/waiters', controller.addWaiter);
router.put('/waiters/:id', controller.updateWaiter);
router.delete('/waiters/:id', controller.deleteWaiter);

router.get('/waiting-queue', controller.getWaitingQueue);
router.post('/waiting-queue', controller.addToWaitingQueue);
router.put('/waiting-queue/:id', controller.updateQueueStatus);
router.delete('/waiting-queue/:id', controller.removeFromWaitingQueue);

module.exports = router;