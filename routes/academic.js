const express = require('express');
const ctrl = require('../controllers/academicController');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate, requireRole('administrator'));

router.get('/faculties', ctrl.listFaculties);
router.post('/faculties', ctrl.createFaculty);
router.delete('/faculties/:id', ctrl.removeFaculty);

router.get('/departments', ctrl.listDepartments);
router.post('/departments', ctrl.createDepartment);
router.delete('/departments/:id', ctrl.removeDepartment);

router.get('/sessions', ctrl.listSessions);
router.post('/sessions', ctrl.createSession);
router.post('/sessions/:id/activate', ctrl.activateSession);
router.delete('/sessions/:id', ctrl.removeSession);

router.get('/semesters', ctrl.listSemesters);
router.post('/semesters', ctrl.createSemester);
router.post('/semesters/:id/activate', ctrl.activateSemester);
router.delete('/semesters/:id', ctrl.removeSemester);

router.get('/classes', ctrl.listClasses);
router.post('/classes', ctrl.createClass);
router.delete('/classes/:id', ctrl.removeClass);

router.get('/subjects', ctrl.listSubjects);
router.post('/subjects', ctrl.createSubject);
router.delete('/subjects/:id', ctrl.removeSubject);

module.exports = router;
