import type { ResttyAppInputPayload } from "../types";

type RuntimeInputHook =
  | ((payload: ResttyAppInputPayload) => string | null | void)
  | null
  | undefined;

export type CreateRuntimeInputHooksOptions = {
  beforeInputHook?: RuntimeInputHook;
  beforeRenderOutputHook?: RuntimeInputHook;
};

export type RuntimeInputHooks = {
  runBeforeInputHook: (text: string, source: string) => string | null;
  runBeforeRenderOutputHook: (text: string, source: string) => string | null;
  runBeforeRenderOutputBytesHook: (bytes: Uint8Array, source: string) => boolean;
};

export function createRuntimeInputHooks(
  options: CreateRuntimeInputHooksOptions,
): RuntimeInputHooks {
  const { beforeInputHook, beforeRenderOutputHook } = options;
  const bytesDecoder = new TextDecoder("utf-8", { fatal: false });

  function runHook(
    hook: RuntimeInputHook,
    text: string,
    source: string,
    errorLabel: string,
  ): string | null {
    if (!hook) return text;
    try {
      const next = hook({ text, source });
      if (next === null) return null;
      if (typeof next === "string") return next;
      return text;
    } catch (error) {
      console.error(errorLabel, error);
      return text;
    }
  }

  return {
    runBeforeInputHook: (text: string, source: string) =>
      runHook(beforeInputHook, text, source, "[restty] beforeInput hook error:"),
    runBeforeRenderOutputHook: (text: string, source: string) =>
      runHook(beforeRenderOutputHook, text, source, "[restty] beforeRenderOutput hook error:"),
    runBeforeRenderOutputBytesHook: (bytes: Uint8Array, source: string) => {
      if (!beforeRenderOutputHook) return true;
      try {
        return (
          beforeRenderOutputHook({
            text: bytesDecoder.decode(bytes),
            source,
            bytes,
          }) !== null
        );
      } catch (error) {
        console.error("[restty] beforeRenderOutput hook error:", error);
        return true;
      }
    },
  };
}
