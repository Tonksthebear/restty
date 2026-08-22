import type { CellPosition, MouseMode, MouseStatus } from "./types";
import { parsePrivateModeSeq } from "./ansi";

/**
 * Construction options for MouseController.
 */
export type MouseControllerOptions = {
  /** Sink for mouse report sequences sent back to the PTY. */
  sendReply: (data: string) => void;
  /** Map pointer events to 0-based cell coordinates. */
  positionToCell: (event: MouseEvent | PointerEvent | WheelEvent) => CellPosition;
  /** Map pointer events to 1-based pixel coordinates (for SGR-Pixels mode). */
  positionToPixel?: (event: MouseEvent | PointerEvent | WheelEvent) => { x: number; y: number };
  /**
   * Cell height in CSS pixels for wheel accumulation.
   * Defaults to 20 when omitted.
   */
  getCellHeight?: () => number;
  /**
   * Viewport rows. Scales page-mode wheel deltas.
   * Defaults to 24 when omitted.
   */
  getRows?: () => number;
  /**
   * Schedule a later wheel-remainder flush. Defaults to requestAnimationFrame
   * so a coalesced flick is paced like native OS scroll callbacks.
   */
  scheduleWheelDrain?: (cb: () => void) => void;
};

/** Discrete reports per PTY write. TUIs redraw once per report. */
export const WHEEL_REPORTS_PER_BURST = 3;

type WheelBurstTarget = {
  code: number;
  col: number;
  row: number;
  pixel: { x: number; y: number } | null;
};

function defaultScheduleWheelDrain(cb: () => void) {
  if (typeof requestAnimationFrame === "function") {
    requestAnimationFrame(() => cb());
    return;
  }
  setTimeout(cb, 16);
}

type MotionMode = "none" | "drag" | "any";
type MouseFormat = "x10" | "utf8" | "sgr" | "urxvt" | "sgr_pixels";

/**
 * Tracks mouse reporting state (mode, format, motion tracking) and encodes
 * pointer events into terminal mouse sequences (X10, UTF-8, URxvt, SGR).
 */
export class MouseController {
  private mode: MouseMode = "auto";
  private enabled = false;
  private format: MouseFormat = "x10";
  private motion: MotionMode = "none";
  private pressed = false;
  private button = 0;
  private flags = { 1000: false, 1002: false, 1003: false };
  private x10Event = false;
  /** Accumulated wheel pixels until one cell height. */
  private pendingWheelPx = 0;
  private wheelDrainEpoch = 0;
  private wheelBurstTarget: WheelBurstTarget | null = null;

  private sendReply: (data: string) => void;
  private positionToCell: (event: MouseEvent | PointerEvent | WheelEvent) => CellPosition;
  private positionToPixel?: (event: MouseEvent | PointerEvent | WheelEvent) => {
    x: number;
    y: number;
  };
  private getCellHeight: () => number;
  private getRows: () => number;
  private scheduleWheelDrain: (cb: () => void) => void;

  constructor(options: MouseControllerOptions) {
    this.sendReply = options.sendReply;
    this.positionToCell = options.positionToCell;
    this.positionToPixel = options.positionToPixel;
    this.getCellHeight = options.getCellHeight ?? (() => 20);
    this.getRows = options.getRows ?? (() => 24);
    this.scheduleWheelDrain = options.scheduleWheelDrain ?? defaultScheduleWheelDrain;
  }

  setReplySink(fn: (data: string) => void) {
    this.sendReply = fn;
  }

  setPositionToCell(fn: (event: MouseEvent | PointerEvent | WheelEvent) => CellPosition) {
    this.positionToCell = fn;
  }

  setPositionToPixel(
    fn: (event: MouseEvent | PointerEvent | WheelEvent) => { x: number; y: number },
  ) {
    this.positionToPixel = fn;
  }

  setMode(mode: MouseMode) {
    this.mode = mode;
    if (mode === "on") {
      this.enabled = true;
      this.format = "sgr";
      this.motion = "drag";
    } else if (mode === "off") {
      this.enabled = false;
      this.format = "x10";
      this.motion = "none";
      this.resetWheelAccumulator();
    } else {
      this.enabled = this.x10Event || this.flags[1000] || this.flags[1002] || this.flags[1003];
      if (this.flags[1003]) this.motion = "any";
      else if (this.flags[1002]) this.motion = "drag";
      else this.motion = "none";
    }
  }

  handleModeSeq(seq: string) {
    const mode = parsePrivateModeSeq(seq);
    if (!mode) return false;
    const { enabled, codes } = mode;
    let handled = false;
    for (const code of codes) {
      if (this.applyPrivateMode(code, enabled)) handled = true;
    }
    return handled;
  }

