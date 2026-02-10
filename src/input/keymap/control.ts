export function ctrlCharForKey(key: string): string {
  if (key === " ") return "\x00";
  if (key === "@") return "\x00";
  if (key === "[") return "\x1b";
  if (key === "\\") return "\x1c";
  if (key === "]") return "\x1d";
  if (key === "^") return "\x1e";
  if (key === "_") return "\x1f";
  if (key === "?") return "\x7f";
  if (key.length === 1) {
    const code = key.toUpperCase().charCodeAt(0);
    if (code >= 64 && code <= 95) {
      return String.fromCharCode(code & 0x1f);
    }
  }
  return "";
}

export function modifierCode(event: KeyboardEvent): number {
  let mod = 1;
  if (event.shiftKey) mod += 1;
  if (event.altKey) mod += 2;
  if (event.ctrlKey) mod += 4;
  return mod;
}
