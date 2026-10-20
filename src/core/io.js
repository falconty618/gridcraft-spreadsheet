import { createCell, createWorkbook, usedRange } from './workbook.js';
import { toAddress } from './address.js';

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  const source = String(text).replace(/^\uFEFF/, '');
  for (let index = 0; index <= source.length; index += 1) {
    const char = source[index] ?? '\n';
    if (quoted) {
      if (char === '"' && source[index + 1] === '"') { field += '"'; index += 1; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') { row.push(field); field = ''; }
    else if (char === '\n') {
      row.push(field.replace(/\r$/, ''));
      if (row.some((value) => value !== '') || rows.length) rows.push(row);
      row = []; field = '';
    } else field += char;
  }
  return rows;
}

const quoteCsv = (value) => {
  const text = String(value ?? '');
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

export function sheetToCsv(sheet) {
  const range = usedRange(sheet);
  const lines = [];
  for (let row = range.startRow; row <= range.endRow; row += 1) {
    const values = [];
    for (let col = range.startCol; col <= range.endCol; col += 1) {
      const cell = sheet.cells[toAddress(row, col)];
      values.push(quoteCsv(cell?.input?.startsWith('=') ? cell.input : (cell?.value ?? '')));
    }
    lines.push(values.join(','));
  }
  return lines.join('\r\n');
}

export function csvToWorkbook(text, name = 'Imported data') {
  const workbook = createWorkbook();
  workbook.title = name.replace(/\.csv$/i, '') || 'Imported data';
  const sheet = workbook.sheets[0];
  sheet.name = 'Imported';
  parseCsv(text).forEach((row, r) => row.forEach((input, c) => {
    if (input !== '') sheet.cells[toAddress(r, c)] = createCell(input);
  }));
  return workbook;
}

export function downloadText(filename, text, type = 'text/plain') {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function safeFileName(value) {
  return String(value || 'workbook').replace(/[<>:"/\\|?*]+/g, '-').replace(/\s+/g, '-').toLowerCase();
}
