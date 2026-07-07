// Tiny pub/sub so FX and UI never import the controller.
// Events: 'jump' | 'land' | 'respawn' | 'win'
const listeners = new Map();

export function on(event, fn) {
  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event).add(fn);
}

export function emit(event, payload) {
  const set = listeners.get(event);
  if (set) for (const fn of set) fn(payload);
}
