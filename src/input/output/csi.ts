import { isDeviceAttributesQuery, parsePrivateModeSeq, parseWindowOpSeq } from "../ansi";
import type { CursorPosition, WindowOp } from "../types";

export type OutputModeState = {
  bracketedPaste: boolean;
  focusReporting: boolean;
  synchronizedOutput: boolean;
};

export type WindowMetrics = {
  rows: number;
  cols: number;
  widthPx: number;
  heightPx: number;
  cellWidthPx: number;
  cellHeightPx: number;
};

export function deriveAltScreen(seq: string, current: boolean): boolean {
  const altMode = parsePrivateModeSeq(seq);
  if (!altMode) return current;
  const { enabled, codes } = altMode;
  if (codes.some((code) => code === 47 || code === 1047 || code === 1049)) {
    return enabled;
  }
  return current;
}

/**
 * Apply tracked private mode flags. Returns true when one of the tracked
 * modes was handled.
 */
export function applyTrackedPrivateModes(seq: string, state: OutputModeState): boolean {
  const mode = parsePrivateModeSeq(seq);
  if (!mode) return false;
  const { enabled, codes } = mode;
  let handled = false;
  for (const code of codes) {
    if (code === 2004) {
      state.bracketedPaste = enabled;
      handled = true;
    } else if (code === 1004) {
      state.focusReporting = enabled;
      handled = true;
    } else if (code === 2026) {
      state.synchronizedOutput = enabled;
    }
  }
  return handled;
}

export type WindowOpHandlers = {
  sendReply: (data: string) => void;
  getWindowMetrics?: () => WindowMetrics;
  onWindowOp?: (op: WindowOp) => void;
};

/** Handle XTWINOPS queries and window manipulation hooks. */
export function handleWindowOpSequence(seq: string, handlers: WindowOpHandlers): boolean {
  const params = parseWindowOpSeq(seq);
  if (!params) return false;
  const op = params[0] ?? 0;
  const metrics = handlers.getWindowMetrics?.();

  if (metrics && op === 14 && params.length === 1) {
    handlers.sendReply(`\x1b[4;${metrics.heightPx};${metrics.widthPx}t`);
    return true;
  }
  if (metrics && op === 16 && params.length === 1) {
    handlers.sendReply(`\x1b[6;${metrics.cellHeightPx};${metrics.cellWidthPx}t`);
    return true;
  }
  if (metrics && op === 18 && params.length === 1) {
    handlers.sendReply(`\x1b[8;${metrics.rows};${metrics.cols}t`);
    return true;
  }

  if (!handlers.onWindowOp) return false;
  if (params[0] === 8 && params.length >= 3) {
    handlers.onWindowOp({
      type: "resize",
      rows: params[1] ?? 0,
      cols: params[2] ?? 0,
      params,
      raw: seq,
    });
  } else {
    handlers.onWindowOp({ type: "unknown", params, raw: seq });
  }
  return true;
}

export type CoreCsiHandlers = {
  sendReply: (data: string) => void;
  getCursorPosition: () => CursorPosition;
};

/** Handle core CSI queries intercepted by OutputFilter. */
export function handleCoreCsiSequence(seq: string, handlers: CoreCsiHandlers): boolean {
  if (seq === "\x1b[6n") {
    const { row, col } = handlers.getCursorPosition();
    handlers.sendReply(`\x1b[${row};${col}R`);
    return true;
  }
  if (seq === "\x1b[>q") {
    // XTVERSION query used by plugins (e.g. snacks.nvim) to detect
    // kitty/ghostty/wezterm support. Reply with a ghostty-compatible id.
    handlers.sendReply("\x1bP>|ghostty 1.0\x1b\\");
    return true;
  }
  if (isDeviceAttributesQuery(seq)) {
    handlers.sendReply("\x1b[?1;2c");
    return true;
  }
  return false;
}
