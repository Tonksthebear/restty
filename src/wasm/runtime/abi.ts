import type { CursorInfo, RenderPtrs, ResttyWasmExports, WasmAbi } from "./types";

export function resolveWasmAbi(exports: ResttyWasmExports): WasmAbi | null {
  if (exports.restty_render_info) {
    return { kind: "info" };
  }
  if (exports.restty_render_codepoints_ptr) {
    return { kind: "render" };
  }
  if (exports.restty_cell_codepoints_ptr) {
    return { kind: "cells" };
  }
  return null;
}

function ptrFromOffset(base: number, offset: number, memSize: number): number {
  if (!offset) return 0;
  const absolute = base + offset;
  if (absolute > 0 && absolute < memSize) return absolute;
  if (offset > 0 && offset < memSize) return offset;
  return 0;
}

export function unpackCursor(buffer: ArrayBufferLike, ptr: number): CursorInfo | null {
  if (!ptr) return null;
  const view = new DataView(buffer, ptr, 16);
  return {
    row: view.getUint16(0, true),
    col: view.getUint16(2, true),
    visible: view.getUint8(4),
    style: view.getUint8(5),
    blinking: view.getUint8(6),
    wideTail: view.getUint8(7),
    color: view.getUint32(8, true),
  };
}

export function readRenderInfo(exports: ResttyWasmExports, handle: number): RenderPtrs | null {
  if (!exports.restty_render_info) return null;
  const base = exports.restty_render_info(handle);
  if (!base) return null;
  const mem = exports.memory;
  const view = new DataView(mem.buffer, base, 64);
  const version = view.getUint32(0, true);
  if (version !== 1) {
    return null;
  }
  const rows = view.getUint16(4, true);
  const cols = view.getUint16(6, true);
  const memSize = mem.buffer.byteLength;
  const codepointsPtr = ptrFromOffset(base, view.getUint32(8, true), memSize);
  const fgPtr = ptrFromOffset(base, view.getUint32(12, true), memSize);
  const bgPtr = ptrFromOffset(base, view.getUint32(16, true), memSize);
  const ulPtr = ptrFromOffset(base, view.getUint32(20, true), memSize);
  const ulStylePtr = ptrFromOffset(base, view.getUint32(24, true), memSize);
  const graphemeOffsetPtr = ptrFromOffset(base, view.getUint32(28, true), memSize);
  const graphemeLenPtr = ptrFromOffset(base, view.getUint32(32, true), memSize);
  const graphemeBufferPtr = ptrFromOffset(base, view.getUint32(36, true), memSize);
  const graphemeBufferLen = view.getUint32(40, true);
  const selectionStartPtr = ptrFromOffset(base, view.getUint32(44, true), memSize);
  const selectionEndPtr = ptrFromOffset(base, view.getUint32(48, true), memSize);
  const cursorPtr = ptrFromOffset(base, view.getUint32(52, true), memSize);

  return {
    rows,
    cols,
    codepointsPtr,
    contentTagsPtr: 0,
    fgPtr,
    bgPtr,
    ulPtr,
    ulStylePtr,
    widePtr: 0,
    flagsPtr: 0,
    styleFlagsPtr: 0,
    linkIdsPtr: 0,
    graphemeOffsetPtr,
    graphemeLenPtr,
    graphemeBufferPtr,
    graphemeBufferLen,
    selectionStartPtr,
    selectionEndPtr,
    cursorPtr,
  };
}

export function readRenderPtrs(exports: ResttyWasmExports, handle: number): RenderPtrs {
  const rows = exports.restty_render_rows
    ? exports.restty_render_rows(handle)
    : exports.restty_rows!(handle);
  const cols = exports.restty_render_cols
    ? exports.restty_render_cols(handle)
    : exports.restty_cols!(handle);
  return {
    rows,
    cols,
    codepointsPtr: exports.restty_render_codepoints_ptr!(handle),
    contentTagsPtr: 0,
    widePtr: 0,
    flagsPtr: 0,
    styleFlagsPtr: 0,
    linkIdsPtr: 0,
    fgPtr: exports.restty_render_fg_rgba_ptr!(handle),
    bgPtr: exports.restty_render_bg_rgba_ptr!(handle),
    ulPtr: exports.restty_render_ul_rgba_ptr!(handle),
    ulStylePtr: exports.restty_render_ul_style_ptr!(handle),
    graphemeOffsetPtr: exports.restty_render_grapheme_offset_ptr!(handle),
    graphemeLenPtr: exports.restty_render_grapheme_len_ptr!(handle),
    graphemeBufferPtr: exports.restty_render_grapheme_buffer_ptr!(handle),
    graphemeBufferLen: exports.restty_render_grapheme_buffer_len
      ? exports.restty_render_grapheme_buffer_len(handle)
      : 0,
    selectionStartPtr: exports.restty_render_selection_start_ptr!(handle),
    selectionEndPtr: exports.restty_render_selection_end_ptr!(handle),
    cursorPtr: exports.restty_render_cursor_ptr!(handle),
  };
}

export function readCellPtrs(exports: ResttyWasmExports, handle: number): RenderPtrs {
  const rows = exports.restty_rows!(handle);
  const cols = exports.restty_cols!(handle);
  return {
    rows,
    cols,
    codepointsPtr: exports.restty_cell_codepoints_ptr!(handle),
    contentTagsPtr: exports.restty_cell_content_tags_ptr
      ? exports.restty_cell_content_tags_ptr(handle)
      : 0,
    widePtr: exports.restty_cell_wide_ptr ? exports.restty_cell_wide_ptr(handle) : 0,
    flagsPtr: exports.restty_cell_flags_ptr ? exports.restty_cell_flags_ptr(handle) : 0,
    styleFlagsPtr: exports.restty_cell_style_flags_ptr
      ? exports.restty_cell_style_flags_ptr(handle)
      : 0,
    linkIdsPtr: exports.restty_cell_link_ids_ptr ? exports.restty_cell_link_ids_ptr(handle) : 0,
    fgPtr: exports.restty_cell_fg_rgba_ptr!(handle),
    bgPtr: exports.restty_cell_bg_rgba_ptr!(handle),
    ulPtr: exports.restty_cell_ul_rgba_ptr!(handle),
    ulStylePtr: exports.restty_cell_underline_styles_ptr!(handle),
    graphemeOffsetPtr: exports.restty_cell_grapheme_offsets_ptr!(handle),
    graphemeLenPtr: exports.restty_cell_grapheme_lengths_ptr!(handle),
    graphemeBufferPtr: exports.restty_grapheme_buffer_ptr!(handle),
    graphemeBufferLen: exports.restty_grapheme_buffer_len!(handle),
    selectionStartPtr: exports.restty_row_selection_start_ptr!(handle),
    selectionEndPtr: exports.restty_row_selection_end_ptr!(handle),
    cursorPtr: exports.restty_cursor_info_ptr!(handle),
  };
}

export function readRenderStatePtrs(
  abi: WasmAbi,
  exports: ResttyWasmExports,
  handle: number,
): RenderPtrs | null {
  if (abi.kind === "info") {
    return readRenderInfo(exports, handle);
  }
  if (abi.kind === "render") {
    return readRenderPtrs(exports, handle);
  }
  return readCellPtrs(exports, handle);
}
