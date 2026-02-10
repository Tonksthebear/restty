/// <reference types="@webgpu/types" />
import type { WebGPUCoreState, WebGPUState } from "../types";
import { GLYPH_SHADER, GLYPH_SHADER_NEAREST } from "../shaders/glyph-wgsl";
import { RECT_SHADER } from "../shaders/rect";

function getPreferredAndSrgbFormats(): {
  preferredFormat: GPUTextureFormat;
  srgbFormat: GPUTextureFormat;
} {
  const preferredFormat = navigator.gpu.getPreferredCanvasFormat();
  const srgbFormat =
    preferredFormat === "bgra8unorm"
      ? "bgra8unorm-srgb"
      : preferredFormat === "rgba8unorm"
        ? "rgba8unorm-srgb"
        : preferredFormat;
  return { preferredFormat, srgbFormat };
}

function configureContextFormat(
  context: GPUCanvasContext,
  device: GPUDevice,
  preferredFormat: GPUTextureFormat,
  srgbFormat: GPUTextureFormat,
): { format: GPUTextureFormat; srgbSwapchain: boolean } {
  let format = preferredFormat;
  try {
    context.configure({ device, format: srgbFormat, alphaMode: "opaque" });
    format = srgbFormat;
  } catch {
    context.configure({ device, format: preferredFormat, alphaMode: "opaque" });
  }
  return { format, srgbSwapchain: format.endsWith("-srgb") };
}

function createWebGPUCoreState(
  device: GPUDevice,
  format: GPUTextureFormat,
  srgbSwapchain: boolean,
): WebGPUCoreState {
  // Quad vertices for instanced rendering
  const quadVertices = new Float32Array([0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1]);
  const vertexBuffer = device.createBuffer({
    size: quadVertices.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    mappedAtCreation: true,
  });
  new Float32Array(vertexBuffer.getMappedRange()).set(quadVertices);
  vertexBuffer.unmap();

  // Shader modules
  const rectModule = device.createShaderModule({ code: RECT_SHADER });
  const glyphModule = device.createShaderModule({ code: GLYPH_SHADER });
  const glyphNearestModule = device.createShaderModule({ code: GLYPH_SHADER_NEAREST });

  // Rect pipeline
  const rectPipeline = device.createRenderPipeline({
    layout: "auto",
    vertex: {
      module: rectModule,
      entryPoint: "vsMain",
      buffers: [
        {
          arrayStride: 8,
          attributes: [{ shaderLocation: 0, offset: 0, format: "float32x2" }],
        },
        {
          arrayStride: 32,
          stepMode: "instance",
          attributes: [
            { shaderLocation: 1, offset: 0, format: "float32x2" },
            { shaderLocation: 2, offset: 8, format: "float32x2" },
            { shaderLocation: 3, offset: 16, format: "float32x4" },
          ],
        },
      ],
    },
    fragment: {
      module: rectModule,
      entryPoint: "fsMain",
      targets: [
        {
          format,
          blend: {
            color: {
              srcFactor: "one",
              dstFactor: "one-minus-src-alpha",
              operation: "add",
            },
            alpha: {
              srcFactor: "one",
              dstFactor: "one-minus-src-alpha",
              operation: "add",
            },
          },
        },
      ],
    },
    primitive: { topology: "triangle-list", cullMode: "none" },
  });

  // Glyph pipeline
  const glyphPipeline = device.createRenderPipeline({
    layout: "auto",
    vertex: {
      module: glyphModule,
      entryPoint: "vsMain",
      buffers: [
        {
          arrayStride: 8,
          attributes: [{ shaderLocation: 0, offset: 0, format: "float32x2" }],
        },
        {
          arrayStride: 72,
          stepMode: "instance",
          attributes: [
            { shaderLocation: 1, offset: 0, format: "float32x2" },
            { shaderLocation: 2, offset: 8, format: "float32x2" },
            { shaderLocation: 3, offset: 16, format: "float32x2" },
            { shaderLocation: 4, offset: 24, format: "float32x2" },
            { shaderLocation: 5, offset: 32, format: "float32x4" },
            { shaderLocation: 6, offset: 48, format: "float32x4" },
            { shaderLocation: 7, offset: 64, format: "float32" },
            { shaderLocation: 8, offset: 68, format: "float32" },
          ],
        },
      ],
    },
    fragment: {
      module: glyphModule,
      entryPoint: "fsMain",
      targets: [
        {
          format,
          blend: {
            color: {
              srcFactor: "one",
              dstFactor: "one-minus-src-alpha",
              operation: "add",
            },
            alpha: {
              srcFactor: "one",
              dstFactor: "one-minus-src-alpha",
              operation: "add",
            },
          },
        },
      ],
    },
    primitive: { topology: "triangle-list", cullMode: "none" },
  });

  const glyphPipelineNearest = device.createRenderPipeline({
    layout: "auto",
    vertex: {
      module: glyphNearestModule,
      entryPoint: "vsMain",
      buffers: [
        {
          arrayStride: 8,
          attributes: [{ shaderLocation: 0, offset: 0, format: "float32x2" }],
        },
        {
          arrayStride: 72,
          stepMode: "instance",
          attributes: [
            { shaderLocation: 1, offset: 0, format: "float32x2" },
            { shaderLocation: 2, offset: 8, format: "float32x2" },
            { shaderLocation: 3, offset: 16, format: "float32x2" },
            { shaderLocation: 4, offset: 24, format: "float32x2" },
            { shaderLocation: 5, offset: 32, format: "float32x4" },
            { shaderLocation: 6, offset: 48, format: "float32x4" },
            { shaderLocation: 7, offset: 64, format: "float32" },
            { shaderLocation: 8, offset: 68, format: "float32" },
          ],
        },
      ],
    },
    fragment: {
      module: glyphNearestModule,
      entryPoint: "fsMain",
      targets: [
        {
          format,
          blend: {
            color: {
              srcFactor: "one",
              dstFactor: "one-minus-src-alpha",
              operation: "add",
            },
            alpha: {
              srcFactor: "one",
              dstFactor: "one-minus-src-alpha",
              operation: "add",
            },
          },
        },
      ],
    },
    primitive: { topology: "triangle-list", cullMode: "none" },
  });

  return {
    device,
    format,
    srgbSwapchain,
    rectPipeline,
    glyphPipeline,
    glyphPipelineNearest,
    vertexBuffer,
  };
}

