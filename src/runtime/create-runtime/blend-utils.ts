import type { Color } from "../../renderer";

export type AlphaBlendingMode = "native" | "linear" | "linear-corrected";

export function srgbChannelToLinear(channel: number): number {
  return channel <= 0.04045 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4);
}

export function srgbToLinearColor(color: Color): Color {
  return [
    srgbChannelToLinear(color[0]),
    srgbChannelToLinear(color[1]),
    srgbChannelToLinear(color[2]),
    color[3],
  ];
}

export function resolveBlendFlags(
  alphaBlending: AlphaBlendingMode,
  backendType: "webgpu" | "webgl2",
  state?: { srgbSwapchain?: boolean },
): { useLinearBlending: boolean; useLinearCorrection: boolean } {
  if (alphaBlending === "native") {
    return { useLinearBlending: false, useLinearCorrection: false };
  }
  if (backendType === "webgl2") {
    return { useLinearBlending: false, useLinearCorrection: false };
  }
  if (backendType === "webgpu" && !state?.srgbSwapchain) {
    return { useLinearBlending: false, useLinearCorrection: false };
  }
  return {
    useLinearBlending: true,
    useLinearCorrection: alphaBlending === "linear-corrected",
  };
}

export function floatsToRgb(color: number[]): [number, number, number] {
  return [
    Math.round((color[0] ?? 0) * 255),
    Math.round((color[1] ?? 0) * 255),
    Math.round((color[2] ?? 0) * 255),
  ];
}
