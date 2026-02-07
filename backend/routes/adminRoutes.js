const express = require('express');
const router = express.Router();
const controller = require('../controllers/adminController');
const authMiddleware = require('../middleware/authMiddleware');


router.use(authMiddleware);


// Analytics
router.get('/analytics', controller.getAnalytics);

// Managers Management
router.get('/managers', controller.getManagers);
router.post('/managers', controller.addManager);
router.delete('/managers/:id', controller.deleteManager);
router.put('/managers/:id', controller.resetManagerPassword);

module.exports = router;