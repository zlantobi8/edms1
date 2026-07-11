const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const Admin = require('../models/Admin');
const Invigilator = require('../models/Invigilator');
const Student = require('../models/Student');

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '8h';

function issueToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

function setCookieAndRespond(res, token, user) {
  res.cookie('emdms_token', token, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 8 * 60 * 60 * 1000,
  });
  res.json({ success: true, token, user });
}

async function adminLogin(req, res, next) {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ success: false, message: 'Username and password are required.' });
    }
    const admin = Admin.findByUsername(username.trim());
    if (!admin || !(await bcrypt.compare(password, admin.password_hash))) {
      return res.status(401).json({ success: false, message: 'Invalid username or password.' });
    }
    const token = issueToken({ id: admin.id, role: 'administrator', name: admin.full_name });
    setCookieAndRespond(res, token, {
      id: admin.id, role: 'administrator', full_name: admin.full_name, username: admin.username,
    });
  } catch (err) { next(err); }
}

async function invigilatorLogin(req, res, next) {
  try {
    const { staff_id, password } = req.body;
    if (!staff_id || !password) {
      return res.status(400).json({ success: false, message: 'Staff ID and password are required.' });
    }
    const invigilator = Invigilator.findByStaffId(staff_id.trim());
    if (!invigilator || !(await bcrypt.compare(password, invigilator.password_hash))) {
      return res.status(401).json({ success: false, message: 'Invalid staff ID or password.' });
    }
    const token = issueToken({ id: invigilator.id, role: 'invigilator', name: invigilator.full_name });
    setCookieAndRespond(res, token, {
      id: invigilator.id, role: 'invigilator', full_name: invigilator.full_name, staff_id: invigilator.staff_id,
    });
  } catch (err) { next(err); }
}

async function studentLogin(req, res, next) {
  try {
    const { reg_number, password } = req.body;
    if (!reg_number || !password) {
      return res.status(400).json({ success: false, message: 'Registration number and password are required.' });
    }
    const student = Student.findByRegNumber(reg_number.trim());
    if (!student || !(await bcrypt.compare(password, student.password_hash))) {
      return res.status(401).json({ success: false, message: 'Invalid registration number or password.' });
    }
    if (student.is_locked) {
      return res.status(403).json({ success: false, message: 'Your account has been locked by an invigilator. Please see your exam supervisor.' });
    }
    const token = issueToken({ id: student.id, role: 'student', name: student.full_name });
    setCookieAndRespond(res, token, {
      id: student.id, role: 'student', full_name: student.full_name, reg_number: student.reg_number,
      department_id: student.department_id, class_id: student.class_id, passport_path: student.passport_path,
    });
  } catch (err) { next(err); }
}

function logout(req, res) {
  res.clearCookie('emdms_token');
  res.json({ success: true, message: 'Logged out.' });
}

function me(req, res) {
  res.json({ success: true, user: req.user });
}

module.exports = { adminLogin, invigilatorLogin, studentLogin, logout, me };
