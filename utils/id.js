/**
 * id.js — sortable, collision-resistant identifiers.
 *
 * The timestamp prefix means IDs sort chronologically, which makes them
 * usable as a stable secondary sort key and pleasant in exported JSON. The
 * shape is also compatible with a future server that mints its own IDs.
 */

const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";

function randomPart(len = 10) {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return out;
}

export function uid(prefix = "") {
  const time = Date.now().toString(36).padStart(9, "0");
  return `${prefix}${time}${randomPart(10)}`;
}

export const placeId = () => uid("p_");
export const collectionId = () => uid("c_");
export const categoryId = () => uid("g_");
export const photoId = () => uid("m_");
