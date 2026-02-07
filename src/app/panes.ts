import type { ResttyApp } from "./types";

export type ResttyPaneSplitDirection = "vertical" | "horizontal";

export type ResttyPaneContextMenuItem = {
  label: string;
  shortcut?: string;
  enabled?: boolean;
  danger?: boolean;
  action: () => void | Promise<void>;
};

export type ResttyPaneDefinition = {
  id: number;
  container: HTMLDivElement;
  focusTarget?: HTMLElement | null;
};

export type ResttyPaneShortcutsOptions = {
  enabled?: boolean;
  canHandleEvent?: (event: KeyboardEvent) => boolean;
  isAllowedInputTarget?: (target: HTMLElement) => boolean;
};

export type ResttyPaneContextMenuOptions<TPane extends ResttyPaneDefinition> = {
  canOpen?: (event: MouseEvent, pane: TPane) => boolean;
  getItems: (
    pane: TPane,
    manager: ResttyPaneManager<TPane>,
  ) => Array<ResttyPaneContextMenuItem | "separator">;
};

export type ResttyPaneStyleOptions = {
  splitBackground?: string;
  paneBackground?: string;
  inactivePaneOpacity?: number;
  activePaneOpacity?: number;
  opacityTransitionMs?: number;
  dividerThicknessPx?: number;
};

export type ResttyPaneStylesOptions = ResttyPaneStyleOptions & {
  enabled?: boolean;
};

export type CreateResttyPaneManagerOptions<TPane extends ResttyPaneDefinition> = {
  root: HTMLElement;
  createPane: (context: {
    id: number;
    sourcePane: TPane | null;
    manager: ResttyPaneManager<TPane>;
  }) => TPane;
  destroyPane?: (pane: TPane) => void;
  onPaneCreated?: (pane: TPane) => void;
  onPaneClosed?: (pane: TPane) => void;
  onPaneSplit?: (
    sourcePane: TPane,
    createdPane: TPane,
    direction: ResttyPaneSplitDirection,
  ) => void;
  onActivePaneChange?: (pane: TPane | null) => void;
  onLayoutChanged?: () => void;
  minPaneSize?: number;
  contextMenu?: ResttyPaneContextMenuOptions<TPane> | null;
  shortcuts?: boolean | ResttyPaneShortcutsOptions;
  styles?: boolean | ResttyPaneStylesOptions;
};

export type ResttyPaneManager<TPane extends ResttyPaneDefinition> = {
  getPanes: () => TPane[];
  getPaneById: (id: number) => TPane | null;
  getActivePane: () => TPane | null;
  getFocusedPane: () => TPane | null;
  createInitialPane: (options?: { focus?: boolean }) => TPane;
  setActivePane: (id: number, options?: { focus?: boolean }) => void;
  markPaneFocused: (id: number, options?: { focus?: boolean }) => void;
  splitPane: (id: number, direction: ResttyPaneSplitDirection) => TPane | null;
  splitActivePane: (direction: ResttyPaneSplitDirection) => TPane | null;
  closePane: (id: number) => boolean;
  getStyleOptions: () => Readonly<Required<ResttyPaneStyleOptions>>;
  setStyleOptions: (options: ResttyPaneStyleOptions) => void;
  requestLayoutSync: () => void;
  hideContextMenu: () => void;
  destroy: () => void;
};

type SplitResizeState = {
  pointerId: number;
  axis: "x" | "y";
  divider: HTMLDivElement;
  first: HTMLElement;
  second: HTMLElement;
  startCoord: number;
  startFirst: number;
  total: number;
};

