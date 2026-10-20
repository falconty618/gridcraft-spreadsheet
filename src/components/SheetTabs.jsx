export default function SheetTabs({ sheets, activeId, onActivate, onAdd, onRename, onDelete, onMove }) {
  return (
    <div className="sheet-tabs">
      <button className="add-sheet" onClick={onAdd} title="Add worksheet">+</button>
      <div className="sheet-tab-scroll">
        {sheets.map((sheet) => (
          <div className={sheet.id === activeId ? 'sheet-tab active' : 'sheet-tab'} key={sheet.id}>
            <button onClick={() => onActivate(sheet.id)} onDoubleClick={() => onRename(sheet.id)}>{sheet.name}</button>
            {sheet.id === activeId && (
              <span className="sheet-actions">
                <button title="Move left" onClick={() => onMove(sheet.id, -1)}>&larr;</button>
                <button title="Move right" onClick={() => onMove(sheet.id, 1)}>&rarr;</button>
                <button title="Rename sheet" onClick={() => onRename(sheet.id)}>Edit</button>
                <button title="Delete sheet" onClick={() => onDelete(sheet.id)}>&times;</button>
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
