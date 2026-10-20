import { dependenciesOf, evaluateFormula, FormulaError } from './formula.js';
import { formatDisplay, getCell } from './workbook.js';

const keyFor = (sheet, address) => `${sheet.id}:${address}`;

function parseLiteral(input) {
  const text = String(input ?? '');
  if (text === '') return { type: 'empty', value: null };
  if (/^(TRUE|FALSE)$/i.test(text)) return { type: 'boolean', value: text.toUpperCase() === 'TRUE' };
  if (/^-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(text.trim())) return { type: 'number', value: Number(text) };
  if (/^\d{4}-\d{2}-\d{2}$/.test(text) && !Number.isNaN(new Date(`${text}T00:00:00`).valueOf())) return { type: 'date', value: text };
  return { type: 'text', value: text };
}

export function buildDependencyGraph(workbook) {
  const dependencies = new Map();
  const dependents = new Map();
  for (const sheet of workbook.sheets) {
    for (const [address, cell] of Object.entries(sheet.cells)) {
      if (!cell.input?.startsWith('=')) continue;
      const key = keyFor(sheet, address);
      try {
        const refs = dependenciesOf(cell.input, sheet, workbook);
        dependencies.set(key, refs);
        for (const ref of refs) {
          if (!dependents.has(ref)) dependents.set(ref, new Set());
          dependents.get(ref).add(key);
        }
      } catch {
        dependencies.set(key, []);
      }
    }
  }
  return { dependencies, dependents };
}

export function recalculateWorkbook(workbook, changedKeys = null) {
  const graph = buildDependencyGraph(workbook);
  const affected = new Set();
  if (changedKeys?.length) {
    const queue = [...changedKeys];
    while (queue.length) {
      const key = queue.shift();
      if (affected.has(key)) continue;
      affected.add(key);
      for (const dependent of graph.dependents.get(key) || []) queue.push(dependent);
    }
  }

  for (const sheet of workbook.sheets) {
    for (const [address, cell] of Object.entries(sheet.cells)) {
      const key = keyFor(sheet, address);
      if (cell.input?.startsWith('=')) {
        if (!changedKeys || affected.has(key)) {
          cell.value = null;
          cell.error = null;
          cell.type = 'formula';
        }
      } else {
        const parsed = parseLiteral(cell.input);
        Object.assign(cell, parsed, { error: null });
        cell.display = formatDisplay(cell);
      }
    }
  }

  const visiting = new Set();
  const completed = new Set();
  const resolveKey = (sheet, address) => {
    const key = keyFor(sheet, address);
    const cell = sheet.cells[address];
    if (!cell) return 0;
    if (!cell.input?.startsWith('=')) return cell.value ?? 0;
    if (completed.has(key) && (!changedKeys || !affected.has(key))) return cell.error || cell.value;
    if (visiting.has(key)) throw new FormulaError('#CIRC!', 'Circular dependency');
    visiting.add(key);
    try {
      const value = evaluateFormula(cell.input, {
        workbook,
        sheet,
        resolve: (targetSheet, targetAddress) => resolveKey(targetSheet, targetAddress),
      });
      cell.value = value;
      cell.error = null;
      cell.type = typeof value === 'boolean' ? 'boolean' : typeof value === 'number' ? 'number' : 'text';
    } catch (error) {
      cell.value = null;
      cell.error = error instanceof FormulaError ? error.code : '#VALUE!';
      cell.type = 'error';
    } finally {
      visiting.delete(key);
      completed.add(key);
      cell.display = formatDisplay(cell);
    }
    if (cell.error) throw new FormulaError(cell.error);
    return cell.value ?? 0;
  };

  for (const sheet of workbook.sheets) {
    for (const [address, cell] of Object.entries(sheet.cells)) {
      if (cell.input?.startsWith('=') && (!changedKeys || affected.has(keyFor(sheet, address)))) {
        try { resolveKey(sheet, address); } catch { /* error already stored */ }
      }
    }
  }
  workbook.updatedAt = new Date().toISOString();
  return graph;
}

export function cellKey(sheet, address) {
  return keyFor(sheet, address);
}