const RESTTY_PANE_ROOT_CLASS = "restty-pane-root";
const RESTTY_PANE_STYLE_MARKER = "data-restty-pane-styles";
const RESTTY_PANE_STYLE_TEXT = `
.${RESTTY_PANE_ROOT_CLASS} {
  display: flex;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
}

.${RESTTY_PANE_ROOT_CLASS} .pane-split {
  display: flex;
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  gap: 0;
  padding: 0;
  background: var(--restty-pane-split-background, #111);
}

.${RESTTY_PANE_ROOT_CLASS} .pane-split.is-vertical {
  flex-direction: row;
}

.${RESTTY_PANE_ROOT_CLASS} .pane-split.is-horizontal {
  flex-direction: column;
}

.${RESTTY_PANE_ROOT_CLASS} .pane {
  position: relative;
  flex: 1 1 0;
  min-width: 0;
  min-height: 0;
  background: var(--restty-pane-background, #000);
  border: 0;
  overflow: hidden;
  opacity: var(--restty-pane-inactive-opacity, 0.82);
  transition: opacity var(--restty-pane-opacity-transition, 140ms) ease-out;
}

.${RESTTY_PANE_ROOT_CLASS} .pane.is-active {
  opacity: var(--restty-pane-active-opacity, 1);
}

.${RESTTY_PANE_ROOT_CLASS} .pane-divider {
  position: relative;
  z-index: 2;
  flex: 0 0 var(--restty-pane-divider-thickness, 1px);
  touch-action: none;
}

.${RESTTY_PANE_ROOT_CLASS} .pane-divider.is-vertical {
  cursor: col-resize;
  background: transparent;
}

.${RESTTY_PANE_ROOT_CLASS} .pane-divider.is-horizontal {
  cursor: row-resize;
  background: transparent;
}

.${RESTTY_PANE_ROOT_CLASS} .pane-divider.is-vertical:hover,
.${RESTTY_PANE_ROOT_CLASS} .pane-divider.is-vertical.is-dragging {
  background:
    radial-gradient(
      100px 46% at 50% 50%,
      rgba(235, 235, 235, 0.92) 0%,
      rgba(200, 200, 200, 0.48) 46%,
      rgba(155, 155, 155, 0.12) 68%,
      rgba(120, 120, 120, 0) 100%
    ),
    rgba(185, 185, 185, 0.24);
}

.${RESTTY_PANE_ROOT_CLASS} .pane-divider.is-horizontal:hover,
.${RESTTY_PANE_ROOT_CLASS} .pane-divider.is-horizontal.is-dragging {
  background:
    radial-gradient(
      46% 100px at 50% 50%,
      rgba(235, 235, 235, 0.92) 0%,
      rgba(200, 200, 200, 0.48) 46%,
      rgba(155, 155, 155, 0.12) 68%,
      rgba(120, 120, 120, 0) 100%
    ),
    rgba(185, 185, 185, 0.24);
}

body.is-resizing-split {
  user-select: none;
}

.${RESTTY_PANE_ROOT_CLASS} .pane-canvas {
  width: 100%;
  height: 100%;
  display: block;
  outline: none;
}

.${RESTTY_PANE_ROOT_CLASS} .pane-ime-input {
  position: fixed;
  left: 0;
  top: 0;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
}

.${RESTTY_PANE_ROOT_CLASS} .pane-term-debug {
  display: none;
}

.pane-context-menu {
  position: fixed;
  z-index: 9999;
  min-width: 200px;
  padding: 6px;
  border: 1px solid #2a2a2a;
  border-radius: 8px;
  background: #161616;
  box-shadow: 0 14px 40px rgba(0, 0, 0, 0.45);
}

.pane-context-menu-item {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 7px 9px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: #d6d6d6;
  text-align: left;
  cursor: pointer;
}

.pane-context-menu-item:hover {
  background: #252525;
}

.pane-context-menu-item:disabled {
  opacity: 0.4;
  cursor: default;
}

.pane-context-menu-item.is-danger {
  color: #f1a1a1;
}

.pane-context-menu-label {
  font-size: 12px;
}

.pane-context-menu-shortcut {
  font-size: 10px;
  color: #868686;
}

.pane-context-menu-separator {
  height: 1px;
  margin: 6px 4px;
  background: #2a2a2a;
}
`;
const DEFAULT_RESTTY_PANE_STYLE_OPTIONS: Required<ResttyPaneStyleOptions> = {
  splitBackground: "#111",
  paneBackground: "#000",
  inactivePaneOpacity: 0.82,
  activePaneOpacity: 1,
  opacityTransitionMs: 140,
  dividerThicknessPx: 1,
};

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function normalizeColor(value: string | undefined, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  return trimmed ? trimmed : fallback;
}

