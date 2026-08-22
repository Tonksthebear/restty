import { expect, test } from "bun:test";
import { createInputHandler } from "../src/input";
import { MouseController, WHEEL_REPORTS_PER_BURST, wheelDeltaPixels } from "../src/input/mouse";

function createMouse(opts?: { cellH?: number; rows?: number; pixel?: { x: number; y: number } }) {
  const replies: string[] = [];
  const drains: Array<() => void> = [];
  const mouse = new MouseController({
    sendReply: (data) => {
      replies.push(data);
    },
    positionToCell: () => ({ row: 1, col: 2 }),
    positionToPixel: opts?.pixel ? () => opts.pixel! : undefined,
    getCellHeight: () => opts?.cellH ?? 20,
    getRows: () => opts?.rows ?? 24,
    scheduleWheelDrain: (cb) => {
      drains.push(cb);
    },
  });
  mouse.setMode("auto");
  const flushDrains = () => {
    while (drains.length > 0) {
      const cb = drains.shift();
      cb?.();
    }
  };
  return { mouse, replies, drains, flushDrains };
}

function enableSgr(mouse: MouseController) {
  mouse.handleModeSeq("\x1b[?1000;1006h");
}

function wheelEvent(deltaY: number, extra: Partial<WheelEvent> = {}): WheelEvent {
  return {
    deltaY,
    deltaMode: 0,
    shiftKey: false,
    altKey: false,
    ctrlKey: false,
    ...extra,
  } as WheelEvent;
}

function reportCount(seq: string | undefined, needle: string): number {
  if (!seq) return 0;
  return seq.split(needle).length - 1;
}

test("wheelDeltaPixels uses live cell height and viewport rows", () => {
  expect(wheelDeltaPixels({ deltaY: 0, deltaMode: 0 } as WheelEvent, 18, 30)).toBe(0);
  expect(wheelDeltaPixels({ deltaY: -7.5, deltaMode: 0 } as WheelEvent, 18, 30)).toBe(-7.5);
  expect(wheelDeltaPixels({ deltaY: 2, deltaMode: 1 } as WheelEvent, 18, 30)).toBe(36);
  expect(wheelDeltaPixels({ deltaY: 1, deltaMode: 2 } as WheelEvent, 18, 30)).toBe(540);
  expect(wheelDeltaPixels({ deltaY: -1, deltaMode: 2 } as WheelEvent, 16, 40)).toBe(-640);
});

test("precision trackpad deltas accumulate to cell height before reporting", () => {
  const { mouse, replies } = createMouse({ cellH: 20 });
  enableSgr(mouse);
  const tiny = wheelEvent(-4);
  expect(mouse.sendMouseEvent("wheel", tiny)).toBe(true);
  expect(mouse.sendMouseEvent("wheel", tiny)).toBe(true);
  expect(mouse.sendMouseEvent("wheel", tiny)).toBe(true);
  expect(mouse.sendMouseEvent("wheel", tiny)).toBe(true);
  expect(replies).toEqual([]);
  expect(mouse.sendMouseEvent("wheel", tiny)).toBe(true);
  expect(replies.length).toBe(1);
  expect(reportCount(replies[0], "\x1b[<")).toBe(1);
  expect(replies[0]).toBe("\x1b[<64;3;2M");
});

test("coarse pixel wheel emits one report per live cell of motion", () => {
  const { mouse, replies } = createMouse({ cellH: 16, rows: 24 });
  enableSgr(mouse);
  expect(mouse.sendMouseEvent("wheel", wheelEvent(48))).toBe(true);
  expect(replies.length).toBe(1);
  expect(reportCount(replies[0], "\x1b[<")).toBe(3);
  expect(replies[0]!.startsWith("\x1b[<65;")).toBe(true);
});

test("momentum stream keeps fractional remainder across events", () => {
  const { mouse, replies } = createMouse({ cellH: 20 });
  enableSgr(mouse);
  expect(mouse.sendMouseEvent("wheel", wheelEvent(-12))).toBe(true);
  expect(replies).toEqual([]);
  expect(mouse.sendMouseEvent("wheel", wheelEvent(-9))).toBe(true);
  expect(replies.length).toBe(1);
  expect(reportCount(replies[0], "\x1b[<")).toBe(1);
  replies.length = 0;
  expect(mouse.sendMouseEvent("wheel", wheelEvent(-6))).toBe(true);
  expect(replies).toEqual([]);
  expect(mouse.sendMouseEvent("wheel", wheelEvent(-14))).toBe(true);
  expect(replies.length).toBe(1);
  expect(reportCount(replies[0], "\x1b[<")).toBe(1);
});

