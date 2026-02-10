import type { WebGLState } from "../../renderer";
import { tickWebGL as tickWebGLImpl } from "./render-tick-webgl";
import { tickWebGPU as tickWebGPUImpl } from "./render-tick-webgpu";

export function createRuntimeRenderTicks(deps: any) {
  function tickWebGPU(state) {
    return tickWebGPUImpl(deps, state);
  }

  function tickWebGL(state: WebGLState) {
    return tickWebGLImpl(deps, state);
  }

  return { tickWebGPU, tickWebGL };
}
