/**
 * Category.js — a kind of place.
 * Categories own a glyph and a colour; a place may override either, which is
 * how "this one coffee shop is special" stays possible without a new category.
 */

import { categoryId } from "../utils/id.js";

export function createCategory(input = {}) {
  const now = new Date().toISOString();
  return {
    id: input.id || categoryId(),
    name: input.name?.trim() || "Untitled",
    glyph: input.glyph || "pin",
    color: input.color || "graphite",
    order: input.order ?? 999,
    createdAt: input.createdAt || now,
    updatedAt: input.updatedAt || now,
    rev: input.rev || 1,
  };
}

export function touchCategory(category, patch = {}) {
  return {
    ...category,
    ...patch,
    updatedAt: new Date().toISOString(),
    rev: (category.rev || 1) + 1,
  };
}
