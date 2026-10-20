import { cloneWorkbook } from './workbook.js';

export class CommandHistory {
  constructor(limit = 100) {
    this.limit = limit;
    this.undoStack = [];
    this.redoStack = [];
  }

  execute(label, workbook, mutation) {
    const before = cloneWorkbook(workbook);
    const next = cloneWorkbook(workbook);
    mutation(next);
    this.undoStack.push({ label, state: before });
    if (this.undoStack.length > this.limit) this.undoStack.shift();
    this.redoStack = [];
    return next;
  }

  undo(workbook) {
    const command = this.undoStack.pop();
    if (!command) return workbook;
    this.redoStack.push({ label: command.label, state: cloneWorkbook(workbook) });
    return cloneWorkbook(command.state);
  }

  redo(workbook) {
    const command = this.redoStack.pop();
    if (!command) return workbook;
    this.undoStack.push({ label: command.label, state: cloneWorkbook(workbook) });
    return cloneWorkbook(command.state);
  }

  get undoLabel() { return this.undoStack.at(-1)?.label || ''; }
  get redoLabel() { return this.redoStack.at(-1)?.label || ''; }
  clear() { this.undoStack = []; this.redoStack = []; }
}
