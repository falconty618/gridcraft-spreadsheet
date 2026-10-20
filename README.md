# Gridcraft Spreadsheet

Gridcraft is a purpose-built, local-first spreadsheet application. It implements a sparse workbook model, parser-based formulas, dependency-aware recalculation, structural reference updates, centralized undo/redo, virtualized rendering, formatting, validation, tables, sorting/filtering, charts, CSV interoperability, and versioned JSON persistence.

## Run locally

```bash
npm install
npm run dev
```

After running `npm run build`, you can also double-click `index.html`. It redirects to the self-contained production application in `dist/index.html`; no local server is required.

## Verify

```bash
npm test
npm run build
```

## Data and privacy

Workbooks are saved in the browser's local storage. JSON workbook files can be exported and imported for durable backups. CSV import/export operates on the active sheet. No workbook data is sent to a server.

## Interoperability scope

- CSV: supported for active-sheet import and export.
- Gridcraft JSON: full-fidelity workbook import and export with schema versioning.
- XLSX: intentionally not included yet. Silent fidelity loss is avoided; this is a Phase 3 design decision.

## Performance target

The grid models 10,000 rows by 200 columns while rendering only the visible viewport plus overscan. The pure calculation layer is tested independently from the UI.
