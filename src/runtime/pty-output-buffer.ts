export type CreatePtyOutputBufferControllerOptions = {
  idleMs: number;
  maxMs: number;
  onFlush: (text: string) => void;
  onFlushBytes?: (data: Uint8Array) => void;
};

export type PtyOutputBufferController = {
  queue: (text: string) => void;
  queueBytes: (data: Uint8Array) => void;
  flush: () => void;
  cancel: () => void;
  clear: () => void;
};

function concatBytes(chunks: Uint8Array[]): Uint8Array {
  let total = 0;
  for (const c of chunks) total += c.length;
  const result = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    result.set(c, offset);
    offset += c.length;
  }
  return result;
}

export function createPtyOutputBufferController(
  options: CreatePtyOutputBufferControllerOptions,
): PtyOutputBufferController {
  const { idleMs, maxMs, onFlush, onFlushBytes } = options;
  let buffer = "";
  let byteChunks: Uint8Array[] = [];
  let bytesLen = 0;
  let idleTimer = 0;
  let maxTimer = 0;

  const cancel = () => {
    if (idleTimer) {
      clearTimeout(idleTimer);
      idleTimer = 0;
    }
    if (maxTimer) {
      clearTimeout(maxTimer);
      maxTimer = 0;
    }
  };

  const flush = () => {
    const textOutput = buffer;
    buffer = "";
    const pendingBytes = bytesLen > 0 ? byteChunks : null;
    byteChunks = [];
    bytesLen = 0;
    cancel();
    if (textOutput) onFlush(textOutput);
    if (pendingBytes && onFlushBytes) {
      onFlushBytes(pendingBytes.length === 1 ? pendingBytes[0] : concatBytes(pendingBytes));
    }
  };

  const scheduleFlush = () => {
    if (idleTimer) {
      clearTimeout(idleTimer);
    }
    idleTimer = setTimeout(() => {
      idleTimer = 0;
      if (maxTimer) {
        clearTimeout(maxTimer);
        maxTimer = 0;
      }
      flush();
    }, idleMs);

    if (!maxTimer) {
      maxTimer = setTimeout(() => {
        maxTimer = 0;
        if (idleTimer) {
          clearTimeout(idleTimer);
          idleTimer = 0;
        }
        flush();
      }, maxMs);
    }
  };

  const queue = (text: string) => {
    if (!text) return;
    buffer += text;
    scheduleFlush();
  };

  const queueBytes = (data: Uint8Array) => {
    if (!data.length) return;
    byteChunks.push(data);
    bytesLen += data.length;
    scheduleFlush();
  };

  const clear = () => {
    buffer = "";
    byteChunks = [];
    bytesLen = 0;
  };

  return {
    queue,
    queueBytes,
    flush,
    cancel,
    clear,
  };
}
