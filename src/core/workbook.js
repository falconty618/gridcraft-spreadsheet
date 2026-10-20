import { cellsInRange, indexToColumn, parseAddress, toAddress } from './address.js';
import { rewriteFormulaForStructure } from './formula.js';

let idCounter = 1;
const newId = (prefix) => `${prefix}_${Date.now().toString(36)}_${(idCounter++).toString(36)}`;

export function createCell(input = '', style = {}) {
  return { input, type: 'empty', value: null, display: '', error: null, style };
}

export function createSheet(name = 'Sheet 1') {
  return {
    id: newId('sheet'),
    name,
    cells: {},
    rowHeights: {},
    colWidths: {},
    hiddenRows: [],
    hiddenCols: [],
    filters: [],
    sort: null,
    conditionalFormats: [],
    tables: [],
    charts: [],
    freeze: { rows: 0, cols: 0 },
  };
}

export function createWorkbook() {
  const sheet = createSheet();
  return {
    schemaVersion: 1,
    id: newId('book'),
    title: 'Untitled workbook',
    activeSheetId: sheet.id,
    sheets: [sheet],
    namedRanges: {},
    updatedAt: new Date().toISOString(),
  };
}

export function sampleWorkbook() {
  const workbook = createWorkbook();
  workbook.title = 'Quarterly plan';
  const sheet = workbook.sheets[0];
  sheet.name = 'Plan';
  const values = [
    ['Product', 'Q1', 'Q2', 'Q3', 'Q4', 'Total'],
    ['Northwind', 12400, 13900, 15200, 16800, '=SUM(B2:E2)'],
    ['Harbor', 9800, 10750, 12100, 13400, '=SUM(B3:E3)'],
    ['Islander', 7600, 8250, 9300, 10100, '=SUM(B4:E4)'],
    ['Total', '=SUM(B2:B4)', '=SUM(C2:C4)', '=SUM(D2:D4)', '=SUM(E2:E4)', '=SUM(F2:F4)'],
  ];
  values.forEach((row, r) => row.forEach((value, c) => {
    sheet.cells[toAddress(r, c)] = createCell(String(value), r === 0 || c === 0 ? { bold: true } : {});
  }));
  sheet.tables.push({ id: newId('table'), name: 'QuarterlyPlan', range: 'A1:F5', hasHeaders: true, style: 'green' });
  return workbook;
}

export const cloneWorkbook = (workbook) => JSON.parse(JSON.stringify(workbook));

export function activeSheet(workbook) {
  return workbook.sheets.find((sheet) => sheet.id === workbook.activeSheetId) || workbook.sheets[0];
}

export function getSheet(workbook, idOrName) {
  const needle = String(idOrName || '').toLowerCase();
  return workbook.sheets.find((sheet) => sheet.id === idOrName || sheet.name.toLowerCase() === needle);
}

export function getCell(sheet, address) {
  return sheet?.cells?.[String(address).replace(/\$/g, '').toUpperCase()] || createCell();
}

export function setCellInput(sheet, address, input) {
  const key = String(address).replace(/\$/g, '').toUpperCase();
  const previous = sheet.cells[key] || createCell();
  if (input === '' && Object.keys(previous.style || {}).length === 0 && !previous.validation) {
    delete sheet.cells[key];
    return;
  }
  sheet.cells[key] = { ...previous, input: String(input), error: null };
}

export function setRangeStyle(sheet, range, patch) {
  for (const { address } of cellsInRange(range)) {
    const current = sheet.cells[address] || createCell();
    current.style = { ...current.style, ...patch };
    sheet.cells[address] = current;
  }
}

export function clearRange(sheet, range) {
  for (const { address } of cellsInRange(range)) {
    const current = sheet.cells[address];
    if (!current) continue;
    if (Object.keys(current.style || {}).length || current.validation) {
      sheet.cells[address] = { ...createCell('', current.style), validation: current.validation };
    } else {
      delete sheet.cells[address];
    }
  }
}

export function addSheet(workbook, name) {
  const base = name || 'Sheet';
  let candidate = base;
  let n = 1;
  while (workbook.sheets.some((sheet) => sheet.name.toLowerCase() === candidate.toLowerCase())) candidate = `${base} ${++n}`;
  const sheet = createSheet(candidate);
  workbook.sheets.push(sheet);
  workbook.activeSheetId = sheet.id;
  return sheet;
}

export function deleteSheet(workbook, sheetId) {
  if (workbook.sheets.length === 1) throw new Error('A workbook must contain at least one sheet.');
  const index = workbook.sheets.findIndex((sheet) => sheet.id === sheetId);
  if (index < 0) return;
  workbook.sheets.splice(index, 1);
  workbook.activeSheetId = workbook.sheets[Math.max(0, index - 1)].id;
}

