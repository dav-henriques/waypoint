/**
 * sync.js — the seam where a backend will attach.
 *
 * Nothing here talks to a network today, and that is the point: the shape is
 * fixed now, while it is free to fix. Every record already carries `updatedAt`
 * and `rev`, deletions already leave tombstones, and IDs are already minted
 * client-side and globally unique. What remains for cloud sync is an adapter
 * that implements the interface below plus an auth provider — no changes to
 * the store, the models, or a single view.
 *
 *   const adapter = {
 *     name: "firebase",
 *     signIn(), signOut(), currentUser(),
 *     pull(since) -> { places, categories, collections, tombstones, cursor },
 *     push(changes) -> { cursor },
 *   }
 *
 * The merge rule is last-write-wins on `updatedAt`, which store.mergeIn()
 * already implements. That is deliberately the simplest correct policy for
 * single-user, multi-device data; anything smarter would be speculative.
 */

import { createEmitter } from "../utils/events.js";
import * as store from "./store.js";

const emitter = createEmitter();
export const onSyncEvent = emitter.on.bind(emitter);

let adapter = null;
let status = "off"; // off | idle | syncing | error
let lastSyncedAt = null;
let lastError = null;

export function registerAdapter(next) {
  adapter = next;
  status = adapter ? "idle" : "off";
  emitter.emit("status", getStatus());
}

export function getStatus() {
  return {
    status,
    provider: adapter?.name || null,
    lastSyncedAt,
    lastError,
    available: !!adapter,
    user: adapter?.currentUser?.() || null,
  };
}

export async function signIn() {
  if (!adapter) throw new Error("Cloud sync is not configured yet");
  const user = await adapter.signIn();
  emitter.emit("status", getStatus());
  return user;
}

export async function signOut() {
  if (!adapter) return;
  await adapter.signOut();
  emitter.emit("status", getStatus());
}

/** Pull remote changes, merge, push local ones. Safe to call repeatedly. */
export async function sync() {
  if (!adapter) return { skipped: true };
  status = "syncing";
  lastError = null;
  emitter.emit("status", getStatus());

  try {
    const cursor = localStorage.getItem("memory-map.syncCursor") || null;
    const remote = await adapter.pull(cursor);
    if (remote) {
      await store.mergeIn({
        places: remote.places || [],
        categories: remote.categories || [],
        collections: remote.collections || [],
      });
    }

    const local = store.snapshot();
    const result = await adapter.push({
      places: local.places,
      categories: local.categories,
      collections: local.collections,
    });

    if (result?.cursor) localStorage.setItem("memory-map.syncCursor", result.cursor);
    lastSyncedAt = new Date().toISOString();
    status = "idle";
    emitter.emit("status", getStatus());
    return { ok: true };
  } catch (err) {
    status = "error";
    lastError = err.message || String(err);
    emitter.emit("status", getStatus());
    return { ok: false, error: lastError };
  }
}
