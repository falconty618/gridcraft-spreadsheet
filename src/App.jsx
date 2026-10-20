import { useEffect, useMemo, useRef, useState } from 'react';
import Toolbar from './components/Toolbar.jsx';
import FormulaBar from './components/FormulaBar.jsx';
import SheetTabs from './components/SheetTabs.jsx';
import SpreadsheetGrid from './components/SpreadsheetGrid.jsx';
import FeaturePanel from './components/FeaturePanel.jsx';
import { cellsInRange, normalizeRange, parseAddress, rangeToA1, toAddress } from './core/address.js';
import {
  activeSheet, addSheet, clearRange, createWorkbook, deleteSheet, getCell, getSheet,
  hydrateWorkbook, moveSheet, mutateStructure, renameSheet, sampleWorkbook,
  setCellInput, setRangeStyle,
} from './core/workbook.js';
import { cellKey, recalculateWorkbook } from './core/recalculate.js';
import { CommandHistory } from './core/history.js';
import { copyRange, cutRange, moveRange, pastePayload, payloadToTsv, tsvToPayload } from './core/clipboard.js';
import { translateFormula } from './core/formula.js';
import { applyFilter, makeTable, refreshDisplays, selectionStats, sortRange, validateInput } from './core/features.js';
import { csvToWorkbook, downloadText, safeFileName, sheetToCsv } from './core/io.js';

const STORAGE_KEY = 'gridcraft.workbook.v1';

function initialWorkbook() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    const workbook = saved ? hydrateWorkbook(JSON.parse(saved)) : sampleWorkbook();
    recalculateWorkbook(workbook);
    return workbook;
  } catch {
    const workbook = sampleWorkbook();
    recalculateWorkbook(workbook);
    return workbook;
  }
}

const initialSelection = () => ({ anchor: { row: 0, col: 0 }, focus: { row: 0, col: 0 } });

