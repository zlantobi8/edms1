const express = require('express');
const ctrl = require('../controllers/examController');
const { authenticate, requireRole } = require('../middleware/auth');
const { localOnly } = require('../middleware/localOnly');
const upload = require('../middleware/upload');

const router = express.Router();
router.use(localOnly, authenticate, requireRole('administrator'));

router.get('/', ctrl.listExams);
router.post('/', ctrl.createExam);
router.get('/:id', ctrl.getExam);
router.put('/:id', ctrl.updateExam);
router.post('/:id/publish', ctrl.publishExam);
router.post('/:id/unpublish', ctrl.unpublishExam);
router.delete('/:id', ctrl.removeExam);

router.get('/:examId/questions', ctrl.listQuestions);
router.post('/:examId/questions', ctrl.createQuestion);
router.put('/:examId/questions/:id', ctrl.updateQuestion);
router.delete('/:examId/questions/:id', ctrl.removeQuestion);
router.post('/:examId/questions/import', upload.uploadMemory.single('file'), ctrl.importQuestionsCsv);

module.exports = router;