test("large swipe sends a TUI-sized burst then drains remainder on later frames", () => {
  const { mouse, replies, drains, flushDrains } = createMouse({ cellH: 20, rows: 10 });
  enableSgr(mouse);
  // 1005px / 20 = 50 cells with 5px remainder. One write is one mouse-notch burst.
  expect(mouse.sendMouseEvent("wheel", wheelEvent(-1005))).toBe(true);
  expect(replies.length).toBe(1);
  expect(reportCount(replies[0], "\x1b[<")).toBe(WHEEL_REPORTS_PER_BURST);
  expect(drains.length).toBe(1);
  flushDrains();
  const total = replies.reduce((n, seq) => n + reportCount(seq, "\x1b[<"), 0);
  expect(total).toBe(50);
  expect(replies.length).toBeGreaterThan(1);
  replies.length = 0;
  expect(mouse.sendMouseEvent("wheel", wheelEvent(-1))).toBe(true);
  expect(replies).toEqual([]);
  expect(mouse.sendMouseEvent("wheel", wheelEvent(-14))).toBe(true);
  expect(replies.length).toBe(1);
  expect(reportCount(replies[0], "\x1b[<")).toBe(1);
});

test("negative deltaY encodes button 64 and positive encodes 65", () => {
  const { mouse, replies } = createMouse({ cellH: 20 });
  enableSgr(mouse);
  expect(mouse.sendMouseEvent("wheel", wheelEvent(-20))).toBe(true);
  expect(replies[0]).toBe("\x1b[<64;3;2M");
  replies.length = 0;
  expect(mouse.sendMouseEvent("wheel", wheelEvent(20))).toBe(true);
  expect(replies[0]).toBe("\x1b[<65;3;2M");
});

test("a later wheel event cancels a pending remainder drain", () => {
  const { mouse, replies, drains } = createMouse({ cellH: 20 });
  enableSgr(mouse);
  expect(mouse.sendMouseEvent("wheel", wheelEvent(-80))).toBe(true);
  expect(reportCount(replies[0], "\x1b[<")).toBe(WHEEL_REPORTS_PER_BURST);
  expect(drains.length).toBe(1);
  const stale = drains[0]!;
  replies.length = 0;
  drains.length = 0;
  expect(mouse.sendMouseEvent("wheel", wheelEvent(-20))).toBe(true);
  expect(replies.length).toBe(1);
  stale();
  expect(replies.length).toBe(1);
});

test("direction change drops stale remainder instead of reversing it", () => {
  const { mouse, replies } = createMouse({ cellH: 20 });
  enableSgr(mouse);
  expect(mouse.sendMouseEvent("wheel", wheelEvent(15))).toBe(true);
  expect(replies).toEqual([]);
  expect(mouse.sendMouseEvent("wheel", wheelEvent(-20))).toBe(true);
  expect(replies.length).toBe(1);
  expect(replies[0]).toBe("\x1b[<64;3;2M");
});

test("line-mode wheel uses the real line count and cell height", () => {
  const { mouse, replies } = createMouse({ cellH: 18, rows: 40 });
  enableSgr(mouse);
  expect(mouse.sendMouseEvent("wheel", wheelEvent(3, { deltaMode: 1 }))).toBe(true);
  expect(replies.length).toBe(1);
  expect(reportCount(replies[0], "\x1b[<")).toBe(3);
  expect(replies[0]!.startsWith("\x1b[<65;")).toBe(true);
});

test("page-mode wheel uses live viewport rows and paces the reports", () => {
  const { mouse, replies, flushDrains } = createMouse({ cellH: 16, rows: 30 });
  enableSgr(mouse);
  expect(mouse.sendMouseEvent("wheel", wheelEvent(1, { deltaMode: 2 }))).toBe(true);
  expect(replies.length).toBe(1);
  expect(reportCount(replies[0], "\x1b[<")).toBe(WHEEL_REPORTS_PER_BURST);
  flushDrains();
  const total = replies.reduce((n, seq) => n + reportCount(seq, "\x1b[<"), 0);
  expect(total).toBe(30);
});

