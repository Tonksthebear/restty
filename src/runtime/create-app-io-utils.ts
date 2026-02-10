export function openLink(uri: string): void {
  if (!uri || typeof window === "undefined") return;
  try {
    const url = new URL(uri, window.location.href);
    if (!["http:", "https:", "mailto:"].includes(url.protocol)) return;
    const win = window.open(url.toString(), "_blank", "noopener,noreferrer");
    if (win) win.opener = null;
  } catch {
    // ignore invalid URLs
  }
}

export function sourceLabelFromUrl(url: string, index: number): string {
  const trimmed = url.trim();
  if (!trimmed) return `font-${index + 1}`;
  try {
    const parsed = new URL(trimmed, typeof window !== "undefined" ? window.location.href : "");
    const file = parsed.pathname.split("/").filter(Boolean).pop();
    return file || parsed.hostname || `font-${index + 1}`;
  } catch {
    const parts = trimmed.split("/").filter(Boolean);
    const file = parts[parts.length - 1] ?? "";
    return file || `font-${index + 1}`;
  }
}

export function sourceBufferFromView(view: ArrayBufferView): ArrayBuffer {
  const { buffer, byteOffset, byteLength } = view;
  if (byteOffset === 0 && byteLength === buffer.byteLength) {
    return buffer.slice(0);
  }
  return buffer.slice(byteOffset, byteOffset + byteLength);
}

export function normalizeNewlines(text: string): string {
  return text.replace(/\r?\n/g, "\r\n");
}
