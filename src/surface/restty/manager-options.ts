import type { DesktopNotification } from "../../input";
import type {
  CreateResttyAppPaneManagerOptions,
  ResttyManagedAppPane,
} from "../pane-app-manager";
import type { ResttyPluginEvents, ResttyRenderHookPayload } from "../restty-plugin-types";
import type { ResttyFontSource } from "../../runtime/types";
import type { ResttyPluginOps } from "./plugin-ops";
import type { ResttyShaderOps } from "./shader-ops";

type PaneManagerEventHandlers = Pick<
  CreateResttyAppPaneManagerOptions,
  "onPaneCreated" | "onPaneClosed" | "onPaneSplit" | "onActivePaneChange" | "onLayoutChanged"
>;

type MergedPaneAppOptionsDeps = {
  appOptions: CreateResttyAppPaneManagerOptions["appOptions"] | undefined;
  getFontSources: () => ResttyFontSource[] | undefined;
  onDesktopNotification?: (notification: DesktopNotification & { paneId: number }) => void;
  shaderOps: Pick<
    ResttyShaderOps,
    "normalizePaneShaderStages" | "setPaneBaseShaderStages" | "buildMergedShaderStages"
  >;
  pluginOps: Pick<ResttyPluginOps, "applyInputInterceptors" | "applyOutputInterceptors">;
  runRenderHooks: (payload: ResttyRenderHookPayload) => void;
};

type PaneManagerCallbacksDeps = PaneManagerEventHandlers & {
  shaderOps: Pick<ResttyShaderOps, "syncPaneShaderStages" | "removePaneBaseShaderStages">;
  emitPluginEvent: <E extends keyof ResttyPluginEvents>(
    event: E,
    payload: ResttyPluginEvents[E],
  ) => void;
};

export function createMergedPaneAppOptions(
  deps: MergedPaneAppOptionsDeps,
): CreateResttyAppPaneManagerOptions["appOptions"] {
  return (context) => {
    const resolved =
      typeof deps.appOptions === "function" ? deps.appOptions(context) : (deps.appOptions ?? {});
    const resolvedBeforeInput = resolved.beforeInput;
    const resolvedBeforeRenderOutput = resolved.beforeRenderOutput;
    const resolvedCallbacks = resolved.callbacks;
    const paneBaseStages = deps.shaderOps.normalizePaneShaderStages(resolved.shaderStages, context.id);
    deps.shaderOps.setPaneBaseShaderStages(context.id, paneBaseStages);

    const fontSources = deps.getFontSources();
    return {
      ...resolved,
      ...(fontSources ? { fontSources } : {}),
      shaderStages: deps.shaderOps.buildMergedShaderStages(paneBaseStages),
      callbacks:
        deps.onDesktopNotification || resolvedCallbacks?.onDesktopNotification
          ? {
              ...resolvedCallbacks,
              onDesktopNotification: (notification) => {
                resolvedCallbacks?.onDesktopNotification?.(notification);
                deps.onDesktopNotification?.({ ...notification, paneId: context.id });
              },
            }
          : resolvedCallbacks,
      beforeInput: ({ text, source }) => {
        const maybeUserText = resolvedBeforeInput?.({ text, source });
        if (maybeUserText === null) return null;
        const current = maybeUserText === undefined ? text : maybeUserText;
        return deps.pluginOps.applyInputInterceptors(context.id, current, source);
      },
      beforeRenderOutput: ({ text, source }) => {
        deps.runRenderHooks({
          phase: "before",
          paneId: context.id,
          text,
          source,
          dropped: false,
        });
        const maybeUserText = resolvedBeforeRenderOutput?.({ text, source });
        if (maybeUserText === null) {
          deps.runRenderHooks({
            phase: "after",
            paneId: context.id,
            text,
            source,
            dropped: true,
          });
          return null;
        }
        const current = maybeUserText === undefined ? text : maybeUserText;
        const next = deps.pluginOps.applyOutputInterceptors(context.id, current, source);
        deps.runRenderHooks({
          phase: "after",
          paneId: context.id,
          text: next === null ? current : next,
          source,
          dropped: next === null,
        });
        return next;
      },
    };
  };
}

export function createPaneManagerEventHandlers(
  deps: PaneManagerCallbacksDeps,
): PaneManagerEventHandlers {
  return {
    onPaneCreated: (pane: ResttyManagedAppPane) => {
      deps.shaderOps.syncPaneShaderStages(pane.id);
      deps.emitPluginEvent("pane:created", { paneId: pane.id });
      deps.onPaneCreated?.(pane);
    },
    onPaneClosed: (pane: ResttyManagedAppPane) => {
      deps.shaderOps.removePaneBaseShaderStages(pane.id);
      deps.emitPluginEvent("pane:closed", { paneId: pane.id });
      deps.onPaneClosed?.(pane);
    },
    onPaneSplit: (sourcePane, createdPane, direction) => {
      deps.emitPluginEvent("pane:split", {
        sourcePaneId: sourcePane.id,
        createdPaneId: createdPane.id,
        direction,
      });
      deps.onPaneSplit?.(sourcePane, createdPane, direction);
    },
    onActivePaneChange: (pane) => {
      deps.emitPluginEvent("pane:active-changed", { paneId: pane?.id ?? null });
      deps.onActivePaneChange?.(pane);
    },
    onLayoutChanged: () => {
      deps.emitPluginEvent("layout:changed", {});
      deps.onLayoutChanged?.();
    },
  };
}
