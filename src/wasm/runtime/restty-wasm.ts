import { decodeBase64Bytes } from "../../utils/base64";
import { WASM_BASE64 } from "../embedded";
import { resolveWasmAbi } from "./abi";
import { readKittyPlacements } from "./kitty";
import { readRenderState } from "./render-state";
import type {
  KittyPlacement,
  RenderState,
  RenderViewCache,
  ResttyWasmExports,
  ResttyWasmOptions,
  WasmAbi,
} from "./types";
import { makeRenderViewCache } from "./view-cache";

const textDecoder = new TextDecoder();
const textEncoder = new TextEncoder();

const requiredWasmExports = [
  "memory",
  "restty_create",
  "restty_destroy",
  "restty_write",
  "restty_resize",
  "restty_render_update",
  "restty_alloc",
  "restty_free",
];

/** WASM terminal core runtime with memory management and typed array caching. */
export class ResttyWasm {
  readonly exports: ResttyWasmExports;
  readonly abi: WasmAbi;
  readonly memory: WebAssembly.Memory;
  private readonly renderViewCaches: Map<number, RenderViewCache>;

  private constructor(exports: ResttyWasmExports, abi: WasmAbi) {
    this.exports = exports;
    this.abi = abi;
    this.memory = exports.memory;
    this.renderViewCaches = new Map();
  }

  /** Load and instantiate the embedded WASM module. */
  static async load(options: ResttyWasmOptions = {}): Promise<ResttyWasm> {
    const bytes = decodeBase64Bytes(WASM_BASE64);
    let memory: WebAssembly.Memory | null = null;
    const log = options.log;

    const imports = {
      env: {
        log: (ptr: number, len: number) => {
          if (!memory || !ptr || !len) return;
          const view = new Uint8Array(memory.buffer, ptr, len);
          const text = textDecoder.decode(view);
          if (log) log(text);
        },
      },
    };

    const { instance } = await WebAssembly.instantiate(bytes, imports);
    const exports = instance.exports as ResttyWasmExports;
    memory = exports.memory ?? null;

    for (const name of requiredWasmExports) {
      if (!(name in exports)) {
        throw new Error(`missing WASM export: ${name}`);
      }
    }

    const abi = resolveWasmAbi(exports);
    if (!abi) {
      throw new Error("missing render ABI exports");
    }

    return new ResttyWasm(exports, abi);
  }

  /** Create a new terminal instance and return its handle. */
  create(cols: number, rows: number, maxScrollback: number): number {
    return this.exports.restty_create(cols, rows, maxScrollback);
  }

  /** Destroy a terminal instance and free its resources. */
  destroy(handle: number): void {
    this.renderViewCaches.delete(handle);
    this.exports.restty_destroy(handle);
  }

  private getRenderViewCache(handle: number): RenderViewCache {
    let cache = this.renderViewCaches.get(handle);
    if (!cache) {
      cache = makeRenderViewCache();
      this.renderViewCaches.set(handle, cache);
    }
    return cache;
  }

  /** Resize the terminal grid. */
  resize(handle: number, cols: number, rows: number): void {
    this.exports.restty_resize(handle, cols, rows);
  }

  /** Set pixel dimensions for Kitty graphics protocol. */
  setPixelSize(handle: number, widthPx: number, heightPx: number): void {
    if (!this.exports.restty_set_pixel_size) return;
    this.exports.restty_set_pixel_size(handle, widthPx, heightPx);
  }

  /** Update internal render buffers after state changes. */
  renderUpdate(handle: number): void {
    this.exports.restty_render_update(handle);
  }

  /** Scroll the viewport by delta rows. */
  scrollViewport(handle: number, delta: number): void {
    if (!this.exports.restty_scroll_viewport) return;
    this.exports.restty_scroll_viewport(handle, delta);
  }

  /** Read and clear pending output replies from terminal. */
  drainOutput(handle: number): string {
    if (!this.exports.restty_output_ptr || !this.exports.restty_output_len) return "";
    const len = this.exports.restty_output_len(handle);
    if (!len) return "";
    const ptr = this.exports.restty_output_ptr(handle);
    if (!ptr) return "";
    const bytes = new Uint8Array(this.memory.buffer, ptr, len);
    const copy = new Uint8Array(len);
    copy.set(bytes);
    if (this.exports.restty_output_consume) {
      this.exports.restty_output_consume(handle, len);
    }
    return textDecoder.decode(copy);
  }

  /** Get active Kitty keyboard protocol flags. */
  getKittyKeyboardFlags(handle: number): number {
    if (!this.exports.restty_kitty_keyboard_flags) return 0;
    return this.exports.restty_kitty_keyboard_flags(handle) >>> 0;
  }

  /** Get all active Kitty graphics placements. */
  getKittyPlacements(handle: number): KittyPlacement[] {
    return readKittyPlacements(this.exports, this.memory, handle);
  }

  /** Write text to terminal for processing. */
  write(handle: number, text: string): void {
    if (!text) return;
    const bytes = textEncoder.encode(text);
    const ptr = this.exports.restty_alloc(bytes.length);
    if (!ptr) return;
    const view = new Uint8Array(this.memory.buffer, ptr, bytes.length);
    view.set(bytes);
    this.exports.restty_write(handle, ptr, bytes.length);
    this.exports.restty_free(ptr, bytes.length);
  }

  /** Set default colors for terminal (RGB packed as 0xRRGGBB). */
  setDefaultColors(handle: number, fg: number, bg: number, cursor: number): void {
    if (!this.exports.restty_set_default_colors) return;
    this.exports.restty_set_default_colors(handle, fg, bg, cursor);
  }

  /** Set terminal color palette (RGB triples). */
  setPalette(handle: number, colors: Uint8Array, count: number): void {
    if (!this.exports.restty_set_palette) return;
    if (count <= 0 || colors.length < count * 3) return;
    const byteLen = count * 3;
    const ptr = this.exports.restty_alloc(byteLen);
    if (!ptr) return;
    const view = new Uint8Array(this.memory.buffer, ptr, byteLen);
    view.set(colors.subarray(0, byteLen));
    this.exports.restty_set_palette(handle, ptr, count);
    this.exports.restty_free(ptr, byteLen);
  }

  /** Reset terminal palette to defaults. */
  resetPalette(handle: number): void {
    if (!this.exports.restty_reset_palette) return;
    this.exports.restty_reset_palette(handle);
  }

  /** Get current render state with cached typed array views. */
  getRenderState(handle: number): RenderState | null {
    return readRenderState(
      this.abi,
      this.exports,
      this.memory,
      handle,
      this.getRenderViewCache(handle),
    );
  }
}

/** Load and instantiate the embedded WASM module (convenience function). */
export async function loadResttyWasm(options: ResttyWasmOptions = {}): Promise<ResttyWasm> {
  return ResttyWasm.load(options);
}
