export function formatPasteText(text: string, bracketedPasteEnabled: boolean): string {
  if (!bracketedPasteEnabled) return text;
  return `\x1b[200~${text}\x1b[201~`;
}

export function formatCodepoint(cp: number): string {
  const hex = cp.toString(16).toUpperCase();
  return `U+${hex.padStart(4, "0")}`;
}
