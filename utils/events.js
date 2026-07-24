/**
 * events.js — the smallest emitter that is still pleasant to use.
 * Subscribing returns the unsubscribe function, so teardown is never forgotten.
 */

export function createEmitter() {
  const map = new Map();

  return {
    on(type, fn) {
      if (!map.has(type)) map.set(type, new Set());
      map.get(type).add(fn);
      return () => map.get(type)?.delete(fn);
    },
    once(type, fn) {
      const off = this.on(type, (...a) => {
        off();
        fn(...a);
      });
      return off;
    },
    emit(type, payload) {
      map.get(type)?.forEach((fn) => {
        try {
          fn(payload);
        } catch (err) {
          console.error(`[emitter] listener for "${type}" threw`, err);
        }
      });
      map.get("*")?.forEach((fn) => fn(type, payload));
    },
    clear(type) {
      if (type) map.delete(type);
      else map.clear();
    },
  };
}
