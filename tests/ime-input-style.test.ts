import { expect, test } from "bun:test";
import { DEFAULT_IME_FONT_FAMILY, syncImeInputTypography } from "../src/ime";

function createFakeImeInput(): HTMLInputElement {
  return {
    style: {},
  } as unknown as HTMLInputElement;
}

test("syncImeInputTypography applies default IME typography", () => {
  const imeInput = createFakeImeInput();

  syncImeInputTypography(imeInput, 19.7);

  expect(imeInput.style.fontSize).toBe("20px");
  expect(imeInput.style.lineHeight).toBe("20px");
  expect(imeInput.style.fontFamily).toBe(DEFAULT_IME_FONT_FAMILY);
  expect(imeInput.style.fontWeight).toBe("400");
  expect(imeInput.style.letterSpacing).toBe("0");
});

test("syncImeInputTypography clamps font size to supported range", () => {
  const imeInput = createFakeImeInput();

  syncImeInputTypography(imeInput, 2);
  expect(imeInput.style.fontSize).toBe("10px");

  syncImeInputTypography(imeInput, 200);
  expect(imeInput.style.fontSize).toBe("64px");
});

test("syncImeInputTypography safely ignores null input", () => {
  expect(() => syncImeInputTypography(null, 18)).not.toThrow();
});
