import { createDiagnoseCodepoint } from "./debug-tools/diagnose-codepoint";
import { createDumpAtlasForCodepoint } from "./debug-tools/dump-atlas-for-codepoint";
import { createSetupDebugExpose } from "./debug-tools/setup-debug-expose";
import type { CreateRuntimeDebugToolsOptions } from "./debug-tools/types";

export type { CreateRuntimeDebugToolsOptions } from "./debug-tools/types";

export function createRuntimeDebugTools(options: CreateRuntimeDebugToolsOptions) {
  const dumpAtlasForCodepoint = createDumpAtlasForCodepoint(options);
  const diagnoseCodepoint = createDiagnoseCodepoint(options);
  const setupDebugExpose = createSetupDebugExpose(options, diagnoseCodepoint);

  return {
    dumpAtlasForCodepoint,
    setupDebugExpose,
  };
}