function normalizePaneStyleOptions(
  options: ResttyPaneStyleOptions,
): Required<ResttyPaneStyleOptions> {
  const inactivePaneOpacity = Number.isFinite(options.inactivePaneOpacity)
    ? clampNumber(Number(options.inactivePaneOpacity), 0, 1)
    : DEFAULT_RESTTY_PANE_STYLE_OPTIONS.inactivePaneOpacity;
  const activePaneOpacity = Number.isFinite(options.activePaneOpacity)
    ? clampNumber(Number(options.activePaneOpacity), 0, 1)
    : DEFAULT_RESTTY_PANE_STYLE_OPTIONS.activePaneOpacity;
  const opacityTransitionMs = Number.isFinite(options.opacityTransitionMs)
    ? clampNumber(Number(options.opacityTransitionMs), 0, 5000)
    : DEFAULT_RESTTY_PANE_STYLE_OPTIONS.opacityTransitionMs;
  const dividerThicknessPx = Number.isFinite(options.dividerThicknessPx)
    ? clampNumber(Number(options.dividerThicknessPx), 1, 32)
    : DEFAULT_RESTTY_PANE_STYLE_OPTIONS.dividerThicknessPx;
  return {
    splitBackground: normalizeColor(
      options.splitBackground,
      DEFAULT_RESTTY_PANE_STYLE_OPTIONS.splitBackground,
    ),
    paneBackground: normalizeColor(
      options.paneBackground,
      DEFAULT_RESTTY_PANE_STYLE_OPTIONS.paneBackground,
    ),
    inactivePaneOpacity,
    activePaneOpacity,
    opacityTransitionMs,
    dividerThicknessPx,
  };
}

function ensureResttyPaneStylesDocument(doc: Document): void {
  if (doc.querySelector(`style[${RESTTY_PANE_STYLE_MARKER}="1"]`)) return;
  const style = doc.createElement("style");
  style.setAttribute(RESTTY_PANE_STYLE_MARKER, "1");
  style.textContent = RESTTY_PANE_STYLE_TEXT;
  doc.head.appendChild(style);
}

function applyPaneStyleOptionsToRoot(
  root: HTMLElement,
  options: Readonly<Required<ResttyPaneStyleOptions>>,
): void {
  root.classList.add(RESTTY_PANE_ROOT_CLASS);
  root.style.setProperty("--restty-pane-split-background", options.splitBackground);
  root.style.setProperty("--restty-pane-background", options.paneBackground);
  root.style.setProperty("--restty-pane-inactive-opacity", options.inactivePaneOpacity.toFixed(3));
  root.style.setProperty("--restty-pane-active-opacity", options.activePaneOpacity.toFixed(3));
  root.style.setProperty("--restty-pane-opacity-transition", `${options.opacityTransitionMs}ms`);
  root.style.setProperty("--restty-pane-divider-thickness", `${options.dividerThicknessPx}px`);
}

function clearPaneStyleOptionsFromRoot(root: HTMLElement): void {
  root.classList.remove(RESTTY_PANE_ROOT_CLASS);
  root.style.removeProperty("--restty-pane-split-background");
  root.style.removeProperty("--restty-pane-background");
  root.style.removeProperty("--restty-pane-inactive-opacity");
  root.style.removeProperty("--restty-pane-active-opacity");
  root.style.removeProperty("--restty-pane-opacity-transition");
  root.style.removeProperty("--restty-pane-divider-thickness");
}

export type ResttyPaneWithApp = ResttyPaneDefinition & {
  app: ResttyApp;
  paused?: boolean;
  setPaused?: (value: boolean) => void;
};

export type CreateDefaultResttyPaneContextMenuItemsOptions<TPane extends ResttyPaneWithApp> = {
  pane: TPane;
  manager: Pick<ResttyPaneManager<TPane>, "splitPane" | "closePane" | "getPanes">;
  modKeyLabel?: string;
  getPtyUrl?: () => string | null | undefined;
};

export function getResttyShortcutModifierLabel(): "Cmd" | "Ctrl" {
  const isMac = typeof navigator !== "undefined" && /mac/i.test(navigator.platform);
  return isMac ? "Cmd" : "Ctrl";
}

