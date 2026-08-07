import type { InputHandler, MouseMode } from "../../input";
import type { GhosttyTheme } from "../../theme";
import type { ResttyPaneHandle } from "../restty-pane-handle";
import type {
  ResttyPaneSearchUiCloseOptions,
  ResttyPaneSearchUiOpenOptions,
} from "../pane-search-ui";
import type { ResttyManagedPaneSearchUiStyleOptions } from "../pane-app-manager";

export abstract class ResttyActivePaneApi {
  protected abstract requireActivePaneHandle(): ResttyPaneHandle;

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

  loadBinarySnapshot(data: Uint8Array): boolean {
    return this.requireActivePaneHandle().loadBinarySnapshot(data);
  }

  getColorForeground(): number | null {
    return this.requireActivePaneHandle().getColorForeground();
  }

  getColorBackground(): number | null {
    return this.requireActivePaneHandle().getColorBackground();
  }

  getColorCursor(): number | null {
    return this.requireActivePaneHandle().getColorCursor();
  }

  getPaletteColor(index: number): number | null {
    return this.requireActivePaneHandle().getPaletteColor(index);
  }

  getPalette(): Uint8Array | null {
    return this.requireActivePaneHandle().getPalette();
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

  openSearch(options?: ResttyPaneSearchUiOpenOptions): void {
    this.requireActivePaneHandle().openSearch(options);
  }

  closeSearch(options?: ResttyPaneSearchUiCloseOptions): void {
    this.requireActivePaneHandle().closeSearch(options);
  }

  toggleSearch(options?: ResttyPaneSearchUiOpenOptions & ResttyPaneSearchUiCloseOptions): void {
    this.requireActivePaneHandle().toggleSearch(options);
  }

  isSearchOpen(): boolean {
    return this.requireActivePaneHandle().isSearchOpen();
  }

  getSearchUiStyleOptions(): Readonly<Required<ResttyManagedPaneSearchUiStyleOptions>> {
    return this.requireActivePaneHandle().getSearchUiStyleOptions();
  }

  setSearchUiStyleOptions(options: ResttyManagedPaneSearchUiStyleOptions): void {
    this.requireActivePaneHandle().setSearchUiStyleOptions(options);
  }

  dumpAtlasForCodepoint(cp: number): void {
    this.requireActivePaneHandle().dumpAtlasForCodepoint(cp);
  }

  updateSize(force?: boolean): void {
    this.requireActivePaneHandle().updateSize(force);
  }

  getBackend(): string {
    return this.requireActivePaneHandle().getBackend();
  }
}
