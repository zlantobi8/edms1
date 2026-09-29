/**
 * Seeds the academic structure from the School of Pure and Applied
 * Sciences (SPAS) tentative exam time-table:
 *   - 1 faculty  (SPAS)
 *   - 6 departments (CS, FT, GCT, SA, ST, HM)
 *   - 4 levels per department (ND I, ND II, HND I, HND II)
 *   - the CS department's course list (SWD / NCC / COM / AIT / CYS / STA / MTH)
 *
 * Run with:  node scripts/seed-academic.js
 *
 * Safe to re-run — every insert is "create if it doesn't already exist",
 * so running it twice will not create duplicates.
 *
 * To seed another department's courses later, copy the `CS` block in
 * COURSE_CATALOG below, fill in that department's code/title pairs from
 * the time-table, and re-run this script.
 */
const { db, initializeDatabase } = require('../database/db');
const { Faculty, Department, ClassModel, Subject } = require('../models/Academic');

initializeDatabase();

const FACULTY_NAME = 'School of Pure and Applied Sciences (SPAS)';

const DEPARTMENTS = [
  { code: 'CS', name: 'CS — Computer Science (Software & Web Development)' },
  { code: 'FT', name: 'FT — Food Technology' },
  { code: 'GCT', name: 'GCT — Glass & Ceramics Technology' },
  { code: 'SA', name: 'SA — Statistics' },
  { code: 'ST', name: 'ST — Science Laboratory Technology' },
  { code: 'HM', name: 'HM — Hospitality Management' },
];

const LEVELS = ['ND I', 'ND II', 'HND I', 'HND II'];

// Course catalog, department code -> [{ level, code, title, units }]
// Only CS is populated for now (per the "SWD courses first" request) —
// add the other five departments here the same way once their course
// lists are ready.
const COURSE_CATALOG = {
  CS: [
    { level: 'ND I', code: 'COM 121', title: 'Programming Using C Language' },
    { level: 'ND I', code: 'COM 123', title: 'Programming Languages Using Java' },
    { level: 'ND I', code: 'COM 124', title: 'Data Structure & Algorithms' },
    { level: 'ND I', code: 'COM 125', title: 'Introduction to System Analysis and Design' },
    { level: 'ND I', code: 'COM 126', title: 'PC Upgrade and Maintenance' },
    { level: 'ND I', code: 'STA 122', title: 'Statistics Theory I' },
    { level: 'ND II', code: 'COM 221', title: 'Basic Computer Networking' },
    { level: 'ND II', code: 'COM 223', title: 'Basic Hardware Maintenance' },
    { level: 'ND II', code: 'COM 224', title: 'Management Information System' },
    { level: 'ND II', code: 'COM 225', title: 'Web Technology' },
    { level: 'ND II', code: 'COM 226', title: 'File Organization & Management' },
    { level: 'ND II', code: 'COM 227', title: 'Data Management I' },
    { level: 'ND II', code: 'MTH 224', title: 'Calculus' },
    { level: 'HND I', code: 'SWD 321', title: 'Python Programming' },
    { level: 'HND I', code: 'AIT 313', title: 'Artificial Intelligence' },
    { level: 'HND I', code: 'SWD 322', title: 'Database Design 2' },
    { level: 'HND I', code: 'CYS 322', title: 'Mobile Wireless Security' },
    { level: 'HND I', code: 'SWD 323', title: 'Frontend Development 1' },
    { level: 'HND I', code: 'NCC 321', title: 'Routing and Switching' },
    { level: 'HND I', code: 'SWD 324', title: 'Backend Development 1' },
    { level: 'HND I', code: 'NCC 322', title: 'Cloud Computing 1' },
    { level: 'HND I', code: 'SWD 328', title: 'Rapid Application Development (CMS)' },
    { level: 'HND I', code: 'SWD 326', title: 'Research Methods in SWD' },
    { level: 'HND I', code: 'NCC 325', title: 'Advance Wireless Network' },
    { level: 'HND I', code: 'NCC 323', title: 'Advanced Statistics for Computing' },
    { level: 'HND I', code: 'COM 312', title: 'Database Design' },
    { level: 'HND II', code: 'NCC 421', title: 'Cloud Computing II' },
    { level: 'HND II', code: 'SWD 421', title: 'Human Computer Interaction' },
    { level: 'HND II', code: 'SWD 422', title: 'Ethical & Professional Practice in SWD' },
    { level: 'HND II', code: 'NCC 423', title: 'Ethical & Professional Practice' },
    { level: 'HND II', code: 'COM 427', title: 'Computer Hardware System' },
    { level: 'HND II', code: 'SWD 423', title: 'Software Testing & Quality Assurance' },
    { level: 'HND II', code: 'SWD 425', title: 'Security in SWD' },
    { level: 'HND II', code: 'COM 428', title: 'Scientific Programming Language Using Java II' },
    { level: 'HND II', code: 'NCC 422', title: 'Enterprise Networking, Security & Automation' },
    { level: 'HND II', code: 'NCC 424', title: 'Internet of Things (IOT)' },
    { level: 'HND II', code: 'COM 423', title: 'Expert System & Machine Learning' },
    { level: 'HND II', code: 'COM 422', title: 'Computer Graphic & Animation' },
  ],
};

function findOrCreateFaculty(name) {
  const existing = Faculty.all().find((f) => f.name === name);
  return existing || Faculty.create(name);
}

function findOrCreateDepartment(facultyId, name) {
  const existing = Department.all().find((d) => d.name === name && d.faculty_id === facultyId);
  return existing || Department.create(facultyId, name);
}

function findOrCreateLevel(departmentId, name) {
  const existing = ClassModel.all().find((c) => c.name === name && c.department_id === departmentId);
  return existing || ClassModel.create(departmentId, name);
}

function findOrCreateCourse(departmentId, code, title, units) {
  const existing = Subject.all().find((s) => s.code === code && s.department_id === departmentId);
  return existing || Subject.create({ department_id: departmentId, code, title, units: units || 2 });
}

function run() {
  const faculty = findOrCreateFaculty(FACULTY_NAME);
  console.log(`Faculty: ${faculty.name} (#${faculty.id})`);

  let levelCount = 0;
  let courseCount = 0;

  for (const dept of DEPARTMENTS) {
    const department = findOrCreateDepartment(faculty.id, dept.name);
    console.log(`  Department: ${department.name} (#${department.id})`);

    for (const level of LEVELS) {
      findOrCreateLevel(department.id, level);
      levelCount += 1;
    }

    const courses = COURSE_CATALOG[dept.code] || [];
    for (const course of courses) {
      findOrCreateCourse(department.id, course.code, course.title, 2);
      courseCount += 1;
    }
    if (courses.length) {
      console.log(`    + ${courses.length} courses seeded`);
    }
  }

  console.log(`\nDone. ${DEPARTMENTS.length} departments, ${levelCount} levels, ${courseCount} course rows processed.`);
  console.log('Only the CS department has courses so far — add the other departments to COURSE_CATALOG in this file and re-run to fill them in.');
}

run();
db.close?.();
