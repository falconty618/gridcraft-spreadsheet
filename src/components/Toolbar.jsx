const Button = ({ title, onClick, children, active, disabled }) => (
  <button className={active ? 'tool-button active' : 'tool-button'} title={title} onClick={onClick} disabled={disabled}>{children}</button>
);

const Divider = () => <span className="tool-divider" />;

export default function Toolbar({ actions, style, canUndo, canRedo, view }) {
  return (
    <div className="toolbar" role="toolbar" aria-label="Spreadsheet tools">
      <div className="toolbar-scroll">
      <div className="toolbar-group file-group">
        <Button title="New workbook" onClick={actions.newWorkbook}>New</Button>
        <Button title="Save a full workbook file" onClick={actions.exportJson}>Save file</Button>
        <Button title="Open a Gridcraft workbook or CSV" onClick={actions.importFile}>Open</Button>
        <Button title="Export active sheet as CSV" onClick={actions.exportCsv}>CSV</Button>
      </div>
      <Divider />
      <div className="toolbar-group">
        <Button title="Undo" onClick={actions.undo} disabled={!canUndo}>Undo</Button>
        <Button title="Redo" onClick={actions.redo} disabled={!canRedo}>Redo</Button>
        <Button title="Copy" onClick={actions.copy}>Copy</Button>
        <Button title="Cut" onClick={actions.cut}>Cut</Button>
        <Button title="Paste" onClick={actions.paste}>Paste</Button>
      </div>
      <Divider />
      <div className="toolbar-group formatting">
        <Button title="Bold" active={style.bold} onClick={() => actions.format({ bold: !style.bold })}><b>B</b></Button>
        <Button title="Italic" active={style.italic} onClick={() => actions.format({ italic: !style.italic })}><i>I</i></Button>
        <Button title="Underline" active={style.underline} onClick={() => actions.format({ underline: !style.underline })}><u>U</u></Button>
        <select aria-label="Text alignment" value={style.align || 'left'} onChange={(event) => actions.format({ align: event.target.value })}>
          <option value="left">Left</option><option value="center">Center</option><option value="right">Right</option>
        </select>
        <select aria-label="Number format" value={style.numberFormat || 'general'} onChange={(event) => actions.format({ numberFormat: event.target.value })}>
          <option value="general">General</option><option value="currency">Currency</option><option value="percent">Percent</option>
        </select>
        <input className="color-input" aria-label="Text color" type="color" value={style.color || '#14221c'} onChange={(event) => actions.format({ color: event.target.value })} />
        <input className="color-input" aria-label="Fill color" type="color" value={style.background || '#ffffff'} onChange={(event) => actions.format({ background: event.target.value })} />
      </div>
      <Divider />
      <div className="toolbar-group">
        <Button title="Insert a row above" onClick={() => actions.structure('row', 'insert')}>+ Row</Button>
        <Button title="Insert a column before" onClick={() => actions.structure('column', 'insert')}>+ Col</Button>
        <Button title="Delete selected rows" onClick={() => actions.structure('row', 'delete')}>- Row</Button>
        <Button title="Delete selected columns" onClick={() => actions.structure('column', 'delete')}>- Col</Button>
      </div>
      </div>
      <div className="toolbar-group panel-tabs" aria-label="Feature panels">
        <Button title="Open find and replace" active={view === 'find'} onClick={() => actions.panel('find')}>Find</Button>
        <Button title="Sort or filter selected data" active={view === 'data'} onClick={() => actions.panel('data')}>Data</Button>
        <Button title="Validation, named ranges, and conditional rules" active={view === 'rules'} onClick={() => actions.panel('rules')}>Rules</Button>
        <Button title="Create a chart from the selection" active={view === 'chart'} onClick={() => actions.panel('chart')}>Chart</Button>
      </div>
    </div>
  );
}
