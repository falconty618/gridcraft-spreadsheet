import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorkbook, addSheet, getCell, hydrateWorkbook, mutateStructure, setCellInput } from '../src/core/workbook.js';
import { recalculateWorkbook } from '../src/core/recalculate.js';
import { translateFormula } from '../src/core/formula.js';
import { copyRange, pastePayload } from '../src/core/clipboard.js';
import { sortRange } from '../src/core/features.js';
import { csvToWorkbook, parseCsv, sheetToCsv } from '../src/core/io.js';

function set(sheet, address, value) {
  setCellInput(sheet, address, String(value));
}

test('formula engine handles arithmetic, comparisons, ranges, and core functions', () => {
  const workbook = createWorkbook();
  const sheet = workbook.sheets[0];
  set(sheet, 'A1', 10);
  set(sheet, 'A2', 20);
  set(sheet, 'A3', '=SUM(A1:A2)');
  set(sheet, 'B1', '=IF(A3>=30,AVERAGE(A1:A2),0)');
  set(sheet, 'B2', '=AND(A1<20,A2=20,NOT(FALSE))');
  recalculateWorkbook(workbook);
  assert.equal(getCell(sheet, 'A3').value, 30);
  assert.equal(getCell(sheet, 'B1').value, 15);
  assert.equal(getCell(sheet, 'B2').value, true);
});

test('dependency chains recalculate after a source edit', () => {
  const workbook = createWorkbook();
  const sheet = workbook.sheets[0];
  set(sheet, 'A1', 2);
  set(sheet, 'B1', '=A1*3');
  set(sheet, 'C1', '=B1+1');
  recalculateWorkbook(workbook);
  assert.equal(getCell(sheet, 'C1').value, 7);
  set(sheet, 'A1', 5);
  recalculateWorkbook(workbook, [`${sheet.id}:A1`]);
  assert.equal(getCell(sheet, 'B1').value, 15);
  assert.equal(getCell(sheet, 'C1').value, 16);
});

test('relative, mixed, and absolute references translate without changing text literals', () => {
  assert.equal(translateFormula('=A1+$B1+C$1+$D$4', 2, 3), '=D3+$B3+F$1+$D$4');
  assert.equal(translateFormula('="A1"&A1', 1, 1), '="A1"&B2');
});

test('circular dependencies return a stable spreadsheet error', () => {
  const workbook = createWorkbook();
  const sheet = workbook.sheets[0];
  set(sheet, 'A1', '=B1');
  set(sheet, 'B1', '=A1');
  recalculateWorkbook(workbook);
  assert.equal(getCell(sheet, 'A1').error, '#CIRC!');
  assert.equal(getCell(sheet, 'B1').error, '#CIRC!');
});

test('cross-sheet references use sheet names and survive sheet order', () => {
  const workbook = createWorkbook();
  workbook.sheets[0].name = 'Inputs';
  set(workbook.sheets[0], 'A1', 42);
  const report = addSheet(workbook, 'Report');
  set(report, 'A1', '=Inputs!A1*2');
  recalculateWorkbook(workbook);
  assert.equal(getCell(report, 'A1').value, 84);
  workbook.sheets.reverse();
  recalculateWorkbook(workbook);
  assert.equal(getCell(report, 'A1').value, 84);
});

test('copy and paste translate formulas while retaining absolute references', () => {
  const workbook = createWorkbook();
  const sheet = workbook.sheets[0];
  set(sheet, 'A1', 10);
  set(sheet, 'B1', '=A1+$A$1');
  const payload = copyRange(sheet, { startRow: 0, endRow: 0, startCol: 1, endCol: 1 });
  pastePayload(sheet, { row: 1, col: 1 }, payload, true);
  assert.equal(getCell(sheet, 'B2').input, '=A2+$A$1');
});

