const textDecoder = new TextDecoder();

/**
 * Decode base64 text into bytes. Throws when no decoder is available in
 * the current runtime.
 */
export function decodeBase64Bytes(text: string): Uint8Array {
  const cleaned = text.replace(/\s+/g, "");
  if (!cleaned) return new Uint8Array(0);
  if (typeof atob === "function") {
    const binary = atob(cleaned);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      out[i] = binary.charCodeAt(i) & 0xff;
    }
    return out;
  }
  if (typeof Buffer !== "undefined") {
    return new Uint8Array(Buffer.from(cleaned, "base64"));
  }
  throw new Error("No base64 decoder available in this environment.");
}

/**
 * Encode bytes to base64 text. Throws when no encoder is available in the
 * current runtime.
 */
export function encodeBase64Bytes(bytes: Uint8Array): string {
  if (typeof btoa === "function") {
    let binary = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    return btoa(binary);
  }
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("base64");
  }
  throw new Error("No base64 encoder available in this environment.");
}

/** Decode base64 text payloads to UTF-8 text, returning empty text on errors. */
export function decodeBase64Text(text: string): string {
  try {
    return textDecoder.decode(decodeBase64Bytes(text));
  } catch {
    return "";
  }
}
