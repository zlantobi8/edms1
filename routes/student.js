const express = require('express');
const ctrl = require('../controllers/studentPortalController');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate, requireRole('student'));

router.get('/profile', ctrl.profile);
router.get('/exams', ctrl.availableExams);
router.get('/results', ctrl.myResults);

module.exports = router;
