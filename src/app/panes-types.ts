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
