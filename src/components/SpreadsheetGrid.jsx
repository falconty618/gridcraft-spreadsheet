import { useEffect, useMemo, useRef, useState } from 'react';
import { MAX_COLS, MAX_ROWS, normalizeRange, parseRange, rangeContains, toAddress } from '../core/address.js';
import { conditionalStyle, rowPassesFilters } from '../core/features.js';
import { getCell } from '../core/workbook.js';

const DEFAULT_ROW_HEIGHT = 28;
const DEFAULT_COL_WIDTH = 112;
const ROW_HEADER_WIDTH = 50;
const COL_HEADER_HEIGHT = 30;
const OVERSCAN = 3;

function dimensions(count, defaultSize, custom, hidden, visible) {
  const positions = new Array(count);
  const sizes = new Array(count);
  let total = 0;
  const hiddenSet = new Set(hidden || []);
  for (let index = 0; index < count; index += 1) {
    positions[index] = total;
    sizes[index] = hiddenSet.has(index) || (visible && !visible(index)) ? 0 : Number(custom?.[index] || defaultSize);
    total += sizes[index];
  }
  return { positions, sizes, total };
}

function firstVisible(positions, sizes, offset) {
  let low = 0;
  let high = positions.length - 1;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (positions[middle] + sizes[middle] < offset) low = middle + 1;
    else high = middle;
  }
  return Math.max(0, low - OVERSCAN);
}

function indicesInView(layout, offset, length, frozenCount) {
  const result = new Set();
  for (let index = 0; index < frozenCount; index += 1) if (layout.sizes[index]) result.add(index);
  const start = firstVisible(layout.positions, layout.sizes, offset);
  for (let index = start; index < layout.positions.length; index += 1) {
    if (layout.positions[index] > offset + length + 200) break;
    if (layout.sizes[index]) result.add(index);
  }
  return [...result];
}

function cellCss(style) {
  return {
    fontWeight: style.bold ? 700 : 400,
    fontStyle: style.italic ? 'italic' : 'normal',
    textDecoration: style.underline ? 'underline' : 'none',
    textAlign: style.align || (style.numberFormat && style.numberFormat !== 'general' ? 'right' : undefined),
    color: style.color,
    background: style.background,
    fontSize: style.fontSize ? `${style.fontSize}px` : undefined,
    whiteSpace: style.wrap ? 'normal' : 'nowrap',
    borderTop: style.borderTop,
    borderRight: style.borderRight,
    borderBottom: style.borderBottom,
    borderLeft: style.borderLeft,
  };
}

