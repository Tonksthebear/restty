import type { FontEntry, FontManagerState } from "../../fonts";
import type { WebGLState, WebGPUState } from "../../renderer";
import type { PtyTransport } from "../../pty";
import type { ResttyWasm } from "../../wasm";
import type { ResttyAppCallbacks } from "../types";

export type GridStateRef = {
  cols: number;
  rows: number;
  cellW: number;
  cellH: number;
  fontSizePx: number;
  scale: number;
  lineHeight: number;
  baselineOffset: number;
  yPad: number;
};

export type FontConfigRef = {
  sizePx: number;
};

export type ResizeStateRef = {
  lastAt: number;
};

export type ShapedGlyph = {
  glyphId?: number;
  xAdvance: number;
};

export type ShapeClusterResult = {
  glyphs: ShapedGlyph[];
  advance: number;
};

export type BuildColorEmojiAtlasWithCanvas = (options: any) => { atlas: any } | null;
export type AtlasBitmapToRGBA = (atlas: any) => Uint8Array | null;
export type ResolveGlyphPixelMode = (entry: FontEntry) => number;
export type ShapeFn = (font: any, buffer: any) => any;
export type GlyphBufferToShapedGlyphsFn = (glyphBuffer: any) => ShapedGlyph[];
export type UnicodeBufferCtor = new () => { addStr: (text: string) => void };

export type CreateRuntimeFontRuntimeHelpersOptions = {
  fontState: FontManagerState;
  fontConfig: FontConfigRef;
  gridState: GridStateRef;
  callbacks?: ResttyAppCallbacks;
  gridEl: HTMLElement | null;
  cellEl: HTMLElement | null;
  getCanvas: () => HTMLCanvasElement;
  getCurrentDpr: () => number;
  getActiveState: () => WebGPUState | WebGLState | null;
  getWasmReady: () => boolean;
  getWasm: () => ResttyWasm | null;
  getWasmHandle: () => number;
  ptyTransport: PtyTransport;
  setNeedsRender: () => void;
  resizeState: ResizeStateRef;
  resizeActiveMs: number;
  resizeCommitDebounceMs: number;
  onSyncKittyOverlaySize: () => void;
  fontScaleOverrides: Array<{ match: RegExp; scale: number }>;
  resolveGlyphPixelMode: ResolveGlyphPixelMode;
  atlasBitmapToRGBA: AtlasBitmapToRGBA;
  padAtlasRGBA: (rgba: Uint8Array, atlas: any, padding: number) => Uint8Array;
  buildAtlas: (font: any, glyphIds: number[], options: any) => any;
  buildColorEmojiAtlasWithCanvas: BuildColorEmojiAtlasWithCanvas;
  rasterizeGlyph: any;
  rasterizeGlyphWithTransform: any;
  pixelModeRgbaValue: number;
  atlasPadding: number;
  symbolAtlasPadding: number;
  symbolAtlasMaxSize: number;
  glyphShapeCacheLimit: number;
  fontPickCacheLimit: number;
  UnicodeBuffer: UnicodeBufferCtor;
  shape: ShapeFn;
  glyphBufferToShapedGlyphs: GlyphBufferToShapedGlyphsFn;
};

export type CellMetrics = {
  cellW: number;
  cellH: number;
  fontSizePx: number;
  scale: number;
  lineHeight: number;
  baselineOffset: number;
  yPad: number;
};
