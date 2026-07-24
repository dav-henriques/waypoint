/**
 * Place.js — a remembered location.
 * The factory exists so every record in the database has an identical shape,
 * which is what lets export, import, search and sync stay dumb.
 */

import { placeId } from "../utils/id.js";
import { todayISO } from "../utils/format.js";

export function createPlace(input = {}) {
  const now = new Date().toISOString();
  return {
    id: input.id || placeId(),
    title: input.title?.trim() || "",
    description: input.description?.trim() || "",
    lat: Number(input.lat),
    lng: Number(input.lng),
    address: input.address || "",
    categoryId: input.categoryId || "cat_other",
    color: input.color || null,     // null = inherit from the category
    glyph: input.glyph || null,     // null = inherit from the category
    tags: normaliseTags(input.tags),
    photos: input.photos || [],     // photo ids, ordered
    coverPhoto: input.coverPhoto || null,
    favorite: !!input.favorite,
    visited: input.visited !== undefined ? !!input.visited : true,
    date: input.date || todayISO(), // when it happened, not when it was typed
    notes: input.notes || "",
    collectionIds: input.collectionIds || [],
    createdAt: input.createdAt || now,
    updatedAt: input.updatedAt || now,
    rev: input.rev || 1,
  };
}

export function normaliseTags(tags) {
  if (!tags) return [];
  const list = Array.isArray(tags) ? tags : String(tags).split(/[,\n]/);
  const seen = new Set();
  const out = [];
  for (const raw of list) {
    const t = String(raw).trim().replace(/^#/, "").slice(0, 32);
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out.slice(0, 24);
}

export function touchPlace(place, patch = {}) {
  return {
    ...place,
    ...patch,
    tags: patch.tags !== undefined ? normaliseTags(patch.tags) : place.tags,
    updatedAt: new Date().toISOString(),
    rev: (place.rev || 1) + 1,
  };
}

/** Everything a place can be matched on, flattened once for cheap searching. */
export function searchCorpus(place, category) {
  return [
    place.title,
    place.description,
    place.address,
    place.notes,
    category?.name,
    ...(place.tags || []),
  ]
    .filter(Boolean)
    .join(" ");
}

export const isValidPlace = (p) =>
  p &&
  Number.isFinite(Number(p.lat)) &&
  Number.isFinite(Number(p.lng)) &&
  Math.abs(p.lat) <= 90 &&
  Math.abs(p.lng) <= 180;
