const express = require('express');
const ctrl = require('../controllers/invigilatorController');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate, requireRole('invigilator'));

router.get('/exams', ctrl.myExams);
router.get('/exams/:examId/monitor', ctrl.monitorExam);
router.get('/exams/:examId/logs', ctrl.examLogs);
router.post('/students/:studentId/lock', ctrl.lockStudent);
router.post('/submissions/:submissionId/force-submit', ctrl.forceSubmit);

module.exports = router;
