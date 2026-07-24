/**
 * format.js — every string the user reads that isn't typed by them.
 * Centralised so tone stays consistent and a future i18n layer has one seam.
 */

const RELATIVE = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

export function formatDate(iso, opts = {}) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(+d)) return "";
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    year: sameYear && !opts.forceYear ? undefined : "numeric",
    ...opts,
  });
}

export function formatMonth(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
}

/** "Today" / "3 days ago" / "12 Mar" — degrades to absolute past a fortnight. */
export function relativeDate(iso) {
  if (!iso) return "";
  const then = new Date(iso);
  if (Number.isNaN(+then)) return "";
  const days = Math.round((then - new Date()) / 86400000);
  if (Math.abs(days) < 1) return "Today";
  if (Math.abs(days) <= 14) return RELATIVE.format(days, "day");
  return formatDate(iso);
}

export function formatCount(n, singular, plural = singular + "s") {
  return `${n} ${n === 1 ? singular : plural}`;
}

export function formatBytes(bytes) {
  if (!bytes) return "0 KB";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let v = bytes;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v < 10 && i > 0 ? v.toFixed(1) : Math.round(v)} ${units[i]}`;
}

/** Coordinates as a human would read them aloud. */
export function formatCoords(lat, lng, precision = 5) {
  if (lat === null || lat === undefined) return "";
  const ns = lat >= 0 ? "N" : "S";
  const ew = lng >= 0 ? "E" : "W";
  return `${Math.abs(lat).toFixed(precision)}° ${ns}, ${Math.abs(lng).toFixed(precision)}° ${ew}`;
}

export function formatDistance(metres) {
  if (metres === null || metres === undefined) return "";
  if (metres < 950) return `${Math.round(metres / 10) * 10} m`;
  return `${(metres / 1000).toFixed(metres < 10000 ? 1 : 0)} km`;
}

/** Great-circle distance in metres. */
export function haversine(a, b) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/** Strip diacritics and case so "café" matches "cafe". */
export function normalise(str) {
  return String(str || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function pluralise(n, word) {
  return n === 1 ? word : word + "s";
}

export function todayISO() {
  const d = new Date();
  const off = d.getTimezoneOffset();
  return new Date(d - off * 60000).toISOString().slice(0, 10);
}

/** Shorten an address to its most human part. */
export function shortAddress(address) {
  if (!address) return "";
  const parts = address.split(",").map((s) => s.trim()).filter(Boolean);
  if (parts.length <= 2) return parts.join(", ");
  return parts.slice(0, 2).join(", ");
}
