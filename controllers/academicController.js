const { Faculty, Department, SessionModel, Semester, ClassModel, Subject } = require('../models/Academic');

// ---- Faculties ----
const listFaculties = (req, res) => res.json({ success: true, data: Faculty.all() });
const createFaculty = (req, res, next) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ success: false, message: 'Faculty name is required.' });
    res.status(201).json({ success: true, data: Faculty.create(name.trim()) });
  } catch (err) { next(err); }
};
const removeFaculty = (req, res) => { Faculty.remove(req.params.id); res.json({ success: true }); };

// ---- Departments ----
const listDepartments = (req, res) => res.json({ success: true, data: Department.all() });
const createDepartment = (req, res, next) => {
  try {
    const { faculty_id, name } = req.body;
    if (!faculty_id || !name) return res.status(400).json({ success: false, message: 'Faculty and department name are required.' });
    res.status(201).json({ success: true, data: Department.create(faculty_id, name.trim()) });
  } catch (err) { next(err); }
};
const removeDepartment = (req, res) => { Department.remove(req.params.id); res.json({ success: true }); };

// ---- Sessions ----
const listSessions = (req, res) => res.json({ success: true, data: SessionModel.all() });
const createSession = (req, res, next) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ success: false, message: 'Session name is required.' });
    res.status(201).json({ success: true, data: SessionModel.create(name.trim()) });
  } catch (err) { next(err); }
};
const activateSession = (req, res) => { SessionModel.setActive(req.params.id); res.json({ success: true }); };
const removeSession = (req, res) => { SessionModel.remove(req.params.id); res.json({ success: true }); };

// ---- Semesters ----
const listSemesters = (req, res) => res.json({ success: true, data: Semester.all(req.query.session_id) });
const createSemester = (req, res, next) => {
  try {
    const { session_id, name } = req.body;
    if (!session_id || !name) return res.status(400).json({ success: false, message: 'Session and semester name are required.' });
    res.status(201).json({ success: true, data: Semester.create(session_id, name.trim()) });
  } catch (err) { next(err); }
};
const activateSemester = (req, res) => { Semester.setActive(req.params.id); res.json({ success: true }); };
const removeSemester = (req, res) => { Semester.remove(req.params.id); res.json({ success: true }); };

// ---- Classes ----
const listClasses = (req, res) => res.json({ success: true, data: ClassModel.all() });
const createClass = (req, res, next) => {
  try {
    const { department_id, name } = req.body;
    if (!department_id || !name) return res.status(400).json({ success: false, message: 'Department and class name are required.' });
    res.status(201).json({ success: true, data: ClassModel.create(department_id, name.trim()) });
  } catch (err) { next(err); }
};
const removeClass = (req, res) => { ClassModel.remove(req.params.id); res.json({ success: true }); };

// ---- Subjects ----
const listSubjects = (req, res) => res.json({ success: true, data: Subject.all() });
const createSubject = (req, res, next) => {
  try {
    const { department_id, code, title, units } = req.body;
    if (!department_id || !code || !title) {
      return res.status(400).json({ success: false, message: 'Department, code and title are required.' });
    }
    res.status(201).json({ success: true, data: Subject.create({ department_id, code: code.trim(), title: title.trim(), units }) });
  } catch (err) { next(err); }
};
const removeSubject = (req, res) => { Subject.remove(req.params.id); res.json({ success: true }); };

module.exports = {
  listFaculties, createFaculty, removeFaculty,
  listDepartments, createDepartment, removeDepartment,
  listSessions, createSession, activateSession, removeSession,
  listSemesters, createSemester, activateSemester, removeSemester,
  listClasses, createClass, removeClass,
  listSubjects, createSubject, removeSubject,
};
