# Architecture

## Layer ownership

- `core/workbook.js`: versioned sparse workbook, sheets, cells, dimensions, feature metadata, serialization, and structural mutations.
- `core/formula.js`: tokenizer, parser, reference semantics, evaluation, formula translation, and structural reference rewriting. It never executes user input as JavaScript.
- `core/recalculate.js`: dependency discovery, affected-cell traversal, topological recalculation, and cycle errors.
- `core/history.js`: central command/history boundary used by all workbook mutations.
- `core/clipboard.js`: internal range payloads and tab/newline interchange.
- `App.jsx`: application controller, persistence, commands, and feature orchestration.
- `components/SpreadsheetGrid.jsx`: virtualized viewport, selection/editing controller, fill handle, and resize controls.
- `components/*`: toolbar, formula bar, sheet tabs, dialogs, chart, and status information.

The DOM grid is a projection of workbook state; it is never authoritative. Sheet IDs remain stable when tabs are renamed or reordered. Cross-sheet references resolve by name while persisted metadata uses stable sheet IDs where applicable.

## Phase 3 boundary

Advanced formula design, simultaneous multi-sheet operations, pivots/derived datasets, automation, AI actions, and collaboration are not implemented. Their UX and data-model implications require approval first.
