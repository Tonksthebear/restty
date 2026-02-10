import { expect, test } from "bun:test";
import { decodeBase64Bytes, decodeBase64Text, encodeBase64Bytes } from "../src/utils/base64";

test("base64 utils round-trip UTF-8 text", () => {
  const input = "hello 🌍";
  const encoded = encodeBase64Bytes(new TextEncoder().encode(input));
  const decoded = decodeBase64Text(encoded);
  expect(decoded).toBe(input);
});

test("decodeBase64Bytes ignores whitespace in payload", () => {
  const bytes = decodeBase64Bytes("aG Vs\nbG8=");
  expect(new TextDecoder().decode(bytes)).toBe("hello");
});

test("decodeBase64Text returns empty string for invalid payload", () => {
  expect(decodeBase64Text("%%%not-base64%%%")).toBe("");
});
