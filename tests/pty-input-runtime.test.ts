import { expect, test } from "bun:test";
import type { InputHandler } from "../src/input";
import type { PtyTransport } from "../src/pty";
import { createPtyInputRuntime } from "../src/runtime/create-runtime/pty-input-runtime";

function createInputHandlerStub(mapper: (seq: string) => string): InputHandler {
  return {
    sequences: {
      enter: "\r",
      backspace: "\x7f",
      delete: "\x1b[3~",
      tab: "\t",
      shiftTab: "\x1b[Z",
      escape: "\x1b",
    },
    encodeKeyEvent: () => "",
    encodeBeforeInput: () => "",
    mapKeyForPty: mapper,
    filterOutput: (output: string) => output,
    setReplySink: () => {},
    setCursorProvider: () => {},
    setPositionToCell: () => {},
    setPositionToPixel: () => {},
    setWindowOpHandler: () => {},
    setMouseMode: () => {},
    getMouseStatus: () => ({
      mode: "off",
      active: false,
      detail: "sgr",
      enabled: false,
    }),
    isMouseActive: () => false,
    isBracketedPaste: () => false,
    isFocusReporting: () => false,
    isAltScreen: () => false,
    isSynchronizedOutput: () => false,
    isPromptClickEventsEnabled: () => false,
    encodePromptClickEvent: () => "",
    sendMouseEvent: () => false,
  };
}

function createTransportStub(sent: string[]): PtyTransport {
  return {
    connect: () => {},
    disconnect: () => {},
    sendInput: (data: string) => {
      sent.push(data);
      return true;
    },
    resize: () => true,
    isConnected: () => true,
  };
}

test("sendKeyInput always routes payloads through PTY key mapper", () => {
  const sent: string[] = [];
  const runtime = createPtyInputRuntime({
    ptyTransport: createTransportStub(sent),
    ptyOutputBuffer: {
      queue: () => {},
      queueBytes: () => {},
      flush: () => {},
      cancel: () => {},
      clear: () => {},
    },
    inputHandler: createInputHandlerStub((seq) => `mapped:${seq}`),
    appendLog: () => {},
    getGridSize: () => ({ cols: 80, rows: 24 }),
    getCursorForCpr: () => ({ row: 1, col: 1 }),
    sendInput: () => {},
    runBeforeInputHook: (text) => text,
    shouldClearSelection: () => false,
    clearSelection: () => {},
    syncOutputResetMs: 1000,
    syncOutputResetSeq: "\x1b[?2026l",
  });

  runtime.sendKeyInput("\x1b[13u");
  runtime.sendKeyInput("\x1b[127;2u");

  expect(sent).toEqual(["mapped:\x1b[13u", "mapped:\x1b[127;2u"]);
});

test("sendKeyInput keeps legacy mapper behavior for non-kitty payloads", () => {
  const sent: string[] = [];
  const runtime = createPtyInputRuntime({
    ptyTransport: createTransportStub(sent),
    ptyOutputBuffer: {
      queue: () => {},
      queueBytes: () => {},
      flush: () => {},
      cancel: () => {},
      clear: () => {},
    },
    inputHandler: createInputHandlerStub((seq) => `mapped:${seq}`),
    appendLog: () => {},
    getGridSize: () => ({ cols: 80, rows: 24 }),
    getCursorForCpr: () => ({ row: 1, col: 1 }),
    sendInput: () => {},
    runBeforeInputHook: (text) => text,
    shouldClearSelection: () => false,
    clearSelection: () => {},
    syncOutputResetMs: 1000,
    syncOutputResetSeq: "\x1b[?2026l",
  });

  runtime.sendKeyInput("\x08");

  expect(sent).toEqual(["mapped:\x08"]);
});

test("connectPty uses byte-safe filtering for live Uint8Array output", () => {
  const filteredBytes: number[][] = [];
  const queuedBytes: number[][] = [];
  let capturedOnData: ((data: string | Uint8Array) => void) | undefined;

  const runtime = createPtyInputRuntime({
    ptyTransport: {
      connect: ({ callbacks }) => {
        capturedOnData = callbacks.onData;
      },
      disconnect: () => {},
      sendInput: () => true,
      resize: () => true,
      isConnected: () => false,
    },
    ptyOutputBuffer: {
      queue: () => {
        throw new Error("string queue should not be used for Uint8Array PTY output");
      },
      queueBytes: (data) => {
        queuedBytes.push(Array.from(data));
      },
      flush: () => {},
      cancel: () => {},
      clear: () => {},
    },
    inputHandler: {
      ...createInputHandlerStub((seq) => seq),
      filterOutput: () => {
        throw new Error("lossy string filter should not be used for Uint8Array PTY output");
      },
      filterOutputBytes: (output) => {
        filteredBytes.push(Array.from(output));
      },
    },
    appendLog: () => {},
    getGridSize: () => ({ cols: 80, rows: 24 }),
    getCursorForCpr: () => ({ row: 1, col: 1 }),
    sendInput: () => {},
    runBeforeInputHook: (text) => text,
    shouldClearSelection: () => false,
    clearSelection: () => {},
    syncOutputResetMs: 1000,
    syncOutputResetSeq: "\x1b[?2026l",
  });

  runtime.connectPty("ws://example.test");
  const payload = Uint8Array.from([0xff, 0x1b, 0x5b, 0x36, 0x6e]);
  capturedOnData?.(payload);

  expect(filteredBytes).toEqual([Array.from(payload)]);
  expect(queuedBytes).toEqual([Array.from(payload)]);
});
