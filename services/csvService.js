const { parse } = require('csv-parse/sync');
const { stringify } = require('csv-stringify/sync');

/**
 * Parses a CSV buffer/string into an array of row objects using the first
 * row as headers. Expected question-import headers:
 * question_text, marks, option_a, option_b, option_c, option_d, correct_option
 */
function parseCsv(content) {
  return parse(content, {
    columns: (headers) => headers.map((h) => h.trim().toLowerCase().replace(/\s+/g, '_')),
    skip_empty_lines: true,
    trim: true,
  });
}

function toCsv(rows, columns) {
  return stringify(rows, { header: true, columns });
}

module.exports = { parseCsv, toCsv };
