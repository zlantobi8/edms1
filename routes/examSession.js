const express = require('express');
const ctrl = require('../controllers/examSessionController');
const recordingCtrl = require('../controllers/recordingController');
const { authenticate, requireRole } = require('../middleware/auth');
const { uploadRecordingChunk } = require('../middleware/upload');

const router = express.Router();
router.use(authenticate, requireRole('student'));

router.post('/:examId/start', ctrl.startExam);
router.post('/:submissionId/answer', ctrl.saveAnswer);
router.post('/:submissionId/heartbeat', ctrl.heartbeat);
router.post('/:submissionId/submit', ctrl.submitExam);
router.post('/:submissionId/log', ctrl.logActivity);
router.post('/:submissionId/recording-chunk', uploadRecordingChunk.single('chunk'), recordingCtrl.uploadChunk);
router.post('/:submissionId/recording-finish', recordingCtrl.finishRecording);

module.exports = router;
