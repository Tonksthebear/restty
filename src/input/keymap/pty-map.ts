import { sequences } from "./constants";

/**
 * Map input sequences to PTY expectations (e.g., DEL vs backspace).
 */
export function mapKeySequenceForPty(seq: string): string {
  const csi = "\x1b[";
  if (seq.startsWith(csi) && seq.endsWith("u")) {
    const body = seq.slice(csi.length, -1);
    const [codeText] = body.split(";");
    if (codeText && /^[0-9]+$/.test(codeText)) {
      const code = Number(codeText);
      if (code === 127) return "\x7f";
      if (code === 13) return "\r";
      if (code === 9) return "\t";
    }
  }
  if (seq.startsWith(csi) && seq.endsWith("~")) {
    const body = seq.slice(csi.length, -1);
    if (body === "3" || body.startsWith("3;")) return "\x1b[3~";
  }
  if (seq === sequences.backspace || seq === "\x08" || seq === "\x08\x1b[P") return "\x7f";
  if (seq === sequences.delete || seq === "\x1b[P") return "\x1b[3~";
  if (seq === sequences.enter || seq === "\r\n") return "\r";
  return seq;
}
