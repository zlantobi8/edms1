const express = require('express');
const ctrl = require('../controllers/recordingController');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate, requireRole('administrator', 'invigilator'));

router.get('/exam/:examId', ctrl.listForExam);
router.get('/storage/summary', requireRole('administrator'), ctrl.storageSummary);
router.get('/:id/stream', ctrl.streamRecording);
router.delete('/:id', requireRole('administrator'), ctrl.removeRecording);

module.exports = router;
