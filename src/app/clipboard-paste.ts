export type ResttyPastePayload = {
  kind: "text" | "image";
  text: string;
  mimeType?: string;
};

function isImageMimeType(value: string | null | undefined): boolean {
  const type = value?.trim?.().toLowerCase?.() ?? "";
  return type.startsWith("image/");
}

function bytesToBase64(bytes: Uint8Array): string {
  if (typeof btoa === "function") {
    const chunkSize = 0x8000;
    let binary = "";
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.subarray(i, i + chunkSize);
      binary += String.fromCharCode(...chunk);
    }
    return btoa(binary);
  }
  throw new Error("No base64 encoder available");
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const mimeType = blob.type?.trim?.() || "application/octet-stream";
  return `data:${mimeType};base64,${bytesToBase64(bytes)}`;
}

function imageBlobFromDataTransfer(dataTransfer: DataTransfer): Blob | null {
  const items = dataTransfer.items;
  if (items) {
    for (let i = 0; i < items.length; i += 1) {
      const item = items[i] ?? null;
      if (!item) continue;
      if (item.kind !== "file" || !isImageMimeType(item.type)) continue;
      const file = item.getAsFile?.();
      if (file) return file;
    }
  }

  const files = dataTransfer.files;
  if (files) {
    for (let i = 0; i < files.length; i += 1) {
      const file = files[i] ?? null;
      if (file && isImageMimeType(file.type)) return file;
    }
  }

  return null;
}

export async function readPastePayloadFromDataTransfer(
  dataTransfer: DataTransfer | null | undefined,
): Promise<ResttyPastePayload | null> {
  if (!dataTransfer) return null;
  const text = dataTransfer.getData("text/plain") || "";
  if (text) {
    return {
      kind: "text",
      text,
    };
  }

  const imageBlob = imageBlobFromDataTransfer(dataTransfer);
  if (!imageBlob) return null;
  return {
    kind: "image",
    text: await blobToDataUrl(imageBlob),
    mimeType: imageBlob.type?.trim?.() || "application/octet-stream",
  };
}

export async function readImagePastePayloadFromClipboardItems(
  items: ClipboardItem[] | null | undefined,
): Promise<ResttyPastePayload | null> {
  if (!items || items.length === 0) return null;
  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    if (!item) continue;
    const types = Array.isArray(item.types) ? item.types : [];
    for (let j = 0; j < types.length; j += 1) {
      const type = types[j];
      if (!isImageMimeType(type)) continue;
      const blob = await item.getType(type);
      return {
        kind: "image",
        text: await blobToDataUrl(blob),
        mimeType: type,
      };
    }
  }
  return null;
}
