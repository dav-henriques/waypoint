/**
 * geo.js — where you are, and what that place is called.
 *
 * Reverse geocoding goes to Nominatim (OpenStreetMap): no key, no account, and
 * a published usage policy that a personal app comfortably sits inside. The
 * policy asks for at most one request per second, so calls are queued and
 * spaced rather than fired in parallel — and results are cached to a rounded
 * coordinate, because dragging a pin two metres is not a new address.
 *
 * The whole thing is optional: Settings → "Look up addresses" turns it off and
 * the app never touches the network again.
 */

import { getSetting } from "./store.js";

const NOMINATIM = "https://nominatim.openstreetmap.org";
const MIN_INTERVAL = 1100;

const cache = new Map();
let lastCall = 0;
let chain = Promise.resolve();

const keyFor = (lat, lng) => `${lat.toFixed(4)},${lng.toFixed(4)}`;

function queue(fn) {
  chain = chain.then(async () => {
    const wait = MIN_INTERVAL - (Date.now() - lastCall);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastCall = Date.now();
    return fn();
  });
  return chain;
}

/** Current position, as a promise. Never throws — returns null on refusal. */
export function currentPosition({ timeout = 9000, highAccuracy = true } = {}) {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          heading: pos.coords.heading,
        }),
      () => resolve(null),
      { enableHighAccuracy: highAccuracy, timeout, maximumAge: 30000 }
    );
  });
}

/** Continuous position updates. Returns a stop function. */
export function watchPosition(onUpdate, onError) {
  if (!navigator.geolocation) {
    onError?.(new Error("Geolocation unavailable"));
    return () => {};
  }
  const id = navigator.geolocation.watchPosition(
    (pos) =>
      onUpdate({
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
        heading: pos.coords.heading,
      }),
    (err) => onError?.(err),
    { enableHighAccuracy: true, timeout: 12000, maximumAge: 5000 }
  );
  return () => navigator.geolocation.clearWatch(id);
}

function composeAddress(data) {
  const a = data?.address;
  if (!a) return data?.display_name || "";
  const road = [a.road || a.pedestrian || a.footway, a.house_number]
    .filter(Boolean)
    .join(" ");
  const parts = [
    road || a.neighbourhood || a.suburb,
    a.suburb && road ? a.suburb : null,
    a.city || a.town || a.village || a.municipality || a.county,
    a.state,
    a.country,
  ].filter(Boolean);
  return [...new Set(parts)].join(", ");
}

export async function reverseGeocode(lat, lng) {
  if (!getSetting("reverseGeocode")) return "";
  const key = keyFor(lat, lng);
  if (cache.has(key)) return cache.get(key);

  try {
    const url = `${NOMINATIM}/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`;
    const data = await queue(() =>
      fetch(url, { headers: { Accept: "application/json" } }).then((r) =>
        r.ok ? r.json() : null
      )
    );
    const address = composeAddress(data);
    cache.set(key, address);
    return address;
  } catch {
    cache.set(key, "");
    return "";
  }
}

/** Forward search, for "find a place by name" inside the Search tab. */
export async function geocode(query, { limit = 5, near = null } = {}) {
  if (!getSetting("reverseGeocode") || !query.trim()) return [];
  try {
    const params = new URLSearchParams({
      format: "jsonv2",
      q: query,
      limit: String(limit),
      addressdetails: "1",
    });
    if (near) {
      const d = 0.6;
      params.set(
        "viewbox",
        `${near.lng - d},${near.lat + d},${near.lng + d},${near.lat - d}`
      );
    }
    const data = await queue(() =>
      fetch(`${NOMINATIM}/search?${params}`, { headers: { Accept: "application/json" } })
        .then((r) => (r.ok ? r.json() : []))
    );
    return (data || []).map((d) => ({
      name: d.name || d.display_name?.split(",")[0] || "",
      address: composeAddress(d),
      lat: Number(d.lat),
      lng: Number(d.lon),
    }));
  } catch {
    return [];
  }
}
