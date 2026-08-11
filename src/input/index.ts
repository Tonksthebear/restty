import { encodeBeforeInput, encodeKeyEvent, mapKeyForPty, sequences } from "./keymap";
import { MouseController } from "./mouse";
import { OutputFilter } from "./output/index";
import type { InputHandler, InputHandlerConfig, InputHandlerOptions, MouseMode } from "./types";

/**
 * Create a terminal input handler with key, IME, PTY, and mouse support.
 */
export function createInputHandler(options: InputHandlerOptions = {}): InputHandler {
  const config: InputHandlerConfig = options.config || {};

  const cursorProvider = options.getCursorPosition || (() => ({ row: 1, col: 1 }));
  // Mouse reports and (by default) query replies share sendReply. When Restty
  // is a pure renderer, mute only query replies so keyboard/mouse input still
  // reaches the session-owned PTY.
  const inputSink = options.sendReply || (() => {});
  const querySink = options.suppressQueryReplies ? () => {} : inputSink;
  const positionToCell = options.positionToCell || (() => ({ row: 0, col: 0 }));
  const positionToPixel = options.positionToPixel || null;

  const mouse = new MouseController({
    sendReply: inputSink,
    positionToCell,
    positionToPixel: positionToPixel ?? undefined,
  });
  const filter = new OutputFilter({
    getCursorPosition: cursorProvider,
    sendReply: querySink,
    mouse,
    getDefaultColors: options.getDefaultColors,
    onClipboardRead: options.onClipboardRead,
    onClipboardWrite: options.onClipboardWrite,
    onWindowOp: options.onWindowOp,
    getWindowMetrics: options.getWindowMetrics,
    onDesktopNotification: options.onDesktopNotification,
  });

  return {
    sequences,
    encodeKeyEvent: (event) =>
      encodeKeyEvent(event, config, options.getKittyKeyboardFlags?.() ?? 0),
    encodeBeforeInput,
    mapKeyForPty,
    filterOutput: (output) => filter.filter(output),
    filterOutputBytes: (output) => filter.filterBytes(output),
    setReplySink: (fn) => {
      mouse.setReplySink(fn);
      // Keep query replies muted for the lifetime of a read-only handler.
      if (!options.suppressQueryReplies) {
        filter.setReplySink(fn);
      }
    },
    setCursorProvider: (fn) => {
      filter.setCursorProvider(fn);
    },
    setPositionToCell: (fn) => {
      mouse.setPositionToCell(fn);
    },
    setPositionToPixel: (fn) => {
      mouse.setPositionToPixel(fn);
    },
    setWindowOpHandler: (fn) => {
      filter.setWindowOpHandler(fn);
    },
    setMouseMode: (mode: MouseMode) => {
      mouse.setMode(mode);
    },
    getMouseStatus: () => mouse.getStatus(),
    isMouseActive: () => mouse.isActive(),
    rehydrateMouseFromTrackingBits: (bits: number) => {
      mouse.rehydrateFromTrackingBits(bits);
    },
    isBracketedPaste: () => filter.isBracketedPaste(),
    isFocusReporting: () => filter.isFocusReporting(),
    isAltScreen: () => filter.isAltScreen(),
    isSynchronizedOutput: () => filter.isSynchronizedOutput(),
    isPromptClickEventsEnabled: () => filter.isPromptClickEventsEnabled(),
    encodePromptClickEvent: (cell) => filter.encodePromptClickEvent(cell),
    sendMouseEvent: (kind, event) => mouse.sendMouseEvent(kind, event),
  };
}

export type {
  CellPosition,
  CursorPosition,
  InputHandler,
  InputHandlerConfig,
  InputHandlerOptions,
  MouseMode,
  MouseStatus,
  DesktopNotification,
} from "./types";
