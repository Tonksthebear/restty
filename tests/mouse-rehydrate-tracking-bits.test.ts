import { expect, test } from "bun:test";
import { MouseController } from "../src/input/mouse";

function createMouse() {
  const replies: string[] = [];
  const mouse = new MouseController({
    sendReply: (data) => {
      replies.push(data);
    },
    positionToCell: () => ({ row: 0, col: 0 }),
  });
  mouse.setMode("auto");
  return { mouse, replies };
}

function lineWheel(deltaY: number): WheelEvent {
  return {
    deltaY,
    deltaMode: 1,
    shiftKey: false,
    altKey: false,
    ctrlKey: false,
  } as WheelEvent;
}

test("rehydrateFromTrackingBits enables SGR mouse tracking without CSI", () => {
  const { mouse, replies } = createMouse();
  expect(mouse.isActive()).toBe(false);

  // bits: 1000 + 1006 → normal tracking + SGR format
  mouse.rehydrateFromTrackingBits((1 << 1) | (1 << 5));
  expect(mouse.isActive()).toBe(true);
  expect(mouse.getStatus().detail).toBe("sgr");

  expect(mouse.sendMouseEvent("wheel", lineWheel(1))).toBe(true);
  expect(replies.length).toBeGreaterThan(0);
  expect(replies[0]!.startsWith("\x1b[<")).toBe(true);
});

test("rehydrateFromTrackingBits clears stale CSI shadow when bits are zero", () => {
  const { mouse, replies } = createMouse();
  mouse.handleModeSeq("\x1b[?1000;1006h");
  expect(mouse.isActive()).toBe(true);

  mouse.rehydrateFromTrackingBits(0);
  expect(mouse.isActive()).toBe(false);
  expect(mouse.getStatus().detail).toBe("x10");

  expect(mouse.sendMouseEvent("wheel", lineWheel(1))).toBe(false);
  expect(replies).toEqual([]);
});

test("rehydrateFromTrackingBits prefers sgr_pixels over sgr", () => {
  const { mouse } = createMouse();
  mouse.rehydrateFromTrackingBits((1 << 1) | (1 << 5) | (1 << 7));
  expect(mouse.isActive()).toBe(true);
  expect(mouse.getStatus().detail).toBe("sgr_pixels");
});