test('row insertion and deletion update references and expose deleted references', () => {
  const workbook = createWorkbook();
  const sheet = workbook.sheets[0];
  set(sheet, 'A1', 5);
  set(sheet, 'B3', '=A1');
  mutateStructure(workbook, sheet.id, 'row', 0, 1, 'insert');
  assert.equal(getCell(sheet, 'B4').input, '=A2');
  mutateStructure(workbook, sheet.id, 'row', 1, 1, 'delete');
  recalculateWorkbook(workbook);
  assert.equal(getCell(sheet, 'B3').error, '#REF!');
});

test('sorting moves complete records rather than individual cells', () => {
  const workbook = createWorkbook();
  const sheet = workbook.sheets[0];
  [['Name', 'Score'], ['Beta', 2], ['Alpha', 3]].forEach((row, r) => row.forEach((value, c) => set(sheet, String.fromCharCode(65 + c) + (r + 1), value)));
  recalculateWorkbook(workbook);
  sortRange(sheet, { startRow: 0, endRow: 2, startCol: 0, endCol: 1 }, 0, 'asc', true);
  assert.equal(getCell(sheet, 'A2').value, 'Alpha');
  assert.equal(getCell(sheet, 'B2').value, 3);
});

test('versioned workbooks serialize and hydrate without losing metadata', () => {
  const workbook = createWorkbook();
  workbook.sheets[0].freeze.rows = 1;
  workbook.sheets[0].rowHeights[2] = 44;
  workbook.namedRanges.total = { name: 'total', sheetId: workbook.sheets[0].id, range: 'A1:A2' };
  const restored = hydrateWorkbook(JSON.parse(JSON.stringify(workbook)));
  assert.equal(restored.schemaVersion, 1);
  assert.equal(restored.sheets[0].freeze.rows, 1);
  assert.equal(restored.sheets[0].rowHeights[2], 44);
  assert.equal(restored.namedRanges.total.range, 'A1:A2');
});

test('CSV parser and exporter preserve quoted delimiters', () => {
  assert.deepEqual(parseCsv('Name,Note\r\nHarbor,"North, East"'), [['Name', 'Note'], ['Harbor', 'North, East']]);
  const workbook = csvToWorkbook('Name,Note\r\nHarbor,"North, East"', 'ports.csv');
  recalculateWorkbook(workbook);
  assert.match(sheetToCsv(workbook.sheets[0]), /"North, East"/);
});

test('named ranges and multi-criteria functions participate in recalculation', () => {
  const workbook = createWorkbook();
  const sheet = workbook.sheets[0];
  [['East', 10], ['West', 20], ['East', 30]].forEach((row, r) => row.forEach((value, c) => set(sheet, String.fromCharCode(65 + c) + (r + 1), value)));
  workbook.namedRanges.sales = { name: 'sales', sheetId: sheet.id, range: 'B1:B3' };
  set(sheet, 'D1', '=SUM(sales)');
  set(sheet, 'D2', '=SUMIFS(B1:B3,A1:A3,"East")');
  set(sheet, 'D3', '=COUNTIFS(A1:A3,"East",B1:B3,">15")');
  recalculateWorkbook(workbook);
  assert.equal(getCell(sheet, 'D1').value, 60);
  assert.equal(getCell(sheet, 'D2').value, 40);
  assert.equal(getCell(sheet, 'D3').value, 1);
  set(sheet, 'B1', 15);
  recalculateWorkbook(workbook, [`${sheet.id}:B1`]);
  assert.equal(getCell(sheet, 'D1').value, 65);
});

test('sparse recalculation remains responsive for a realistic working set', () => {
  const workbook = createWorkbook();
  const sheet = workbook.sheets[0];
  for (let row = 1; row <= 2000; row += 1) {
    set(sheet, `A${row}`, row);
    set(sheet, `B${row}`, `=A${row}*2`);
  }
  const started = performance.now();
  recalculateWorkbook(workbook);
  const elapsed = performance.now() - started;
  assert.equal(getCell(sheet, 'B2000').value, 4000);
  assert.ok(elapsed < 3000, `Expected recalculation under 3 seconds, received ${elapsed.toFixed(0)}ms`);
});
