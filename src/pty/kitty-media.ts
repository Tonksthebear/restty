import { decodeBase64Text, encodeBase64Bytes } from "../utils/base64";

type KittyTerminator = {
  index: number;
  len: 1 | 2;
};

/** State for streaming Kitty file-based media rewriting (tracks remainder across chunks). */
export type KittyMediaRewriteState = {
  remainder?: string;
};

/** Callback to read file contents for Kitty file-based media payloads. */
export type KittyMediaReadFile = (path: string) => Uint8Array;

function findKittyTerminator(data: string, from: number): KittyTerminator | null {
  const bel = data.indexOf("\x07", from);
  const st = data.indexOf("\x1b\\", from);
  if (bel === -1 && st === -1) return null;
  if (bel !== -1 && (st === -1 || bel < st)) return { index: bel, len: 1 };
  return { index: st, len: 2 };
}

function rewriteOneKittyCommand(body: string, readFile: KittyMediaReadFile): string {
  const sep = body.indexOf(";");
  if (sep < 0) return body;

  const control = body.slice(0, sep);
  const payload = body.slice(sep + 1);
  if (!control || !payload) return body;

  const parts = control.split(",");
  let medium: string | null = null;
  let hasMedium = false;
  let hasMore = false;
  for (const part of parts) {
    if (part.startsWith("t=")) {
      hasMedium = true;
      medium = part.slice(2);
    } else if (part.startsWith("m=")) {
      hasMore = true;
    }
  }

  // Only local file or temp file media need host filesystem access.
  if (medium !== "f" && medium !== "t") return body;

  const path = decodeBase64Text(payload);
  if (!path || path.includes("\0")) return body;

  let bytes: Uint8Array;
  try {
    bytes = readFile(path);
  } catch {
    return body;
  }

  const nextParts = parts.map((part) => {
    if (part.startsWith("t=")) return "t=d";
    if (part.startsWith("m=")) return "m=0";
    return part;
  });
  if (!hasMedium) nextParts.push("t=d");
  if (hasMore) {
    // Already normalized by the map above.
  }

  try {
    return `${nextParts.join(",")};${encodeBase64Bytes(bytes)}`;
  } catch {
    return body;
  }
}

/** Rewrite Kitty file-based media sequences (f=...) to direct base64 payloads (t=d). */
export function rewriteKittyFileMediaToDirect(
  chunk: string,
  state: KittyMediaRewriteState,
  readFile: KittyMediaReadFile,
): string {
  const input = (state.remainder ?? "") + chunk;
  let out = "";
  let i = 0;

  while (i < input.length) {
    const start = input.indexOf("\x1b_G", i);
    if (start < 0) {
      out += input.slice(i);
      state.remainder = "";
      return out;
    }

    out += input.slice(i, start);
    const terminator = findKittyTerminator(input, start + 3);
    if (!terminator) {
      state.remainder = input.slice(start);
      return out;
    }

    const body = input.slice(start + 3, terminator.index);
    const rewritten = rewriteOneKittyCommand(body, readFile);
    out += "\x1b_G";
    out += rewritten;
    out += terminator.len === 2 ? "\x1b\\" : "\x07";

    i = terminator.index + terminator.len;
  }

  state.remainder = "";
  return out;
}
