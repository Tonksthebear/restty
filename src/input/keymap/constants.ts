import type { InputHandlerConfig } from "../types";

/**
 * Standard sequences used by terminal emulators.
 */
export const sequences = {
  enter: "\r",
  backspace: "\x7f",
  delete: "\x1b[3~",
  tab: "\t",
  shiftTab: "\x1b[Z",
  escape: "\x1b",
};

export const DEFAULT_CONFIG: Required<InputHandlerConfig> = {
  enableCtrlCombos: true,
};