export function renameSheet(workbook, sheetId, name) {
  const trimmed = String(name).trim();
  if (!trimmed) throw new Error('Sheet name cannot be empty.');
  if (workbook.sheets.some((sheet) => sheet.id !== sheetId && sheet.name.toLowerCase() === trimmed.toLowerCase())) {
    throw new Error('Sheet names must be unique.');
  }
  const sheet = getSheet(workbook, sheetId);
  const oldName = sheet.name;
  sheet.name = trimmed;
  for (const owner of workbook.sheets) {
    for (const cell of Object.values(owner.cells)) {
      if (cell.input?.startsWith('=')) {
        const escaped = oldName.replace(/[.*+?^$()|[\]\\]/g, '\\$&');
        cell.input = cell.input.replace(new RegExp(`('?${escaped}'?)!`, 'gi'), () => {
          const safe = /^[A-Za-z_]\w*$/.test(trimmed) ? trimmed : `'${trimmed.replace(/'/g, "''")}'`;
          return `${safe}!`;
        });
      }
    }
  }
}

export function moveSheet(workbook, sheetId, delta) {
  const index = workbook.sheets.findIndex((sheet) => sheet.id === sheetId);
  const next = Math.max(0, Math.min(workbook.sheets.length - 1, index + delta));
  if (index === next || index < 0) return;
  const [sheet] = workbook.sheets.splice(index, 1);
  workbook.sheets.splice(next, 0, sheet);
}

function remapCells(sheet, mapper) {
  const next = {};
  for (const [address, cell] of Object.entries(sheet.cells)) {
    const point = parseAddress(address);
    const mapped = mapper(point);
    if (mapped && mapped.row >= 0 && mapped.col >= 0) next[toAddress(mapped.row, mapped.col)] = cell;
  }
  sheet.cells = next;
}

export function mutateStructure(workbook, sheetId, axis, index, count, operation) {
  const sheet = getSheet(workbook, sheetId);
  const isRow = axis === 'row';
  const isInsert = operation === 'insert';
  remapCells(sheet, (point) => {
    const coordinate = isRow ? point.row : point.col;
    if (!isInsert && coordinate >= index && coordinate < index + count) return null;
    if (coordinate < index) return point;
    const shifted = isInsert ? coordinate + count : coordinate - count;
    return isRow ? { ...point, row: shifted } : { ...point, col: shifted };
  });
  for (const owner of workbook.sheets) {
    for (const cell of Object.values(owner.cells)) {
      if (cell.input?.startsWith('=')) {
        cell.input = rewriteFormulaForStructure(cell.input, {
          targetSheet: sheet.name,
          formulaSheet: owner.name,
          axis,
          index,
          count,
          operation,
        });
      }
    }
  }
  const dimensionKey = isRow ? 'rowHeights' : 'colWidths';
  const shiftedDimensions = {};
  for (const [key, value] of Object.entries(sheet[dimensionKey])) {
    const coordinate = Number(key);
    if (!isInsert && coordinate >= index && coordinate < index + count) continue;
    const shifted = coordinate < index ? coordinate : coordinate + (isInsert ? count : -count);
    if (shifted >= 0) shiftedDimensions[shifted] = value;
  }
  sheet[dimensionKey] = shiftedDimensions;
}

export function usedRange(sheet) {
  const points = Object.keys(sheet.cells).map(parseAddress).filter(Boolean);
  if (!points.length) return { startRow: 0, endRow: 0, startCol: 0, endCol: 0 };
  return {
    startRow: Math.min(...points.map((p) => p.row)),
    endRow: Math.max(...points.map((p) => p.row)),
    startCol: Math.min(...points.map((p) => p.col)),
    endCol: Math.max(...points.map((p) => p.col)),
  };
}

export function formatDisplay(cell) {
  if (cell.error) return cell.error;
  if (cell.value == null) return '';
  const style = cell.style || {};
  if (typeof cell.value === 'number') {
    const decimals = Math.max(0, Number(style.decimals ?? 2));
    if (style.numberFormat === 'percent') return `${(cell.value * 100).toFixed(decimals)}%`;
    if (style.numberFormat === 'currency') return new Intl.NumberFormat(undefined, { style: 'currency', currency: style.currency || 'USD', maximumFractionDigits: decimals }).format(cell.value);
    return new Intl.NumberFormat(undefined, { maximumFractionDigits: decimals }).format(cell.value);
  }
  if (cell.type === 'boolean') return cell.value ? 'TRUE' : 'FALSE';
  if (cell.type === 'date') {
    const date = new Date(`${cell.value}T00:00:00`);
    return Number.isNaN(date.valueOf()) ? String(cell.value) : date.toLocaleDateString();
  }
  return String(cell.value);
}

export function hydrateWorkbook(candidate) {
  if (!candidate || candidate.schemaVersion !== 1 || !Array.isArray(candidate.sheets) || !candidate.sheets.length) {
    throw new Error('This is not a supported Gridcraft workbook.');
  }
  const workbook = cloneWorkbook(candidate);
  for (const sheet of workbook.sheets) {
    sheet.cells ||= {};
    sheet.rowHeights ||= {};
    sheet.colWidths ||= {};
    sheet.hiddenRows ||= [];
    sheet.hiddenCols ||= [];
    sheet.filters ||= [];
    sheet.conditionalFormats ||= [];
    sheet.tables ||= [];
    sheet.charts ||= [];
    sheet.freeze ||= { rows: 0, cols: 0 };
  }
  workbook.namedRanges ||= {};
  return workbook;
}

export function displayColumnLabel(col) {
  return indexToColumn(col);
}
