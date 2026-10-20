export default function Dialog({ title, onClose, children }) {
  return (
    <aside className="side-panel" aria-label={title}>
      <header><div><span className="eyebrow">Workspace tool</span><h2>{title}</h2></div><button className="icon-button" onClick={onClose} aria-label="Close panel">�</button></header>
      <div className="side-panel-body">{children}</div>
    </aside>
  );
}
