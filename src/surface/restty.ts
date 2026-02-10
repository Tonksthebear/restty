import type { DesktopNotification, InputHandler, MouseMode } from "../input";
import type { GhosttyTheme } from "../theme";
import {
  createResttyAppPaneManager,
  type CreateResttyAppPaneManagerOptions,
  type ResttyManagedAppPane,
  type ResttyManagedPaneStyleOptions,
  type ResttyPaneAppOptionsInput,
} from "./pane-app-manager";
import type { ResttyPaneManager, ResttyPaneSplitDirection } from "./panes";
import type { ResttyFontSource, ResttyShaderStage } from "./types";
import { ResttyPaneHandle, type ResttyPaneApi } from "./restty-pane-handle";
import {
  RESTTY_PLUGIN_API_VERSION,
  type ResttyPluginApiRange,
  type ResttyPluginRequires,
  type ResttyPluginInfo,
  type ResttyPluginManifestEntry,
  type ResttyPluginRegistryEntry,
  type ResttyPluginRegistry,
  type ResttyPluginLoadStatus,
  type ResttyPluginLoadResult,
  type ResttyPluginEvents,
  type ResttyPluginDisposable,
  type ResttyPluginCleanup,
  type ResttyInputInterceptorPayload,
  type ResttyOutputInterceptorPayload,
  type ResttyInputInterceptor,
  type ResttyOutputInterceptor,
  type ResttyLifecycleHookPayload,
  type ResttyLifecycleHook,
  type ResttyRenderHookPayload,
  type ResttyRenderHook,
  type ResttyInterceptorOptions,
  type ResttyRenderStageHandle,
  type ResttyPluginContext,
  type ResttyPlugin,
} from "./restty-plugin-types";
import {
  type ResttyPluginRuntimeDisposerKind,
  type ResttyPluginRuntime,
  type ResttyPluginDiagnostic,
  type ResttyRegisteredInterceptor,
  type ResttyManagedShaderStage,
  registerPluginInterceptor,
  applyPluginInterceptors,
  runPluginHooks,
  attachRuntimeDisposer,
  teardownPluginRuntime,
  setPluginLoadError,
  patchPluginDiagnostic,
  buildPluginInfo,
  onPluginEvent,
  emitPluginEvent,
} from "./restty-plugin-runtime";
import {
  assertPluginCompatibility,
  errorToMessage,
  lookupPluginRegistryEntry,
  normalizePluginCleanup,
  normalizePluginMetadata,
  resolvePluginRegistryEntry,
} from "./restty-plugin-utils";
import {
  cloneShaderStages,
  normalizeShaderStage,
  normalizeShaderStages,
  sortShaderStages,
} from "./shader-stages";
export { ResttyPaneHandle } from "./restty-pane-handle";
export type { ResttyPaneApi } from "./restty-pane-handle";
export { RESTTY_PLUGIN_API_VERSION } from "./restty-plugin-types";
export type {
  ResttyPluginApiRange,
  ResttyPluginRequires,
  ResttyPluginInfo,
  ResttyPluginManifestEntry,
  ResttyPluginRegistryEntry,
  ResttyPluginRegistry,
  ResttyPluginLoadStatus,
  ResttyPluginLoadResult,
  ResttyPluginEvents,
  ResttyPluginDisposable,
  ResttyPluginCleanup,
  ResttyInputInterceptorPayload,
  ResttyOutputInterceptorPayload,
  ResttyInputInterceptor,
  ResttyOutputInterceptor,
  ResttyLifecycleHookPayload,
  ResttyLifecycleHook,
  ResttyRenderHookPayload,
  ResttyRenderHook,
  ResttyInterceptorOptions,
  ResttyRenderStageHandle,
  ResttyPluginContext,
  ResttyPlugin,
} from "./restty-plugin-types";

/**
 * Top-level configuration for creating a Restty instance.
 */
export type ResttyOptions = Omit<CreateResttyAppPaneManagerOptions, "appOptions"> & {
  /** Per-pane app options, static or factory. */
  appOptions?: CreateResttyAppPaneManagerOptions["appOptions"];
  /** Font sources applied to every pane. */
  fontSources?: ResttyPaneAppOptionsInput["fontSources"];
  /** Global shader stages synchronized to all panes. */
  shaderStages?: ResttyShaderStage[];
  /** Global handler for desktop notifications emitted by any pane. */
  onDesktopNotification?: (notification: DesktopNotification & { paneId: number }) => void;
  /** Whether to create the first pane automatically (default true). */
  createInitialPane?: boolean | { focus?: boolean };
};

