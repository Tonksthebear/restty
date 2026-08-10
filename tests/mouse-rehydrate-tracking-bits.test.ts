import { expect, test } from "bun:test";
import { MouseController, wheelReportSteps } from "../src/input/mouse";

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

test("rehydrateFromTrackingBits enables SGR mouse tracking without CSI", () => {
  const { mouse, replies } = createMouse();
  expect(mouse.isActive()).toBe(false);

  // bits: 1000 + 1006 → normal tracking + SGR format
  mouse.rehydrateFromTrackingBits((1 << 1) | (1 << 5));
  expect(mouse.isActive()).toBe(true);
  expect(mouse.getStatus().detail).toBe("sgr");

  const wheel = {
    deltaY: 1,
    shiftKey: false,
    altKey: false,
    ctrlKey: false,
  } as WheelEvent;
  expect(mouse.sendMouseEvent("wheel", wheel)).toBe(true);
  expect(replies.length).toBeGreaterThan(0);
  expect(replies[0]).toMatch(/^\x1b\[</);
});

test("rehydrateFromTrackingBits clears stale CSI shadow when bits are zero", () => {
  const { mouse, replies } = createMouse();
  mouse.handleModeSeq("\x1b[?1000;1006h");
  expect(mouse.isActive()).toBe(true);

  mouse.rehydrateFromTrackingBits(0);
  expect(mouse.isActive()).toBe(false);
  expect(mouse.getStatus().detail).toBe("x10");

  const wheel = {
    deltaY: 1,
    shiftKey: false,
    altKey: false,
    ctrlKey: false,
  } as WheelEvent;
  expect(mouse.sendMouseEvent("wheel", wheel)).toBe(false);
  expect(replies).toEqual([]);
});

test("rehydrateFromTrackingBits prefers sgr_pixels over sgr", () => {
  const { mouse } = createMouse();
  mouse.rehydrateFromTrackingBits((1 << 1) | (1 << 5) | (1 << 7));
  expect(mouse.isActive()).toBe(true);
  expect(mouse.getStatus().detail).toBe("sgr_pixels");
});

test("wheelReportSteps scales pixel delta instead of collapsing to ±1", () => {
  expect(wheelReportSteps({ deltaY: 0, deltaMode: 0 } as WheelEvent)).toBe(0);
  expect(wheelReportSteps({ deltaY: -1, deltaMode: 0 } as WheelEvent)).toBe(-1);
  expect(wheelReportSteps({ deltaY: 40, deltaMode: 0 } as WheelEvent)).toBe(1);
  expect(wheelReportSteps({ deltaY: -120, deltaMode: 0 } as WheelEvent)).toBe(-3);
  expect(wheelReportSteps({ deltaY: 400, deltaMode: 0 } as WheelEvent)).toBe(8); // capped
  expect(wheelReportSteps({ deltaY: 3, deltaMode: 1 } as WheelEvent)).toBe(3);
});

test("sendMouseEvent wheel emits multiple SGR reports for large deltaY", () => {
  const { mouse, replies } = createMouse();
  mouse.rehydrateFromTrackingBits((1 << 1) | (1 << 5));
  const wheel = {
    deltaY: -120,
    deltaMode: 0,
    shiftKey: false,
    altKey: false,
    ctrlKey: false,
  } as WheelEvent;
  expect(mouse.sendMouseEvent("wheel", wheel)).toBe(true);
  // 120px / 40 ≈ 3 steps of button 64 (wheel up)
  expect(replies.length).toBe(3);
  for (const r of replies) {
    expect(r).toMatch(/^\x1b\[<64;/);
  }
});
