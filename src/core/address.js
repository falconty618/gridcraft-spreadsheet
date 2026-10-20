export const MAX_ROWS = 10000;
export const MAX_COLS = 200;

export function indexToColumn(index) {
  let value = index + 1;
  let result = '';
  while (value > 0) {
    value -= 1;
    result = String.fromCharCode(65 + (value % 26)) + result;
    value = Math.floor(value / 26);
  }
  return result;
}

export function columnToIndex(column) {
  let value = 0;
  for (const char of String(column).toUpperCase()) {
    if (char < 'A' || char > 'Z') return -1;
    value = value * 26 + char.charCodeAt(0) - 64;
  }
  return value - 1;
}

export function toAddress(row, col) {
  return `${indexToColumn(col)}${row + 1}`;
}

export function parseAddress(address) {
  const match = /^\$?([A-Z]+)\$?([1-9]\d*)$/i.exec(String(address).trim());
  if (!match) return null;
  return { row: Number(match[2]) - 1, col: columnToIndex(match[1]) };
}

export function parseReference(reference) {
  const match = /^(?:(?:'((?:[^']|'')+)'|([A-Za-z_][\w ]*))!)?(\$?)([A-Z]+)(\$?)([1-9]\d*)$/i.exec(String(reference).trim());
  if (!match) return null;
  return {
    sheet: (match[1] || match[2] || '').replace(/''/g, "'") || null,
    colAbsolute: match[3] === '$',
    col: columnToIndex(match[4]),
    rowAbsolute: match[5] === '$',
    row: Number(match[6]) - 1,
  };
}

export function formatReference(ref, includeSheet = true) {
  const sheet = includeSheet && ref.sheet
    ? (/^[A-Za-z_]\w*$/.test(ref.sheet) ? ref.sheet : `'${ref.sheet.replace(/'/g, "''")}'`) + '!'
    : '';
  return `${sheet}${ref.colAbsolute ? '$' : ''}${indexToColumn(ref.col)}${ref.rowAbsolute ? '$' : ''}${ref.row + 1}`;
}

export function normalizeRange(anchor, focus) {
  return {
    startRow: Math.min(anchor.row, focus.row),
    endRow: Math.max(anchor.row, focus.row),
    startCol: Math.min(anchor.col, focus.col),
    endCol: Math.max(anchor.col, focus.col),
  };
}

export function parseRange(text) {
  const [left, right = left] = String(text).split(':');
  const a = parseAddress(left);
  const b = parseAddress(right);
  return a && b ? normalizeRange(a, b) : null;
}

export function rangeToA1(range) {
  const start = toAddress(range.startRow, range.startCol);
  const end = toAddress(range.endRow, range.endCol);
  return start === end ? start : `${start}:${end}`;
}

export function* cellsInRange(range) {
  for (let row = range.startRow; row <= range.endRow; row += 1) {
    for (let col = range.startCol; col <= range.endCol; col += 1) {
      yield { row, col, address: toAddress(row, col) };
    }
  }
}

export function rangeContains(range, row, col) {
  return row >= range.startRow && row <= range.endRow && col >= range.startCol && col <= range.endCol;
}
