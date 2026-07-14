const express = require('express');
const authController = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');
const { localOnly } = require('../middleware/localOnly');

const router = express.Router();

router.post('/admin/login', localOnly, authController.adminLogin);
router.post('/invigilator/login', authController.invigilatorLogin);
router.post('/student/login', authController.studentLogin);
router.post('/logout', authController.logout);
router.get('/me', authenticate, authController.me);

module.exports = router;
