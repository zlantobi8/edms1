const PDFDocument = require('pdfkit');

/**
 * Streams a formatted result-sheet PDF directly to the given HTTP response.
 * `title` is the report heading (e.g. exam title or "All Results"),
 * `results` is an array of rows with reg_number, full_name, department_name,
 * score, total_marks, percentage, passed.
 */
function streamResultsPdf(res, title, results) {
  const doc = new PDFDocument({ margin: 40, size: 'A4', layout: 'landscape' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${title.replace(/\s+/g, '_')}_results.pdf"`);
  doc.pipe(res);

  doc.fontSize(18).text('EMDMS — Examination Result Sheet', { align: 'center' });
  doc.fontSize(12).text(title, { align: 'center' });
  doc.moveDown(1);
  doc.fontSize(9).text(`Generated: ${new Date().toLocaleString()}`, { align: 'center' });
  doc.moveDown(1);

  const colWidths = [90, 150, 130, 60, 60, 60, 60];
  const headers = ['Reg. Number', 'Full Name', 'Department', 'Score', 'Total', '%', 'Status'];
  let y = doc.y;
  const startX = doc.page.margins.left;

  function drawRow(cells, isHeader = false) {
    let x = startX;
    doc.font(isHeader ? 'Helvetica-Bold' : 'Helvetica').fontSize(9);
    cells.forEach((cell, i) => {
      doc.text(String(cell), x, y, { width: colWidths[i], ellipsis: true });
      x += colWidths[i];
    });
    y += 18;
    if (y > doc.page.height - doc.page.margins.bottom) {
      doc.addPage({ margin: 40, size: 'A4', layout: 'landscape' });
      y = doc.page.margins.top;
    }
  }

  drawRow(headers, true);
  doc.moveTo(startX, y).lineTo(startX + colWidths.reduce((a, b) => a + b, 0), y).stroke();
  y += 4;

  results.forEach((r) => {
    drawRow([
      r.reg_number, r.full_name, r.department_name || '-',
      r.score, r.total_marks, `${Number(r.percentage).toFixed(1)}%`,
      r.passed ? 'PASS' : 'FAIL',
    ]);
  });

  doc.end();
}

/**
 * Streams a printable Incident Report PDF: a per-student summary of flagged
 * events (counts by type) followed by the full chronological timeline.
 * `exam` is the examinations row, `summary` comes from
 * ActivityLog.summaryForExam, `timeline` from ActivityLog.forExam.
 */
function streamIncidentReportPdf(res, exam, summary, timeline, labels, highSeverity) {
  const title = exam ? exam.title : `Exam #${timeline[0]?.exam_id || ''}`;
  const doc = new PDFDocument({ margin: 40, size: 'A4' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="incident_report_${String(title).replace(/\s+/g, '_')}.pdf"`);
  doc.pipe(res);

  doc.fontSize(18).text('EMDMS — Incident Report', { align: 'center' });
  doc.fontSize(12).text(title, { align: 'center' });
  doc.fontSize(9).fillColor('#666').text(`Generated: ${new Date().toLocaleString()}`, { align: 'center' });
  doc.fillColor('#000');
  doc.moveDown(1.5);

  // ---- Summary table (one row per flagged student) ----
  doc.fontSize(13).text('Summary — Flagged Students', { underline: false });
  doc.moveDown(0.5);

  const startX = doc.page.margins.left;
  const summaryWidths = [140, 90, 70, 220];
  let y = doc.y;

  function drawRow(cells, widths, isHeader = false) {
    let x = startX;
    doc.font(isHeader ? 'Helvetica-Bold' : 'Helvetica').fontSize(9);
    cells.forEach((cell, i) => {
      doc.text(String(cell), x, y, { width: widths[i], ellipsis: true });
      x += widths[i];
    });
    y += 18;
    if (y > doc.page.height - doc.page.margins.bottom) {
      doc.addPage({ margin: 40, size: 'A4' });
      y = doc.page.margins.top;
    }
  }

  if (!summary.length) {
    doc.fontSize(10).fillColor('#666').text('No incidents were flagged for this examination.', startX, y);
    doc.fillColor('#000');
    y = doc.y + 20;
  } else {
    drawRow(['Student', 'Reg. Number', 'Total', 'Breakdown'], summaryWidths, true);
    doc.moveTo(startX, y).lineTo(startX + summaryWidths.reduce((a, b) => a + b, 0), y).stroke();
    y += 4;
    summary.forEach((s) => {
      const breakdown = Object.entries(s.by_type)
        .map(([type, count]) => `${labels[type] || type} (${count})`)
        .join(', ');
      drawRow([s.full_name, s.reg_number, s.total_events, breakdown], summaryWidths);
    });
  }

  // ---- Full timeline ----
  doc.addPage({ margin: 40, size: 'A4' });
  y = doc.y;
  doc.fontSize(13).text('Full Timeline', startX, y);
  y = doc.y + 10;

  const timelineWidths = [110, 100, 130, 130];
  drawRow(['Time', 'Student', 'Event', 'Severity'], timelineWidths, true);
  doc.moveTo(startX, y).lineTo(startX + timelineWidths.reduce((a, b) => a + b, 0), y).stroke();
  y += 4;

  if (!timeline.length) {
    doc.fontSize(10).fillColor('#666').text('No events recorded.', startX, y);
    doc.fillColor('#000');
  } else {
    timeline.forEach((t) => {
      drawRow([
        t.created_at, t.full_name || '(unknown)',
        labels[t.event_type] || t.event_type,
        highSeverity.has(t.event_type) ? 'High' : 'Normal',
      ], timelineWidths);
    });
  }

  doc.end();
}

module.exports = { streamResultsPdf, streamIncidentReportPdf };
