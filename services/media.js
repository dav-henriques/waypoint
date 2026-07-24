/**
 * media.js — photos in, blobs out.
 *
 * A modern phone camera produces 4–8MB files. Storing those untouched would
 * blow through the storage quota in an afternoon and make every list scroll
 * badly, so each image is resampled twice on the way in: a display copy at
 * 1600px and a thumbnail at 420px. Both are stored, so grids never decode a
 * full-size image just to draw a 100px square.
 *
 * EXIF orientation is handled for us by createImageBitmap({imageOrientation}),
 * which is supported everywhere this app runs.
 */

import { photoId } from "../utils/id.js";
import { put, get, del, getByIndex } from "./db.js";
import { STORE } from "../models/schema.js";

const FULL_EDGE = 1600;
const THUMB_EDGE = 420;
const QUALITY = 0.84;

const urlCache = new Map();

async function decode(file) {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch { /* Safari occasionally refuses HEIC; fall through */ }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    return img;
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

function fit(w, h, edge) {
  const scale = Math.min(1, edge / Math.max(w, h));
  return { w: Math.max(1, Math.round(w * scale)), h: Math.max(1, Math.round(h * scale)) };
}

async function resample(bitmap, edge) {
  const sw = bitmap.width || bitmap.naturalWidth;
  const sh = bitmap.height || bitmap.naturalHeight;
  const { w, h } = fit(sw, sh, edge);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, w, h);
  const blob = await new Promise((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", QUALITY)
  );
  return { blob, w, h };
}

/** Ingest one file. Returns the stored photo record (without blobs re-read). */
export async function importPhoto(file, placeIdRef) {
  if (!file || !file.type.startsWith("image/")) throw new Error("Not an image");
  const bitmap = await decode(file);
  const [full, thumb] = await Promise.all([
    resample(bitmap, FULL_EDGE),
    resample(bitmap, THUMB_EDGE),
  ]);
  bitmap.close?.();

  const record = {
    id: photoId(),
    placeId: placeIdRef || null,
    blob: full.blob,
    thumb: thumb.blob,
    width: full.w,
    height: full.h,
    bytes: full.blob.size + thumb.blob.size,
    createdAt: new Date().toISOString(),
  };
  await put(STORE.photos, record);
  return record;
}

export async function importPhotos(files, placeIdRef) {
  const out = [];
  for (const file of files) {
    try {
      out.push(await importPhoto(file, placeIdRef));
    } catch (err) {
      console.warn("[media] skipped a file", file?.name, err);
    }
  }
  return out;
}

/**
 * Object URLs are cached and never revoked while the app is alive. Photos are
 * viewed repeatedly and the alternative — revoke-on-unmount — produces broken
 * images the moment two views share a photo.
 */
export async function photoURL(id, { thumb = false } = {}) {
  const key = `${id}:${thumb ? "t" : "f"}`;
  if (urlCache.has(key)) return urlCache.get(key);
  const record = await get(STORE.photos, id);
  if (!record) return null;
  const blob = thumb ? record.thumb || record.blob : record.blob;
  const url = URL.createObjectURL(blob);
  urlCache.set(key, url);
  return url;
}

export async function getPhoto(id) {
  return get(STORE.photos, id);
}

export async function deletePhoto(id) {
  for (const suffix of ["f", "t"]) {
    const key = `${id}:${suffix}`;
    if (urlCache.has(key)) {
      URL.revokeObjectURL(urlCache.get(key));
      urlCache.delete(key);
    }
  }
  await del(STORE.photos, id);
}

export async function photosForPlace(placeIdRef) {
  return getByIndex(STORE.photos, "byPlace", placeIdRef);
}

export async function attachPhotosToPlace(photoIds, placeIdRef) {
  for (const id of photoIds) {
    const record = await get(STORE.photos, id);
    if (record && record.placeId !== placeIdRef) {
      record.placeId = placeIdRef;
      await put(STORE.photos, record);
    }
  }
}

/** Base64 for the JSON export path. Slow and fat — used only on demand. */
export async function photoToDataURL(id) {
  const record = await get(STORE.photos, id);
  if (!record) return null;
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(record.blob);
  });
}

export async function photoFromDataURL(dataURL, meta = {}) {
  const res = await fetch(dataURL);
  const blob = await res.blob();
  const bitmap = await decode(blob);
  const thumb = await resample(bitmap, THUMB_EDGE);
  bitmap.close?.();
  const record = {
    id: meta.id || photoId(),
    placeId: meta.placeId || null,
    blob,
    thumb: thumb.blob,
    width: meta.width || bitmap.width || 0,
    height: meta.height || bitmap.height || 0,
    bytes: blob.size + thumb.blob.size,
    createdAt: meta.createdAt || new Date().toISOString(),
  };
  await put(STORE.photos, record);
  return record;
}
