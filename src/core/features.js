import { cellsInRange, parseRange, toAddress } from './address.js';
import { createCell, formatDisplay, getCell } from './workbook.js';

const compareValues = (a, b) => {
  if (a == null || a === '') return 1;
  if (b == null || b === '') return -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
};

export function sortRange(sheet, range, column, direction = 'asc', hasHeader = true) {
  const start = range.startRow + (hasHeader ? 1 : 0);
  const rows = [];
  for (let row = start; row <= range.endRow; row += 1) {
    const record = [];
    for (let col = range.startCol; col <= range.endCol; col += 1) record.push(JSON.parse(JSON.stringify(getCell(sheet, toAddress(row, col)))));
    rows.push(record);
  }
  const key = Math.max(0, Math.min(column - range.startCol, range.endCol - range.startCol));
  rows.sort((left, right) => compareValues(left[key].value, right[key].value) * (direction === 'desc' ? -1 : 1));
  rows.forEach((record, offset) => record.forEach((cell, colOffset) => {
    sheet.cells[toAddress(start + offset, range.startCol + colOffset)] = cell;
  }));
}

export function applyFilter(sheet, filter) {
  sheet.filters = sheet.filters.filter((item) => item.range !== filter.range);
  sheet.filters.push(filter);
}

export function rowPassesFilters(sheet, row) {
  return sheet.filters.every((filter) => {
    const range = parseRange(filter.range);
    if (!range || row <= range.startRow || row > range.endRow) return true;
    const value = getCell(sheet, toAddress(row, filter.column)).value;
    const needle = filter.value;
    if (filter.operator === 'contains') return String(value ?? '').toLowerCase().includes(String(needle).toLowerCase());
    if (filter.operator === 'equals') return String(value ?? '') === String(needle);
    if (filter.operator === 'notEquals') return String(value ?? '') !== String(needle);
    if (filter.operator === 'greater') return Number(value) > Number(needle);
    if (filter.operator === 'less') return Number(value) < Number(needle);
    return true;
  });
}

export function validateInput(cell, input) {
  const rule = cell.validation;
  if (!rule || input === '') return { valid: true };
  if (rule.type === 'list') {
    const valid = rule.values.some((value) => String(value) === String(input));
    return { valid, message: valid ? '' : `Choose one of: ${rule.values.join(', ')}` };
  }
  if (rule.type === 'number') {
    const value = Number(input);
    const valid = Number.isFinite(value) && (rule.min == null || value >= rule.min) && (rule.max == null || value <= rule.max);
    return { valid, message: valid ? '' : `Enter a number between ${rule.min ?? '-infinity'} and ${rule.max ?? 'infinity'}.` };
  }
  if (rule.type === 'date') {
    const timestamp = new Date(input).valueOf();
    const valid = !Number.isNaN(timestamp) && (!rule.min || timestamp >= new Date(rule.min).valueOf()) && (!rule.max || timestamp <= new Date(rule.max).valueOf());
    return { valid, message: valid ? '' : 'Enter a date within the permitted range.' };
  }
  return { valid: true };
}

export function conditionalStyle(sheet, row, col, baseStyle = {}) {
  const address = toAddress(row, col);
  const cell = getCell(sheet, address);
  let style = { ...baseStyle };
  for (const rule of sheet.conditionalFormats) {
    const range = parseRange(rule.range);
    if (!range || row < range.startRow || row > range.endRow || col < range.startCol || col > range.endCol) continue;
    const value = cell.value;
    let matches = false;
    if (rule.operator === 'greater') matches = Number(value) > Number(rule.value);
    if (rule.operator === 'less') matches = Number(value) < Number(rule.value);
    if (rule.operator === 'equals') matches = String(value) === String(rule.value);
    if (rule.operator === 'contains') matches = String(value ?? '').toLowerCase().includes(String(rule.value).toLowerCase());
    if (rule.operator === 'blank') matches = value == null || value === '';
    if (rule.operator === 'notBlank') matches = value != null && value !== '';
    if (matches) style = { ...style, background: rule.color || '#dff4e8', color: rule.textColor || '#173f2a' };
  }
  return style;
}

export function selectionStats(sheet, range) {
  const values = [...cellsInRange(range)].map(({ address }) => getCell(sheet, address).value);
  const numbers = values.filter((value) => typeof value === 'number' && Number.isFinite(value));
  return {
    count: values.filter((value) => value !== '' && value != null).length,
    sum: numbers.reduce((total, value) => total + value, 0),
    average: numbers.length ? numbers.reduce((total, value) => total + value, 0) / numbers.length : null,
    min: numbers.length ? Math.min(...numbers) : null,
    max: numbers.length ? Math.max(...numbers) : null,
  };
}

export function makeTable(sheet, range, name) {
  sheet.tables.push({ id: `table_${Date.now().toString(36)}`, name, range, hasHeaders: true, style: 'green' });
  for (const { row, address } of cellsInRange(parseRange(range))) {
    if (row === parseRange(range).startRow) {
      const cell = sheet.cells[address] || createCell();
      cell.style = { ...cell.style, bold: true, color: '#ffffff', background: '#1e5c48' };
      sheet.cells[address] = cell;
    }
  }
}

export function refreshDisplays(sheet) {
  Object.values(sheet.cells).forEach((cell) => { cell.display = formatDisplay(cell); });
}
