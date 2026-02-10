export type Listener<T> = (payload: T) => void;

export function addListener<T>(
  bucket: Set<Listener<T>>,
  listener: Listener<T>,
): { dispose: () => void } {
  bucket.add(listener);
  return {
    dispose: () => {
      bucket.delete(listener);
    },
  };
}

export function emitWithGuard<T>(
  bucket: Set<Listener<T>>,
  payload: T,
  label: "onData" | "onResize",
): void {
  const listeners = Array.from(bucket);
  for (let i = 0; i < listeners.length; i += 1) {
    try {
      listeners[i](payload);
    } catch (error) {
      console.error(`[restty/xterm] ${label} listener error:`, error);
    }
  }
}
