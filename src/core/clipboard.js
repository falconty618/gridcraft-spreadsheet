import { cellsInRange, toAddress } from './address.js';
import { createCell, getCell } from './workbook.js';
import { translateFormula } from './formula.js';

export function copyRange(sheet, range) {
  const cells = [];
  for (let row = range.startRow; row <= range.endRow; row += 1) {
    const line = [];
    for (let col = range.startCol; col <= range.endCol; col += 1) {
      line.push(JSON.parse(JSON.stringify(getCell(sheet, toAddress(row, col)))));
    }
    cells.push(line);
  }
  return { source: { row: range.startRow, col: range.startCol }, cells };
}

export function payloadToTsv(payload) {
  return payload.cells.map((row) => row.map((cell) => {
    const value = cell.input?.startsWith('=') ? cell.input : (cell.display || cell.input || '');
    return String(value).replace(/\t/g, ' ').replace(/\r?\n/g, ' ');
  }).join('\t')).join('\n');
}

export function tsvToPayload(text) {
  return {
    source: { row: 0, col: 0 },
    cells: String(text).replace(/\r/g, '').split('\n').map((row) => row.split('\t').map((input) => createCell(input))),
  };
}

export function pastePayload(sheet, target, payload, translate = true) {
  payload.cells.forEach((row, r) => row.forEach((sourceCell, c) => {
    const cell = JSON.parse(JSON.stringify(sourceCell));
    if (translate && cell.input?.startsWith('=')) {
      cell.input = translateFormula(cell.input, target.row - payload.source.row, target.col - payload.source.col);
    }
    sheet.cells[toAddress(target.row + r, target.col + c)] = cell;
  }));
  return {
    startRow: target.row,
    endRow: target.row + payload.cells.length - 1,
    startCol: target.col,
    endCol: target.col + Math.max(0, ...payload.cells.map((row) => row.length - 1)),
  };
}

export function cutRange(sheet, range) {
  const payload = copyRange(sheet, range);
  for (const { address } of cellsInRange(range)) delete sheet.cells[address];
  return payload;
}

export function moveRange(sheet, source, target) {
  const destination = {
    startRow: target.row,
    endRow: target.row + source.endRow - source.startRow,
    startCol: target.col,
    endCol: target.col + source.endCol - source.startCol,
  };
  if (destination.startRow === source.startRow && destination.startCol === source.startCol) return destination;
  const payload = cutRange(sheet, source);
  pastePayload(sheet, target, payload, false);
  return destination;
}
