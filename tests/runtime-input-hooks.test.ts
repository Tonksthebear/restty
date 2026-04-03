import { expect, test } from "bun:test";
import { createRuntimeInputHooks } from "../src/runtime/create-runtime/input-hooks";

test("beforeRenderOutput byte hook exposes raw bytes and can suppress binary PTY output", () => {
  const seen: Array<{ source: string; text: string; bytes: number[] }> = [];
  const hooks = createRuntimeInputHooks({
    beforeRenderOutputHook: ({ text, source, bytes }) => {
      seen.push({
        source,
        text,
        bytes: Array.from(bytes ?? []),
      });
      return bytes?.[0] === 0xff ? null : text;
    },
  });

  expect(hooks.runBeforeRenderOutputBytesHook(Uint8Array.from([0xff, 0x41]), "pty")).toBe(false);
  expect(hooks.runBeforeRenderOutputBytesHook(Uint8Array.from([0x42]), "pty")).toBe(true);
  expect(seen).toEqual([
    { source: "pty", text: "\ufffdA", bytes: [0xff, 0x41] },
    { source: "pty", text: "B", bytes: [0x42] },
  ]);
});