test("ctrl modifier is encoded on batched wheel reports", () => {
  const { mouse, replies } = createMouse({ cellH: 20 });
  enableSgr(mouse);
  expect(mouse.sendMouseEvent("wheel", wheelEvent(-40, { ctrlKey: true }))).toBe(true);
  expect(replies[0]).toBe("\x1b[<80;3;2M\x1b[<80;3;2M");
});

test("X10 format clamp does not debit remainder when encode fails", () => {
  let cell = { row: 300, col: 300 };
  const replies: string[] = [];
  const mouse = new MouseController({
    sendReply: (data) => {
      replies.push(data);
    },
    positionToCell: () => cell,
    getCellHeight: () => 20,
    getRows: () => 24,
  });
  mouse.setMode("auto");
  mouse.handleModeSeq("\x1b[?1000h");
  expect(mouse.sendMouseEvent("wheel", wheelEvent(-40))).toBe(false);
  expect(replies).toEqual([]);
  cell = { row: 1, col: 2 };
  expect(mouse.sendMouseEvent("wheel", wheelEvent(-40))).toBe(true);
  expect(replies.length).toBe(1);
  expect(reportCount(replies[0], "\x1b[M")).toBe(2);
});

test("X10 event mode suppresses wheel and keeps the 223 clamp", () => {
  const replies: string[] = [];
  let cell = { row: 0, col: 0 };
  const mouse = new MouseController({
    sendReply: (data) => {
      replies.push(data);
    },
    positionToCell: () => cell,
  });
  mouse.setMode("auto");
  mouse.handleModeSeq("\x1b[?9h");
  expect(mouse.isActive()).toBe(true);
  expect(mouse.sendMouseEvent("wheel", wheelEvent(-20))).toBe(false);
  expect(replies).toEqual([]);

  cell = { row: 300, col: 300 };
  const downFar = { button: 0, shiftKey: false, altKey: false, ctrlKey: false } as PointerEvent;
  expect(mouse.sendMouseEvent("down", downFar)).toBe(false);
  expect(replies).toEqual([]);

  cell = { row: 1, col: 2 };
  expect(mouse.sendMouseEvent("down", downFar)).toBe(true);
  expect(replies.length).toBe(1);
  expect(replies[0]!.startsWith("\x1b[M")).toBe(true);
});

test("createInputHandler uses live cell metrics for wheel accumulation", () => {
  const replies: string[] = [];
  const input = createInputHandler({
    sendReply: (data) => {
      replies.push(data);
    },
    positionToCell: () => ({ row: 0, col: 0 }),
    getCellHeight: () => 13,
    getRows: () => 9,
  });
  input.setMouseMode("auto");
  input.rehydrateMouseFromTrackingBits?.((1 << 1) | (1 << 5));
  expect(input.sendMouseEvent("wheel", wheelEvent(-12))).toBe(true);
  expect(replies).toEqual([]);
  expect(input.sendMouseEvent("wheel", wheelEvent(-14))).toBe(true);
  expect(replies.length).toBe(1);
  expect(reportCount(replies[0], "\x1b[<")).toBe(2);
});

test("utf8 urxvt sgr and sgr-pixels wheel encodings batch without inventing steps", () => {
  const cases: Array<{
    seq: string;
    detail: string;
    needle: string;
    pixel?: { x: number; y: number };
  }> = [
    { seq: "\x1b[?1000;1005h", detail: "utf8", needle: "\x1b[M" },
    { seq: "\x1b[?1000;1015h", detail: "urxvt", needle: "\x1b[" },
    { seq: "\x1b[?1000;1006h", detail: "sgr", needle: "\x1b[<" },
    {
      seq: "\x1b[?1000;1016h",
      detail: "sgr_pixels",
      needle: "\x1b[<",
      pixel: { x: 11, y: 22 },
    },
  ];
  for (const c of cases) {
    const { mouse, replies } = createMouse({ cellH: 20, pixel: c.pixel });
    mouse.handleModeSeq(c.seq);
    expect(mouse.getStatus().detail).toBe(c.detail);
    expect(mouse.sendMouseEvent("wheel", wheelEvent(-40))).toBe(true);
    expect(replies.length).toBe(1);
    expect(reportCount(replies[0], c.needle)).toBeGreaterThanOrEqual(2);
    if (c.detail === "sgr_pixels") {
      expect(replies[0]).toContain(";11;22M");
    }
  }
});
