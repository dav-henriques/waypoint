/**
 * db.js — IndexedDB, wrapped just enough to be pleasant.
 *
 * IndexedDB is used rather than localStorage for one decisive reason: photos.
 * Blobs go in natively, without base64's 33% inflation, and there is no 5MB
 * ceiling to design around. Settings still live in localStorage, because they
 * need to be readable synchronously before the first paint.
 */

import { DB_NAME, DB_VERSION, STORE, DEFAULT_CATEGORIES } from "../models/schema.js";
import { createCategory } from "../models/Category.js";

let dbPromise = null;

function req(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export function openDB() {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const open = indexedDB.open(DB_NAME, DB_VERSION);

    open.onupgradeneeded = (event) => {
      const db = open.result;
      const from = event.oldVersion;

      // v1 — initial shape.
      if (from < 1) {
        const places = db.createObjectStore(STORE.places, { keyPath: "id" });
        places.createIndex("byCategory", "categoryId");
        places.createIndex("byUpdated", "updatedAt");
        places.createIndex("byDate", "date");
        places.createIndex("byFavorite", "favorite");

        db.createObjectStore(STORE.categories, { keyPath: "id" });

        const collections = db.createObjectStore(STORE.collections, { keyPath: "id" });
        collections.createIndex("byUpdated", "updatedAt");

        const photos = db.createObjectStore(STORE.photos, { keyPath: "id" });
        photos.createIndex("byPlace", "placeId");

        db.createObjectStore(STORE.tombstones, { keyPath: "id" });
        db.createObjectStore(STORE.meta, { keyPath: "key" });
      }

      // Future migrations append here as `if (from < 2) { ... }`. Never edit a
      // previous block — someone is already running it.
    };

    open.onsuccess = () => {
      const db = open.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };
    open.onerror = () => reject(open.error);
    open.onblocked = () => reject(new Error("Database upgrade blocked by another tab"));
  });

  return dbPromise;
}

async function tx(stores, mode, fn) {
  const db = await openDB();
  const names = Array.isArray(stores) ? stores : [stores];
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(names, mode);
    let result;
    transaction.oncomplete = () => resolve(result);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error || new Error("Transaction aborted"));
    Promise.resolve(
      fn(...names.map((n) => transaction.objectStore(n)), transaction)
    )
      .then((r) => { result = r; })
      .catch((err) => {
        try { transaction.abort(); } catch { /* already gone */ }
        reject(err);
      });
  });
}

export const getAll = (store, query, count) =>
  tx(store, "readonly", (s) => req(s.getAll(query, count)));

export const get = (store, key) => tx(store, "readonly", (s) => req(s.get(key)));

export const put = (store, value) =>
  tx(store, "readwrite", (s) => req(s.put(value)).then(() => value));

export const putMany = (store, values) =>
  tx(store, "readwrite", async (s) => {
    for (const v of values) await req(s.put(v));
    return values;
  });

export const del = (store, key) => tx(store, "readwrite", (s) => req(s.delete(key)));

export const clearStore = (store) => tx(store, "readwrite", (s) => req(s.clear()));

export const countAll = (store) => tx(store, "readonly", (s) => req(s.count()));

export const getByIndex = (store, index, value) =>
  tx(store, "readonly", (s) => req(s.index(index).getAll(value)));

/**
 * Soft delete. The record leaves its store, and a tombstone takes its place so
 * a future sync can propagate the deletion instead of resurrecting the row.
 */
export async function softDelete(store, id) {
  await tx([store, STORE.tombstones], "readwrite", async (s, t) => {
    await req(s.delete(id));
    await req(t.put({ id, store, deletedAt: new Date().toISOString() }));
  });
}

export async function seedIfEmpty() {
  const existing = await countAll(STORE.categories);
  if (existing > 0) return false;
  await putMany(STORE.categories, DEFAULT_CATEGORIES.map(createCategory));
  return true;
}

/** Approximate on-disk footprint, for the Settings screen. */
export async function estimateUsage() {
  if (navigator.storage?.estimate) {
    try {
      const { usage, quota } = await navigator.storage.estimate();
      return { usage: usage || 0, quota: quota || 0 };
    } catch { /* fall through */ }
  }
  return { usage: 0, quota: 0 };
}

/** Ask the browser not to evict us under storage pressure. */
export async function requestPersistence() {
  if (!navigator.storage?.persist) return false;
  try {
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

export async function wipeAll() {
  for (const store of Object.values(STORE)) await clearStore(store);
}
