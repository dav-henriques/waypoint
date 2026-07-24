/**
 * store.js — one in-memory copy of the truth, written through to IndexedDB.
 *
 * A personal archive is small: a thousand places is a rich lifetime of them,
 * and a thousand plain objects is nothing to hold in memory. So the whole set
 * is loaded once at boot and every read after that is synchronous. That single
 * decision is why lists, search and statistics render without a spinner, and
 * why no screen in this app has a loading state.
 *
 * Writes go to IndexedDB and then emit. Views subscribe and re-render.
 */

import { createEmitter } from "../utils/events.js";
import { normalise, haversine } from "../utils/format.js";
import * as db from "./db.js";
import { STORE, DEFAULT_SETTINGS, SETTINGS_KEY, colorHex } from "../models/schema.js";
import { createPlace, touchPlace, searchCorpus } from "../models/Place.js";
import { createCollection, touchCollection } from "../models/Collection.js";
import { createCategory, touchCategory } from "../models/Category.js";

const emitter = createEmitter();
export const on = emitter.on.bind(emitter);

const state = {
  places: new Map(),
  categories: new Map(),
  collections: new Map(),
  settings: { ...DEFAULT_SETTINGS },
  ready: false,
};

/* ---- Settings ---------------------------------------------------------- */
/* localStorage, deliberately: theme and map camera must be readable before the
   first frame, and awaiting IndexedDB there would cost a visible flash.      */

function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) state.settings = { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    state.settings = { ...DEFAULT_SETTINGS };
  }
}

export function getSetting(key) {
  return state.settings[key];
}

export function getSettings() {
  return { ...state.settings };
}

export function setSetting(key, value) {
  state.settings[key] = value;
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings));
  } catch { /* private mode; the app still works, it just forgets */ }
  emitter.emit("settings", { key, value });
  return value;
}

/* ---- Boot -------------------------------------------------------------- */

let bootPromise = null;

export function init() {
  if (bootPromise) return bootPromise;
  loadSettings();
  bootPromise = (async () => {
    await db.seedIfEmpty();
    const [places, categories, collections] = await Promise.all([
      db.getAll(STORE.places),
      db.getAll(STORE.categories),
      db.getAll(STORE.collections),
    ]);
    places.forEach((p) => state.places.set(p.id, p));
    categories.forEach((c) => state.categories.set(c.id, c));
    collections.forEach((c) => state.collections.set(c.id, c));
    state.ready = true;
    emitter.emit("ready");
    emitter.emit("change", { type: "boot" });
  })();
  return bootPromise;
}

export const isReady = () => state.ready;

/* ---- Reads ------------------------------------------------------------- */