export function createDefaultResttyPaneContextMenuItems<TPane extends ResttyPaneWithApp>(
  options: CreateDefaultResttyPaneContextMenuItemsOptions<TPane>,
): Array<ResttyPaneContextMenuItem | "separator"> {
  const { pane, manager, getPtyUrl } = options;
  const mod = options.modKeyLabel ?? getResttyShortcutModifierLabel();
  const closeEnabled = manager.getPanes().length > 1;
  const pauseLabel =
    typeof pane.paused === "boolean"
      ? pane.paused
        ? "Resume Renderer"
        : "Pause Renderer"
      : "Toggle Renderer Pause";

  return [
    {
      label: "Copy",
      shortcut: `${mod}+C`,
      action: async () => {
        await pane.app.copySelectionToClipboard();
      },
    },
    {
      label: "Paste",
      shortcut: `${mod}+V`,
      action: async () => {
        await pane.app.pasteFromClipboard();
      },
    },
    "separator",
    {
      label: "Split Right",
      shortcut: `${mod}+D`,
      action: () => {
        manager.splitPane(pane.id, "vertical");
      },
    },
    {
      label: "Split Down",
      shortcut: `${mod}+Shift+D`,
      action: () => {
        manager.splitPane(pane.id, "horizontal");
      },
    },
    {
      label: "Close Pane",
      enabled: closeEnabled,
      danger: true,
      action: () => {
        manager.closePane(pane.id);
      },
    },
    "separator",
    {
      label: "Clear Screen",
      action: () => {
        pane.app.clearScreen();
      },
    },
    {
      label: pane.app.isPtyConnected() ? "Disconnect PTY" : "Connect PTY",
      action: () => {
        if (pane.app.isPtyConnected()) {
          pane.app.disconnectPty();
          return;
        }
        const url = (getPtyUrl?.() ?? "").trim();
        pane.app.connectPty(url);
      },
    },
    {
      label: pauseLabel,
      action: () => {
        if (typeof pane.setPaused === "function") {
          pane.setPaused(!(pane.paused ?? false));
          return;
        }
        pane.app.togglePause();
      },
    },
  ];
}

