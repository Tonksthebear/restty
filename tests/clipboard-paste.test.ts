import { expect, test } from "bun:test";
import {
  readImagePastePayloadFromClipboardItems,
  readPastePayloadFromDataTransfer,
} from "../src/app/clipboard-paste";

type MockDataTransfer = {
  getData: (type: string) => string;
  items?: Array<{ kind: string; type: string; getAsFile?: () => File | null }>;
  files?: File[];
};

function createDataTransfer(overrides: Partial<MockDataTransfer>): DataTransfer {
  return {
    getData: (type: string) => (type === "text/plain" ? "" : ""),
    ...overrides,
  } as unknown as DataTransfer;
}

test("readPastePayloadFromDataTransfer prefers plain text over image", async () => {
  const image = new Blob([Uint8Array.of(1, 2, 3)], { type: "image/png" }) as File;
  const payload = await readPastePayloadFromDataTransfer(
    createDataTransfer({
      getData: (type) => (type === "text/plain" ? "hello" : ""),
      items: [{ kind: "file", type: "image/png", getAsFile: () => image }],
    }),
  );

  expect(payload).toEqual({ kind: "text", text: "hello" });
});

test("readPastePayloadFromDataTransfer reads image from clipboard items", async () => {
  const image = new Blob([Uint8Array.of(1, 2, 3)], { type: "image/png" }) as File;
  const payload = await readPastePayloadFromDataTransfer(
    createDataTransfer({
      getData: () => "",
      items: [{ kind: "file", type: "image/png", getAsFile: () => image }],
    }),
  );

  expect(payload?.kind).toBe("image");
  expect(payload?.mimeType).toBe("image/png");
  expect(payload?.text).toBe("data:image/png;base64,AQID");
});

test("readPastePayloadFromDataTransfer falls back to files list", async () => {
  const image = new Blob([Uint8Array.of(4, 5, 6)], { type: "image/jpeg" }) as File;
  const payload = await readPastePayloadFromDataTransfer(
    createDataTransfer({
      getData: () => "",
      files: [image],
    }),
  );

  expect(payload?.kind).toBe("image");
  expect(payload?.mimeType).toBe("image/jpeg");
  expect(payload?.text).toBe("data:image/jpeg;base64,BAUG");
});

test("readImagePastePayloadFromClipboardItems reads first image type", async () => {
  const image = new Blob([Uint8Array.of(7, 8, 9)], { type: "image/webp" });
  const payload = await readImagePastePayloadFromClipboardItems([
    {
      types: ["text/plain", "image/webp"],
      getType: async (type: string) => {
        if (type === "image/webp") return image;
        return new Blob([], { type });
      },
    } as unknown as ClipboardItem,
  ]);

  expect(payload?.kind).toBe("image");
  expect(payload?.mimeType).toBe("image/webp");
  expect(payload?.text).toBe("data:image/webp;base64,BwgJ");
});

test("clipboard paste readers return null when payload is empty", async () => {
  const fromTransfer = await readPastePayloadFromDataTransfer(
    createDataTransfer({
      getData: () => "",
      items: [],
      files: [],
    }),
  );
  const fromItems = await readImagePastePayloadFromClipboardItems([]);

  expect(fromTransfer).toBeNull();
  expect(fromItems).toBeNull();
});
