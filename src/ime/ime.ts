import type { ImeState, CursorPosition } from "./types";

/** Default CSS font stack used for IME preedit UI when terminal fonts are not directly available to CSS. */
export const DEFAULT_IME_FONT_FAMILY =
  '"JetBrains Mono","Fira Code","SFMono-Regular","Menlo","Consolas","Liberation Mono",monospace';

/** Create a fresh IME state with no active composition. */
export function createImeState(): ImeState {
  return {
    composing: false,
    preedit: "",
    selectionStart: 0,
    selectionEnd: 0,
  };
}

/** Set the preedit string on the IME state and sync it to the hidden input element. */
export function setPreedit(
  state: ImeState,
  text: string,
  imeInput?: HTMLInputElement | null,
): void {
  state.preedit = text || "";
  if (imeInput) {
    imeInput.value = state.preedit;
  }
}

/** Clear the preedit string, reset selection offsets, and empty the hidden input. */
export function clearPreedit(state: ImeState, imeInput?: HTMLInputElement | null): void {
  state.preedit = "";
  state.selectionStart = 0;
  state.selectionEnd = 0;
  if (imeInput) {
    imeInput.value = "";
  }
}

/** Begin an IME composition session, marking the state as composing and setting initial preedit. */
export function startComposition(
  state: ImeState,
  data: string,
  imeInput?: HTMLInputElement | null,
): void {
  state.composing = true;
  setPreedit(state, data || imeInput?.value || "");
}

/** Update the preedit text during an active composition without changing composing state. */
export function updateComposition(
  state: ImeState,
  data: string,
  imeInput?: HTMLInputElement | null,
): void {
  setPreedit(state, data || imeInput?.value || "");
}

/** End the composition session and return the committed preedit text. */
export function endComposition(state: ImeState): string {
  state.composing = false;
  const text = state.preedit;
  state.preedit = "";
  state.selectionStart = 0;
  state.selectionEnd = 0;
  return text;
}

/** Read the current selection range from the hidden input and sync it into the IME state. */
export function syncImeSelection(state: ImeState, imeInput: HTMLInputElement | null): void {
  if (!imeInput) return;
  const start = imeInput.selectionStart ?? 0;
  const end = imeInput.selectionEnd ?? start;
  state.selectionStart = Math.max(0, Math.min(start, imeInput.value.length));
  state.selectionEnd = Math.max(state.selectionStart, Math.min(end, imeInput.value.length));
}

/** Reposition the hidden IME input element to align with the terminal cursor. */
export function updateImePosition(
  imeInput: HTMLInputElement | null,
  cursor: CursorPosition | null,
  cellW: number,
  cellH: number,
  dpr: number,
  canvasRect: DOMRect,
): void {
  if (!imeInput || !cursor) return;
  const scale = dpr || 1;
  const x = canvasRect.left + cursor.col * (cellW / scale);
  const y = canvasRect.top + cursor.row * (cellH / scale);
  imeInput.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
}

/** Resolve a visible IME anchor from cursor coordinates, clamped to current viewport bounds. */
export function resolveImeAnchor(
  cursor: {
    row: number;
    col: number;
    wideTail?: boolean;
  } | null,
  cols: number,
  rows: number,
): CursorPosition | null {
  if (!cursor) return null;
  const maxCol = Math.max(0, Math.floor(cols) - 1);
  const maxRow = Math.max(0, Math.floor(rows) - 1);
  let col = Number.isFinite(cursor.col) ? Math.floor(cursor.col) : 0;
  if (cursor.wideTail && col > 0) {
    col -= 1;
  }
  const row = Number.isFinite(cursor.row) ? Math.floor(cursor.row) : 0;
  return {
    col: Math.max(0, Math.min(maxCol, col)),
    row: Math.max(0, Math.min(maxRow, row)),
  };
}

/**
 * Sync hidden IME input typography with terminal sizing so OS preedit/candidate UI
 * uses the same visual scale as the terminal text.
 */
export function syncImeInputTypography(
  imeInput: HTMLInputElement | HTMLTextAreaElement | null,
  fontSizePx: number,
  fontFamily = DEFAULT_IME_FONT_FAMILY,
): void {
  if (!imeInput) return;
  const size = Number.isFinite(fontSizePx)
    ? Math.max(10, Math.min(64, Math.round(fontSizePx)))
    : 18;
  imeInput.style.fontSize = `${size}px`;
  imeInput.style.lineHeight = `${size}px`;
  imeInput.style.fontFamily = fontFamily;
  imeInput.style.fontWeight = "400";
  imeInput.style.letterSpacing = "0";
}

/** Default RGBA background color for the preedit overlay. */
export const PREEDIT_BG = [0.16, 0.16, 0.2, 0.9] as const;
/** Default RGBA background color for the active (selected) preedit segment. */
export const PREEDIT_ACTIVE_BG = [0.3, 0.32, 0.42, 0.95] as const;
/** Default RGBA foreground color for preedit text. */
export const PREEDIT_FG = [0.95, 0.95, 0.98, 1.0] as const;
/** Default RGBA color for the preedit underline. */
export const PREEDIT_UL = [0.7, 0.7, 0.8, 0.9] as const;
/** Default RGBA color for the preedit caret. */
export const PREEDIT_CARET = [0.95, 0.95, 0.98, 1.0] as const;
