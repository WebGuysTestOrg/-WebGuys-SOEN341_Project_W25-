const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

// Authentication routes
router.post('/register', authController.register);
router.post('/login', authController.login);
router.get('/logout', authController.logout);
router.post('/update-password', authController.updatePassword);
router.get('/user-info', authController.getUserInfo);
router.get('/admin-info', authController.getAdminInfo);

module.exports = router; 