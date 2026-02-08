export type PtyMessage =
  | { type: "input"; data: string }
  | { type: "resize"; cols: number; rows: number };

export type PtyStatusMessage = { type: "status"; shell?: string };
export type PtyErrorMessage = { type: "error"; message?: string; errors?: string[] };
export type PtyExitMessage = { type: "exit"; code?: number };

export type PtyServerMessage = PtyStatusMessage | PtyErrorMessage | PtyExitMessage;

export type PtyLifecycleState = "idle" | "connecting" | "connected" | "closing";

export type PtyConnectionState = {
  socket: WebSocket | null;
  status: PtyLifecycleState;
  url: string;
  decoder: TextDecoder | null;
  connectId: number;
};

export type PtyCallbacks = {
  onConnect?: () => void;
  onDisconnect?: () => void;
  onData?: (data: string) => void;
  onStatus?: (shell: string) => void;
  onError?: (message: string, errors?: string[]) => void;
  onExit?: (code: number) => void;
};

export type PtyConnectOptions = {
  url: string;
  cols?: number;
  rows?: number;
  callbacks: PtyCallbacks;
};

export type PtyTransport = {
  connect: (options: PtyConnectOptions) => void | Promise<void>;
  disconnect: () => void;
  sendInput: (data: string) => boolean;
  resize: (cols: number, rows: number) => boolean;
  isConnected: () => boolean;
  destroy?: () => void | Promise<void>;
};
