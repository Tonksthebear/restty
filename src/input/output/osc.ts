import type { DesktopNotification } from "../types";
import { decodeBase64Bytes, encodeBase64Bytes } from "../../utils/base64";

export type OscColorProvider = () => {
  fg?: [number, number, number];
  bg?: [number, number, number];
  cursor?: [number, number, number];
};

export type OscHandlers = {
  sendReply: (data: string) => void;
  getDefaultColors?: OscColorProvider;
  onClipboardWrite?: (text: string) => void | Promise<void>;
  onClipboardRead?: () => string | null | Promise<string | null>;
  onDesktopNotification?: (notification: DesktopNotification) => void;
};

const textDecoder = new TextDecoder();
const textEncoder = new TextEncoder();

function replyOscColor(
  code: string,
  rgb: [number, number, number],
  sendReply: (data: string) => void,
) {
  const toHex4 = (value: number) =>
    Math.round(Math.max(0, Math.min(255, value)) * 257)
      .toString(16)
      .padStart(4, "0");
  const r = toHex4(rgb[0]);
  const g = toHex4(rgb[1]);
  const b = toHex4(rgb[2]);
  sendReply(`\x1b]${code};rgb:${r}/${g}/${b}\x07`);
}

/** Handle intercepted OSC queries and side effects. Returns true when handled. */
export function handleOscSequence(seq: string, handlers: OscHandlers): boolean {
  const content = seq.slice(2);
  const parts = content.split(";");
  const code = parts[0] ?? "";
  if (code === "9") {
    const firstSep = content.indexOf(";");
    const body = firstSep >= 0 ? content.slice(firstSep + 1) : "";
    if (/^(?:[2-9]|1[0-2]?)(?:;|$)/.test(body)) {
      // ConEmu extension space uses OSC 9;N... and is not a desktop
      // notification payload.
      return true;
    }
    handlers.onDesktopNotification?.({
      title: "",
      body,
      source: "osc9",
      raw: seq,
    });
    return true;
  }
  if (code === "777") {
    const firstSep = content.indexOf(";");
    const rest = firstSep >= 0 ? content.slice(firstSep + 1) : "";
    if (!rest.startsWith("notify;")) {
      return true;
    }
    const payload = rest.slice("notify;".length);
    const titleSep = payload.indexOf(";");
    if (titleSep < 0) {
      return true;
    }
    handlers.onDesktopNotification?.({
      title: payload.slice(0, titleSep),
      body: payload.slice(titleSep + 1),
      source: "osc777",
      raw: seq,
    });
    return true;
  }
  if (code === "52") {
    const target = parts[1] ?? "c";
    const payload = parts.slice(2).join(";");
    if (payload === "?") {
      if (!handlers.onClipboardRead) return true;
      Promise.resolve(handlers.onClipboardRead())
        .then((text) => {
          const safeText = text ?? "";
          const bytes = textEncoder.encode(safeText);
          try {
            const encoded = encodeBase64Bytes(bytes);
            handlers.sendReply(`\x1b]52;${target};${encoded}\x07`);
          } catch {}
        })
        .catch(() => {});
      return true;
    }
    if (!handlers.onClipboardWrite) return true;
    let bytes = new Uint8Array(0);
    try {
      bytes = decodeBase64Bytes(payload);
    } catch {}
    const text = textDecoder.decode(bytes);
    Promise.resolve(handlers.onClipboardWrite(text)).catch(() => {});
    return true;
  }
  const param = parts[1];
  if (param !== "?") return false;
  const colors = handlers.getDefaultColors?.();
  if (!colors) return false;
  if (code === "10" && colors.fg) {
    replyOscColor(code, colors.fg, handlers.sendReply);
    return true;
  }
  if (code === "11" && colors.bg) {
    replyOscColor(code, colors.bg, handlers.sendReply);
    return true;
  }
  if (code === "12" && colors.cursor) {
    replyOscColor(code, colors.cursor, handlers.sendReply);
    return true;
  }
  return false;
}