/**
 * Main entry point for the restty terminal widget. Manages a set of
 * split panes, each running its own terminal app, and exposes
 * convenience methods that operate on the active pane.
 */
export class Restty {
  readonly paneManager: ResttyPaneManager<ResttyManagedAppPane>;
  private fontSources: ResttyFontSource[] | undefined;
  private readonly paneBaseShaderStages = new Map<number, ResttyShaderStage[]>();
  private readonly globalShaderStages = new Map<string, ResttyManagedShaderStage>();
  private nextShaderStageOrder = 1;
  private readonly pluginListeners = new Map<
    keyof ResttyPluginEvents,
    Set<(payload: unknown) => void>
  >();
  private readonly pluginRuntimes = new Map<string, ResttyPluginRuntime>();
  private readonly pluginDiagnostics = new Map<string, ResttyPluginDiagnostic>();
  private readonly inputInterceptors: Array<ResttyRegisteredInterceptor<ResttyInputInterceptor>> =
    [];
  private readonly outputInterceptors: Array<ResttyRegisteredInterceptor<ResttyOutputInterceptor>> =
    [];
  private readonly lifecycleHooks: Array<ResttyRegisteredInterceptor<ResttyLifecycleHook>> = [];
  private readonly renderHooks: Array<ResttyRegisteredInterceptor<ResttyRenderHook>> = [];
  private nextInterceptorId = 1;
  private nextInterceptorOrder = 1;