export function createResttyPaneManager<TPane extends ResttyPaneDefinition>(
  options: CreateResttyPaneManagerOptions<TPane>,
): ResttyPaneManager<TPane> {
  const { root, createPane } = options;
  if (!(root instanceof HTMLElement)) {
    throw new Error("createResttyPaneManager requires a root HTMLElement");
  }

  const panes = new Map<number, TPane>();
  const paneCleanupFns = new Map<number, Array<() => void>>();
  const minPaneSize = Number.isFinite(options.minPaneSize)
    ? Math.max(24, Number(options.minPaneSize))
    : 96;
  const shortcutOptions: ResttyPaneShortcutsOptions =
    typeof options.shortcuts === "object"
      ? options.shortcuts
      : { enabled: options.shortcuts !== false };
  const stylesInput =
    typeof options.styles === "object" && options.styles ? options.styles : undefined;
  const stylesEnabled = options.styles === false ? false : (stylesInput?.enabled ?? true);
  let styleOptions = normalizePaneStyleOptions({
    ...DEFAULT_RESTTY_PANE_STYLE_OPTIONS,
    ...stylesInput,
  });

  if (stylesEnabled) {
    const doc = root.ownerDocument ?? document;
    ensureResttyPaneStylesDocument(doc);
    applyPaneStyleOptionsToRoot(root, styleOptions);
  }

  let nextPaneId = 1;
  let activePaneId: number | null = null;
  let focusedPaneId: number | null = null;
  let resizeRaf = 0;
  let splitResizeState: SplitResizeState | null = null;

  const contextMenuEl = options.contextMenu ? document.createElement("div") : null;
  if (contextMenuEl) {
    contextMenuEl.className = "pane-context-menu";
    contextMenuEl.hidden = true;
    document.body.appendChild(contextMenuEl);
  }

  const requestLayoutSync = () => {
    if (resizeRaf) return;
    resizeRaf = requestAnimationFrame(() => {
      resizeRaf = 0;
      options.onLayoutChanged?.();
    });
  };

  const getStyleOptions = (): Readonly<Required<ResttyPaneStyleOptions>> => ({
    ...styleOptions,
  });

  const setStyleOptions = (next: ResttyPaneStyleOptions) => {
    styleOptions = normalizePaneStyleOptions({
      ...styleOptions,
      ...next,
    });
    if (!stylesEnabled) return;
    applyPaneStyleOptionsToRoot(root, styleOptions);
  };

  const getPanes = () => Array.from(panes.values());

  const getPaneById = (id: number): TPane | null => {
    return panes.get(id) ?? null;
  };

  const findPaneByElement = (element: Element | null): TPane | null => {
    if (!(element instanceof HTMLElement)) return null;
    const host = element.closest(".pane");
    if (!host) return null;
    const id = Number(host.dataset.paneId ?? "");
    if (!Number.isFinite(id)) return null;
    return panes.get(id) ?? null;
  };

  const getActivePane = (): TPane | null => {
    if (activePaneId === null) return null;
    return panes.get(activePaneId) ?? null;
  };

  const getFocusedPane = (): TPane | null => {
    if (focusedPaneId !== null) {
      const focused = panes.get(focusedPaneId);
      if (focused) return focused;
    }
    if (typeof document === "undefined") return null;
    return findPaneByElement(document.activeElement);
  };

  const setActivePane = (id: number, config?: { focus?: boolean }) => {
    const pane = panes.get(id);
    if (!pane) return;
    activePaneId = id;
    for (const current of panes.values()) {
      current.container.classList.toggle("is-active", current.id === id);
    }
    options.onActivePaneChange?.(pane);
    if (config?.focus) {
      const target = pane.focusTarget ?? pane.container;
      if (target instanceof HTMLElement) {
        target.focus({ preventScroll: true });
      }
    }
  };

  const markPaneFocused = (id: number, config?: { focus?: boolean }) => {
    focusedPaneId = id;
    setActivePane(id, config);
  };

  const getSplitBranches = (split: HTMLElement): HTMLElement[] => {
    const branches: HTMLElement[] = [];
    for (const child of Array.from(split.children)) {
      if (!(child instanceof HTMLElement)) continue;
      if (child.classList.contains("pane-divider")) continue;
      branches.push(child);
    }
    return branches;
  };

  const getRectEdgeDistanceSquared = (
    sourceRect: DOMRectReadOnly,
    targetRect: DOMRectReadOnly,
  ): number => {
    const dx = Math.max(targetRect.left - sourceRect.right, sourceRect.left - targetRect.right, 0);
    const dy = Math.max(targetRect.top - sourceRect.bottom, sourceRect.top - targetRect.bottom, 0);
    return dx ** 2 + dy ** 2;
  };

  const getRectCenterDistanceSquared = (
    sourceRect: DOMRectReadOnly,
    targetRect: DOMRectReadOnly,
  ): number => {
    const sourceCenterX = sourceRect.left + sourceRect.width * 0.5;
    const sourceCenterY = sourceRect.top + sourceRect.height * 0.5;
    const targetCenterX = targetRect.left + targetRect.width * 0.5;
    const targetCenterY = targetRect.top + targetRect.height * 0.5;
    const dx = targetCenterX - sourceCenterX;
    const dy = targetCenterY - sourceCenterY;
    return dx ** 2 + dy ** 2;
  };

  const findClosestPaneToRect = (sourceRect: DOMRectReadOnly | null): TPane | null => {
    if (!sourceRect) return null;
    let closestPane: TPane | null = null;
    let closestEdgeDistance = Number.POSITIVE_INFINITY;
    let closestCenterDistance = Number.POSITIVE_INFINITY;
    for (const candidate of panes.values()) {
      const targetRect = candidate.container.getBoundingClientRect();
      const edgeDistance = getRectEdgeDistanceSquared(sourceRect, targetRect);
      const centerDistance = getRectCenterDistanceSquared(sourceRect, targetRect);
      if (
        edgeDistance < closestEdgeDistance ||
        (edgeDistance === closestEdgeDistance && centerDistance < closestCenterDistance)
      ) {
        closestPane = candidate;
        closestEdgeDistance = edgeDistance;
        closestCenterDistance = centerDistance;
      }
    }
    return closestPane;
  };

  const hideContextMenu = () => {
    if (!contextMenuEl) return;
    contextMenuEl.hidden = true;
    contextMenuEl.innerHTML = "";
  };

  const addContextMenuSeparator = () => {
    if (!contextMenuEl) return;
    const separator = document.createElement("div");
    separator.className = "pane-context-menu-separator";
    contextMenuEl.appendChild(separator);
  };

  const renderContextMenu = (items: Array<ResttyPaneContextMenuItem | "separator">) => {
    if (!contextMenuEl) return;
    contextMenuEl.innerHTML = "";
    for (const item of items) {
      if (item === "separator") {
        addContextMenuSeparator();
        continue;
      }
      const button = document.createElement("button");
      button.type = "button";
      button.className = "pane-context-menu-item";
      if (item.danger) button.classList.add("is-danger");
      if (item.enabled === false) button.disabled = true;

      const label = document.createElement("span");
      label.className = "pane-context-menu-label";
      label.textContent = item.label;
      button.appendChild(label);

      if (item.shortcut) {
        const shortcut = document.createElement("span");
        shortcut.className = "pane-context-menu-shortcut";
        shortcut.textContent = item.shortcut;
        button.appendChild(shortcut);
      }

      button.addEventListener("click", () => {
        hideContextMenu();
        void item.action();
      });
      contextMenuEl.appendChild(button);
    }
  };

  const showContextMenu = (pane: TPane, clientX: number, clientY: number) => {
    if (!contextMenuEl || !options.contextMenu) return;
    const items = options.contextMenu.getItems(pane, api);
    renderContextMenu(items);
    contextMenuEl.hidden = false;

    const margin = 8;
    const rect = contextMenuEl.getBoundingClientRect();
    const maxX = Math.max(margin, window.innerWidth - rect.width - margin);
    const maxY = Math.max(margin, window.innerHeight - rect.height - margin);
    const left = Math.min(Math.max(clientX, margin), maxX);
    const top = Math.min(Math.max(clientY, margin), maxY);
    contextMenuEl.style.left = `${left}px`;
    contextMenuEl.style.top = `${top}px`;
  };

  const bindPaneInteractions = (pane: TPane) => {
    const cleanupFns: Array<() => void> = [];
    const { id, container } = pane;

    const onPointerDown = () => {
      markPaneFocused(id);
    };
    container.addEventListener("pointerdown", onPointerDown);
    cleanupFns.push(() => {
      container.removeEventListener("pointerdown", onPointerDown);
    });

    const focusTarget = pane.focusTarget;
    if (focusTarget) {
      const onFocus = () => {
        markPaneFocused(id);
      };
      focusTarget.addEventListener("focus", onFocus);
      cleanupFns.push(() => {
        focusTarget.removeEventListener("focus", onFocus);
      });
    }

    if (options.contextMenu) {
      const onContextMenu = (event: MouseEvent) => {
        if (options.contextMenu?.canOpen && !options.contextMenu.canOpen(event, pane)) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        markPaneFocused(id);
        showContextMenu(pane, event.clientX, event.clientY);
      };
      container.addEventListener("contextmenu", onContextMenu);
      cleanupFns.push(() => {
        container.removeEventListener("contextmenu", onContextMenu);
      });
    }

    paneCleanupFns.set(id, cleanupFns);
  };

  const createSplitDivider = (direction: ResttyPaneSplitDirection): HTMLDivElement => {
    const divider = document.createElement("div");
    divider.className = `pane-divider ${direction === "vertical" ? "is-vertical" : "is-horizontal"}`;
    divider.setAttribute("role", "separator");
    divider.setAttribute("aria-orientation", direction === "vertical" ? "vertical" : "horizontal");

    const onPointerMove = (event: PointerEvent) => {
      const state = splitResizeState;
      if (!state || event.pointerId !== state.pointerId) return;
      event.preventDefault();

      const coord = state.axis === "x" ? event.clientX : event.clientY;
      const delta = coord - state.startCoord;
      const maxFirst = Math.max(minPaneSize, state.total - minPaneSize);
      const nextFirst = Math.min(maxFirst, Math.max(minPaneSize, state.startFirst + delta));
      const nextSecond = Math.max(minPaneSize, state.total - nextFirst);
      const firstPercent = (nextFirst / (nextFirst + nextSecond)) * 100;
      const secondPercent = 100 - firstPercent;
      state.first.style.flex = `0 0 ${firstPercent.toFixed(5)}%`;
      state.second.style.flex = `0 0 ${secondPercent.toFixed(5)}%`;
      requestLayoutSync();
    };

    const endResize = () => {
      if (!splitResizeState) return;
      splitResizeState.divider.classList.remove("is-dragging");
      document.body.classList.remove("is-resizing-split");
      splitResizeState = null;
    };

    const onPointerEnd = (event: PointerEvent) => {
      if (!splitResizeState || event.pointerId !== splitResizeState.pointerId) return;
      try {
        divider.releasePointerCapture(splitResizeState.pointerId);
      } catch {
        // ignore capture release errors
      }
      divider.removeEventListener("pointermove", onPointerMove);
      divider.removeEventListener("pointerup", onPointerEnd);
      divider.removeEventListener("pointercancel", onPointerEnd);
      endResize();
    };

    divider.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      const first = divider.previousElementSibling as HTMLElement | null;
      const second = divider.nextElementSibling as HTMLElement | null;
      const split = divider.parentElement as HTMLElement | null;
      if (!first || !second || !split) return;

      const splitRect = split.getBoundingClientRect();
      const firstRect = first.getBoundingClientRect();
      const axis: "x" | "y" = direction === "vertical" ? "x" : "y";
      const total = axis === "x" ? splitRect.width : splitRect.height;
      if (total <= 0) return;

      endResize();
      event.preventDefault();
      event.stopPropagation();

      splitResizeState = {
        pointerId: event.pointerId,
        axis,
        divider,
        first,
        second,
        startCoord: axis === "x" ? event.clientX : event.clientY,
        startFirst: axis === "x" ? firstRect.width : firstRect.height,
        total,
      };

      divider.classList.add("is-dragging");
      document.body.classList.add("is-resizing-split");
      divider.setPointerCapture(event.pointerId);
      divider.addEventListener("pointermove", onPointerMove);
      divider.addEventListener("pointerup", onPointerEnd);
      divider.addEventListener("pointercancel", onPointerEnd);
    });

    return divider;
  };

  const createPaneInternal = (sourcePane: TPane | null): TPane => {
    const id = nextPaneId;
    nextPaneId += 1;

    const pane = createPane({ id, sourcePane, manager: api });
    if (pane.id !== id) {
      throw new Error(`createResttyPaneManager expected pane.id=${id}, received ${pane.id}`);
    }
    if (!(pane.container instanceof HTMLDivElement)) {
      throw new Error(
        "createResttyPaneManager createPane() must return { container: HTMLDivElement }",
      );
    }

    pane.container.classList.add("pane");
    pane.container.dataset.paneId = `${id}`;

    panes.set(id, pane);
    bindPaneInteractions(pane);
    options.onPaneCreated?.(pane);
    return pane;
  };

  const collapseSplitAncestors = (start: HTMLElement | null) => {
    let current = start;
    while (current && current.classList.contains("pane-split")) {
      const branches = getSplitBranches(current);
      if (branches.length > 1) return;
      const onlyChild = branches[0];
      const parent = current.parentElement;
      if (!parent || !onlyChild) return;
      const inheritedFlex = current.style.flex;
      if (inheritedFlex) {
        onlyChild.style.flex = inheritedFlex;
      } else {
        onlyChild.style.flex = "";
      }
      parent.replaceChild(onlyChild, current);
      current = parent;
    }
  };

  const splitPane = (id: number, direction: ResttyPaneSplitDirection): TPane | null => {
    const target = panes.get(id);
    if (!target) return null;
    const parent = target.container.parentElement;
    if (!parent) return null;

    const split = document.createElement("div");
    split.className = `pane-split ${direction === "vertical" ? "is-vertical" : "is-horizontal"}`;
    const inheritedFlex = target.container.style.flex;
    if (inheritedFlex) {
      split.style.flex = inheritedFlex;
    }

    parent.replaceChild(split, target.container);
    target.container.style.flex = "0 0 50%";
    split.appendChild(target.container);
    split.appendChild(createSplitDivider(direction));

    const created = createPaneInternal(target);
    created.container.style.flex = "0 0 50%";
    split.appendChild(created.container);

    markPaneFocused(created.id, { focus: true });
    requestLayoutSync();
    options.onPaneSplit?.(target, created, direction);
    return created;
  };

  const splitActivePane = (direction: ResttyPaneSplitDirection): TPane | null => {
    const target = getFocusedPane() ?? getActivePane();
    if (!target) return null;
    return splitPane(target.id, direction);
  };

  const closePane = (id: number): boolean => {
    if (panes.size <= 1) return false;
    const pane = panes.get(id);
    if (!pane) return false;
    const closingRect = pane.container.getBoundingClientRect();

    const cleanupFns = paneCleanupFns.get(id) ?? [];
    paneCleanupFns.delete(id);
    for (const cleanup of cleanupFns) {
      cleanup();
    }

    options.destroyPane?.(pane);
    panes.delete(id);
    if (activePaneId === id) activePaneId = null;
    if (focusedPaneId === id) focusedPaneId = null;

    const parent = pane.container.parentElement as HTMLElement | null;
    pane.container.remove();
    collapseSplitAncestors(parent);

    const fallback = getActivePane() ?? findClosestPaneToRect(closingRect) ?? getPanes()[0] ?? null;
    if (fallback) {
      markPaneFocused(fallback.id, { focus: true });
    } else {
      options.onActivePaneChange?.(null);
    }
    options.onPaneClosed?.(pane);
    requestLayoutSync();
    return true;
  };

  const createInitialPane = (config?: { focus?: boolean }): TPane => {
    if (panes.size) {
      return getPanes()[0] as TPane;
    }
    const first = createPaneInternal(null);
    root.appendChild(first.container);
    markPaneFocused(first.id, { focus: config?.focus !== false });
    requestLayoutSync();
    return first;
  };

  const onWindowPointerDown = (event: PointerEvent) => {
    if (!contextMenuEl || contextMenuEl.hidden) return;
    if (event.target instanceof Node && contextMenuEl.contains(event.target)) return;
    hideContextMenu();
  };

  const onWindowBlur = () => {
    hideContextMenu();
  };

  const onWindowKeyDown = (event: KeyboardEvent) => {
    if (contextMenuEl && !contextMenuEl.hidden && event.key === "Escape") {
      hideContextMenu();
      return;
    }

    if (shortcutOptions.enabled === false) return;
    if (shortcutOptions.canHandleEvent && !shortcutOptions.canHandleEvent(event)) {
      return;
    }

    const target = event.target as HTMLElement | null;
    if (target && ["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(target.tagName)) {
      const allowed = shortcutOptions.isAllowedInputTarget?.(target) ?? false;
      if (!allowed) return;
    }

    const isMac = typeof navigator !== "undefined" && /mac/i.test(navigator.platform);
    const hasCommandModifier = isMac ? event.metaKey : event.ctrlKey;
    if (!hasCommandModifier || event.altKey || event.code !== "KeyD" || event.repeat) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    splitActivePane(event.shiftKey ? "horizontal" : "vertical");
  };

  window.addEventListener("pointerdown", onWindowPointerDown);
  window.addEventListener("blur", onWindowBlur);
  window.addEventListener("keydown", onWindowKeyDown, { capture: true });

  const destroy = () => {
    window.removeEventListener("pointerdown", onWindowPointerDown);
    window.removeEventListener("blur", onWindowBlur);
    window.removeEventListener("keydown", onWindowKeyDown, { capture: true });

    if (resizeRaf) {
      cancelAnimationFrame(resizeRaf);
      resizeRaf = 0;
    }

    for (const pane of getPanes()) {
      const cleanupFns = paneCleanupFns.get(pane.id) ?? [];
      for (const cleanup of cleanupFns) {
        cleanup();
      }
      paneCleanupFns.delete(pane.id);
      options.destroyPane?.(pane);
    }
    panes.clear();
    activePaneId = null;
    focusedPaneId = null;
    root.replaceChildren();

    hideContextMenu();
    contextMenuEl?.remove();

    if (stylesEnabled) {
      clearPaneStyleOptionsFromRoot(root);
    }
  };

  const api: ResttyPaneManager<TPane> = {
    getPanes,
    getPaneById,
    getActivePane,
    getFocusedPane,
    createInitialPane,
    setActivePane,
    markPaneFocused,
    splitPane,
    splitActivePane,
    closePane,
    getStyleOptions,
    setStyleOptions,
    requestLayoutSync,
    hideContextMenu,
    destroy,
  };

  return api;
}