export default function App() {
  const [workbook, setWorkbook] = useState(initialWorkbook);
  const [selection, setSelection] = useState(initialSelection);
  const [formulaDraft, setFormulaDraft] = useState('');
  const [panel, setPanel] = useState(null);
  const [notice, setNotice] = useState('Ready');
  const [saveState, setSaveState] = useState('Saved locally');
  const history = useRef(new CommandHistory(120));
  const clipboard = useRef(null);
  const fileInput = useRef(null);

  const sheet = activeSheet(workbook);
  const selectedRange = useMemo(() => normalizeRange(selection.anchor, selection.focus), [selection]);
  const activeAddress = toAddress(selection.focus.row, selection.focus.col);
  const activeCell = getCell(sheet, activeAddress);
  const style = activeCell.style || {};
  const stats = useMemo(() => selectionStats(sheet, selectedRange), [sheet, selectedRange]);

  useEffect(() => setFormulaDraft(activeCell.input || ''), [sheet.id, activeAddress, activeCell.input]);
  useEffect(() => {
    setSaveState('Saving...');
    const timer = setTimeout(() => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(workbook));
      setSaveState('Saved locally');
    }, 250);
    return () => clearTimeout(timer);
  }, [workbook]);
  useEffect(() => {
    if (notice === 'Ready') return undefined;
    const timer = setTimeout(() => setNotice('Ready'), 3500);
    return () => clearTimeout(timer);
  }, [notice]);

  const apply = (label, mutation, changedKeys = null) => {
    const next = history.current.execute(label, workbook, mutation);
    recalculateWorkbook(next, changedKeys);
    setWorkbook(next);
    setNotice(label);
    return next;
  };

  const commitCell = (row, col, value) => {
    const address = toAddress(row, col);
    const current = getCell(sheet, address);
    const validation = validateInput(current, value);
    if (!validation.valid && current.validation?.behavior !== 'warn') {
      setNotice(validation.message);
      return false;
    }
    apply('Edited cell', (next) => setCellInput(getSheet(next, sheet.id), address, value), [cellKey(sheet, address)]);
    if (!validation.valid) setNotice(validation.message);
    return true;
  };

  const clearSelection = () => apply('Cleared cells', (next) => clearRange(getSheet(next, sheet.id), selectedRange));

  const copy = async () => {
    clipboard.current = copyRange(sheet, selectedRange);
    try { await navigator.clipboard.writeText(payloadToTsv(clipboard.current)); } catch { /* internal clipboard remains available */ }
    setNotice(`Copied ${rangeToA1(selectedRange)}`);
  };

  const cut = async () => {
    const payload = copyRange(sheet, selectedRange);
    clipboard.current = payload;
    try { await navigator.clipboard.writeText(payloadToTsv(payload)); } catch { /* internal clipboard remains available */ }
    apply('Cut cells', (next) => cutRange(getSheet(next, sheet.id), selectedRange));
  };

  const paste = async () => {
    let payload = clipboard.current;
    try {
      const text = await navigator.clipboard.readText();
      if (text && (!payload || text !== payloadToTsv(payload))) payload = tsvToPayload(text);
    } catch { /* use internal payload */ }
    if (!payload) { setNotice('Nothing to paste'); return; }
    apply('Pasted cells', (next) => pastePayload(getSheet(next, sheet.id), selection.focus, payload, true));
  };

  const fill = (target) => {
    if (!target) return;
    const source = selectedRange;
    const destination = {
      startRow: Math.min(source.startRow, target.row), endRow: Math.max(source.endRow, target.row),
      startCol: Math.min(source.startCol, target.col), endCol: Math.max(source.endCol, target.col),
    };
    apply('Filled range', (next) => {
      const targetSheet = getSheet(next, sheet.id);
      const sourceHeight = source.endRow - source.startRow + 1;
      const sourceWidth = source.endCol - source.startCol + 1;
      const snapshot = copyRange(targetSheet, source);
      for (const { row, col, address } of cellsInRange(destination)) {
        if (row >= source.startRow && row <= source.endRow && col >= source.startCol && col <= source.endCol) continue;
        const sourceRow = ((row - source.startRow) % sourceHeight + sourceHeight) % sourceHeight;
        const sourceCol = ((col - source.startCol) % sourceWidth + sourceWidth) % sourceWidth;
        const origin = snapshot.cells[sourceRow][sourceCol];
        const cell = JSON.parse(JSON.stringify(origin));
        const originRow = source.startRow + sourceRow;
        const originCol = source.startCol + sourceCol;
        if (cell.input?.startsWith('=')) cell.input = translateFormula(cell.input, row - originRow, col - originCol);
        if (!cell.input?.startsWith('=') && sourceWidth === 1 && sourceHeight >= 2 && typeof getCell(targetSheet, toAddress(source.startRow, source.startCol)).value === 'number') {
          const first = getCell(targetSheet, toAddress(source.startRow, source.startCol)).value;
          const second = getCell(targetSheet, toAddress(source.startRow + 1, source.startCol)).value;
          if (typeof second === 'number' && row > source.endRow) cell.input = String(first + (second - first) * (row - source.startRow));
        }
        targetSheet.cells[address] = cell;
      }
    });
    setSelection({ anchor: { row: destination.startRow, col: destination.startCol }, focus: { row: destination.endRow, col: destination.endCol } });
  };

  const moveSelection = (target) => {
    if (!target) return;
    const source = selectedRange;
    const destination = {
      startRow: target.row,
      endRow: target.row + source.endRow - source.startRow,
      startCol: target.col,
      endCol: target.col + source.endCol - source.startCol,
    };
    if (destination.startRow === source.startRow && destination.startCol === source.startCol) return;
    apply('Moved cells', (next) => moveRange(getSheet(next, sheet.id), source, target));
    setSelection({
      anchor: { row: destination.startRow, col: destination.startCol },
      focus: { row: destination.endRow, col: destination.endCol },
    });
  };

  const undo = () => {
    const next = history.current.undo(workbook);
    if (next === workbook) return;
    recalculateWorkbook(next);
    setWorkbook(next);
    setNotice('Undid change');
  };
  const redo = () => {
    const next = history.current.redo(workbook);
    if (next === workbook) return;
    recalculateWorkbook(next);
    setWorkbook(next);
    setNotice('Redid change');
  };

  const actions = {
    newWorkbook: () => {
      if (!window.confirm('Start a new workbook? Your current workbook remains available if you saved a file.')) return;
      const next = createWorkbook();
      recalculateWorkbook(next);
      history.current.clear();
      setWorkbook(next);
      setSelection(initialSelection());
      setNotice('Created workbook');
    },
    exportJson: () => downloadText(`${safeFileName(workbook.title)}.gridcraft.json`, JSON.stringify(workbook, null, 2), 'application/json'),
    importFile: () => fileInput.current?.click(),
    exportCsv: () => downloadText(`${safeFileName(sheet.name)}.csv`, sheetToCsv(sheet), 'text/csv'),
    undo, redo, copy, cut, paste,
    format: (patch) => apply('Formatted cells', (next) => { setRangeStyle(getSheet(next, sheet.id), selectedRange, patch); refreshDisplays(getSheet(next, sheet.id)); }),
    structure: (axis, operation) => {
      const index = axis === 'row' ? selectedRange.startRow : selectedRange.startCol;
      const count = axis === 'row' ? selectedRange.endRow - selectedRange.startRow + 1 : selectedRange.endCol - selectedRange.startCol + 1;
      apply(`${operation === 'insert' ? 'Inserted' : 'Deleted'} ${axis}${count > 1 ? 's' : ''}`, (next) => mutateStructure(next, sheet.id, axis, index, count, operation));
    },
    panel: (name) => setPanel(panel === name ? null : name),
  };

  const featureActions = {
    findNext: (matches) => {
      const current = matches.indexOf(activeAddress);
      const point = parseAddress(matches[(current + 1) % matches.length]);
      if (point) setSelection({ anchor: point, focus: point });
    },
    replace: (address, find, replacement) => {
      if (!address) return;
      const cell = getCell(sheet, address);
      apply('Replaced match', (next) => setCellInput(getSheet(next, sheet.id), address, String(cell.input).replace(find, replacement)));
    },
    replaceAll: (find, replacement) => apply('Replaced all matches', (next) => {
      const targetSheet = getSheet(next, sheet.id);
      Object.values(targetSheet.cells).forEach((cell) => { cell.input = String(cell.input ?? '').split(find).join(replacement); });
    }),
    sort: (column, direction) => apply('Sorted records', (next) => sortRange(getSheet(next, sheet.id), selectedRange, column, direction, true)),
    filter: (column, operator, value) => apply('Applied filter', (next) => applyFilter(getSheet(next, sheet.id), { range: rangeToA1(selectedRange), column, operator, value })),
    clearFilters: () => apply('Cleared filters', (next) => { getSheet(next, sheet.id).filters = []; }),
    makeTable: () => apply('Created table', (next) => makeTable(getSheet(next, sheet.id), rangeToA1(selectedRange), `Table${getSheet(next, sheet.id).tables.length + 1}`)),
    freeze: (axis) => apply('Changed frozen panes', (next) => {
      const target = getSheet(next, sheet.id);
      if (axis === 'row') target.freeze.rows = target.freeze.rows ? 0 : Math.max(1, selectedRange.startRow || 1);
      else target.freeze.cols = target.freeze.cols ? 0 : Math.max(1, selectedRange.startCol || 1);
    }),
    hide: (axis) => apply(`Hid ${axis}s`, (next) => {
      const target = getSheet(next, sheet.id);
      const values = [];
      const start = axis === 'row' ? selectedRange.startRow : selectedRange.startCol;
      const end = axis === 'row' ? selectedRange.endRow : selectedRange.endCol;
      for (let index = start; index <= end; index += 1) values.push(index);
      if (axis === 'row') target.hiddenRows = [...new Set([...target.hiddenRows, ...values])];
      else target.hiddenCols = [...new Set([...target.hiddenCols, ...values])];
    }),
    unhide: () => apply('Unhid rows and columns', (next) => { const target = getSheet(next, sheet.id); target.hiddenRows = []; target.hiddenCols = []; }),
    conditional: (operator, value, color) => apply('Added conditional format', (next) => { getSheet(next, sheet.id).conditionalFormats.push({ range: rangeToA1(selectedRange), operator, value, color }); }),
    validation: (type, value) => apply('Applied data validation', (next) => {
      const targetSheet = getSheet(next, sheet.id);
      const parts = value.split(',').map((part) => part.trim());
      const validation = type === 'list' ? { type, values: parts.filter(Boolean), behavior: 'reject' } : { type, min: parts[0] || null, max: parts[1] || null, behavior: 'reject' };
      for (const { address } of cellsInRange(selectedRange)) {
        const cell = targetSheet.cells[address] || { input: '', type: 'empty', value: null, display: '', error: null, style: {} };
        cell.validation = validation;
        targetSheet.cells[address] = cell;
      }
    }),
    namedRange: (name) => apply('Created named range', (next) => { next.namedRanges[name.toLowerCase()] = { name, sheetId: sheet.id, range: rangeToA1(selectedRange) }; }),
    saveChart: (range, type) => apply('Saved chart view', (next) => {
      getSheet(next, sheet.id).charts.push({ id: `chart_${Date.now().toString(36)}`, range, type });
    }),
    deleteChart: (id) => apply('Removed chart view', (next) => {
      const target = getSheet(next, sheet.id);
      target.charts = target.charts.filter((chart) => chart.id !== id);
    }),
    namedRanges: workbook.namedRanges,
  };

  const gridCommand = (key, shift) => {
    if (key === 'c') copy();
    if (key === 'x') cut();
    if (key === 'v') paste();
    if (key === 'z') shift ? redo() : undo();
    if (key === 'y') redo();
    if (key === 'f') setPanel('find');
    if (key === 's') actions.exportJson();
  };

  const handleFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      const next = file.name.toLowerCase().endsWith('.csv') ? csvToWorkbook(text, file.name) : hydrateWorkbook(JSON.parse(text));
      recalculateWorkbook(next);
      history.current.clear();
      setWorkbook(next);
      setSelection(initialSelection());
      setNotice(`Opened ${file.name}`);
    } catch (error) {
      setNotice(error.message || 'Could not open that file.');
    }
  };

  const titleCommit = (value) => {
    const trimmed = value.trim() || 'Untitled workbook';
    if (trimmed === workbook.title) return;
    apply('Renamed workbook', (next) => { next.title = trimmed; });
  };

  return (
    <main className="app-shell">
      <header className="app-header">
        <div className="brand"><span className="brand-mark">G</span><div><span className="eyebrow">Gridcraft</span><input className="workbook-title" defaultValue={workbook.title} key={workbook.id} onBlur={(event) => titleCommit(event.target.value)} aria-label="Workbook title" /></div></div>
        <div className="header-meta"><span className="save-state"><i />{saveState}</span><span className="phase-badge">Core + productivity</span></div>
      </header>
      <Toolbar actions={actions} style={style} canUndo={Boolean(history.current.undoLabel)} canRedo={Boolean(history.current.redoLabel)} view={panel} />
      <FormulaBar address={activeAddress} value={formulaDraft} onChange={setFormulaDraft} onCommit={() => commitCell(selection.focus.row, selection.focus.col, formulaDraft)} onCancel={() => setFormulaDraft(activeCell.input || '')} />
      <div className="workspace">
        <SpreadsheetGrid
          sheet={sheet}
          selection={selection}
          onSelect={setSelection}
          onCommit={commitCell}
          onClear={clearSelection}
          onFill={fill}
          onMove={moveSelection}
          onResize={(axis, index, size) => apply(`Resized ${axis}`, (next) => {
            const target = getSheet(next, sheet.id);
            if (axis === 'row') target.rowHeights[index] = size;
            else target.colWidths[index] = size;
          })}
          onCommand={gridCommand}
        />
        {panel && <FeaturePanel view={panel} onClose={() => setPanel(null)} sheet={sheet} selection={selectedRange} actions={featureActions} />}
      </div>
      <SheetTabs
        sheets={workbook.sheets}
        activeId={workbook.activeSheetId}
        onActivate={(id) => { setWorkbook((current) => ({ ...current, activeSheetId: id })); setSelection(initialSelection()); }}
        onAdd={() => apply('Added sheet', (next) => addSheet(next))}
        onRename={(id) => {
          const target = getSheet(workbook, id);
          const name = window.prompt('Sheet name', target.name);
          if (name && name !== target.name) {
            try { apply('Renamed sheet', (next) => renameSheet(next, id, name)); } catch (error) { setNotice(error.message); }
          }
        }}
        onDelete={(id) => {
          if (!window.confirm('Delete this sheet? You can undo this action.')) return;
          try { apply('Deleted sheet', (next) => deleteSheet(next, id)); setSelection(initialSelection()); } catch (error) { setNotice(error.message); }
        }}
        onMove={(id, delta) => apply('Reordered sheets', (next) => moveSheet(next, id, delta))}
      />
      <footer className="status-bar">
        <span>{notice}</span>
        <span className="status-selection">{sheet.name} � {rangeToA1(selectedRange)}</span>
        <div className="quick-stats"><span>Count <b>{stats.count}</b></span><span>Sum <b>{stats.sum.toLocaleString(undefined, { maximumFractionDigits: 2 })}</b></span>{stats.average != null && <span>Average <b>{stats.average.toLocaleString(undefined, { maximumFractionDigits: 2 })}</b></span>}</div>
      </footer>
      <input ref={fileInput} hidden type="file" accept=".csv,.json,.gridcraft.json,application/json,text/csv" onChange={handleFile} />
    </main>
  );
}
