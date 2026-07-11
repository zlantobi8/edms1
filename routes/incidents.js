const express = require('express');
const ctrl = require('../controllers/incidentController');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate, requireRole('administrator', 'invigilator'));

router.get('/exam/:examId', ctrl.listForExam);
router.get('/exam/:examId/export/csv', ctrl.exportCsv);
router.get('/exam/:examId/export/pdf', ctrl.exportPdf);

module.exports = router;
