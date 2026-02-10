import type { RenderViewCache, TypedArrayCtor, ViewEntry } from "./types";

export function makeViewEntry<T extends ArrayBufferView>(): ViewEntry<T> {
  return { buffer: null, ptr: 0, len: 0, view: null };
}

export function makeRenderViewCache(): RenderViewCache {
  return {
    codepoints: makeViewEntry<Uint32Array>(),
    contentTags: makeViewEntry<Uint8Array>(),
    wide: makeViewEntry<Uint8Array>(),
    cellFlags: makeViewEntry<Uint16Array>(),
    styleFlags: makeViewEntry<Uint16Array>(),
    linkIds: makeViewEntry<Uint32Array>(),
    fgBytes: makeViewEntry<Uint8Array>(),
    bgBytes: makeViewEntry<Uint8Array>(),
    ulBytes: makeViewEntry<Uint8Array>(),
    ulStyle: makeViewEntry<Uint8Array>(),
    linkOffsets: makeViewEntry<Uint32Array>(),
    linkLengths: makeViewEntry<Uint32Array>(),
    linkBuffer: makeViewEntry<Uint8Array>(),
    graphemeOffset: makeViewEntry<Uint32Array>(),
    graphemeLen: makeViewEntry<Uint32Array>(),
    graphemeBuffer: makeViewEntry<Uint32Array>(),
    selectionStart: makeViewEntry<Int16Array>(),
    selectionEnd: makeViewEntry<Int16Array>(),
  };
}

export function getCachedView<T extends ArrayBufferView>(
  entry: ViewEntry<T>,
  buffer: ArrayBufferLike,
  ptr: number,
  len: number,
  Ctor: TypedArrayCtor<T>,
): T | null {
  if (!ptr || len <= 0) {
    entry.buffer = buffer;
    entry.ptr = 0;
    entry.len = 0;
    entry.view = null;
    return null;
  }
  if (entry.view && entry.buffer === buffer && entry.ptr === ptr && entry.len === len) {
    return entry.view;
  }
  const view = new Ctor(buffer, ptr, len);
  entry.buffer = buffer;
  entry.ptr = ptr;
  entry.len = len;
  entry.view = view;
  return view;
}
