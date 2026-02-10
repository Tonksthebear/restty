import type { InputHandler, MouseMode } from "../input";
import type { GhosttyTheme } from "../theme";
import type { ResttyManagedAppPane } from "./pane-app-manager";
import type { ResttyShaderStage } from "../runtime/types";

/**
 * Public API surface exposed by each pane handle.
 */
export type ResttyPaneApi = {
  id: number;
  setRenderer: (value: "auto" | "webgpu" | "webgl2") => void;
  setPaused: (value: boolean) => void;
  togglePause: () => void;
  setFontSize: (value: number) => void;
  applyTheme: (theme: GhosttyTheme, sourceLabel?: string) => void;
  resetTheme: () => void;
  sendInput: (text: string, source?: string) => void;
  sendKeyInput: (text: string, source?: string) => void;
  clearScreen: () => void;
  connectPty: (url?: string) => void;
  disconnectPty: () => void;
  isPtyConnected: () => boolean;
  setMouseMode: (value: MouseMode) => void;
  getMouseStatus: () => ReturnType<InputHandler["getMouseStatus"]>;
  copySelectionToClipboard: () => Promise<boolean>;
  pasteFromClipboard: () => Promise<boolean>;
  dumpAtlasForCodepoint: (cp: number) => void;
  resize: (cols: number, rows: number) => void;
  focus: () => void;
  blur: () => void;
  updateSize: (force?: boolean) => void;
  getBackend: () => string;
  setShaderStages: (stages: ResttyShaderStage[]) => void;
  getShaderStages: () => ResttyShaderStage[];
  getRawPane: () => ResttyManagedAppPane;
};

/**
 * Thin wrapper around a managed pane that delegates calls to the
 * underlying app. Resolves the pane lazily so it stays valid across
 * layout changes.
 */
export class ResttyPaneHandle implements ResttyPaneApi {
  private readonly resolvePane: () => ResttyManagedAppPane;

  constructor(resolvePane: () => ResttyManagedAppPane) {
    this.resolvePane = resolvePane;
  }

  get id(): number {
    return this.resolvePane().id;
  }

  setRenderer(value: "auto" | "webgpu" | "webgl2"): void {
    this.resolvePane().app.setRenderer(value);
  }

  setPaused(value: boolean): void {
    this.resolvePane().app.setPaused(value);
  }

  togglePause(): void {
    this.resolvePane().app.togglePause();
  }

  setFontSize(value: number): void {
    this.resolvePane().app.setFontSize(value);
  }

  applyTheme(theme: GhosttyTheme, sourceLabel?: string): void {
    this.resolvePane().app.applyTheme(theme, sourceLabel);
  }

  resetTheme(): void {
    this.resolvePane().app.resetTheme();
  }

  sendInput(text: string, source?: string): void {
    this.resolvePane().app.sendInput(text, source);
  }

  sendKeyInput(text: string, source?: string): void {
    this.resolvePane().app.sendKeyInput(text, source);
  }

  clearScreen(): void {
    this.resolvePane().app.clearScreen();
  }

  connectPty(url = ""): void {
    this.resolvePane().app.connectPty(url);
  }

  disconnectPty(): void {
    this.resolvePane().app.disconnectPty();
  }

  isPtyConnected(): boolean {
    return this.resolvePane().app.isPtyConnected();
  }

  setMouseMode(value: MouseMode): void {
    this.resolvePane().app.setMouseMode(value);
  }

  getMouseStatus(): ReturnType<InputHandler["getMouseStatus"]> {
    return this.resolvePane().app.getMouseStatus();
  }

  copySelectionToClipboard(): Promise<boolean> {
    return this.resolvePane().app.copySelectionToClipboard();
  }

  pasteFromClipboard(): Promise<boolean> {
    return this.resolvePane().app.pasteFromClipboard();
  }

  dumpAtlasForCodepoint(cp: number): void {
    this.resolvePane().app.dumpAtlasForCodepoint(cp);
  }

  resize(cols: number, rows: number): void {
    this.resolvePane().app.resize(cols, rows);
  }

  focus(): void {
    this.resolvePane().app.focus();
  }

  blur(): void {
    this.resolvePane().app.blur();
  }

  updateSize(force?: boolean): void {
    this.resolvePane().app.updateSize(force);
  }

  getBackend(): string {
    return this.resolvePane().app.getBackend();
  }

  setShaderStages(stages: ResttyShaderStage[]): void {
    this.resolvePane().app.setShaderStages(stages);
  }

  getShaderStages(): ResttyShaderStage[] {
    return this.resolvePane().app.getShaderStages();
  }

  getRawPane(): ResttyManagedAppPane {
    return this.resolvePane();
  }
}
