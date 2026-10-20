import { getCell } from '../core/workbook.js';
import { indexToColumn, parseRange, toAddress } from '../core/address.js';

export default function ChartPanel({ sheet, rangeText, type = 'column' }) {
  const range = parseRange(rangeText);
  if (!range) return <div className="empty-state">Select a range to preview a chart.</div>;
  const labels = [];
  const values = [];
  for (let row = range.startRow; row <= range.endRow; row += 1) {
    labels.push(String(getCell(sheet, toAddress(row, range.startCol)).value ?? row + 1));
    values.push(Number(getCell(sheet, toAddress(row, Math.min(range.endCol, range.startCol + 1))).value) || 0);
  }
  const max = Math.max(1, ...values.map(Math.abs));
  if (type === 'line') {
    const points = values.map((value, index) => `${20 + index * (260 / Math.max(1, values.length - 1))},${150 - (value / max) * 120}`).join(' ');
    return <div className="chart-card"><svg viewBox="0 0 300 180" role="img" aria-label="Line chart"><line x1="20" y1="150" x2="285" y2="150" /><polyline points={points} fill="none" stroke="#1f6b52" strokeWidth="3" />{points.split(' ').map((point) => { const [x, y] = point.split(','); return <circle key={point} cx={x} cy={y} r="4" fill="#f08b53" />; })}</svg></div>;
  }
  return (
    <div className="chart-card"><div className="bar-chart">
      {values.map((value, index) => (
        <div className="bar-item" key={`${labels[index]}-${index}`}><div className="bar-value">{value.toLocaleString()}</div><div className="bar" style={{ height: `${Math.max(2, Math.abs(value) / max * 120)}px` }} /><span title={labels[index]}>{labels[index].slice(0, 10)}</span></div>
      ))}
    </div><p>{indexToColumn(range.startCol)} supplies labels; {indexToColumn(Math.min(range.endCol, range.startCol + 1))} supplies values.</p></div>
  );
}
