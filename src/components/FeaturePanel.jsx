import { useEffect, useMemo, useState } from 'react';
import Dialog from './Dialog.jsx';
import ChartPanel from './ChartPanel.jsx';
import { indexToColumn, rangeToA1 } from '../core/address.js';
import { getCell } from '../core/workbook.js';

function Field({ label, children, hint }) {
  return <label className="field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>;
}

export default function FeaturePanel({ view, onClose, sheet, selection, actions }) {
  const rangeText = rangeToA1(selection);
  const [find, setFind] = useState('');
  const [replace, setReplace] = useState('');
  const [operator, setOperator] = useState('greater');
  const [ruleValue, setRuleValue] = useState('0');
  const [color, setColor] = useState('#dff4e8');
  const [validationType, setValidationType] = useState('list');
  const [validationValue, setValidationValue] = useState('Open, In progress, Done');
  const [name, setName] = useState('');
  const [sortColumn, setSortColumn] = useState(selection.startCol);
  const [sortDirection, setSortDirection] = useState('asc');
  const [filterOperator, setFilterOperator] = useState('contains');
  const [filterValue, setFilterValue] = useState('');
  const [chartType, setChartType] = useState('column');

  useEffect(() => setSortColumn(selection.startCol), [selection.startCol]);
  const matches = useMemo(() => {
    if (!find) return [];
    const lower = find.toLowerCase();
    return Object.entries(sheet.cells).filter(([, cell]) => String(cell.input ?? '').toLowerCase().includes(lower)).map(([address]) => address);
  }, [find, sheet.cells]);

  if (view === 'find') return (
    <Dialog title="Find and replace" onClose={onClose}>
      <Field label="Find"><input value={find} onChange={(event) => setFind(event.target.value)} autoFocus /></Field>
      <Field label="Replace with"><input value={replace} onChange={(event) => setReplace(event.target.value)} /></Field>
      <div className="button-row"><button className="primary" disabled={!matches.length} onClick={() => actions.findNext(matches)}>Next match</button><button disabled={!matches.length} onClick={() => actions.replace(matches[0], find, replace)}>Replace</button></div>
      <button className="wide-button" disabled={!matches.length} onClick={() => actions.replaceAll(find, replace)}>Replace all</button>
      <p className="panel-note">{find ? `${matches.length} match${matches.length === 1 ? '' : 'es'} in ${sheet.name}` : 'Searches the current worksheet. Workbook-wide search can be added without replacing this subsystem.'}</p>
    </Dialog>
  );

  if (view === 'data') return (
    <Dialog title="Data tools" onClose={onClose}>
      <section><h3>Sort selected records</h3><p className="selection-label">{rangeText}</p>
        <div className="field-grid">
          <Field label="Column"><select value={sortColumn} onChange={(event) => setSortColumn(Number(event.target.value))}>{Array.from({ length: selection.endCol - selection.startCol + 1 }, (_, index) => selection.startCol + index).map((col) => <option key={col} value={col}>{indexToColumn(col)}</option>)}</select></Field>
          <Field label="Order"><select value={sortDirection} onChange={(event) => setSortDirection(event.target.value)}><option value="asc">Ascending</option><option value="desc">Descending</option></select></Field>
        </div>
        <button className="primary wide-button" onClick={() => actions.sort(sortColumn, sortDirection)}>Sort rows</button>
      </section>
      <section><h3>Filter selected records</h3>
        <div className="field-grid">
          <Field label="Column"><select value={sortColumn} onChange={(event) => setSortColumn(Number(event.target.value))}>{Array.from({ length: selection.endCol - selection.startCol + 1 }, (_, index) => selection.startCol + index).map((col) => <option key={col} value={col}>{indexToColumn(col)}</option>)}</select></Field>
          <Field label="Condition"><select value={filterOperator} onChange={(event) => setFilterOperator(event.target.value)}><option value="contains">Contains</option><option value="equals">Equals</option><option value="notEquals">Does not equal</option><option value="greater">Greater than</option><option value="less">Less than</option></select></Field>
        </div>
        <Field label="Value"><input value={filterValue} onChange={(event) => setFilterValue(event.target.value)} /></Field>
        <div className="button-row"><button className="primary" onClick={() => actions.filter(sortColumn, filterOperator, filterValue)}>Apply filter</button><button onClick={actions.clearFilters}>Clear filters</button></div>
      </section>
      <section><h3>Structure</h3>
        <button className="wide-button" onClick={actions.makeTable}>Turn selection into a table</button>
        <div className="button-row"><button onClick={() => actions.freeze('row')}>{sheet.freeze.rows ? 'Unfreeze rows' : 'Freeze top row'}</button><button onClick={() => actions.freeze('column')}>{sheet.freeze.cols ? 'Unfreeze columns' : 'Freeze first column'}</button></div>
        <div className="button-row"><button onClick={() => actions.hide('row')}>Hide rows</button><button onClick={() => actions.hide('column')}>Hide columns</button><button onClick={actions.unhide}>Unhide all</button></div>
      </section>
    </Dialog>
  );

  if (view === 'rules') return (
    <Dialog title="Rules and names" onClose={onClose}>
      <section><h3>Conditional formatting</h3><p className="selection-label">{rangeText}</p>
        <div className="field-grid"><Field label="Condition"><select value={operator} onChange={(event) => setOperator(event.target.value)}><option value="greater">Greater than</option><option value="less">Less than</option><option value="equals">Equals</option><option value="contains">Text contains</option><option value="blank">Blank</option><option value="notBlank">Not blank</option></select></Field><Field label="Highlight"><input type="color" value={color} onChange={(event) => setColor(event.target.value)} /></Field></div>
        {!['blank', 'notBlank'].includes(operator) && <Field label="Value"><input value={ruleValue} onChange={(event) => setRuleValue(event.target.value)} /></Field>}
        <button className="primary wide-button" onClick={() => actions.conditional(operator, ruleValue, color)}>Add rule</button>
      </section>
      <section><h3>Data validation</h3>
        <Field label="Rule type"><select value={validationType} onChange={(event) => setValidationType(event.target.value)}><option value="list">Dropdown list</option><option value="number">Number range</option><option value="date">Date range</option></select></Field>
        <Field label={validationType === 'list' ? 'Allowed values' : 'Minimum and maximum'} hint={validationType === 'list' ? 'Separate choices with commas.' : 'Separate the two bounds with a comma.'}><input value={validationValue} onChange={(event) => setValidationValue(event.target.value)} /></Field>
        <button className="primary wide-button" onClick={() => actions.validation(validationType, validationValue)}>Apply validation</button>
      </section>
      <section><h3>Named range</h3>
        <Field label="Name" hint="Letters, numbers, and underscores; begin with a letter."><input value={name} onChange={(event) => setName(event.target.value)} placeholder="monthly_sales" /></Field>
        <button className="wide-button" disabled={!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)} onClick={() => { actions.namedRange(name); setName(''); }}>Create name for {rangeText}</button>
        {Object.entries(actions.namedRanges).map(([key, value]) => <div className="named-range" key={key}><span>{key}</span><code>{value.range}</code></div>)}
      </section>
    </Dialog>
  );

  if (view === 'chart') return (
    <Dialog title="Chart preview" onClose={onClose}>
      <Field label="Chart type"><select value={chartType} onChange={(event) => setChartType(event.target.value)}><option value="column">Column</option><option value="line">Line</option></select></Field>
      <ChartPanel sheet={sheet} rangeText={rangeText} type={chartType} />
      <p className="panel-note">The chart reads directly from {rangeText} and updates when source cells change.</p>
      <button className="primary wide-button" onClick={() => actions.saveChart(rangeText, chartType)}>Save chart view</button>
      {sheet.charts.length > 0 && <section className="saved-charts"><h3>Saved chart views</h3>
        {sheet.charts.map((chart) => <div className="saved-chart" key={chart.id}><div><b>{chart.type === 'line' ? 'Line' : 'Column'} chart</b><code>{chart.range}</code></div><button onClick={() => actions.deleteChart(chart.id)}>Remove</button></div>)}
      </section>}
    </Dialog>
  );
  return null;
}
