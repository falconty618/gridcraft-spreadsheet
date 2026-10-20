export default function FormulaBar({ address, value, onChange, onCommit, onCancel }) {
  return (
    <div className="formula-bar">
      <div className="name-box" title="Active cell">{address}</div>
      <div className="formula-mark">fx</div>
      <input
        aria-label="Cell input or formula"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onCommit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') { event.preventDefault(); onCommit(); }
          if (event.key === 'Escape') { event.preventDefault(); onCancel(); }
        }}
      />
    </div>
  );
}
