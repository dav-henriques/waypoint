/**
 * export.js — your data leaves whole, or it isn't yours.
 *
 * The archive is plain JSON with photos inlined as data URLs. That makes the
 * file large, and that is the correct trade: a backup that silently drops the
 * pictures is not a backup. GeoJSON is offered alongside it because every map
 * tool on earth reads GeoJSON, so an export is also an exit.
 */

import * as store from "./store.js";
import { photoToDataURL, photoFromDataURL } from "./media.js";
import { isValidPlace, createPlace } from "../models/Place.js";
import { createCollection } from "../models/Collection.js";
import { createCategory } from "../models/Category.js";

export const ARCHIVE_VERSION = 1;

export async function buildArchive({ includePhotos = true, onProgress } = {}) {
  const snap = store.snapshot();
  const photos = [];

  if (includePhotos) {
    const ids = snap.places.flatMap((p) => p.photos || []);
    let done = 0;
    for (const id of ids) {
      const dataURL = await photoToDataURL(id);
      if (dataURL) photos.push({ id, dataURL });
      onProgress?.(++done / Math.max(1, ids.length));
    }
  }

  return {
    format: "memory-map-archive",
    version: ARCHIVE_VERSION,
    exportedAt: new Date().toISOString(),
    counts: {
      places: snap.places.length,
      collections: snap.collections.length,
      categories: snap.categories.length,
      photos: photos.length,
    },
    places: snap.places,
    categories: snap.categories,
    collections: snap.collections,
    settings: snap.settings,
    photos,
  };
}

export function buildGeoJSON() {
  const snap = store.snapshot();
  return {
    type: "FeatureCollection",
    features: snap.places.map((p) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [p.lng, p.lat] },
      properties: {
        id: p.id,
        title: p.title,
        description: p.description,
        address: p.address,
        category: store.getCategory(p.categoryId)?.name || "",
        tags: (p.tags || []).join(", "),
        favorite: p.favorite,
        visited: p.visited,
        date: p.date,
        colour: store.placeColor(p),
      },
    })),
  };
}

export function downloadJSON(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function archiveFilename(ext = "json") {
  return `memory-map-${new Date().toISOString().slice(0, 10)}.${ext}`;
}

/**
 * Import. `mode` is "merge" (last write wins per record) or "replace".
 * Unknown or malformed records are skipped rather than aborting the whole
 * file — a partial restore beats no restore.
 */
export async function importArchive(json, { mode = "merge", onProgress } = {}) {
  const data = typeof json === "string" ? JSON.parse(json) : json;

  // Accept a bare GeoJSON file too, so exports from other tools work.
  if (data?.type === "FeatureCollection") return importGeoJSON(data, { mode });

  if (data?.format !== "memory-map-archive") {
    throw new Error("This file is not a Memory Map archive.");
  }

  const categories = (data.categories || []).map(createCategory);
  const places = (data.places || []).filter(isValidPlace).map((p) => createPlace(p));
  const collections = (data.collections || []).map(createCollection);

  if (mode === "replace") await store.replaceAll({ places, categories, collections });
  else await store.mergeIn({ places, categories, collections });

  let done = 0;
  const photos = data.photos || [];
  for (const photo of photos) {
    try {
      await photoFromDataURL(photo.dataURL, { id: photo.id });
    } catch { /* one bad image must not sink the import */ }
    onProgress?.(++done / Math.max(1, photos.length));
  }

  return {
    places: places.length,
    collections: collections.length,
    categories: categories.length,
    photos: photos.length,
  };
}

async function importGeoJSON(data, { mode }) {
  const places = (data.features || [])
    .filter((f) => f?.geometry?.type === "Point")
    .map((f) =>
      createPlace({
        title: f.properties?.title || f.properties?.name || "Untitled",
        description: f.properties?.description || "",
        address: f.properties?.address || "",
        lng: f.geometry.coordinates[0],
        lat: f.geometry.coordinates[1],
        tags: f.properties?.tags,
        favorite: !!f.properties?.favorite,
      })
    )
    .filter(isValidPlace);

  if (mode === "replace") {
    await store.replaceAll({ places, categories: store.allCategories(), collections: [] });
  } else {
    await store.mergeIn({ places });
  }
  return { places: places.length, collections: 0, categories: 0, photos: 0 };
}

export function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}
