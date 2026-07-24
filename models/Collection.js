/**
 * Collection.js — a hand-made grouping of places.
 *
 * Membership is stored on the collection, not derived from the place, because
 * the ordering within a collection is meaningful ("my route through Lisbon")
 * and a query result cannot carry that.
 */

import { collectionId } from "../utils/id.js";

export function createCollection(input = {}) {
  const now = new Date().toISOString();
  return {
    id: input.id || collectionId(),
    name: input.name?.trim() || "Untitled",
    description: input.description?.trim() || "",
    glyph: input.glyph || "folder",
    color: input.color || "sky",
    placeIds: input.placeIds || [],
    createdAt: input.createdAt || now,
    updatedAt: input.updatedAt || now,
    rev: input.rev || 1,
  };
}

export function touchCollection(collection, patch = {}) {
  return {
    ...collection,
    ...patch,
    updatedAt: new Date().toISOString(),
    rev: (collection.rev || 1) + 1,
  };
}

export const SUGGESTED_COLLECTIONS = [
  { name: "Best Coffee", glyph: "coffee", color: "clay" },
  { name: "Skate Spots", glyph: "skate", color: "ember" },
  { name: "Photo Locations", glyph: "camera", color: "sky" },
  { name: "Vintage Stores", glyph: "bag", color: "rose" },
  { name: "Hidden Places", glyph: "key", color: "iris" },
  { name: "Weekend Ideas", glyph: "sparkle", color: "citron" },
];
