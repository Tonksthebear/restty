import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isSymbolCp } from "../src/renderer/shapes";
import {
  isRenderSymbolLike,
  resolveSymbolConstraint,
} from "../src/runtime/create-app-symbols";

test("symbol-like classification follows Ghostty's precomputed table", () => {
  expect(isSymbolCp(0x2192)).toBe(true); // →
  expect(isSymbolCp(0x1f680)).toBe(true); // 🚀
  expect(isSymbolCp(0x23f5)).toBe(false); // ⏵
  expect(isSymbolCp(0x25a3)).toBe(false); // ▣
  expect(isSymbolCp(0x2b1d)).toBe(false); // ⬝
  expect(isSymbolCp(0x41)).toBe(false); // A
});

test("both render loops apply default centered symbol constraint", () => {
  const source = readFileSync(join(process.cwd(), "src/runtime/create-runtime.ts"), "utf8");
  const defaultConstraintMatches =
    source.match(
      /const defaultConstraint = isAppleSymbolsFont\(entry\)\s+\?\s+DEFAULT_APPLE_SYMBOLS_CONSTRAINT\s+:\s+DEFAULT_SYMBOL_CONSTRAINT;/g,
    ) ?? [];
  expect(defaultConstraintMatches.length).toBe(2);

  const matches =
    source.match(
      /const constraint =\s+nerdConstraint \?\? \(colorGlyph \? DEFAULT_EMOJI_CONSTRAINT : defaultConstraint\);/g,
    ) ?? [];
  expect(matches.length).toBe(2);
});

test("nerd constraints are keyed by codepoint, not font label", () => {
  const source = readFileSync(join(process.cwd(), "src/runtime/create-runtime.ts"), "utf8");
  const byCodepoint =
    source.match(/const nerdConstraint = symbolLike \? resolveSymbolConstraint\(cp\) : null;/g) ??
    [];
  const perItem =
    source.match(/const nerdConstraint = resolveSymbolConstraint\(item\.cp\);/g) ?? [];
  expect(byCodepoint.length).toBe(2);
  expect(perItem.length).toBe(2);
});

test("render path uses generic symbol handling without per-codepoint override table", () => {
  const appSource = readFileSync(join(process.cwd(), "src/runtime/create-runtime.ts"), "utf8");
  const symbolSource = readFileSync(
    join(process.cwd(), "src/runtime/create-app-symbols.ts"),
    "utf8",
  );
  expect(appSource.includes("const PARITY_SYMBOL_OVERRIDES")).toBe(false);
  expect(symbolSource.includes("[0x2300, 0x23ff]")).toBe(true);
  expect(symbolSource.includes("[0x25a0, 0x25ff]")).toBe(true);
  expect(symbolSource.includes("[0x2b00, 0x2bff]")).toBe(true);
  expect(symbolSource.includes('align_vertical: "center"')).toBe(true);
  expect(symbolSource.includes('align_horizontal: "center"')).toBe(true);
  expect(symbolSource.includes("const DEFAULT_APPLE_SYMBOLS_CONSTRAINT")).toBe(true);
  expect(symbolSource.includes("const DEFAULT_EMOJI_CONSTRAINT")).toBe(true);
  expect(symbolSource.includes('size: "cover"')).toBe(true);
  const renderSymbolChecks = appSource.match(/const symbolLike = isRenderSymbolLike\(cp\);/g) ?? [];
  expect(renderSymbolChecks.length).toBe(2);
});

test("symbol constraints remain table-driven without per-codepoint overrides", () => {
  const symbolSource = readFileSync(
    join(process.cwd(), "src/runtime/create-app-symbols.ts"),
    "utf8",
  );
  expect(symbolSource.includes("cp === 0x15e3")).toBe(false);
  expect(symbolSource.includes("RENDERER_SYMBOL_FALLBACK_CODEPOINTS")).toBe(false);
  expect(isRenderSymbolLike(0x15e3)).toBe(false);
  expect(resolveSymbolConstraint(0x15e3)).toBeNull();
});