export const allPlaces = () =>
  [...state.places.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

export const allCategories = () =>
  [...state.categories.values()].sort((a, b) => (a.order ?? 999) - (b.order ?? 999));

export const allCollections = () =>
  [...state.collections.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

export const getPlace = (id) => state.places.get(id) || null;
export const getCategory = (id) => state.categories.get(id) || null;
export const getCollection = (id) => state.collections.get(id) || null;

export const placeCount = () => state.places.size;

/** Colour a place actually renders with: own override, else its category's. */
export function placeColor(place) {
  if (!place) return colorHex("graphite");
  if (place.color) return colorHex(place.color);
  return colorHex(getCategory(place.categoryId)?.color || "graphite");
}

export function placeGlyph(place) {
  if (!place) return "pin";
  return place.glyph || getCategory(place.categoryId)?.glyph || "pin";
}

export function placesInCollection(collectionId) {
  const c = state.collections.get(collectionId);
  if (!c) return [];
  return c.placeIds.map((id) => state.places.get(id)).filter(Boolean);
}

export function collectionsForPlace(placeId) {
  return allCollections().filter((c) => c.placeIds.includes(placeId));
}

export const favorites = () => allPlaces().filter((p) => p.favorite);

export function placesInCategory(categoryId) {
  return allPlaces().filter((p) => p.categoryId === categoryId);
}

export function allTags() {
  const counts = new Map();
  for (const p of state.places.values()) {
    for (const t of p.tags || []) {
      const key = t.toLowerCase();
      const entry = counts.get(key) || { tag: t, count: 0 };
      entry.count++;
      counts.set(key, entry);
    }
  }
  return [...counts.values()].sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

/* ---- Search ------------------------------------------------------------ */
/* Substring matching over a normalised corpus, ranked so that a title hit
   always outranks a note hit. Diacritics are folded, so "cafe" finds "Café". */

export function search(query, { limit = 200 } = {}) {
  const q = normalise(query);
  if (!q) return [];
  const terms = q.split(/\s+/).filter(Boolean);
  const results = [];

  for (const place of state.places.values()) {
    const category = getCategory(place.categoryId);
    const title = normalise(place.title);
    const corpus = normalise(searchCorpus(place, category));
    if (!terms.every((t) => corpus.includes(t))) continue;

    let score = 0;
    for (const t of terms) {
      if (title.startsWith(t)) score += 100;
      else if (title.includes(t)) score += 60;
      if (normalise(category?.name).includes(t)) score += 24;
      if ((place.tags || []).some((tag) => normalise(tag).startsWith(t))) score += 30;
      if (normalise(place.address).includes(t)) score += 12;
    }
    if (place.favorite) score += 6;
    results.push({ place, score });
  }

  return results
    .sort((a, b) => b.score - a.score || b.place.createdAt.localeCompare(a.place.createdAt))
    .slice(0, limit)
    .map((r) => r.place);
}

export function nearby(origin, { limit = 20, maxDistance = Infinity } = {}) {
  return allPlaces()
    .map((p) => ({ place: p, distance: haversine(origin, p) }))
    .filter((r) => r.distance <= maxDistance)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, limit);
}

/* ---- Writes ------------------------------------------------------------ */

async function commit(store, record, event) {
  await db.put(store, record);
  emitter.emit("change", event);
  return record;
}

export async function savePlace(input) {
  const existing = input.id ? state.places.get(input.id) : null;
  const record = existing ? touchPlace(existing, input) : createPlace(input);
  state.places.set(record.id, record);
  return commit(STORE.places, record, {
    type: existing ? "place:update" : "place:create",
    id: record.id,
  });
}

export async function deletePlace(id) {
  const place = state.places.get(id);
  if (!place) return;
  state.places.delete(id);

  // Detach from every collection so no list renders a hole.
  for (const c of state.collections.values()) {
    if (!c.placeIds.includes(id)) continue;
    const next = touchCollection(c, { placeIds: c.placeIds.filter((p) => p !== id) });
    state.collections.set(c.id, next);
    await db.put(STORE.collections, next);
  }

  for (const photoId of place.photos || []) {
    await db.del(STORE.photos, photoId).catch(() => {});
  }

  await db.softDelete(STORE.places, id);
  emitter.emit("change", { type: "place:delete", id });
}

export async function toggleFavorite(id) {
  const place = state.places.get(id);
  if (!place) return null;
  return savePlace({ id, favorite: !place.favorite });
}

export async function saveCollection(input) {
  const existing = input.id ? state.collections.get(input.id) : null;
  const record = existing ? touchCollection(existing, input) : createCollection(input);
  state.collections.set(record.id, record);
  return commit(STORE.collections, record, {
    type: existing ? "collection:update" : "collection:create",
    id: record.id,
  });
}

export async function deleteCollection(id) {
  state.collections.delete(id);
  await db.softDelete(STORE.collections, id);
  emitter.emit("change", { type: "collection:delete", id });
}

export async function setPlaceInCollection(collectionId, placeId, member) {
  const c = state.collections.get(collectionId);
  if (!c) return null;
  const has = c.placeIds.includes(placeId);
  if (has === member) return c;
  const placeIds = member
    ? [...c.placeIds, placeId]
    : c.placeIds.filter((id) => id !== placeId);
  return saveCollection({ id: collectionId, placeIds });
}

export async function saveCategory(input) {
  const existing = input.id ? state.categories.get(input.id) : null;
  const record = existing ? touchCategory(existing, input) : createCategory(input);
  state.categories.set(record.id, record);
  return commit(STORE.categories, record, {
    type: existing ? "category:update" : "category:create",
    id: record.id,
  });
}

export async function deleteCategory(id) {
  if (state.categories.size <= 1) throw new Error("At least one category must remain");
  const fallback = [...state.categories.keys()].find((k) => k !== id);
  state.categories.delete(id);
  for (const p of state.places.values()) {
    if (p.categoryId !== id) continue;
    const next = touchPlace(p, { categoryId: fallback });
    state.places.set(p.id, next);
    await db.put(STORE.places, next);
  }
  await db.softDelete(STORE.categories, id);
  emitter.emit("change", { type: "category:delete", id });
}

export async function reorderCategories(ids) {
  const updates = ids.map((id, order) => {
    const next = touchCategory(state.categories.get(id), { order });
    state.categories.set(id, next);
    return next;
  });
  await db.putMany(STORE.categories, updates);
  emitter.emit("change", { type: "category:reorder" });
}

/* ---- Statistics -------------------------------------------------------- */

export function statistics() {
  const places = allPlaces();
  const now = new Date();
  const monthKey = (iso) => iso.slice(0, 7);
  const thisMonth = monthKey(now.toISOString());

  const byCategory = new Map();
  const cities = new Set();
  let photos = 0;
  let visited = 0;

  for (const p of places) {
    byCategory.set(p.categoryId, (byCategory.get(p.categoryId) || 0) + 1);
    photos += p.photos?.length || 0;
    if (p.visited) visited++;
    const city = cityFromAddress(p.address);
    if (city) cities.add(city);
  }

  const categoryBreakdown = [...byCategory.entries()]
    .map(([id, count]) => ({ category: getCategory(id), count }))
    .filter((c) => c.category)
    .sort((a, b) => b.count - a.count);

  // Twelve months of activity, oldest first — the shape of a year of walking.
  const months = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    months.push({
      key,
      label: d.toLocaleDateString("en-US", { month: "narrow" }),
      full: d.toLocaleDateString("en-US", { month: "long", year: "numeric" }),
      count: places.filter((p) => monthKey(p.date || p.createdAt) === key).length,
    });
  }

  const sortedByDate = [...places].sort((a, b) =>
    (a.date || a.createdAt).localeCompare(b.date || b.createdAt)
  );

  return {
    total: places.length,
    favorites: places.filter((p) => p.favorite).length,
    visited,
    unvisited: places.length - visited,
    photos,
    cities: cities.size,
    cityList: [...cities].sort(),
    collections: state.collections.size,
    tags: allTags().length,
    thisMonth: places.filter((p) => monthKey(p.date || p.createdAt) === thisMonth).length,
    topCategory: categoryBreakdown[0] || null,
    categoryBreakdown,
    months,
    oldest: sortedByDate[0] || null,
    newest: sortedByDate[sortedByDate.length - 1] || null,
  };
}

/** Best-effort city extraction from a free-form address string. */
export function cityFromAddress(address) {
  if (!address) return "";
  const parts = address.split(",").map((s) => s.trim()).filter(Boolean);
  if (parts.length < 2) return "";
  // Reverse geocoders put the country last and the city two or three from the
  // end; the second-from-last non-numeric part is right far more often than not.
  for (let i = parts.length - 2; i >= 0; i--) {
    const part = parts[i];
    if (!/^\d/.test(part) && part.length > 2) return part;
  }
  return "";
}

/* ---- Bulk (export / import / reset) ------------------------------------ */

export function snapshot() {
  return {
    places: allPlaces(),
    categories: allCategories(),
    collections: allCollections(),
    settings: getSettings(),
  };
}

export async function replaceAll({ places = [], categories = [], collections = [] }) {
  state.places.clear();
  state.categories.clear();
  state.collections.clear();
  places.forEach((p) => state.places.set(p.id, p));
  categories.forEach((c) => state.categories.set(c.id, c));
  collections.forEach((c) => state.collections.set(c.id, c));
  await db.clearStore(STORE.places);
  await db.clearStore(STORE.categories);
  await db.clearStore(STORE.collections);
  if (places.length) await db.putMany(STORE.places, places);
  if (categories.length) await db.putMany(STORE.categories, categories);
  if (collections.length) await db.putMany(STORE.collections, collections);
  emitter.emit("change", { type: "bulk" });
}

export async function mergeIn({ places = [], categories = [], collections = [] }) {
  for (const c of categories) if (!state.categories.has(c.id)) {
    state.categories.set(c.id, c);
    await db.put(STORE.categories, c);
  }
  for (const p of places) {
    const existing = state.places.get(p.id);
    // Last write wins — the same rule a future server will use.
    if (existing && existing.updatedAt >= p.updatedAt) continue;
    state.places.set(p.id, p);
    await db.put(STORE.places, p);
  }
  for (const c of collections) {
    const existing = state.collections.get(c.id);
    if (existing && existing.updatedAt >= c.updatedAt) continue;
    state.collections.set(c.id, c);
    await db.put(STORE.collections, c);
  }
  emitter.emit("change", { type: "bulk" });
}

export async function resetEverything() {
  state.places.clear();
  state.categories.clear();
  state.collections.clear();
  await db.wipeAll();
  await db.seedIfEmpty();
  (await db.getAll(STORE.categories)).forEach((c) => state.categories.set(c.id, c));
  emitter.emit("change", { type: "bulk" });
}