export default function SpreadsheetGrid({
  sheet,
  selection,
  onSelect,
  onCommit,
  onClear,
  onFill,
  onMove,
  onResize,
  onCommand,
}) {
  const viewportRef = useRef(null);
  const dragRef = useRef(null);
  const [scroll, setScroll] = useState({ left: 0, top: 0 });
  const [viewport, setViewport] = useState({ width: 1000, height: 600 });
  const [editor, setEditor] = useState(null);
  const [fillPreview, setFillPreview] = useState(null);
  const [movePreview, setMovePreview] = useState(null);

  const rowLayout = useMemo(() => dimensions(
    MAX_ROWS,
    DEFAULT_ROW_HEIGHT,
    sheet.rowHeights,
    sheet.hiddenRows,
    (row) => rowPassesFilters(sheet, row),
  ), [sheet.rowHeights, sheet.hiddenRows, sheet.filters, sheet.cells]);
  const colLayout = useMemo(() => dimensions(MAX_COLS, DEFAULT_COL_WIDTH, sheet.colWidths, sheet.hiddenCols), [sheet.colWidths, sheet.hiddenCols]);
  const rows = useMemo(() => indicesInView(rowLayout, scroll.top, viewport.height, sheet.freeze.rows), [rowLayout, scroll.top, viewport.height, sheet.freeze.rows]);
  const cols = useMemo(() => indicesInView(colLayout, scroll.left, viewport.width, sheet.freeze.cols), [colLayout, scroll.left, viewport.width, sheet.freeze.cols]);
  const range = normalizeRange(selection.anchor, selection.focus);
  const singleCellSelection = range.startRow === range.endRow && range.startCol === range.endCol;
  const fillRange = fillPreview ? {
    startRow: Math.min(range.startRow, fillPreview.row),
    endRow: Math.max(range.endRow, fillPreview.row),
    startCol: Math.min(range.startCol, fillPreview.col),
    endCol: Math.max(range.endCol, fillPreview.col),
  } : null;

  useEffect(() => {
    if (!viewportRef.current) return undefined;
    const observer = new ResizeObserver(([entry]) => setViewport({ width: entry.contentRect.width, height: entry.contentRect.height }));
    observer.observe(viewportRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const release = () => {
      const drag = dragRef.current;
      if (drag?.kind === 'fill' && fillPreview) onFill(fillPreview);
      if (drag?.kind === 'move' && movePreview) onMove({ row: movePreview.startRow, col: movePreview.startCol });
      if (drag?.kind === 'pending-move') onSelect({ anchor: drag.point, focus: drag.point });
      dragRef.current = null;
      setFillPreview(null);
      setMovePreview(null);
    };
    window.addEventListener('pointerup', release);
    window.addEventListener('pointercancel', release);
    return () => {
      window.removeEventListener('pointerup', release);
      window.removeEventListener('pointercancel', release);
    };
  }, [fillPreview, movePreview, onFill, onMove, onSelect]);

  const activate = (row, col, event = {}) => {
    event.preventDefault?.();
    const point = { row, col };
    if (!event.shiftKey && !singleCellSelection && rangeContains(range, row, col)) {
      dragRef.current = {
        kind: 'pending-move',
        point,
        source: range,
        offset: { row: row - range.startRow, col: col - range.startCol },
      };
    } else if (event.shiftKey) {
      dragRef.current = { kind: 'select', anchor: selection.anchor };
      onSelect({ anchor: selection.anchor, focus: point });
    } else {
      dragRef.current = { kind: 'select', anchor: point };
      onSelect({ anchor: point, focus: point });
    }
    viewportRef.current?.focus();
  };

  const startEditing = (row, col, initial) => {
    const cell = getCell(sheet, toAddress(row, col));
    setEditor({ row, col, value: initial ?? cell.input ?? '' });
  };

  const finishEditing = (move = 0) => {
    if (!editor) return;
    if (onCommit(editor.row, editor.col, editor.value) !== false && move) {
      const point = { row: Math.max(0, editor.row + move), col: editor.col };
      onSelect({ anchor: point, focus: point });
    }
    setEditor(null);
  };

  const keyDown = (event) => {
    if (editor) return;
    const point = { ...selection.focus };
    if ((event.ctrlKey || event.metaKey) && ['c', 'x', 'v', 'z', 'y', 'f', 's'].includes(event.key.toLowerCase())) {
      event.preventDefault();
      onCommand(event.key.toLowerCase(), event.shiftKey);
      return;
    }
    if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); onClear(); return; }
    if (event.key === 'F2') { event.preventDefault(); startEditing(point.row, point.col); return; }
    if (event.key === 'Enter') { event.preventDefault(); point.row = Math.min(MAX_ROWS - 1, point.row + (event.shiftKey ? -1 : 1)); }
    else if (event.key === 'Tab') { event.preventDefault(); point.col = Math.min(MAX_COLS - 1, Math.max(0, point.col + (event.shiftKey ? -1 : 1))); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); point.row = Math.max(0, point.row - 1); }
    else if (event.key === 'ArrowDown') { event.preventDefault(); point.row = Math.min(MAX_ROWS - 1, point.row + 1); }
    else if (event.key === 'ArrowLeft') { event.preventDefault(); point.col = Math.max(0, point.col - 1); }
    else if (event.key === 'ArrowRight') { event.preventDefault(); point.col = Math.min(MAX_COLS - 1, point.col + 1); }
    else if (event.key === 'Home') { event.preventDefault(); point.col = 0; if (event.ctrlKey) point.row = 0; }
    else if (!event.ctrlKey && !event.metaKey && !event.altKey && event.key.length === 1) {
      event.preventDefault();
      startEditing(point.row, point.col, event.key);
      return;
    } else return;
    onSelect(event.shiftKey && event.key !== 'Tab' && event.key !== 'Enter' ? { anchor: selection.anchor, focus: point } : { anchor: point, focus: point });
  };

  const beginResize = (axis, index, event) => {
    event.preventDefault();
    event.stopPropagation();
    const start = axis === 'row' ? event.clientY : event.clientX;
    const initial = axis === 'row' ? rowLayout.sizes[index] : colLayout.sizes[index];
    const move = (moveEvent) => {
      const delta = (axis === 'row' ? moveEvent.clientY : moveEvent.clientX) - start;
      event.currentTarget.style.setProperty('--resize-guide', `${Math.max(18, initial + delta)}px`);
    };
    const up = (upEvent) => {
      const delta = (axis === 'row' ? upEvent.clientY : upEvent.clientX) - start;
      onResize(axis, index, Math.max(18, initial + delta));
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const frozenBoundaryX = sheet.freeze.cols ? ROW_HEADER_WIDTH + colLayout.positions[sheet.freeze.cols] : 0;
  const frozenBoundaryY = sheet.freeze.rows ? COL_HEADER_HEIGHT + rowLayout.positions[sheet.freeze.rows] : 0;
  return (
    <div
      className="grid-viewport"
      ref={viewportRef}
      tabIndex={0}
      onKeyDown={keyDown}
      onScroll={(event) => setScroll({ left: event.currentTarget.scrollLeft, top: event.currentTarget.scrollTop })}
      onPointerUp={() => { if (dragRef.current?.kind === 'select') dragRef.current = null; }}
    >
      <div className="grid-canvas" style={{ width: ROW_HEADER_WIDTH + colLayout.total, height: COL_HEADER_HEIGHT + rowLayout.total }}>
        <div className="grid-corner" style={{ left: scroll.left, top: scroll.top, width: ROW_HEADER_WIDTH, height: COL_HEADER_HEIGHT }} />
        {cols.map((col) => {
          const frozen = col < sheet.freeze.cols;
          return (
            <div
              key={`h-${col}`}
              className={range.startCol <= col && range.endCol >= col ? 'column-header selected' : 'column-header'}
              style={{ left: ROW_HEADER_WIDTH + colLayout.positions[col] + (frozen ? scroll.left : 0), top: scroll.top, width: colLayout.sizes[col], height: COL_HEADER_HEIGHT, zIndex: frozen ? 8 : 5 }}
              onPointerDown={(event) => { dragRef.current = { kind: 'select', anchor: { row: 0, col } }; onSelect({ anchor: { row: 0, col }, focus: { row: MAX_ROWS - 1, col } }); event.preventDefault(); }}
            >
              {toAddress(0, col).replace('1', '')}
              <span className="col-resizer" onPointerDown={(event) => beginResize('column', col, event)} />
            </div>
          );
        })}
        {rows.map((row) => {
          const frozen = row < sheet.freeze.rows;
          return (
            <div
              key={`r-${row}`}
              className={range.startRow <= row && range.endRow >= row ? 'row-header selected' : 'row-header'}
              style={{ left: scroll.left, top: COL_HEADER_HEIGHT + rowLayout.positions[row] + (frozen ? scroll.top : 0), width: ROW_HEADER_WIDTH, height: rowLayout.sizes[row], zIndex: frozen ? 8 : 5 }}
              onPointerDown={(event) => { dragRef.current = { kind: 'select', anchor: { row, col: 0 } }; onSelect({ anchor: { row, col: 0 }, focus: { row, col: MAX_COLS - 1 } }); event.preventDefault(); }}
            >
              {row + 1}
              <span className="row-resizer" onPointerDown={(event) => beginResize('row', row, event)} />
            </div>
          );
        })}
        {rows.flatMap((row) => cols.map((col) => {
          const address = toAddress(row, col);
          const cell = getCell(sheet, address);
          const frozenRow = row < sheet.freeze.rows;
          const frozenCol = col < sheet.freeze.cols;
          const selected = rangeContains(range, row, col);
          const active = row === selection.focus.row && col === selection.focus.col;
          const fillAnchor = row === range.endRow && col === range.endCol;
          const fillSelected = fillRange && rangeContains(fillRange, row, col);
          const moveSelected = movePreview && rangeContains(movePreview, row, col);
          const table = sheet.tables.some((item) => {
            const tableRange = parseRange(item.range);
            return tableRange && rangeContains(tableRange, row, col);
          });
          const style = conditionalStyle(sheet, row, col, cell.style);
          return (
            <div
              key={address}
              className={[
                'grid-cell',
                selected && 'selected',
                selected && row === range.startRow && 'selection-top',
                selected && row === range.endRow && 'selection-bottom',
                selected && col === range.startCol && 'selection-left',
                selected && col === range.endCol && 'selection-right',
                selected && !singleCellSelection && 'movable-selection',
                selected && movePreview && 'moving-source',
                active && singleCellSelection && 'active',
                fillSelected && 'fill-preview',
                moveSelected && 'move-preview',
                moveSelected && row === movePreview.startRow && 'move-preview-top',
                moveSelected && row === movePreview.endRow && 'move-preview-bottom',
                moveSelected && col === movePreview.startCol && 'move-preview-left',
                moveSelected && col === movePreview.endCol && 'move-preview-right',
                cell.error && 'error',
                table && 'table-cell',
              ].filter(Boolean).join(' ')}
              style={{
                left: ROW_HEADER_WIDTH + colLayout.positions[col] + (frozenCol ? scroll.left : 0),
                top: COL_HEADER_HEIGHT + rowLayout.positions[row] + (frozenRow ? scroll.top : 0),
                width: colLayout.sizes[col],
                height: rowLayout.sizes[row],
                zIndex: frozenRow || frozenCol ? 4 : 1,
                ...cellCss(style),
              }}
              title={cell.error ? `${cell.error}: ${cell.input}` : cell.input}
              onPointerDown={(event) => activate(row, col, event)}
              onPointerEnter={() => {
                if (dragRef.current?.kind === 'select') onSelect({ anchor: dragRef.current.anchor, focus: { row, col } });
                if (dragRef.current?.kind === 'fill') setFillPreview({ row, col });
                if (dragRef.current?.kind === 'pending-move' || dragRef.current?.kind === 'move') {
                  const drag = dragRef.current;
                  const height = drag.source.endRow - drag.source.startRow + 1;
                  const width = drag.source.endCol - drag.source.startCol + 1;
                  const startRow = Math.min(MAX_ROWS - height, Math.max(0, row - drag.offset.row));
                  const startCol = Math.min(MAX_COLS - width, Math.max(0, col - drag.offset.col));
                  dragRef.current = { ...drag, kind: 'move' };
                  setMovePreview({
                    startRow,
                    endRow: startRow + height - 1,
                    startCol,
                    endCol: startCol + width - 1,
                  });
                }
              }}
              onDoubleClick={() => startEditing(row, col)}
            >
              {editor?.row === row && editor?.col === col ? (
                cell.validation?.type === 'list' ? (
                  <select className="cell-editor" autoFocus value={editor.value} onChange={(event) => setEditor({ ...editor, value: event.target.value })} onBlur={() => finishEditing()} onKeyDown={(event) => { if (event.key === 'Enter') finishEditing(1); if (event.key === 'Escape') setEditor(null); }}>
                    <option value="">Choose...</option>{cell.validation.values.map((value) => <option key={value} value={value}>{value}</option>)}
                  </select>
                ) : (
                  <textarea className="cell-editor" autoFocus value={editor.value} onChange={(event) => setEditor({ ...editor, value: event.target.value })} onBlur={() => finishEditing()} onKeyDown={(event) => { if (event.key === 'Enter' && !event.altKey) { event.preventDefault(); finishEditing(1); } if (event.key === 'Escape') setEditor(null); }} />
                )
              ) : <span>{cell.display ?? cell.input}</span>}
              {fillAnchor && !editor && !movePreview && (
                <span
                  className="fill-handle"
                  title="Drag to fill"
                  onPointerDown={(event) => { event.preventDefault(); event.stopPropagation(); dragRef.current = { kind: 'fill' }; setFillPreview({ row, col }); }}
                />
              )}
              {cell.validation?.type === 'list' && !editor && <button className="validation-arrow" title="Choose from list" onClick={(event) => { event.stopPropagation(); startEditing(row, col); }}>#</button>}
            </div>
          );
        }))}
        {frozenBoundaryX > 0 && <div className="freeze-line vertical" style={{ left: frozenBoundaryX + scroll.left, top: scroll.top }} />}
        {frozenBoundaryY > 0 && <div className="freeze-line horizontal" style={{ top: frozenBoundaryY + scroll.top, left: scroll.left }} />}
      </div>
    </div>
  );
}
