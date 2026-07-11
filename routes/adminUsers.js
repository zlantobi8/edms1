const express = require('express');
const ctrl = require('../controllers/adminUserController');
const { authenticate, requireRole } = require('../middleware/auth');
const upload = require('../middleware/upload');

const router = express.Router();
router.use(authenticate, requireRole('administrator'));

router.get('/students', ctrl.listStudents);
router.post('/students', upload.single('passport'), ctrl.registerStudent);
router.put('/students/:id', upload.single('passport'), ctrl.updateStudent);
router.post('/students/:id/lock', ctrl.lockStudent);
router.post('/students/:id/unlock', ctrl.unlockStudent);
router.post('/students/:id/reset-password', ctrl.resetStudentPassword);
router.delete('/students/:id', ctrl.removeStudent);

router.get('/invigilators', ctrl.listInvigilators);
router.post('/invigilators', ctrl.registerInvigilator);
router.delete('/invigilators/:id', ctrl.removeInvigilator);
router.post('/invigilators/assign', ctrl.assignInvigilator);
router.post('/invigilators/unassign', ctrl.unassignInvigilator);

module.exports = router;
