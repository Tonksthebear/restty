import type {
  PtyCallbacks,
  PtyConnectionState,
  PtyConnectOptions,
  PtyLifecycleState,
  PtyMessage,
  PtyResizeMeta,
  PtyServerMessage,
  PtyTransport,
} from "./types";

/** Create a fresh idle PTY connection state. */
export function createPtyConnection(): PtyConnectionState {
  return {
    socket: null,
    status: "idle",
    url: "",
    connectId: 0,
  };
}

function setConnectionStatus(state: PtyConnectionState, status: PtyLifecycleState): void {
  state.status = status;
}

/**
 * Open a WebSocket connection to a PTY server. Returns false if the
 * connection is already active or the URL is empty.
 */
export function connectPty(
  state: PtyConnectionState,
  options: Pick<PtyConnectOptions, "url" | "cols" | "rows">,
  callbacks: PtyCallbacks,
): boolean {
  if (state.status === "connecting" || state.status === "connected" || state.status === "closing") {
    return false;
  }

  const url = options.url?.trim?.() ?? "";
  if (!url) return false;

  const ws = new WebSocket(url);
  const connectId = state.connectId + 1;
  state.connectId = connectId;
  state.url = url;
  state.socket = ws;
  setConnectionStatus(state, "connecting");
  ws.binaryType = "arraybuffer";

  let disconnectedNotified = false;
  const notifyDisconnected = () => {
    if (disconnectedNotified) return;
    disconnectedNotified = true;
    callbacks.onDisconnect?.();
  };

  const clearCurrentSocket = () => {
    if (state.connectId !== connectId) return;
    if (state.socket === ws) {
      state.socket = null;
    }
    setConnectionStatus(state, "idle");
  };

  ws.addEventListener("open", () => {
    if (state.connectId !== connectId) {
      try {
        ws.close();
      } catch {
        // ignore stale connection close errors
      }
      return;
    }
    if (state.socket !== ws) return;
    setConnectionStatus(state, "connected");
    callbacks.onConnect?.();
    if (Number.isFinite(options.cols) && Number.isFinite(options.rows)) {
      const cols = Math.max(0, Number(options.cols));
      const rows = Math.max(0, Number(options.rows));
      sendPtyResize(state, cols, rows);
    }
  });

  ws.addEventListener("close", () => {
    clearCurrentSocket();
    notifyDisconnected();
  });

  ws.addEventListener("error", () => {
    clearCurrentSocket();
    notifyDisconnected();
  });

  ws.addEventListener("message", (event) => {
    if (state.connectId !== connectId || state.socket !== ws) return;
    const payload = event.data;

    if (payload instanceof ArrayBuffer) {
      const bytes = new Uint8Array(payload);
      if (bytes.length) callbacks.onData?.(bytes);
      return;
    }

    if (payload instanceof Blob) {
      payload.arrayBuffer().then((buf) => {
        if (state.connectId !== connectId || state.socket !== ws) return;
        const bytes = new Uint8Array(buf);
        if (bytes.length) callbacks.onData?.(bytes);
      });
      return;
    }

    if (typeof payload === "string") {
      if (handleServerMessage(payload, callbacks)) return;
      callbacks.onData?.(payload);
    }
  });

  return true;
}

/** Gracefully close the PTY WebSocket connection and reset state to idle. */
export function disconnectPty(state: PtyConnectionState): void {
  const socket = state.socket;
  if (!socket) {
    setConnectionStatus(state, "idle");
    return;
  }

  setConnectionStatus(state, "closing");
  if (socket) {
    try {
      if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
        socket.close();
      } else {
        if (state.socket === socket) {
          state.socket = null;
        }
        setConnectionStatus(state, "idle");
      }
    } catch {
      // Ignore close errors
      if (state.socket === socket) {
        state.socket = null;
      }
      setConnectionStatus(state, "idle");
    }
  }
}

/** Send terminal input data to the PTY server. Returns false if the socket is not open. */
export function sendPtyInput(state: PtyConnectionState, data: string): boolean {
  if (!state.socket || state.socket.readyState !== WebSocket.OPEN) return false;
  const message: PtyMessage = { type: "input", data };
  state.socket.send(JSON.stringify(message));
  return true;
}

/** Send a resize notification to the PTY server. Returns false if the socket is not open. */
export function sendPtyResize(
  state: PtyConnectionState,
  cols: number,
  rows: number,
  meta?: PtyResizeMeta,
): boolean {
  if (!state.socket || state.socket.readyState !== WebSocket.OPEN) return false;
  const message: PtyMessage = { type: "resize", cols, rows };
  if (meta) {
    if (Number.isFinite(meta.widthPx)) message.widthPx = Math.max(0, Number(meta.widthPx));
    if (Number.isFinite(meta.heightPx)) message.heightPx = Math.max(0, Number(meta.heightPx));
    if (Number.isFinite(meta.cellW)) message.cellW = Math.max(0, Number(meta.cellW));
    if (Number.isFinite(meta.cellH)) message.cellH = Math.max(0, Number(meta.cellH));
  }
  state.socket.send(JSON.stringify(message));
  return true;
}

function handleServerMessage(payload: string, callbacks: PtyCallbacks): boolean {
  try {
    const msg = JSON.parse(payload) as PtyServerMessage;

    if (msg.type === "status") {
      callbacks.onStatus?.(msg.shell ?? "");
      return true;
    }

    if (msg.type === "error") {
      callbacks.onError?.(msg.message ?? "", msg.errors);
      return true;
    }

    if (msg.type === "exit") {
      callbacks.onExit?.(msg.code ?? 0);
      return true;
    }
  } catch {
    // Not JSON, treat as data
  }
  return false;
}

/** Check whether the PTY WebSocket is currently open and connected. */
export function isPtyConnected(state: PtyConnectionState): boolean {
  return state.status === "connected" && state.socket?.readyState === WebSocket.OPEN;
}

/** Create a PtyTransport backed by a WebSocket connection. */
export function createWebSocketPtyTransport(
  state: PtyConnectionState = createPtyConnection(),
): PtyTransport {
  return {
    connect: (options: PtyConnectOptions) => {
      const url = options.url?.trim?.() ?? "";
      if (!url) {
        throw new Error("PTY URL is required for WebSocket transport");
      }
      const connected = connectPty(state, options, options.callbacks);
      if (!connected && state.status !== "connected") {
        throw new Error(`PTY connection is busy (${state.status})`);
      }
    },
    disconnect: () => {
      disconnectPty(state);
    },
    sendInput: (data: string) => {
      return sendPtyInput(state, data);
    },
    resize: (cols: number, rows: number, meta?: PtyResizeMeta) => {
      return sendPtyResize(state, cols, rows, meta);
    },
    isConnected: () => {
      return isPtyConnected(state);
    },
    destroy: () => {
      disconnectPty(state);
    },
  };
}