  /**
   * Apply a single DEC private mode code (same semantics as CSI ? … h/l).
   * Used by live CSI handling and post-GHOSTSNP rehydrate from Ghostty state.
   */
  applyPrivateMode(code: number, enabled: boolean): boolean {
    if (code === 9) {
      this.x10Event = enabled;
      this.recomputeEnabledFromFlags();
      return true;
    }
    if (code === 1006) {
      this.format = enabled ? "sgr" : "x10";
      return true;
    }
    if (code === 1016) {
      this.format = enabled ? "sgr_pixels" : "x10";
      return true;
    }
    if (code === 1005) {
      this.format = enabled ? "utf8" : "x10";
      return true;
    }
    if (code === 1015) {
      this.format = enabled ? "urxvt" : "x10";
      return true;
    }
    if (code === 1000 || code === 1002 || code === 1003) {
      this.updateFlags(code, enabled);
      return true;
    }
    return false;
  }

  /**
   * Rehydrate mouse tracking/format from Ghostty mode bits after snapshot import.
   * Bit layout matches `restty_mouse_tracking_bits` in wasm.
   */
  rehydrateFromTrackingBits(bits: number) {
    // Reset tracking flags so a snapshot without mouse does not leave stale CSI shadow.
    this.x10Event = false;
    this.flags = { 1000: false, 1002: false, 1003: false };
    this.format = "x10";
    this.motion = "none";
    this.enabled = false;
    this.pressed = false;
    this.button = 0;
    this.resetWheelAccumulator();

    const bit = (n: number) => (bits & (1 << n)) !== 0;
    this.x10Event = bit(0);
    this.flags[1000] = bit(1);
    this.flags[1002] = bit(2);
    this.flags[1003] = bit(3);
    // Format: most specific wins (sgr_pixels > sgr > urxvt > utf8 > x10).
    if (bit(7)) this.format = "sgr_pixels";
    else if (bit(5)) this.format = "sgr";
    else if (bit(6)) this.format = "urxvt";
    else if (bit(4)) this.format = "utf8";
    else this.format = "x10";

    // Respect auto/on/off mode after flag rehydrate.
    if (this.mode === "auto") {
      this.recomputeEnabledFromFlags();
    } else {
      this.setMode(this.mode);
    }
  }

  private recomputeEnabledFromFlags() {
    this.enabled = this.x10Event || this.flags[1000] || this.flags[1002] || this.flags[1003];
    if (this.flags[1003]) this.motion = "any";
    else if (this.flags[1002]) this.motion = "drag";
    else this.motion = "none";
    if (!this.enabled) this.resetWheelAccumulator();
  }

  private resetWheelAccumulator() {
    this.wheelDrainEpoch += 1;
    this.pendingWheelPx = 0;
    this.wheelBurstTarget = null;
  }

  private wheelBurstLimit() {
    return Math.max(1, Math.min(WHEEL_REPORTS_PER_BURST, this.getRows() || 24));
  }

  private queueWheelDrain() {
    const cellH = Math.max(1, this.getCellHeight() || 20);
    if (!this.wheelBurstTarget || Math.abs(this.pendingWheelPx) < cellH) return;
    const epoch = this.wheelDrainEpoch;
    this.scheduleWheelDrain(() => {
      if (epoch !== this.wheelDrainEpoch) return;
      this.flushWheelRemainder();
    });
  }

  private flushWheelRemainder() {
    const target = this.wheelBurstTarget;
    if (!target || !this.isActive()) {
      this.resetWheelAccumulator();
      return;
    }
    const cellH = Math.max(1, this.getCellHeight() || 20);
    if (Math.abs(this.pendingWheelPx) < cellH) {
      this.wheelBurstTarget = null;
      return;
    }
    const rawSteps = Math.trunc(this.pendingWheelPx / cellH);
    if (!rawSteps) return;
    const burst = Math.min(Math.abs(rawSteps), this.wheelBurstLimit());
    if (!this.sendWheelBatch(target.code, target.col, target.row, target.pixel, burst)) return;
    this.pendingWheelPx -= Math.sign(rawSteps) * burst * cellH;
    if (Math.abs(this.pendingWheelPx) >= cellH) this.queueWheelDrain();
    else this.wheelBurstTarget = null;
  }

  isActive() {
    if (this.mode === "off") return false;
    if (this.mode === "on") return true;
    return this.enabled;
  }

  getStatus(): MouseStatus {
    return { mode: this.mode, active: this.isActive(), detail: this.format, enabled: this.enabled };
  }