/** Initialize shared WebGPU core state (device, pipelines, vertex buffer) from a canvas. */
export async function initWebGPUCore(canvas: HTMLCanvasElement): Promise<WebGPUCoreState | null> {
  if (!navigator.gpu) return null;

  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) return null;

  const device = await adapter.requestDevice();
  const context = canvas.getContext("webgpu");
  if (!context) return null;

  const { preferredFormat, srgbFormat } = getPreferredAndSrgbFormats();
  const { format, srgbSwapchain } = configureContextFormat(
    context,
    device,
    preferredFormat,
    srgbFormat,
  );

  return createWebGPUCoreState(device, format, srgbSwapchain);
}

/**
 * Initialize a full WebGPU renderer state for a canvas, including context,
 * uniform buffer, and bind groups. Accepts an optional pre-initialized core.
 */
export async function initWebGPU(
  canvas: HTMLCanvasElement,
  options: { core?: WebGPUCoreState | null } = {},
): Promise<WebGPUState | null> {
  const core = options.core ?? (await initWebGPUCore(canvas));
  if (!core) return null;
  const context = canvas.getContext("webgpu");
  if (!context) return null;

  try {
    context.configure({ device: core.device, format: core.format, alphaMode: "opaque" });
  } catch {
    return null;
  }

  // Uniform buffer for resolution and blending flags
  const uniformBuffer = core.device.createBuffer({
    size: 8 * 4,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  // Rect bind group
  const rectBindGroup = core.device.createBindGroup({
    layout: core.rectPipeline.getBindGroupLayout(0),
    entries: [{ binding: 0, resource: { buffer: uniformBuffer } }],
  });

  return {
    core,
    device: core.device,
    context,
    format: core.format,
    srgbSwapchain: core.srgbSwapchain,
    rectPipeline: core.rectPipeline,
    glyphPipeline: core.glyphPipeline,
    glyphPipelineNearest: core.glyphPipelineNearest,
    rectBindGroup,
    uniformBuffer,
    vertexBuffer: core.vertexBuffer,
    rectInstanceBuffer: core.device.createBuffer({
      size: 4,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    }),
    rectCapacity: 4,
    glyphInstanceBuffer: core.device.createBuffer({
      size: 4,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    }),
    glyphCapacity: 4,
    glyphAtlases: new Map(),
  };
}
