import type { GlyphConstraintMeta } from "../../atlas-builder";
import type { CreateRuntimeDebugToolsOptions } from "./types";
import { readTextureToImageData } from "./read-texture-to-image-data";

export function createDumpGlyphRender(options: CreateRuntimeDebugToolsOptions) {
  const {
    getActiveState,
    pickFontIndexForText,
    fontState,
    getCanvas,
    gridState,
    fontConfig,
    fontHeightUnits,
    fontScaleOverride,
    fontScaleOverrides,
    isSymbolFont,
    isColorEmojiFont,
    fontAdvanceUnits,
    fontMaxCellSpan,
    clamp,
    buildNerdMetrics,
    nerdIconScale,
    ensureAtlasForFont,
    formatCodepoint,
    shapeClusterWithFont,
  } = options;

  return async function dumpGlyphRender(cp: number, constraintWidth = 1) {
    const state = getActiveState();
    if (!state || !("device" in state)) {
      console.warn("WebGPU not active");
      return null;
    }

    const text = String.fromCodePoint(cp);
    const span = Math.max(1, constraintWidth || 1);
    const fontIndex = pickFontIndexForText(text, span);
    const entry = fontState.fonts[fontIndex];
    if (!entry?.font) {
      console.warn("font not ready");
      return null;
    }

    const glyphId = entry.font.glyphIdForChar(text);
    if (!glyphId) {
      console.warn("missing glyph");
      return null;
    }

    const runtimeCanvas = getCanvas();
    const cellW = gridState.cellW || runtimeCanvas.width / Math.max(1, gridState.cols || 1);
    const cellH = gridState.cellH || runtimeCanvas.height / Math.max(1, gridState.rows || 1);
    const fontSizePx = gridState.fontSizePx || fontConfig.sizePx;
    const primaryEntry = fontState.fonts[0];
    const primaryScale = primaryEntry?.font
      ? primaryEntry.font.scaleForSize(fontSizePx, fontState.sizeMode)
      : 1;
    const lineHeight = primaryEntry?.font ? fontHeightUnits(primaryEntry.font) * primaryScale : cellH;
    const baselineOffset = primaryEntry?.font ? primaryEntry.font.ascender * primaryScale : 0;
    const yPad = gridState.yPad ?? (cellH - lineHeight) * 0.5;

    const baseScale =
      entry.font.scaleForSize(fontSizePx, fontState.sizeMode) *
      fontScaleOverride(entry, fontScaleOverrides);
    let fontScale = baseScale;
    if (!isSymbolFont(entry) && !isColorEmojiFont(entry)) {
      const advanceUnits = fontAdvanceUnits(entry, shapeClusterWithFont);
      const maxSpan = fontMaxCellSpan(entry);
      const widthPx = advanceUnits * baseScale;
      const widthAdjustRaw = widthPx > 0 ? (cellW * maxSpan) / widthPx : 1;
      const widthAdjust = clamp(widthAdjustRaw, 0.5, 2);
      fontScale = baseScale * widthAdjust;
      const adjustedHeightPx = fontHeightUnits(entry.font) * fontScale;
      if (adjustedHeightPx > lineHeight && adjustedHeightPx > 0) {
        fontScale *= lineHeight / adjustedHeightPx;
      }
    }
    const baselineAdjust = primaryEntry?.font
      ? primaryEntry.font.ascender * primaryScale - entry.font.ascender * fontScale
      : 0;
    const atlasScale = clamp(fontScale / (baseScale || 1), 0.5, 2);

    const meta = new Map<number, GlyphConstraintMeta>();
    meta.set(glyphId, {
      cp,
      constraintWidth: span,
      widths: new Set([span]),
      variable: false,
    });

    const constraintContext = {
      cellW,
      cellH,
      yPad,
      baselineOffset,
      baselineAdjust,
      fontScale,
      nerdMetrics: buildNerdMetrics(
        cellW,
        cellH,
        lineHeight,
        primaryEntry?.font,
        primaryScale,
        nerdIconScale,
      ),
      fontEntry: entry,
    };

    ensureAtlasForFont(
      state.device,
      state,
      entry,
      new Set([glyphId]),
      fontSizePx,
      fontIndex,
      atlasScale,
      meta,
      constraintContext,
    );

    const atlas = entry.atlas;
    const atlasState = state.glyphAtlases?.get(fontIndex);
    if (!atlas || !atlasState) {
      console.warn("atlas not ready");
      return null;
    }

    const widthMap = atlas.glyphsByWidth?.get(span);
    const metrics = widthMap?.get(glyphId) ?? atlas.glyphs.get(glyphId);
    if (!metrics) {
      console.warn("metrics missing");
      return null;
    }

    const atlasW = atlas.bitmap.width;
    const atlasH = atlas.bitmap.rows;
    const baseInset = Number.isFinite(atlas.inset) ? atlas.inset : 0;
    const uvInset = baseInset + (atlasState.nearest ? 0.5 : 0);
    const insetX = Math.min(uvInset, (metrics.width - 1) * 0.5);
    const insetY = Math.min(uvInset, (metrics.height - 1) * 0.5);
    const u0 = (metrics.atlasX + insetX) / atlasW;
    const v0 = (metrics.atlasY + insetY) / atlasH;
    const u1 = (metrics.atlasX + metrics.width - insetX) / atlasW;
    const v1 = (metrics.atlasY + metrics.height - insetY) / atlasH;

    const outW = Math.max(1, metrics.width);
    const outH = Math.max(1, metrics.height);
    const uniformBuffer = state.device.createBuffer({
      size: 8 * 4,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    const uniforms = new Float32Array([outW, outH, 0, 0, 0, 0, 0, 0]);
    state.device.queue.writeBuffer(uniformBuffer, 0, uniforms);

    const instance = new Float32Array([
      0,
      0,
      outW,
      outH,
      u0,
      v0,
      u1,
      v1,
      1,
      1,
      1,
      1,
      0,
      0,
      0,
      1,
    ]);
    const instanceBuffer = state.device.createBuffer({
      size: instance.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true,
    });
    new Float32Array(instanceBuffer.getMappedRange()).set(instance);
    instanceBuffer.unmap();

    const renderTarget = state.device.createTexture({
      size: [outW, outH, 1],
      format: state.format,
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
    });

    const pipeline = atlasState.nearest ? state.glyphPipelineNearest : state.glyphPipeline;
    const bindGroup = state.device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: atlasState.nearest
        ? [
            { binding: 0, resource: { buffer: uniformBuffer } },
            {
              binding: 1,
              resource:
                atlasState.samplerNearest ??
                state.device.createSampler({
                  magFilter: "nearest",
                  minFilter: "nearest",
                  addressModeU: "clamp-to-edge",
                  addressModeV: "clamp-to-edge",
                }),
            },
            { binding: 2, resource: atlasState.texture.createView() },
          ]
        : [
            { binding: 0, resource: { buffer: uniformBuffer } },
            {
              binding: 1,
              resource:
                atlasState.sampler ??
                state.device.createSampler({
                  magFilter: "linear",
                  minFilter: "linear",
                  addressModeU: "clamp-to-edge",
                  addressModeV: "clamp-to-edge",
                }),
            },
            { binding: 2, resource: atlasState.texture.createView() },
          ],
    });

    const encoder = state.device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: renderTarget.createView(),
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
          loadOp: "clear",
          storeOp: "store",
        },
      ],
    });
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.setVertexBuffer(0, state.vertexBuffer);
    pass.setVertexBuffer(1, instanceBuffer);
    pass.draw(6, 1, 0, 0);
    pass.end();
    state.device.queue.submit([encoder.finish()]);

    const image = await readTextureToImageData(state.device, renderTarget, outW, outH);
    const canvas = document.createElement("canvas");
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext("2d");
    if (ctx) ctx.putImageData(image, 0, 0);
    canvas.style.border = "1px solid #555";
    canvas.style.margin = "6px";
    canvas.style.imageRendering = "pixelated";
    canvas.style.width = `${outW * 3}px`;
    canvas.style.height = `${outH * 3}px`;
    document.body.appendChild(canvas);

    console.log("dumpGlyphRender", {
      cp: formatCodepoint(cp),
      fontIndex,
      glyphId,
      constraintWidth: span,
      metrics,
      atlasW,
      atlasH,
      format: state.format,
      u0,
      v0,
      u1,
      v1,
      nearest: atlasState.nearest,
    });

    return image;
  };
}
