const UN_SHIFTED_CODE_BY_CODE: Record<string, string> = {
  Backquote: "`",
  Minus: "-",
  Equal: "=",
  BracketLeft: "[",
  BracketRight: "]",
  Backslash: "\\",
  Semicolon: ";",
  Quote: "'",
  Comma: ",",
  Period: ".",
  Slash: "/",
};

const SHIFTED_CODE_BY_CODE: Record<string, string> = {
  Backquote: "~",
  Digit1: "!",
  Digit2: "@",
  Digit3: "#",
  Digit4: "$",
  Digit5: "%",
  Digit6: "^",
  Digit7: "&",
  Digit8: "*",
  Digit9: "(",
  Digit0: ")",
  Minus: "_",
  Equal: "+",
  BracketLeft: "{",
  BracketRight: "}",
  Backslash: "|",
  Semicolon: ":",
  Quote: '"',
  Comma: "<",
  Period: ">",
  Slash: "?",
};

export function deriveUnshiftedCodepoint(event: KeyboardEvent): number {
  const code = event.code || "";
  if (code.startsWith("Key") && code.length === 4) {
    return code.slice(3).toLowerCase().codePointAt(0) ?? 0;
  }
  if (code.startsWith("Digit") && code.length === 6) {
    return code.slice(5).codePointAt(0) ?? 0;
  }
  const punctuation = UN_SHIFTED_CODE_BY_CODE[code];
  if (punctuation) return punctuation.codePointAt(0) ?? 0;
  if (event.key?.length === 1) return event.key.codePointAt(0) ?? 0;
  return 0;
}

export function deriveShiftedCodepoint(event: KeyboardEvent, unshiftedCodepoint: number): number {
  if (!event.shiftKey) return 0;
  if (event.key?.length === 1) {
    const cp = event.key.codePointAt(0) ?? 0;
    if (cp > 0 && cp !== unshiftedCodepoint) return cp;
  }
  const shifted = SHIFTED_CODE_BY_CODE[event.code || ""];
  if (!shifted) return 0;
  const cp = shifted.codePointAt(0) ?? 0;
  return cp !== unshiftedCodepoint ? cp : 0;
}

export function deriveBaseLayoutCodepoint(event: KeyboardEvent): number {
  const code = event.code || "";
  if (code.startsWith("Key") && code.length === 4) {
    return code.slice(3).toLowerCase().codePointAt(0) ?? 0;
  }
  if (code.startsWith("Digit") && code.length === 6) {
    return code.slice(5).codePointAt(0) ?? 0;
  }
  const punctuation = UN_SHIFTED_CODE_BY_CODE[code];
  if (punctuation) return punctuation.codePointAt(0) ?? 0;
  return 0;
}

export function toCodepoints(text: string): number[] {
  const points: number[] = [];
  for (const ch of text) {
    points.push(ch.codePointAt(0) ?? 0);
  }
  return points.filter((cp) => cp > 0);
}
