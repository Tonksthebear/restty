import type { SelectionState } from "./types";
import { selectionForRow } from "./core";

/** Callback that returns the text content of a cell by flat grid index. */
export type CellTextGetter = (idx: number) => string;

/**
 * Extract the selected text as a newline-separated string, with trailing
 * whitespace trimmed from each line.
 */
export function getSelectionText(
  state: SelectionState,
  rows: number,
  cols: number,
  getCellText: CellTextGetter,
): string {
  if (!state.active || !state.anchor || !state.focus) return "";
  if (!rows || !cols) return "";

  const a = state.anchor;
  const f = state.focus;
  const forward = f.row > a.row || (f.row === a.row && f.col >= a.col);
  const startRow = forward ? a.row : f.row;
  const endRow = forward ? f.row : a.row;

  const lines: string[] = [];
  for (let row = startRow; row <= endRow; row += 1) {
    const range = selectionForRow(state, row, cols);
    if (!range) continue;
    let line = "";
    for (let col = range.start; col < range.end; col += 1) {
      const idx = row * cols + col;
      line += getCellText(idx);
    }
    line = line.replace(/[ \t]+$/g, "");
    lines.push(line);
  }
  return lines.join("\n");
}
