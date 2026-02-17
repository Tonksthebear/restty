import { sequences } from "./constants";

/**
 * Map input sequences to PTY expectations (e.g., DEL vs backspace).
 * Kitty keyboard protocol sequences (CSI ... u / CSI ... ~) pass through
 * unchanged — the encoder already produces the correct encoding based on
 * the terminal's kitty flags.
 */
export function mapKeySequenceForPty(seq: string): string {
  const csi = "\x1b[";
  if (seq.startsWith(csi) && (seq.endsWith("u") || seq.endsWith("~"))) {
    return seq;
  }
  if (seq === sequences.backspace || seq === "\x08" || seq === "\x08\x1b[P") return "\x7f";
  if (seq === sequences.delete || seq === "\x1b[P") return "\x1b[3~";
  if (seq === sequences.enter || seq === "\r\n") return "\r";
  return seq;
}
