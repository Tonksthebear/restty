import { sequences } from "./constants";
import {
  deriveBaseLayoutCodepoint,
  deriveShiftedCodepoint,
  deriveUnshiftedCodepoint,
  toCodepoints,
} from "./normalization";

const KITTY_FLAG_DISAMBIGUATE = 1 << 0;
const KITTY_FLAG_REPORT_EVENTS = 1 << 1;
const KITTY_FLAG_REPORT_ALTERNATE = 1 << 2;
const KITTY_FLAG_REPORT_ALL = 1 << 3;
const KITTY_FLAG_REPORT_ASSOCIATED_TEXT = 1 << 4;

type KittyKey = {
  code: number;
  final: string;
};

const KITTY_SPECIAL_KEYS: Record<string, KittyKey> = {
  Escape: { code: 27, final: "u" },
  Enter: { code: 13, final: "u" },
  Tab: { code: 9, final: "u" },
  Backspace: { code: 127, final: "u" },
  Insert: { code: 2, final: "~" },
  Delete: { code: 3, final: "~" },
  Del: { code: 3, final: "~" },
  ArrowLeft: { code: 1, final: "D" },
  ArrowRight: { code: 1, final: "C" },
  ArrowUp: { code: 1, final: "A" },
  ArrowDown: { code: 1, final: "B" },
  PageUp: { code: 5, final: "~" },
  PageDown: { code: 6, final: "~" },
  Home: { code: 1, final: "H" },
  End: { code: 1, final: "F" },
  CapsLock: { code: 57358, final: "u" },
  ScrollLock: { code: 57359, final: "u" },
  NumLock: { code: 57360, final: "u" },
  PrintScreen: { code: 57361, final: "u" },
  Pause: { code: 57362, final: "u" },
  ContextMenu: { code: 57363, final: "u" },
  Menu: { code: 57363, final: "u" },
  F1: { code: 1, final: "P" },
  F2: { code: 1, final: "Q" },
  F3: { code: 13, final: "~" },
  F4: { code: 1, final: "S" },
  F5: { code: 15, final: "~" },
  F6: { code: 17, final: "~" },
  F7: { code: 18, final: "~" },
  F8: { code: 19, final: "~" },
  F9: { code: 20, final: "~" },
  F10: { code: 21, final: "~" },
  F11: { code: 23, final: "~" },
  F12: { code: 24, final: "~" },
  F13: { code: 57376, final: "u" },
  F14: { code: 57377, final: "u" },
  F15: { code: 57378, final: "u" },
  F16: { code: 57379, final: "u" },
  F17: { code: 57380, final: "u" },
  F18: { code: 57381, final: "u" },
  F19: { code: 57382, final: "u" },
  F20: { code: 57383, final: "u" },
  F21: { code: 57384, final: "u" },
  F22: { code: 57385, final: "u" },
  F23: { code: 57386, final: "u" },
  F24: { code: 57387, final: "u" },
};

const KITTY_KEYPAD_BY_CODE: Record<string, KittyKey> = {
  Numpad0: { code: 57399, final: "u" },
  Numpad1: { code: 57400, final: "u" },
  Numpad2: { code: 57401, final: "u" },
  Numpad3: { code: 57402, final: "u" },
  Numpad4: { code: 57403, final: "u" },
  Numpad5: { code: 57404, final: "u" },
  Numpad6: { code: 57405, final: "u" },
  Numpad7: { code: 57406, final: "u" },
  Numpad8: { code: 57407, final: "u" },
  Numpad9: { code: 57408, final: "u" },
  NumpadDecimal: { code: 57409, final: "u" },
  NumpadDivide: { code: 57410, final: "u" },
  NumpadMultiply: { code: 57411, final: "u" },
  NumpadSubtract: { code: 57412, final: "u" },
  NumpadAdd: { code: 57413, final: "u" },
  NumpadEnter: { code: 57414, final: "u" },
  NumpadEqual: { code: 57415, final: "u" },
};

const KITTY_LOCK_KEYS = new Set(["CapsLock", "NumLock", "ScrollLock"]);

function kittyModifierCode(event: KeyboardEvent, includeLockModifiers: boolean): number {
  let code = 1;
  if (event.shiftKey) code += 1;
  if (event.altKey) code += 2;
  if (event.ctrlKey) code += 4;
  if (event.metaKey) code += 8;
  if (includeLockModifiers) {
    if (event.getModifierState?.("CapsLock")) code += 64;
    if (event.getModifierState?.("NumLock")) code += 128;
  }
  return code;
}

