import { readRenderStatePtrs, unpackCursor } from "./abi";
import type {
  RenderState,
  RenderViewCache,
  ResttyWasmExports,
  WasmAbi,
} from "./types";
import { getCachedView } from "./view-cache";

export function readRenderState(
  abi: WasmAbi,
  exports: ResttyWasmExports,
  memory: WebAssembly.Memory,
  handle: number,
  cache: RenderViewCache,
): RenderState | null {
  const info = readRenderStatePtrs(abi, exports, handle);
  if (!info) return null;

  const { rows, cols } = info;
  if (!rows || !cols) return null;

  const cellCount = rows * cols;
  const buffer = memory.buffer;
  const codepoints = getCachedView(cache.codepoints, buffer, info.codepointsPtr, cellCount, Uint32Array);
  const contentTags = getCachedView(
    cache.contentTags,
    buffer,
    info.contentTagsPtr,
    cellCount,
    Uint8Array,
  );
  const wide = getCachedView(cache.wide, buffer, info.widePtr, cellCount, Uint8Array);
  const cellFlags = getCachedView(cache.cellFlags, buffer, info.flagsPtr, cellCount, Uint16Array);
  const styleFlags = getCachedView(
    cache.styleFlags,
    buffer,
    info.styleFlagsPtr,
    cellCount,
    Uint16Array,
  );
  const linkIds = getCachedView(cache.linkIds, buffer, info.linkIdsPtr, cellCount, Uint32Array);
  const fgBytes = getCachedView(cache.fgBytes, buffer, info.fgPtr, cellCount * 4, Uint8Array);
  const bgBytes = getCachedView(cache.bgBytes, buffer, info.bgPtr, cellCount * 4, Uint8Array);
  const ulBytes = getCachedView(cache.ulBytes, buffer, info.ulPtr, cellCount * 4, Uint8Array);
  const ulStyle = getCachedView(cache.ulStyle, buffer, info.ulStylePtr, cellCount, Uint8Array);
  const linkCount = exports.restty_link_count ? exports.restty_link_count(handle) : 0;
  const linkOffsetsPtr =
    linkCount && exports.restty_link_offsets_ptr ? exports.restty_link_offsets_ptr(handle) : 0;
  const linkLengthsPtr =
    linkCount && exports.restty_link_lengths_ptr ? exports.restty_link_lengths_ptr(handle) : 0;
  const linkOffsets = getCachedView(cache.linkOffsets, buffer, linkOffsetsPtr, linkCount, Uint32Array);
  const linkLengths = getCachedView(cache.linkLengths, buffer, linkLengthsPtr, linkCount, Uint32Array);
  const linkBufferLen = exports.restty_link_buffer_len ? exports.restty_link_buffer_len(handle) : 0;
  const linkBufferPtr =
    linkBufferLen && exports.restty_link_buffer_ptr ? exports.restty_link_buffer_ptr(handle) : 0;
  const linkBuffer = getCachedView(cache.linkBuffer, buffer, linkBufferPtr, linkBufferLen, Uint8Array);
  const graphemeOffset = getCachedView(
    cache.graphemeOffset,
    buffer,
    info.graphemeOffsetPtr,
    cellCount,
    Uint32Array,
  );
  const graphemeLen = getCachedView(
    cache.graphemeLen,
    buffer,
    info.graphemeLenPtr,
    cellCount,
    Uint32Array,
  );
  const graphemeBuffer = getCachedView(
    cache.graphemeBuffer,
    buffer,
    info.graphemeBufferPtr,
    info.graphemeBufferLen,
    Uint32Array,
  );
  const selectionStart = getCachedView(
    cache.selectionStart,
    buffer,
    info.selectionStartPtr,
    rows,
    Int16Array,
  );
  const selectionEnd = getCachedView(cache.selectionEnd, buffer, info.selectionEndPtr, rows, Int16Array);
  const cursor = info.cursorPtr ? unpackCursor(buffer, info.cursorPtr) : null;

  return {
    rows,
    cols,
    cellCount,
    codepoints,
    contentTags,
    wide,
    cellFlags,
    styleFlags,
    linkIds,
    fgBytes,
    bgBytes,
    ulBytes,
    ulStyle,
    linkOffsets,
    linkLengths,
    linkBuffer,
    graphemeOffset,
    graphemeLen,
    graphemeBuffer,
    selectionStart,
    selectionEnd,
    cursor,
  };
}
