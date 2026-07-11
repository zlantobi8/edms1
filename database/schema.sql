-- EMDMS CBT System — SQLite Schema
-- Normalized schema covering academic structure, users, exams, questions,
-- submissions, results and activity logging.

PRAGMA foreign_keys = ON;

-- ============================================================
-- ACADEMIC STRUCTURE
-- ============================================================

CREATE TABLE IF NOT EXISTS faculties (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS departments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  faculty_id INTEGER NOT NULL REFERENCES faculties(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(faculty_id, name)
);

CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE, -- e.g. 2025/2026
  is_active INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS semesters (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  name TEXT NOT NULL, -- e.g. First Semester
  is_active INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(session_id, name)
);

CREATE TABLE IF NOT EXISTS classes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  department_id INTEGER NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  name TEXT NOT NULL, -- e.g. HND I, ND II
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(department_id, name)
);

CREATE TABLE IF NOT EXISTS subjects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  department_id INTEGER NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  title TEXT NOT NULL,
  units INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(department_id, code)
);

-- ============================================================
-- USERS
-- ============================================================

CREATE TABLE IF NOT EXISTS administrators (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  email TEXT,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS invigilators (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  staff_id TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS students (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reg_number TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  department_id INTEGER REFERENCES departments(id) ON DELETE SET NULL,
  class_id INTEGER REFERENCES classes(id) ON DELETE SET NULL,
  passport_path TEXT,
  password_hash TEXT NOT NULL,
  is_locked INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================
-- EXAMS & QUESTIONS
-- ============================================================

CREATE TABLE IF NOT EXISTS examinations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  semester_id INTEGER NOT NULL REFERENCES semesters(id) ON DELETE CASCADE,
  duration_minutes INTEGER NOT NULL DEFAULT 60,
  pass_mark REAL NOT NULL DEFAULT 50,
  total_marks REAL NOT NULL DEFAULT 100,
  exam_date TEXT NOT NULL,          -- YYYY-MM-DD
  start_time TEXT NOT NULL,         -- HH:MM (24hr)
  end_time TEXT NOT NULL,           -- HH:MM (24hr)
  randomize_questions INTEGER NOT NULL DEFAULT 1,
  randomize_options INTEGER NOT NULL DEFAULT 1,
  is_published INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER REFERENCES administrators(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS exam_invigilators (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  exam_id INTEGER NOT NULL REFERENCES examinations(id) ON DELETE CASCADE,
  invigilator_id INTEGER NOT NULL REFERENCES invigilators(id) ON DELETE CASCADE,
  UNIQUE(exam_id, invigilator_id)
);

CREATE TABLE IF NOT EXISTS questions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  exam_id INTEGER NOT NULL REFERENCES examinations(id) ON DELETE CASCADE,
  question_text TEXT NOT NULL,
  marks REAL NOT NULL DEFAULT 1,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS options (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  option_text TEXT NOT NULL,
  is_correct INTEGER NOT NULL DEFAULT 0,
  position INTEGER NOT NULL DEFAULT 0
);

-- ============================================================
-- EXAM ATTEMPTS, ANSWERS, SUBMISSIONS, RESULTS
-- ============================================================

-- One row per student attempt of an exam
CREATE TABLE IF NOT EXISTS submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  exam_id INTEGER NOT NULL REFERENCES examinations(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'in_progress', -- in_progress | submitted | auto_submitted | force_submitted
  question_order TEXT,      -- JSON array of question ids in the order shown to the student
  started_at TEXT,
  submitted_at TEXT,
  time_remaining_seconds INTEGER,
  last_seen_at TEXT,
  is_online INTEGER NOT NULL DEFAULT 0,
  webcam_connected INTEGER NOT NULL DEFAULT 0,
  UNIQUE(exam_id, student_id)
);

CREATE TABLE IF NOT EXISTS answers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  submission_id INTEGER NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  option_id INTEGER REFERENCES options(id) ON DELETE SET NULL,
  is_marked_for_review INTEGER NOT NULL DEFAULT 0,
  answered_at TEXT,
  UNIQUE(submission_id, question_id)
);

CREATE TABLE IF NOT EXISTS results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  submission_id INTEGER NOT NULL UNIQUE REFERENCES submissions(id) ON DELETE CASCADE,
  exam_id INTEGER NOT NULL REFERENCES examinations(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  score REAL NOT NULL DEFAULT 0,
  total_marks REAL NOT NULL DEFAULT 0,
  percentage REAL NOT NULL DEFAULT 0,
  passed INTEGER NOT NULL DEFAULT 0,
  graded_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================
-- ACTIVITY / ANTI-CHEATING LOGS
-- ============================================================

CREATE TABLE IF NOT EXISTS activity_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  submission_id INTEGER REFERENCES submissions(id) ON DELETE CASCADE,
  student_id INTEGER REFERENCES students(id) ON DELETE CASCADE,
  exam_id INTEGER REFERENCES examinations(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL, -- e.g. tab_switch, fullscreen_exit, copy_attempt, webcam_disconnect
  details TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================
-- SURVEILLANCE RECORDINGS
-- ============================================================

-- Each student's webcam feed is recorded client-side (low bitrate, no audio)
-- and streamed to the server in small chunks over plain HTTP as the exam
-- progresses — independent of whether an invigilator is watching live.
-- Only the file path and small metadata live in SQLite; the actual video
-- bytes live on disk (see services/recordingStorage.js) to keep the
-- database itself small and fast.
CREATE TABLE IF NOT EXISTS recordings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  submission_id INTEGER NOT NULL UNIQUE REFERENCES submissions(id) ON DELETE CASCADE,
  exam_id INTEGER NOT NULL REFERENCES examinations(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  mime_type TEXT NOT NULL DEFAULT 'video/webm',
  chunk_count INTEGER NOT NULL DEFAULT 0,
  total_bytes INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'recording', -- recording | completed | failed
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  ended_at TEXT
);

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_questions_exam ON questions(exam_id);
CREATE INDEX IF NOT EXISTS idx_options_question ON options(question_id);
CREATE INDEX IF NOT EXISTS idx_submissions_exam ON submissions(exam_id);
CREATE INDEX IF NOT EXISTS idx_submissions_student ON submissions(student_id);
CREATE INDEX IF NOT EXISTS idx_answers_submission ON answers(submission_id);
CREATE INDEX IF NOT EXISTS idx_results_exam ON results(exam_id);
CREATE INDEX IF NOT EXISTS idx_logs_exam ON activity_logs(exam_id);
CREATE INDEX IF NOT EXISTS idx_students_dept ON students(department_id);
CREATE INDEX IF NOT EXISTS idx_students_class ON students(class_id);
CREATE INDEX IF NOT EXISTS idx_recordings_exam ON recordings(exam_id);
CREATE INDEX IF NOT EXISTS idx_recordings_student ON recordings(student_id);