function kittyEventType(event: KeyboardEvent, reportEvents: boolean): 0 | 1 | 2 | 3 {
  if (!reportEvents) return 0;
  if (event.type === "keyup") return 3;
  if (event.repeat) return 2;
  return 1;
}

function encodeKittySequence(
  code: number,
  final: string,
  modifiers: number,
  eventType: 0 | 1 | 2 | 3,
  alternates?: { shifted?: number; base?: number },
  associatedText?: number[],
): string {
  if (final !== "u" && final !== "~") {
    if (eventType !== 0) return `\x1b[1;${modifiers}:${eventType}${final}`;
    if (modifiers > 1) return `\x1b[1;${modifiers}${final}`;
    return `\x1b[${final}`;
  }

  let keyPart = `${code}`;
  if (final === "u" && alternates && (alternates.shifted || alternates.base)) {
    const shifted = alternates.shifted ? `${alternates.shifted}` : "";
    const base = alternates.base ? `${alternates.base}` : "";
    keyPart += `:${shifted}`;
    if (base) keyPart += `:${base}`;
  }

  const hasAssocText = Boolean(associatedText?.length);
  if (eventType === 0 && modifiers <= 1 && !hasAssocText) {
    return `\x1b[${keyPart}${final}`;
  }

  let seq = `\x1b[${keyPart};${modifiers}`;
  if (eventType !== 0) seq += `:${eventType}`;
  if (hasAssocText) seq += `;${associatedText!.join(":")}`;
  seq += final;
  return seq;
}

export function encodeKittyKeyEvent(event: KeyboardEvent, kittyFlags: number): string {
  const reportEvents = (kittyFlags & KITTY_FLAG_REPORT_EVENTS) !== 0;
  const reportAlternate = (kittyFlags & KITTY_FLAG_REPORT_ALTERNATE) !== 0;
  const reportAll = (kittyFlags & KITTY_FLAG_REPORT_ALL) !== 0;
  const reportAssociatedText = (kittyFlags & KITTY_FLAG_REPORT_ASSOCIATED_TEXT) !== 0;
  const disambiguate = (kittyFlags & KITTY_FLAG_DISAMBIGUATE) !== 0;

  const key = event.key ?? "";
  const special = KITTY_KEYPAD_BY_CODE[event.code || ""] ?? KITTY_SPECIAL_KEYS[key];
  const isLockKey = KITTY_LOCK_KEYS.has(key);
  const hasText = key.length === 1;
  const hasTextModifiers = event.altKey || event.ctrlKey || event.metaKey;
  const eventType = kittyEventType(event, reportEvents);
  const isRelease = event.type === "keyup";
  const isLegacyTextKey = !special && hasText && !reportAll && !hasTextModifiers;
  const isLegacyControlKey =
    (key === "Enter" || key === "Tab" || key === "Backspace") &&
    !reportAll &&
    !hasTextModifiers &&
    !disambiguate;

  if (isRelease && !reportEvents) return "";
  if (isRelease && isLegacyTextKey) return "";
  if (isRelease && isLegacyControlKey) return "";
  if (isLockKey && !reportAll) return "";

  // Preserve user-typable defaults unless report_all or modifier semantics require CSI output.
  if (isLegacyTextKey) {
    return key;
  }
  if (isLegacyControlKey) {
    switch (key) {
      case "Enter":
        return sequences.enter;
      case "Tab":
        return sequences.tab;
      case "Backspace":
        return sequences.backspace;
      default:
        break;
    }
  }

  const mods = kittyModifierCode(event, reportAll);

  if (special) {
    return encodeKittySequence(special.code, special.final, mods, eventType);
  }

  // For printable keys, use unshifted codepoint with optional alternate/base variants.
  const unshifted = deriveUnshiftedCodepoint(event);
  if (unshifted > 0 && (reportAll || disambiguate || hasTextModifiers || eventType !== 0)) {
    const alternates =
      reportAlternate && reportAll
        ? {
            shifted: deriveShiftedCodepoint(event, unshifted) || undefined,
            base: (() => {
              const base = deriveBaseLayoutCodepoint(event);
              return base > 0 && base !== unshifted ? base : undefined;
            })(),
          }
        : undefined;
    const associated = reportAll && reportAssociatedText && hasText ? toCodepoints(key) : undefined;
    return encodeKittySequence(unshifted, "u", mods, eventType, alternates, associated);
  }

  // Fallback to legacy text behavior when we cannot build Kitty form.
  if (hasText) {
    return event.altKey ? `\x1b${key}` : key;
  }

  // Unknown keys produce nothing.
  return "";
}
