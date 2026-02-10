/** Create the initial resize tracking state with default values. */
export function createResizeState(): {
  active: boolean;
  lastAt: number;
  cols: number;
  rows: number;
  dpr: number;
} {
  return {
    active: false,
    lastAt: 0,
    cols: 0,
    rows: 0,
    dpr: 1,
  };
}

/** Create the initial scrollbar position state with default values. */
export function createScrollbarState(): {
  lastInputAt: number;
  lastTotal: number;
  lastOffset: number;
  lastLen: number;
} {
  return {
    lastInputAt: 0,
    lastTotal: 0,
    lastOffset: 0,
    lastLen: 0,
  };
}