  sendMouseEvent(kind: "down" | "up" | "move" | "wheel", event: PointerEvent | WheelEvent) {
    if (!this.isActive()) return false;
    if (!this.positionToCell) return false;

    if (this.isX10EventMode() && kind !== "down") return false;

    const cell = this.positionToCell(event);
    const col = cell.col + 1;
    const row = cell.row + 1;
    const pixel = this.positionToPixel ? this.positionToPixel(event) : null;
    const isSgr = this.format === "sgr" || this.format === "sgr_pixels";
    const base =
      "button" in event && event.button === 1 ? 1 : "button" in event && event.button === 2 ? 2 : 0;
    const mods = this.modifiers(event, !this.isX10EventMode());

    if (kind === "down") {
      this.pressed = true;
      this.button = base;
      const code = base + mods;
      return this.sendMouse(code, col, row, pixel, false);
    }
    if (kind === "up") {
      const btn = this.pressed ? this.button : base;
      this.pressed = false;
      const code = isSgr ? btn + mods : 3 + mods;
      return this.sendMouse(code, col, row, pixel, true);
    }
    if (kind === "move") {
      if (this.motion === "none") return false;
      if (this.motion === "drag" && !this.pressed) return false;
      const btn = this.pressed ? this.button : 3;
      const code = btn + mods + 32;
      return this.sendMouse(code, col, row, pixel, false);
    }
    if (kind === "wheel") {
      // Browser wheel quantity is pixels/lines/pages, not terminal bytes.
      // A TUI treats each report as one line and redraws. Native terminals
      // receive small OS scroll callbacks; browsers coalesce a flick into one
      // huge delta. Burst now, drain leftover cells on later frames.
      this.wheelDrainEpoch += 1;
      this.wheelBurstTarget = null;
      const cellH = Math.max(1, this.getCellHeight() || 20);
      const rows = Math.max(1, this.getRows() || 24);
      const dyPx = wheelDeltaPixels(event as WheelEvent, cellH, rows);
      if (!dyPx) return false;
      // Drop stale remainder on reverse so leftover motion does not invert.
      let next = this.pendingWheelPx;
      if (next !== 0 && Math.sign(next) !== Math.sign(dyPx)) next = 0;
      next += dyPx;
      if (Math.abs(next) < cellH) {
        this.pendingWheelPx = next;
        return true;
      }
      const rawSteps = Math.trunc(next / cellH);
      if (!rawSteps) {
        this.pendingWheelPx = next;
        return true;
      }
      const burst = Math.min(Math.abs(rawSteps), this.wheelBurstLimit());
      const code = (rawSteps < 0 ? 64 : 65) + mods;
      // Encode before committing remainder so a failed X10 clamp does not drop motion.
      if (!this.sendWheelBatch(code, col, row, pixel, burst)) return false;
      this.pendingWheelPx = next - Math.sign(rawSteps) * burst * cellH;
      this.wheelBurstTarget = { code, col, row, pixel };
      if (Math.abs(this.pendingWheelPx) >= cellH) this.queueWheelDrain();
      else this.wheelBurstTarget = null;
      return true;
    }
    return false;
  }

  private updateFlags(code: number, enabled: boolean) {
    if (!(code in this.flags)) return;
    this.flags[code as 1000 | 1002 | 1003] = enabled;
    this.recomputeEnabledFromFlags();
  }

  private isX10EventMode() {
    if (!this.x10Event) return false;
    return !(this.flags[1000] || this.flags[1002] || this.flags[1003]);
  }

  private modifiers(event: MouseEvent | PointerEvent | WheelEvent, enabled: boolean) {
    if (!enabled) return 0;
    let mod = 0;
    if (event.shiftKey) mod |= 4;
    if (event.altKey) mod |= 8;
    if (event.ctrlKey) mod |= 16;
    return mod;
  }

  private sendMouse(
    code: number,
    col: number,
    row: number,
    pixel: { x: number; y: number } | null,
    release: boolean,
  ) {
    const seq = this.encodeMouse(code, col, row, pixel, release);
    if (!seq) return false;
    this.sendReply(seq);
    return true;
  }

  private sendWheelBatch(
    code: number,
    col: number,
    row: number,
    pixel: { x: number; y: number } | null,
    count: number,
  ) {
    if (count <= 0) return false;
    const one = this.encodeMouse(code, col, row, pixel, false);
    if (!one) return false;
    this.sendReply(count === 1 ? one : one.repeat(count));
    return true;
  }

  private encodeMouse(
    code: number,
    col: number,
    row: number,
    pixel: { x: number; y: number } | null,
    release: boolean,
  ): string | null {
    if (this.format === "x10") {
      if (col > 223 || row > 223) return null;
      const cb = 32 + code;
      const cx = 32 + col;
      const cy = 32 + row;
      return `\x1b[M${String.fromCharCode(cb, cx, cy)}`;
    }
    if (this.format === "utf8") {
      const cb = String.fromCharCode(32 + code);
      const cx = String.fromCodePoint(32 + col);
      const cy = String.fromCodePoint(32 + row);
      return `\x1b[M${cb}${cx}${cy}`;
    }
    if (this.format === "urxvt") {
      return `\x1b[${32 + code};${col};${row}M`;
    }
    const suffix = release ? "m" : "M";
    if (this.format === "sgr_pixels" && pixel) {
      return `\x1b[<${code};${pixel.x};${pixel.y}${suffix}`;
    }
    return `\x1b[<${code};${col};${row}${suffix}`;
  }
}

/**
 * Convert a DOM wheel event into pixel delta for accumulation.
 * DOM_DELTA_PIXEL = 0, LINE = 1, PAGE = 2.
 */
export function wheelDeltaPixels(event: WheelEvent, cellH: number, rows: number): number {
  const dy = event.deltaY;
  if (!dy || !Number.isFinite(dy)) return 0;
  const h = Math.max(1, cellH);
  const r = Math.max(1, rows);
  if (event.deltaMode === 1) return dy * h;
  if (event.deltaMode === 2) return dy * r * h;
  return dy;
}
