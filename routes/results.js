const express = require('express');
const ctrl = require('../controllers/resultController');
const { authenticate, requireRole } = require('../middleware/auth');
const { localOnly } = require('../middleware/localOnly');

const router = express.Router();
router.use(localOnly, authenticate, requireRole('administrator'));

router.get('/', ctrl.listResults);
router.get('/export/csv', ctrl.exportResultsCsv);
router.get('/export/pdf', ctrl.exportResultsPdf);
router.get('/student/:studentId', ctrl.studentResults);

module.exports = router;
