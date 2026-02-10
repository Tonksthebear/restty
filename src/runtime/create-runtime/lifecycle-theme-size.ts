import { createLifecycleCanvasHandlers } from "./lifecycle-theme-size-canvas";
import { createLifecycleThemeHandlers } from "./lifecycle-theme-size-theme";
import type { LifecycleThemeSizeDeps } from "./lifecycle-theme-size.types";

export function createRuntimeLifecycleThemeSize(deps: LifecycleThemeSizeDeps) {
  const { applyTheme, resetTheme } = createLifecycleThemeHandlers(deps);
  const {
    replaceCanvas,
    updateSize,
    resize,
    scheduleSizeUpdate,
    focusTypingInput,
    focus,
    blur,
    bindFocusEvents,
    bindAutoResizeEvents,
    cancelScheduledSizeUpdate,
  } = createLifecycleCanvasHandlers(deps);

  return {
    applyTheme,
    resetTheme,
    replaceCanvas,
    updateSize,
    resize,
    scheduleSizeUpdate,
    focusTypingInput,
    focus,
    blur,
    bindFocusEvents,
    bindAutoResizeEvents,
    cancelScheduledSizeUpdate,
    getActiveTheme: deps.getActiveTheme,
  };
}

