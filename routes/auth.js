const express = require('express');
const authController = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

router.post('/admin/login', authController.adminLogin);
router.post('/invigilator/login', authController.invigilatorLogin);
router.post('/student/login', authController.studentLogin);
router.post('/logout', authController.logout);
router.get('/me', authenticate, authController.me);

module.exports = router;
