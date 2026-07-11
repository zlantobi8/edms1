const Result = require('../models/Result');
const { toCsv } = require('../services/csvService');
const { streamResultsPdf } = require('../services/pdfService');

const listResults = (req, res) => {
  const { exam_id, department_id, class_id } = req.query;
  res.json({ success: true, data: Result.all({ exam_id, department_id, class_id }) });
};

const exportResultsCsv = (req, res) => {
  const { exam_id, department_id, class_id } = req.query;
  const results = Result.all({ exam_id, department_id, class_id });
  const rows = results.map((r) => ({
    reg_number: r.reg_number,
    full_name: r.full_name,
    department: r.department_name || '',
    class: r.class_name || '',
    exam: r.exam_title,
    score: r.score,
    total_marks: r.total_marks,
    percentage: Number(r.percentage).toFixed(2),
    status: r.passed ? 'PASS' : 'FAIL',
    submitted_at: r.submitted_at,
  }));
  const csv = toCsv(rows, ['reg_number', 'full_name', 'department', 'class', 'exam', 'score', 'total_marks', 'percentage', 'status', 'submitted_at']);
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="emdms_results.csv"');
  res.send(csv);
};

const exportResultsPdf = (req, res) => {
  const { exam_id, department_id, class_id } = req.query;
  const results = Result.all({ exam_id, department_id, class_id });
  const title = exam_id && results[0] ? results[0].exam_title : 'All Examinations';
  streamResultsPdf(res, title, results);
};

const studentResults = (req, res) => res.json({ success: true, data: Result.forStudent(req.params.studentId) });

module.exports = { listResults, exportResultsCsv, exportResultsPdf, studentResults };
