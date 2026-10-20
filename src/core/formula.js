import { cellsInRange, formatReference, normalizeRange, parseReference, toAddress } from './address.js';

export class FormulaError extends Error {
  constructor(code, message = code) {
    super(message);
    this.code = code;
  }
}

const tokenPatterns = {
  number: /^(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/i,
  ref: /^(?:(?:'(?:[^']|'')+'|[A-Za-z_][A-Za-z0-9_ ]*)!)?\$?[A-Z]+\$?[1-9]\d*/i,
  identifier: /^[A-Za-z_][A-Za-z0-9_.]*/,
};

export function tokenize(formula) {
  const tokens = [];
  let source = String(formula).replace(/^=/, '');
  while (source.length) {
    const spaces = /^\s+/.exec(source);
    if (spaces) { source = source.slice(spaces[0].length); continue; }
    if (source[0] === '"') {
      let value = '';
      let index = 1;
      while (index < source.length) {
        if (source[index] === '"' && source[index + 1] === '"') { value += '"'; index += 2; continue; }
        if (source[index] === '"') break;
        value += source[index++];
      }
      if (source[index] !== '"') throw new FormulaError('#VALUE!', 'Unclosed text value');
      tokens.push({ type: 'string', value });
      source = source.slice(index + 1);
      continue;
    }
    const operator = /^(<=|>=|<>|[+\-*/^=<>(),:&])/.exec(source);
    if (operator) {
      tokens.push({ type: operator[1] === ',' || operator[1] === '(' || operator[1] === ')' || operator[1] === ':' ? operator[1] : 'operator', value: operator[1] });
      source = source.slice(operator[1].length);
      continue;
    }
    const number = tokenPatterns.number.exec(source);
    if (number) { tokens.push({ type: 'number', value: Number(number[0]) }); source = source.slice(number[0].length); continue; }
    const ref = tokenPatterns.ref.exec(source);
    if (ref) { tokens.push({ type: 'ref', value: ref[0] }); source = source.slice(ref[0].length); continue; }
    const identifier = tokenPatterns.identifier.exec(source);
    if (identifier) { tokens.push({ type: 'identifier', value: identifier[0] }); source = source.slice(identifier[0].length); continue; }
    throw new FormulaError('#NAME?', `Unexpected token near ${source.slice(0, 12)}`);
  }
  tokens.push({ type: 'eof' });
  return tokens;
}

export function parseFormula(formula) {
  const tokens = tokenize(formula);
  let position = 0;
  const peek = () => tokens[position];
  const take = (type, value) => {
    const token = tokens[position];
    if (token.type !== type || (value && token.value !== value)) throw new FormulaError('#VALUE!', `Expected ${value || type}`);
    position += 1;
    return token;
  };
  const binary = (next, operators) => {
    let node = next();
    while (peek().type === 'operator' && operators.includes(peek().value)) {
      const operator = take('operator').value;
      node = { type: 'binary', operator, left: node, right: next() };
    }
    return node;
  };
  const primary = () => {
    const token = peek();
    if (token.type === 'number' || token.type === 'string') { position += 1; return { type: token.type, value: token.value }; }
    if (token.type === 'ref') {
      position += 1;
      const start = parseReference(token.value);
      if (peek().type === ':') {
        take(':');
        const end = parseReference(take('ref').value);
        return { type: 'range', start, end };
      }
      return { type: 'ref', ref: start };
    }
    if (token.type === 'identifier') {
      position += 1;
      const name = token.value;
      if (peek().type === '(') {
        take('(');
        const args = [];
        if (peek().type !== ')') {
          do {
            args.push(comparison());
            if (peek().type !== ',') break;
            take(',');
          } while (true);
        }
        take(')');
        return { type: 'call', name: name.toUpperCase(), args };
      }
      if (/^(TRUE|FALSE)$/i.test(name)) return { type: 'boolean', value: name.toUpperCase() === 'TRUE' };
      return { type: 'name', name };
    }
    if (token.type === '(') {
      take('(');
      const node = comparison();
      take(')');
      return node;
    }
    throw new FormulaError('#VALUE!', 'Incomplete formula');
  };
  const unary = () => {
    if (peek().type === 'operator' && ['+', '-'].includes(peek().value)) return { type: 'unary', operator: take('operator').value, value: unary() };
    return primary();
  };
  const power = () => binary(unary, ['^']);
  const multiply = () => binary(power, ['*', '/']);
  const add = () => binary(multiply, ['+', '-', '&']);
  const comparison = () => binary(add, ['=', '<>', '<', '>', '<=', '>=']);
  const ast = comparison();
  if (peek().type !== 'eof') throw new FormulaError('#VALUE!', 'Unexpected formula content');
  return ast;
}

const flatten = (value) => Array.isArray(value) ? value.flat(Infinity) : [value];
const numeric = (values) => flatten(values).filter((value) => typeof value === 'number' && Number.isFinite(value));
const number = (value) => {
  if (typeof value === 'number') return value;
  if (value === true) return 1;
  if (value === false || value == null || value === '') return 0;
  const result = Number(value);
  if (!Number.isFinite(result)) throw new FormulaError('#VALUE!');
  return result;
};
const scalar = (value) => Array.isArray(value) ? value.flat(Infinity)[0] : value;

function compare(left, operator, right) {
  const a = scalar(left);
  const b = scalar(right);
  if (operator === '=') return a === b;
  if (operator === '<>') return a !== b;
  if (operator === '<') return a < b;
  if (operator === '>') return a > b;
  if (operator === '<=') return a <= b;
  return a >= b;
}

function matchesCriteria(value, criteria) {
  if (typeof criteria !== 'string') return value === criteria;
  const match = /^(<=|>=|<>|=|<|>)?(.*)$/.exec(criteria);
  const operator = match[1] || '=';
  const target = Number.isNaN(Number(match[2])) || match[2] === '' ? match[2] : Number(match[2]);
  if (typeof target === 'string' && target.includes('*')) {
    const pattern = new RegExp(`^${target.split('*').map((part) => part.replace(/[.*+?^$()|[\]\\]/g, '\\$&')).join('.*')}$`, 'i');
    return operator === '<>' ? !pattern.test(String(value)) : pattern.test(String(value));
  }
  return compare(value, operator, target);
}

function callFunction(name, args) {
  const all = args.flat(Infinity);
  const nums = numeric(all);
  const functions = {
    SUM: () => nums.reduce((sum, value) => sum + value, 0),
    AVERAGE: () => nums.length ? nums.reduce((sum, value) => sum + value, 0) / nums.length : new FormulaError('#DIV/0!'),
    MIN: () => nums.length ? Math.min(...nums) : 0,
    MAX: () => nums.length ? Math.max(...nums) : 0,
    COUNT: () => nums.length,
    COUNTA: () => all.filter((value) => value !== '' && value != null).length,
    IF: () => scalar(args[0]) ? scalar(args[1]) : scalar(args[2] ?? false),
    AND: () => all.every(Boolean),
    OR: () => all.some(Boolean),
    NOT: () => !scalar(args[0]),
    ROUND: () => { const digits = number(scalar(args[1] ?? 0)); const factor = 10 ** digits; return Math.round(number(scalar(args[0])) * factor) / factor; },
    ABS: () => Math.abs(number(scalar(args[0]))),
    MEDIAN: () => { if (!nums.length) return 0; const sorted = [...nums].sort((a, b) => a - b); const middle = Math.floor(sorted.length / 2); return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2; },
    STDEV: () => { if (nums.length < 2) return new FormulaError('#DIV/0!'); const mean = nums.reduce((a, b) => a + b, 0) / nums.length; return Math.sqrt(nums.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (nums.length - 1)); },
    LEFT: () => String(scalar(args[0]) ?? '').slice(0, number(scalar(args[1] ?? 1))),
    RIGHT: () => String(scalar(args[0]) ?? '').slice(-number(scalar(args[1] ?? 1))),
    MID: () => String(scalar(args[0]) ?? '').slice(number(scalar(args[1])) - 1, number(scalar(args[1])) - 1 + number(scalar(args[2]))),
    LEN: () => String(scalar(args[0]) ?? '').length,
    TRIM: () => String(scalar(args[0]) ?? '').trim().replace(/\s+/g, ' '),
    CONCAT: () => all.join(''),
    TEXTJOIN: () => { const delimiter = String(scalar(args[0])); const ignoreEmpty = Boolean(scalar(args[1])); return args.slice(2).flat(Infinity).filter((value) => !ignoreEmpty || value !== '').join(delimiter); },
    DATE: () => new Date(Date.UTC(number(scalar(args[0])), number(scalar(args[1])) - 1, number(scalar(args[2])))).toISOString().slice(0, 10),
    YEAR: () => new Date(scalar(args[0])).getUTCFullYear(),
    MONTH: () => new Date(scalar(args[0])).getUTCMonth() + 1,
    DAY: () => new Date(scalar(args[0])).getUTCDate(),
    TODAY: () => new Date().toISOString().slice(0, 10),
    SUMIF: () => { const range = flatten(args[0]); const values = args[2] ? flatten(args[2]) : range; return range.reduce((sum, value, index) => matchesCriteria(value, scalar(args[1])) ? sum + number(values[index] ?? 0) : sum, 0); },
    COUNTIF: () => flatten(args[0]).filter((value) => matchesCriteria(value, scalar(args[1]))).length,
    SUMIFS: () => {
      const values = flatten(args[0]);
      return values.reduce((sum, value, index) => {
        for (let arg = 1; arg < args.length; arg += 2) if (!matchesCriteria(flatten(args[arg])[index], scalar(args[arg + 1]))) return sum;
        return sum + number(value);
      }, 0);
    },
    COUNTIFS: () => {
      const first = flatten(args[0]);
      return first.reduce((count, _, index) => {
        for (let arg = 0; arg < args.length; arg += 2) if (!matchesCriteria(flatten(args[arg])[index], scalar(args[arg + 1]))) return count;
        return count + 1;
      }, 0);
    },
    AVERAGEIF: () => { const range = flatten(args[0]); const values = args[2] ? flatten(args[2]) : range; const matched = values.filter((_, index) => matchesCriteria(range[index], scalar(args[1]))); return matched.length ? numeric(matched).reduce((a, b) => a + b, 0) / numeric(matched).length : new FormulaError('#DIV/0!'); },
    INDEX: () => { const rows = args[0]; const row = number(scalar(args[1])) - 1; const col = number(scalar(args[2] ?? 1)) - 1; return Array.isArray(rows[row]) ? rows[row][col] : flatten(rows)[row]; },
    MATCH: () => { const needle = scalar(args[0]); const index = flatten(args[1]).findIndex((value) => value === needle); return index < 0 ? new FormulaError('#N/A') : index + 1; },
    XLOOKUP: () => { const needle = scalar(args[0]); const index = flatten(args[1]).findIndex((value) => value === needle); return index < 0 ? scalar(args[3] ?? new FormulaError('#N/A')) : flatten(args[2])[index]; },
  };
  const result = functions[name]?.();
  if (result === undefined) throw new FormulaError('#NAME?', `Unknown function ${name}`);
  if (result instanceof FormulaError) throw result;
  return result;
}

function resolveRef(ref, context) {
  const sheet = ref.sheet ? context.workbook.sheets.find((item) => item.name.toLowerCase() === ref.sheet.toLowerCase()) : context.sheet;
  if (!sheet) throw new FormulaError('#REF!');
  const address = toAddress(ref.row, ref.col);
  return context.resolve(sheet, address);
}

export function evaluateAst(node, context) {
  if (['number', 'string', 'boolean'].includes(node.type)) return node.value;
  if (node.type === 'ref') return resolveRef(node.ref, context);
  if (node.type === 'range') {
    const sheetName = node.start.sheet || node.end.sheet;
    const sheet = sheetName ? context.workbook.sheets.find((item) => item.name.toLowerCase() === sheetName.toLowerCase()) : context.sheet;
    if (!sheet) throw new FormulaError('#REF!');
    const range = normalizeRange(node.start, node.end);
    const rows = [];
    for (let row = range.startRow; row <= range.endRow; row += 1) {
      const values = [];
      for (let col = range.startCol; col <= range.endCol; col += 1) values.push(context.resolve(sheet, toAddress(row, col)));
      rows.push(values);
    }
    return rows;
  }
  if (node.type === 'name') {
    const named = context.workbook.namedRanges[node.name.toLowerCase()];
    if (!named) throw new FormulaError('#NAME?');
    const sheet = context.workbook.sheets.find((item) => item.id === named.sheetId);
    const [start, end = start] = named.range.split(':').map(parseReference);
    return evaluateAst({ type: 'range', start: { ...start, sheet: sheet.name }, end: { ...end, sheet: sheet.name } }, context);
  }
  if (node.type === 'unary') return node.operator === '-' ? -number(evaluateAst(node.value, context)) : number(evaluateAst(node.value, context));
  if (node.type === 'binary') {
    const left = evaluateAst(node.left, context);
    const right = evaluateAst(node.right, context);
    if (['=', '<>', '<', '>', '<=', '>='].includes(node.operator)) return compare(left, node.operator, right);
    if (node.operator === '&') return String(scalar(left) ?? '') + String(scalar(right) ?? '');
    const a = number(scalar(left)); const b = number(scalar(right));
    if (node.operator === '+') return a + b;
    if (node.operator === '-') return a - b;
    if (node.operator === '*') return a * b;
    if (node.operator === '/') { if (b === 0) throw new FormulaError('#DIV/0!'); return a / b; }
    return a ** b;
  }
  if (node.type === 'call') return callFunction(node.name, node.args.map((arg) => evaluateAst(arg, context)));
  throw new FormulaError('#VALUE!');
}

export function evaluateFormula(formula, context) {
  if (String(formula).includes('#REF!')) throw new FormulaError('#REF!');
  return evaluateAst(parseFormula(formula), context);
}

function visit(node, callback) {
  callback(node);
  if (node.left) visit(node.left, callback);
  if (node.right) visit(node.right, callback);
  if (node.value && typeof node.value === 'object') visit(node.value, callback);
  if (node.args) node.args.forEach((arg) => visit(arg, callback));
}

export function dependenciesOf(formula, formulaSheet, workbook) {
  const dependencies = [];
  const ast = parseFormula(formula);
  visit(ast, (node) => {
    if (node.type === 'ref') {
      const sheet = node.ref.sheet ? workbook.sheets.find((item) => item.name.toLowerCase() === node.ref.sheet.toLowerCase()) : formulaSheet;
      if (sheet) dependencies.push(`${sheet.id}:${toAddress(node.ref.row, node.ref.col)}`);
    } else if (node.type === 'range') {
      const sheetName = node.start.sheet || node.end.sheet;
      const sheet = sheetName ? workbook.sheets.find((item) => item.name.toLowerCase() === sheetName.toLowerCase()) : formulaSheet;
      if (sheet) for (const { address } of cellsInRange(normalizeRange(node.start, node.end))) dependencies.push(`${sheet.id}:${address}`);
    } else if (node.type === 'name') {
      const named = workbook.namedRanges[node.name.toLowerCase()];
      const sheet = named && workbook.sheets.find((item) => item.id === named.sheetId);
      if (sheet) {
        const [start, end = start] = named.range.split(':').map(parseReference);
        for (const { address } of cellsInRange(normalizeRange(start, end))) dependencies.push(`${sheet.id}:${address}`);
      }
    }
  });
  return [...new Set(dependencies)];
}

const referenceAtStart = /^(?:(?:'(?:[^']|'')+'|[A-Za-z_][A-Za-z0-9_ ]*)!)?\$?[A-Z]+\$?[1-9]\d*/i;

function transformReferences(formula, transform) {
  const source = String(formula);
  let result = '';
  let index = 0;
  let inString = false;
  while (index < source.length) {
    if (source[index] === '"') {
      result += source[index];
      if (inString && source[index + 1] === '"') { result += source[index + 1]; index += 2; continue; }
      inString = !inString;
      index += 1;
      continue;
    }
    if (!inString) {
      const match = referenceAtStart.exec(source.slice(index));
      const previous = source[index - 1];
      if (match && (!previous || !/[A-Za-z0-9_.]/.test(previous))) {
        result += transform(match[0]);
        index += match[0].length;
        continue;
      }
    }
    result += source[index++];
  }
  return result;
}

export function translateFormula(formula, rowDelta, colDelta) {
  return transformReferences(formula, (text) => {
    const ref = parseReference(text);
    if (!ref) return text;
    if (!ref.rowAbsolute) ref.row = Math.max(0, ref.row + rowDelta);
    if (!ref.colAbsolute) ref.col = Math.max(0, ref.col + colDelta);
    return formatReference(ref);
  });
}

export function rewriteFormulaForStructure(formula, change) {
  return transformReferences(formula, (text) => {
    const ref = parseReference(text);
    if (!ref) return text;
    const applies = ref.sheet ? ref.sheet.toLowerCase() === change.targetSheet.toLowerCase() : change.formulaSheet.toLowerCase() === change.targetSheet.toLowerCase();
    if (!applies) return text;
    const key = change.axis === 'row' ? 'row' : 'col';
    const coordinate = ref[key];
    if (change.operation === 'insert' && coordinate >= change.index) ref[key] += change.count;
    if (change.operation === 'delete') {
      if (coordinate >= change.index && coordinate < change.index + change.count) return '#REF!';
      if (coordinate >= change.index + change.count) ref[key] -= change.count;
    }
    return formatReference(ref);
  });
}
