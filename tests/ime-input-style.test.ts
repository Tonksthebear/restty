import { expect, test } from "bun:test";
import { DEFAULT_IME_FONT_FAMILY, resolveImeAnchor, syncImeInputTypography } from "../src/ime";

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

test("resolveImeAnchor clamps row/col into viewport bounds", () => {
  expect(resolveImeAnchor({ row: 300, col: -6 }, 80, 24)).toEqual({ row: 23, col: 0 });
  expect(resolveImeAnchor({ row: 7, col: 9 }, 80, 24)).toEqual({ row: 7, col: 9 });
});

test("resolveImeAnchor backs up wide-tail cursor and clamps", () => {
  expect(resolveImeAnchor({ row: 5, col: 0, wideTail: true }, 80, 24)).toEqual({ row: 5, col: 0 });
  expect(resolveImeAnchor({ row: 5, col: 12, wideTail: true }, 80, 24)).toEqual({
    row: 5,
    col: 11,
  });
});
