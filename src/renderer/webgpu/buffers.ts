/// <reference types="@webgpu/types" />
import type { WebGLState, WebGPUState } from "../types";

/** Grow a WebGPU instance buffer if the required byte length exceeds current capacity. */
export function ensureInstanceBuffer(
  state: WebGPUState,
  kind: "rect" | "glyph",
  byteLength: number,
): void {
  const bufferKey = kind === "rect" ? "rectInstanceBuffer" : "glyphInstanceBuffer";
  const capKey = kind === "rect" ? "rectCapacity" : "glyphCapacity";

  if (byteLength <= state[capKey]) return;

  const newSize = Math.max(byteLength, state[capKey] * 2, 1024);
  state[bufferKey] = state.device.createBuffer({
    size: newSize,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  });
  state[capKey] = newSize;
}

/** Re-configure the WebGPU canvas context with the current device and format. */
export function configureContext(state: WebGPUState): void {
  state.context.configure({
    device: state.device,
    format: state.format,
    alphaMode: "opaque",
  });
}

/** Grow a WebGL instance buffer if the required byte length exceeds current capacity. */
export function ensureGLInstanceBuffer(
  state: WebGLState,
  kind: "rect" | "glyph",
  byteLength: number,
): void {
  const { gl } = state;
  const bufferKey = kind === "rect" ? "rectInstanceBuffer" : "glyphInstanceBuffer";
  const capKey = kind === "rect" ? "rectCapacity" : "glyphCapacity";
  const vaoKey = kind === "rect" ? "rectVao" : "glyphVao";

  if (byteLength <= state[capKey]) return;

  const newSize = Math.max(byteLength, state[capKey] * 2, 1024);
  gl.bindVertexArray(state[vaoKey]);
  gl.bindBuffer(gl.ARRAY_BUFFER, state[bufferKey]);
  gl.bufferData(gl.ARRAY_BUFFER, newSize, gl.DYNAMIC_DRAW);
  state[capKey] = newSize;
  gl.bindVertexArray(null);
}