  constructor(options: ResttyOptions) {
    const {
      createInitialPane = true,
      appOptions,
      fontSources,
      shaderStages,
      onDesktopNotification,
      onPaneCreated,
      onPaneClosed,
      onPaneSplit,
      onActivePaneChange,
      onLayoutChanged,
      ...paneManagerOptions
    } = options;
    this.fontSources = fontSources ? [...fontSources] : undefined;
    if (shaderStages?.length) {
      const normalized = sortShaderStages(normalizeShaderStages(shaderStages));
      for (let i = 0; i < normalized.length; i += 1) {
        const stage = normalized[i];
        this.globalShaderStages.set(stage.id, {
          id: stage.id,
          stage,
          order: this.nextShaderStageOrder++,
          ownerPluginId: null,
        });
      }
    }
    const mergedAppOptions: CreateResttyAppPaneManagerOptions["appOptions"] = (context) => {
      const resolved = typeof appOptions === "function" ? appOptions(context) : (appOptions ?? {});
      const resolvedBeforeInput = resolved.beforeInput;
      const resolvedBeforeRenderOutput = resolved.beforeRenderOutput;
      const resolvedCallbacks = resolved.callbacks;
      const paneBaseStages = this.normalizePaneShaderStages(resolved.shaderStages, context.id);
      this.paneBaseShaderStages.set(context.id, paneBaseStages);

      return {
        ...resolved,
        ...(this.fontSources ? { fontSources: this.fontSources } : {}),
        shaderStages: this.buildMergedShaderStages(paneBaseStages),
        callbacks:
          onDesktopNotification || resolvedCallbacks?.onDesktopNotification
            ? {
                ...resolvedCallbacks,
                onDesktopNotification: (notification) => {
                  resolvedCallbacks?.onDesktopNotification?.(notification);
                  onDesktopNotification?.({ ...notification, paneId: context.id });
                },
              }
            : resolvedCallbacks,
        beforeInput: ({ text, source }) => {
          const maybeUserText = resolvedBeforeInput?.({ text, source });
          if (maybeUserText === null) return null;
          const current = maybeUserText === undefined ? text : maybeUserText;
          return this.applyInputInterceptors(context.id, current, source);
        },
        beforeRenderOutput: ({ text, source }) => {
          this.runRenderHooks({
            phase: "before",
            paneId: context.id,
            text,
            source,
            dropped: false,
          });
          const maybeUserText = resolvedBeforeRenderOutput?.({ text, source });
          if (maybeUserText === null) {
            this.runRenderHooks({
              phase: "after",
              paneId: context.id,
              text,
              source,
              dropped: true,
            });
            return null;
          }
          const current = maybeUserText === undefined ? text : maybeUserText;
          const next = this.applyOutputInterceptors(context.id, current, source);
          this.runRenderHooks({
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

    this.paneManager = createResttyAppPaneManager({
      ...paneManagerOptions,
      appOptions: mergedAppOptions,
      onPaneCreated: (pane) => {
        this.syncPaneShaderStages(pane.id);
        this.emitPluginEvent("pane:created", { paneId: pane.id });
        onPaneCreated?.(pane);
      },
      onPaneClosed: (pane) => {
        this.paneBaseShaderStages.delete(pane.id);
        this.emitPluginEvent("pane:closed", { paneId: pane.id });
        onPaneClosed?.(pane);
      },
      onPaneSplit: (sourcePane, createdPane, direction) => {
        this.emitPluginEvent("pane:split", {
          sourcePaneId: sourcePane.id,
          createdPaneId: createdPane.id,
          direction,
        });
        onPaneSplit?.(sourcePane, createdPane, direction);
      },
      onActivePaneChange: (pane) => {
        this.emitPluginEvent("pane:active-changed", { paneId: pane?.id ?? null });
        onActivePaneChange?.(pane);
      },
      onLayoutChanged: () => {
        this.emitPluginEvent("layout:changed", {});
        onLayoutChanged?.();
      },
    });

    if (createInitialPane) {
      const focus =
        typeof createInitialPane === "object" ? (createInitialPane.focus ?? true) : true;
      this.createInitialPane({ focus });
    }
  }

  getPanes(): ResttyManagedAppPane[] {
    return this.paneManager.getPanes();
  }

  getPaneById(id: number): ResttyManagedAppPane | null {
    return this.paneManager.getPaneById(id);
  }

  getActivePane(): ResttyManagedAppPane | null {
    return this.paneManager.getActivePane();
  }

  getFocusedPane(): ResttyManagedAppPane | null {
    return this.paneManager.getFocusedPane();
  }

  panes(): ResttyPaneHandle[] {
    return this.getPanes().map((pane) => this.makePaneHandle(pane.id));
  }

  pane(id: number): ResttyPaneHandle | null {
    if (!this.getPaneById(id)) return null;
    return this.makePaneHandle(id);
  }

  activePane(): ResttyPaneHandle | null {
    const pane = this.getActivePane();
    if (!pane) return null;
    return this.makePaneHandle(pane.id);
  }

  focusedPane(): ResttyPaneHandle | null {
    const pane = this.getFocusedPane();
    if (!pane) return null;
    return this.makePaneHandle(pane.id);
  }

  forEachPane(visitor: (pane: ResttyPaneHandle) => void): void {
    const panes = this.getPanes();
    for (let i = 0; i < panes.length; i += 1) {
      visitor(this.makePaneHandle(panes[i].id));
    }
  }

  async setFontSources(sources: ResttyFontSource[]): Promise<void> {
    this.fontSources = sources.length ? [...sources] : undefined;
    const panes = this.getPanes();
    const updates: Array<Promise<void>> = new Array(panes.length);
    for (let i = 0; i < panes.length; i += 1) {
      updates[i] = panes[i].app.setFontSources(this.fontSources ?? []);
    }
    await Promise.all(updates);
  }

  setShaderStages(stages: ResttyShaderStage[]): void {
    this.globalShaderStages.clear();
    const normalized = sortShaderStages(normalizeShaderStages(stages ?? []));
    for (let i = 0; i < normalized.length; i += 1) {
      const stage = normalized[i];
      this.globalShaderStages.set(stage.id, {
        id: stage.id,
        stage,
        order: this.nextShaderStageOrder++,
        ownerPluginId: null,
      });
    }
    this.syncPaneShaderStages();
  }

  getShaderStages(): ResttyShaderStage[] {
    return cloneShaderStages(this.listGlobalShaderStages().map((entry) => entry.stage));
  }

  addShaderStage(stage: ResttyShaderStage): ResttyRenderStageHandle {
    const normalized = normalizeShaderStage(stage);
    return this.addGlobalShaderStage(normalized, null);
  }

  removeShaderStage(id: string): boolean {
    const stageId = id?.trim?.() ?? "";
    if (!stageId) return false;
    const removed = this.globalShaderStages.delete(stageId);
    if (removed) {
      this.syncPaneShaderStages();
    }
    return removed;
  }

  createInitialPane(options?: { focus?: boolean }): ResttyManagedAppPane {
    this.runLifecycleHooks({ phase: "before", action: "create-initial-pane" });
    const pane = this.paneManager.createInitialPane(options);
    this.runLifecycleHooks({
      phase: "after",
      action: "create-initial-pane",
      paneId: pane.id,
      ok: true,
    });
    return pane;
  }

  splitActivePane(direction: ResttyPaneSplitDirection): ResttyManagedAppPane | null {
    const sourcePaneId = this.getActivePane()?.id ?? null;
    this.runLifecycleHooks({
      phase: "before",
      action: "split-active-pane",
      paneId: sourcePaneId,
      direction,
    });
    const pane = this.paneManager.splitActivePane(direction);
    this.runLifecycleHooks({
      phase: "after",
      action: "split-active-pane",
      sourcePaneId: sourcePaneId ?? undefined,
      createdPaneId: pane?.id ?? null,
      direction,
      ok: !!pane,
    });
    return pane;
  }

  splitPane(id: number, direction: ResttyPaneSplitDirection): ResttyManagedAppPane | null {
    this.runLifecycleHooks({
      phase: "before",
      action: "split-pane",
      paneId: id,
      direction,
    });
    const pane = this.paneManager.splitPane(id, direction);
    this.runLifecycleHooks({
      phase: "after",
      action: "split-pane",
      sourcePaneId: id,
      createdPaneId: pane?.id ?? null,
      direction,
      ok: !!pane,
    });
    return pane;
  }

  closePane(id: number): boolean {
    this.runLifecycleHooks({ phase: "before", action: "close-pane", paneId: id });
    const ok = this.paneManager.closePane(id);
    this.runLifecycleHooks({
      phase: "after",
      action: "close-pane",
      paneId: id,
      ok,
    });
    return ok;
  }

  getPaneStyleOptions(): Readonly<Required<ResttyManagedPaneStyleOptions>> {
    return this.paneManager.getStyleOptions();
  }

  setPaneStyleOptions(options: ResttyManagedPaneStyleOptions): void {
    this.paneManager.setStyleOptions(options);
  }

  setActivePane(id: number, options?: { focus?: boolean }): void {
    this.runLifecycleHooks({
      phase: "before",
      action: "set-active-pane",
      paneId: id,
    });
    this.paneManager.setActivePane(id, options);
    const activePaneId = this.getActivePane()?.id ?? null;
    this.runLifecycleHooks({
      phase: "after",
      action: "set-active-pane",
      paneId: activePaneId,
      ok: activePaneId === id,
    });
  }

  markPaneFocused(id: number, options?: { focus?: boolean }): void {
    this.runLifecycleHooks({
      phase: "before",
      action: "mark-pane-focused",
      paneId: id,
    });
    this.paneManager.markPaneFocused(id, options);
    const focusedPaneId = this.getFocusedPane()?.id ?? null;
    this.runLifecycleHooks({
      phase: "after",
      action: "mark-pane-focused",
      paneId: focusedPaneId,
      ok: focusedPaneId === id,
    });
  }

  requestLayoutSync(): void {
    this.paneManager.requestLayoutSync();
  }

  hideContextMenu(): void {
    this.paneManager.hideContextMenu();
  }

  async use(plugin: ResttyPlugin, options?: unknown): Promise<void> {
    if (!plugin || typeof plugin !== "object") {
      throw new Error("Restty plugin must be an object");
    }
    const pluginId = plugin.id?.trim?.() ?? "";
    if (!pluginId) {
      throw new Error("Restty plugin id is required");
    }
    if (typeof plugin.activate !== "function") {
      throw new Error(`Restty plugin ${pluginId} must define activate(context)`);
    }
    if (this.pluginRuntimes.has(pluginId)) return;
    try {
      assertPluginCompatibility(pluginId, plugin, RESTTY_PLUGIN_API_VERSION);
    } catch (error) {
      this.pluginDiagnostics.set(pluginId, {
        id: pluginId,
        version: plugin.version?.trim?.() || null,
        apiVersion: Number.isFinite(plugin.apiVersion) ? Number(plugin.apiVersion) : null,
        requires: plugin.requires ?? null,
        active: false,
        activatedAt: null,
        lastError: errorToMessage(error),
      });
      throw error;
    }

    const runtime: ResttyPluginRuntime = {
      plugin: normalizePluginMetadata(plugin, pluginId),
      cleanup: null,
      activatedAt: Date.now(),
      options,
      disposers: [],
    };
    this.pluginDiagnostics.set(pluginId, {
      id: pluginId,
      version: runtime.plugin.version?.trim?.() || null,
      apiVersion: Number.isFinite(runtime.plugin.apiVersion)
        ? Number(runtime.plugin.apiVersion)
        : null,
      requires: runtime.plugin.requires ?? null,
      active: false,
      activatedAt: null,
      lastError: null,
    });
    this.pluginRuntimes.set(pluginId, runtime);
    try {
      const cleanup = await runtime.plugin.activate(
        this.createPluginContext(runtime),
        runtime.options,
      );
      runtime.cleanup = normalizePluginCleanup(cleanup);
      runtime.activatedAt = Date.now();
      this.updatePluginDiagnostic(pluginId, {
        active: true,
        activatedAt: runtime.activatedAt,
        lastError: null,
      });
      this.emitPluginEvent("plugin:activated", { pluginId });
    } catch (error) {
      this.teardownPluginRuntime(runtime);
      this.pluginRuntimes.delete(pluginId);
      this.updatePluginDiagnostic(pluginId, {
        active: false,
        activatedAt: null,
        lastError: errorToMessage(error),
      });
      throw error;
    }
  }

  async loadPlugins(
    manifest: ReadonlyArray<ResttyPluginManifestEntry>,
    registry: ResttyPluginRegistry,
  ): Promise<ResttyPluginLoadResult[]> {
    const results: ResttyPluginLoadResult[] = [];
    for (let i = 0; i < manifest.length; i += 1) {
      const item = manifest[i];
      const pluginId = item.id?.trim?.() ?? "";
      if (!pluginId) {
        results.push({
          id: "",
          status: "failed",
          error: "Restty plugin manifest entry is missing id",
        });
        continue;
      }
      if (item.enabled === false) {
        results.push({ id: pluginId, status: "skipped", error: null });
        continue;
      }

      const entry = lookupPluginRegistryEntry(registry, pluginId);
      if (!entry) {
        const message = `Restty plugin ${pluginId} was not found in registry`;
        this.setPluginLoadError(pluginId, message);
        results.push({ id: pluginId, status: "missing", error: message });
        continue;
      }

      let plugin: ResttyPlugin;
      try {
        plugin = await resolvePluginRegistryEntry(entry);
      } catch (error) {
        const message = errorToMessage(error);
        this.setPluginLoadError(pluginId, message);
        results.push({ id: pluginId, status: "failed", error: message });
        continue;
      }

      const resolvedId = plugin.id?.trim?.() ?? "";
      if (resolvedId !== pluginId) {
        const message = `Restty plugin registry entry ${pluginId} resolved to id ${resolvedId || "(empty)"}`;
        this.setPluginLoadError(pluginId, message);
        results.push({ id: pluginId, status: "failed", error: message });
        continue;
      }

      try {
        await this.use(plugin, item.options);
        results.push({ id: pluginId, status: "loaded", error: null });
      } catch (error) {
        results.push({
          id: pluginId,
          status: "failed",
          error: errorToMessage(error),
        });
      }
    }
    return results;
  }

  unuse(pluginId: string): boolean {
    const key = pluginId?.trim?.() ?? "";
    if (!key) return false;
    const runtime = this.pluginRuntimes.get(key);
    if (!runtime) return false;
    this.pluginRuntimes.delete(key);
    this.teardownPluginRuntime(runtime);
    this.updatePluginDiagnostic(key, {
      active: false,
      activatedAt: null,
    });
    this.emitPluginEvent("plugin:deactivated", { pluginId: key });
    return true;
  }

  plugins(): string[] {
    return Array.from(this.pluginRuntimes.keys());
  }

  pluginInfo(pluginId: string): ResttyPluginInfo | null;
  pluginInfo(): ResttyPluginInfo[];
  pluginInfo(pluginId?: string): ResttyPluginInfo | ResttyPluginInfo[] | null {
    if (typeof pluginId === "string") {
      const key = pluginId.trim();
      if (!key) return null;
      return this.buildPluginInfo(key);
    }
    const keys = new Set<string>();
    for (const key of this.pluginDiagnostics.keys()) keys.add(key);
    for (const key of this.pluginRuntimes.keys()) keys.add(key);
    return Array.from(keys)
      .sort((a, b) => a.localeCompare(b))
      .map((key) => this.buildPluginInfo(key))
      .filter((entry): entry is ResttyPluginInfo => entry !== null);
  }

  destroy(): void {
    const pluginIds = this.plugins();
    for (let i = 0; i < pluginIds.length; i += 1) {
      this.unuse(pluginIds[i]);
    }
    this.globalShaderStages.clear();
    this.paneBaseShaderStages.clear();
    this.paneManager.destroy();
  }

  connectPty(url = ""): void {
    const pane = this.requireActivePaneHandle();
    this.runLifecycleHooks({
      phase: "before",
      action: "connect-pty",
      paneId: pane.id,
    });
    pane.connectPty(url);
    this.runLifecycleHooks({
      phase: "after",
      action: "connect-pty",
      paneId: pane.id,
      ok: true,
    });
  }

  disconnectPty(): void {
    const pane = this.requireActivePaneHandle();
    this.runLifecycleHooks({
      phase: "before",
      action: "disconnect-pty",
      paneId: pane.id,
    });
    pane.disconnectPty();
    this.runLifecycleHooks({
      phase: "after",
      action: "disconnect-pty",
      paneId: pane.id,
      ok: true,
    });
  }

  isPtyConnected(): boolean {
    return this.requireActivePaneHandle().isPtyConnected();
  }

  setRenderer(value: "auto" | "webgpu" | "webgl2"): void {
    this.requireActivePaneHandle().setRenderer(value);
  }

  setPaused(value: boolean): void {
    this.requireActivePaneHandle().setPaused(value);
  }

  togglePause(): void {
    this.requireActivePaneHandle().togglePause();
  }

  setFontSize(value: number): void {
    this.requireActivePaneHandle().setFontSize(value);
  }

  applyTheme(theme: GhosttyTheme, sourceLabel?: string): void {
    this.requireActivePaneHandle().applyTheme(theme, sourceLabel);
  }

  resetTheme(): void {
    this.requireActivePaneHandle().resetTheme();
  }

  sendInput(text: string, source?: string): void {
    this.requireActivePaneHandle().sendInput(text, source);
  }

  sendKeyInput(text: string, source?: string): void {
    this.requireActivePaneHandle().sendKeyInput(text, source);
  }

  clearScreen(): void {
    this.requireActivePaneHandle().clearScreen();
  }

  setMouseMode(value: MouseMode): void {
    this.requireActivePaneHandle().setMouseMode(value);
  }

  getMouseStatus(): ReturnType<InputHandler["getMouseStatus"]> {
    return this.requireActivePaneHandle().getMouseStatus();
  }

  copySelectionToClipboard(): Promise<boolean> {
    return this.requireActivePaneHandle().copySelectionToClipboard();
  }

  pasteFromClipboard(): Promise<boolean> {
    return this.requireActivePaneHandle().pasteFromClipboard();
  }

  dumpAtlasForCodepoint(cp: number): void {
    this.requireActivePaneHandle().dumpAtlasForCodepoint(cp);
  }

  resize(cols: number, rows: number): void {
    const pane = this.requireActivePaneHandle();
    this.runLifecycleHooks({
      phase: "before",
      action: "resize",
      paneId: pane.id,
      cols,
      rows,
    });
    pane.resize(cols, rows);
    this.runLifecycleHooks({
      phase: "after",
      action: "resize",
      paneId: pane.id,
      cols,
      rows,
      ok: true,
    });
    this.emitPluginEvent("pane:resized", { paneId: pane.id, cols, rows });
  }

  focus(): void {
    const pane = this.requireActivePaneHandle();
    this.runLifecycleHooks({
      phase: "before",
      action: "focus",
      paneId: pane.id,
    });
    pane.focus();
    this.runLifecycleHooks({
      phase: "after",
      action: "focus",
      paneId: pane.id,
      ok: true,
    });
    this.emitPluginEvent("pane:focused", { paneId: pane.id });
  }

  blur(): void {
    const pane = this.requireActivePaneHandle();
    this.runLifecycleHooks({
      phase: "before",
      action: "blur",
      paneId: pane.id,
    });
    pane.blur();
    this.runLifecycleHooks({
      phase: "after",
      action: "blur",
      paneId: pane.id,
      ok: true,
    });
    this.emitPluginEvent("pane:blurred", { paneId: pane.id });
  }

  updateSize(force?: boolean): void {
    this.requireActivePaneHandle().updateSize(force);
  }

  getBackend(): string {
    return this.requireActivePaneHandle().getBackend();
  }

  private addGlobalShaderStage(
    stage: ResttyShaderStage,
    ownerPluginId: string | null,
  ): ResttyRenderStageHandle {
    const normalized = normalizeShaderStage(stage);
    this.globalShaderStages.set(normalized.id, {
      id: normalized.id,
      stage: normalized,
      order: this.nextShaderStageOrder++,
      ownerPluginId,
    });
    this.syncPaneShaderStages();
    return {
      id: normalized.id,
      setUniforms: (uniforms: number[]) => {
        const current = this.globalShaderStages.get(normalized.id);
        if (!current) return;
        const next = normalizeShaderStage({
          ...current.stage,
          uniforms,
        });
        this.globalShaderStages.set(normalized.id, {
          ...current,
          stage: next,
        });
        this.syncPaneShaderStages();
      },
      setEnabled: (value: boolean) => {
        const current = this.globalShaderStages.get(normalized.id);
        if (!current) return;
        const next = normalizeShaderStage({
          ...current.stage,
          enabled: Boolean(value),
        });
        this.globalShaderStages.set(normalized.id, {
          ...current,
          stage: next,
        });
        this.syncPaneShaderStages();
      },
      dispose: () => {
        this.removeShaderStage(normalized.id);
      },
    };
  }

  private listGlobalShaderStages(): ResttyManagedShaderStage[] {
    return Array.from(this.globalShaderStages.values()).sort((a, b) => a.order - b.order);
  }

  private normalizePaneShaderStages(
    stages: ResttyShaderStage[] | undefined,
    paneId: number,
  ): ResttyShaderStage[] {
    if (!stages?.length) return [];
    try {
      return sortShaderStages(normalizeShaderStages(stages));
    } catch (error) {
      console.warn(`[restty shader-stage] invalid pane stage config for pane ${paneId}:`, error);
      return [];
    }
  }

  private buildMergedShaderStages(baseStages: ResttyShaderStage[]): ResttyShaderStage[] {
    const merged = new Map<string, ResttyShaderStage>();
    for (let i = 0; i < baseStages.length; i += 1) {
      const stage = baseStages[i];
      merged.set(stage.id, stage);
    }
    const globals = this.listGlobalShaderStages();
    for (let i = 0; i < globals.length; i += 1) {
      const stage = globals[i].stage;
      if (merged.has(stage.id)) merged.delete(stage.id);
      merged.set(stage.id, stage);
    }
    return sortShaderStages(Array.from(merged.values()));
  }

  private syncPaneShaderStages(paneId?: number): void {
    const panes: ResttyManagedAppPane[] = [];
    if (paneId === undefined) {
      panes.push(...this.getPanes());
    } else {
      const pane = this.getPaneById(paneId);
      if (pane) panes.push(pane);
    }
    for (let i = 0; i < panes.length; i += 1) {
      const pane = panes[i];
      const base = this.paneBaseShaderStages.get(pane.id) ?? [];
      pane.app.setShaderStages(this.buildMergedShaderStages(base));
    }
  }

  private makePaneHandle(id: number): ResttyPaneHandle {
    return new ResttyPaneHandle(() => this.requirePaneById(id));
  }

  private requirePaneById(id: number): ResttyManagedAppPane {
    const pane = this.getPaneById(id);
    if (!pane) throw new Error(`Restty pane ${id} does not exist`);
    return pane;
  }

  private requireActivePaneHandle(): ResttyPaneHandle {
    const pane = this.getActivePane();
    if (!pane) {
      throw new Error("Restty has no active pane. Create or focus a pane first.");
    }
    return this.makePaneHandle(pane.id);
  }

  private createPluginContext(runtime: ResttyPluginRuntime): ResttyPluginContext {
    return {
      restty: this,
      options: runtime.options,
      panes: () => this.panes(),
      pane: (id: number) => this.pane(id),
      activePane: () => this.activePane(),
      focusedPane: () => this.focusedPane(),
      on: <E extends keyof ResttyPluginEvents>(
        event: E,
        listener: (payload: ResttyPluginEvents[E]) => void,
      ) => {
        return {
          dispose: this.attachRuntimeDisposer(
            runtime,
            "event",
            this.onPluginEvent(event, listener),
          ),
        };
      },
      addInputInterceptor: (interceptor, options) => {
        return {
          dispose: this.attachRuntimeDisposer(
            runtime,
            "input-interceptor",
            this.addInputInterceptor(runtime.plugin.id, interceptor, options),
          ),
        };
      },
      addOutputInterceptor: (interceptor, options) => {
        return {
          dispose: this.attachRuntimeDisposer(
            runtime,
            "output-interceptor",
            this.addOutputInterceptor(runtime.plugin.id, interceptor, options),
          ),
        };
      },
      addLifecycleHook: (hook, options) => {
        return {
          dispose: this.attachRuntimeDisposer(
            runtime,
            "lifecycle-hook",
            this.addLifecycleHook(runtime.plugin.id, hook, options),
          ),
        };
      },
      addRenderHook: (hook, options) => {
        return {
          dispose: this.attachRuntimeDisposer(
            runtime,
            "render-hook",
            this.addRenderHook(runtime.plugin.id, hook, options),
          ),
        };
      },
      addRenderStage: (stage) => {
        const rawId = stage?.id?.trim?.() ?? "";
        if (!rawId) {
          throw new Error(`Restty plugin ${runtime.plugin.id} render stage id is required`);
        }
        const stageId = `${runtime.plugin.id}:${rawId}`;
        const normalized = normalizeShaderStage({ ...stage, id: stageId });
        const handle = this.addGlobalShaderStage(normalized, runtime.plugin.id);
        return {
          ...handle,
          dispose: this.attachRuntimeDisposer(runtime, "render-stage", handle.dispose),
        };
      },
    };
  }

  private attachRuntimeDisposer(
    runtime: ResttyPluginRuntime,
    kind: ResttyPluginRuntimeDisposerKind,
    dispose: () => void,
  ): () => void {
    return attachRuntimeDisposer(runtime, kind, dispose);
  }

  private addInputInterceptor(
    pluginId: string,
    interceptor: ResttyInputInterceptor,
    options?: ResttyInterceptorOptions,
  ): () => void {
    return this.registerInterceptor(this.inputInterceptors, pluginId, interceptor, options);
  }

  private addOutputInterceptor(
    pluginId: string,
    interceptor: ResttyOutputInterceptor,
    options?: ResttyInterceptorOptions,
  ): () => void {
    return this.registerInterceptor(this.outputInterceptors, pluginId, interceptor, options);
  }

  private addLifecycleHook(
    pluginId: string,
    hook: ResttyLifecycleHook,
    options?: ResttyInterceptorOptions,
  ): () => void {
    return this.registerInterceptor(this.lifecycleHooks, pluginId, hook, options);
  }

  private addRenderHook(
    pluginId: string,
    hook: ResttyRenderHook,
    options?: ResttyInterceptorOptions,
  ): () => void {
    return this.registerInterceptor(this.renderHooks, pluginId, hook, options);
  }

  private registerInterceptor<T extends (payload: unknown) => string | null | void>(
    bucket: Array<ResttyRegisteredInterceptor<T>>,
    pluginId: string,
    interceptor: T,
    options?: ResttyInterceptorOptions,
  ): () => void {
    const result = registerPluginInterceptor(bucket, pluginId, interceptor, options, {
      nextId: this.nextInterceptorId,
      nextOrder: this.nextInterceptorOrder,
    });
    this.nextInterceptorId = result.nextId;
    this.nextInterceptorOrder = result.nextOrder;
    return result.dispose;
  }

  private applyInputInterceptors(paneId: number, text: string, source: string): string | null {
    return this.applyInterceptors(this.inputInterceptors, "input", { paneId, text, source });
  }

  private applyOutputInterceptors(paneId: number, text: string, source: string): string | null {
    return this.applyInterceptors(this.outputInterceptors, "output", { paneId, text, source });
  }

  private runLifecycleHooks(payload: ResttyLifecycleHookPayload): void {
    this.runHooks(this.lifecycleHooks, "lifecycle", payload);
  }

  private runRenderHooks(payload: ResttyRenderHookPayload): void {
    this.runHooks(this.renderHooks, "render", payload);
  }

  private applyInterceptors<TPayload extends { text: string }>(
    bucket: Array<ResttyRegisteredInterceptor<(payload: TPayload) => string | null | void>>,
    kind: "input" | "output",
    payload: TPayload,
  ): string | null {
    return applyPluginInterceptors(bucket, kind, payload);
  }

  private runHooks<TPayload>(
    bucket: Array<ResttyRegisteredInterceptor<(payload: TPayload) => void>>,
    kind: "lifecycle" | "render",
    payload: TPayload,
  ): void {
    runPluginHooks(bucket, kind, payload);
  }

  private setPluginLoadError(pluginId: string, message: string): void {
    setPluginLoadError(this.pluginDiagnostics, pluginId, message);
  }

  private updatePluginDiagnostic(
    pluginId: string,
    patch: Partial<Pick<ResttyPluginDiagnostic, "active" | "activatedAt" | "lastError">>,
  ): void {
    patchPluginDiagnostic(this.pluginDiagnostics, pluginId, patch);
  }

  private buildPluginInfo(pluginId: string): ResttyPluginInfo | null {
    return buildPluginInfo(pluginId, this.pluginDiagnostics, this.pluginRuntimes);
  }

  private onPluginEvent<E extends keyof ResttyPluginEvents>(
    event: E,
    listener: (payload: ResttyPluginEvents[E]) => void,
  ): () => void {
    return onPluginEvent(this.pluginListeners, event, listener);
  }

  private emitPluginEvent<E extends keyof ResttyPluginEvents>(
    event: E,
    payload: ResttyPluginEvents[E],
  ): void {
    emitPluginEvent(this.pluginListeners, event, payload);
  }

  private teardownPluginRuntime(runtime: ResttyPluginRuntime): void {
    teardownPluginRuntime(runtime);
  }
}

/** Create a new Restty instance with the given options. */
export function createRestty(options: ResttyOptions): Restty {
  return new Restty(options);
}
