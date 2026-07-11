const bcrypt = require('bcrypt');
const Student = require('../models/Student');
const Invigilator = require('../models/Invigilator');
const { randomPassword, generateRegNumber, generateStaffId } = require('../services/credentialService');

// ============== STUDENTS ==============

const listStudents = (req, res) => {
  const { department_id, class_id } = req.query;
  res.json({ success: true, data: Student.all({ department_id, class_id }) });
};

async function registerStudent(req, res, next) {
  try {
    const { full_name, email, phone, department_id, class_id, dept_code } = req.body;
    if (!full_name) return res.status(400).json({ success: false, message: 'Student full name is required.' });

    let reg_number = req.body.reg_number?.trim();
    if (!reg_number) reg_number = generateRegNumber(dept_code || 'GEN');

    const password = randomPassword(8);
    const password_hash = await bcrypt.hash(password, 10);
    const passport_path = req.file ? `/uploads/passports/${req.file.filename}` : null;

    const student = Student.create({
      reg_number, full_name: full_name.trim(), email, phone,
      department_id: department_id || null, class_id: class_id || null,
      passport_path, password_hash,
    });

    res.status(201).json({
      success: true,
      data: student,
      credentials: { reg_number: student.reg_number, password }, // shown once at creation time
    });
  } catch (err) {
    if (err.message?.includes('UNIQUE')) {
      return res.status(409).json({ success: false, message: 'A student with that registration number already exists.' });
    }
    next(err);
  }
}

const updateStudent = (req, res, next) => {
  try {
    const fields = { ...req.body };
    if (req.file) fields.passport_path = `/uploads/passports/${req.file.filename}`;
    const student = Student.update(req.params.id, fields);
    res.json({ success: true, data: student });
  } catch (err) { next(err); }
};

const lockStudent = (req, res) => { Student.setLocked(req.params.id, true); res.json({ success: true }); };
const unlockStudent = (req, res) => { Student.setLocked(req.params.id, false); res.json({ success: true }); };

async function resetStudentPassword(req, res, next) {
  try {
    const password = randomPassword(8);
    const password_hash = await bcrypt.hash(password, 10);
    Student.resetPassword(req.params.id, password_hash);
    res.json({ success: true, credentials: { password } });
  } catch (err) { next(err); }
}

const removeStudent = (req, res) => { Student.remove(req.params.id); res.json({ success: true }); };

// ============== INVIGILATORS ==============

const listInvigilators = (req, res) => res.json({ success: true, data: Invigilator.all() });

async function registerInvigilator(req, res, next) {
  try {
    const { full_name, email, phone } = req.body;
    if (!full_name) return res.status(400).json({ success: false, message: 'Invigilator full name is required.' });

    let staff_id = req.body.staff_id?.trim();
    if (!staff_id) staff_id = generateStaffId();

    const password = randomPassword(8);
    const password_hash = await bcrypt.hash(password, 10);
    const invigilator = Invigilator.create({ staff_id, full_name: full_name.trim(), email, phone, password_hash });

    res.status(201).json({
      success: true,
      data: invigilator,
      credentials: { staff_id: invigilator.staff_id, password },
    });
  } catch (err) {
    if (err.message?.includes('UNIQUE')) {
      return res.status(409).json({ success: false, message: 'An invigilator with that staff ID already exists.' });
    }
    next(err);
  }
}

const removeInvigilator = (req, res) => { Invigilator.remove(req.params.id); res.json({ success: true }); };

const assignInvigilator = (req, res) => {
  const { exam_id, invigilator_id } = req.body;
  Invigilator.assignToExam(exam_id, invigilator_id);
  res.json({ success: true });
};

const unassignInvigilator = (req, res) => {
  const { exam_id, invigilator_id } = req.body;
  Invigilator.unassignFromExam(exam_id, invigilator_id);
  res.json({ success: true });
};

module.exports = {
  listStudents, registerStudent, updateStudent, lockStudent, unlockStudent, resetStudentPassword, removeStudent,
  listInvigilators, registerInvigilator, removeInvigilator, assignInvigilator, unassignInvigilator,
};
