/**
 * schema.js — the shape of everything that gets stored.
 *
 * Two rules make the future easy:
 *   1. every record carries `updatedAt` and a monotonic `rev`
 *   2. deletions are tombstones, never real deletes
 * Together they are the whole precondition for last-write-wins cloud sync, so
 * adding a server later is a networking job rather than a migration job.
 */

export const DB_NAME = "memory-map";
export const DB_VERSION = 1;

export const STORE = {
  places: "places",
  categories: "categories",
  collections: "collections",
  photos: "photos",
  tombstones: "tombstones",
  meta: "meta",
};

/**
 * The pin palette. Muted rather than saturated: a dozen fully-bright dots on a
 * near-black map is a Christmas tree, and these have to sit next to each other
 * a hundred at a time without shouting.
 *
 * A note on accessibility, because the numbers here were argued with rather
 * than guessed. Twelve colours cannot all be perceptually separable — run any
 * categorical-palette validator over a set this size and it fails, because
 * twelve points simply do not fit in the usable region of OKLab with room to
 * spare. Optimising the hues numerically was tried and made things worse: it
 * traded a beautiful palette for an ugly one and still left pairs colliding
 * under simulated deuteranopia.
 *
 * So the constraint is answered structurally instead: **colour is never the
 * only encoding anywhere in this app.** Every pin carries its category glyph,
 * every chip and legend row carries a glyph and a name, and the statistics
 * breakdown direct-labels every bar. Colour is recognition, not identity —
 * which is the correct role for something the user picks by taste anyway.
 *
 * Within that, the worst genuine collisions were still worth fixing by hand:
 * cobalt/iris were 1.7 ΔE apart under protanopia and moss/teal 5.6 apart in
 * normal vision, both of which read as "the same colour" on a 30px pin. Those
 * two pairs were pulled apart in lightness and hue below.
 */
export const COLORS = [
  { id: "ember", hex: "#E4674A", name: "Ember" },
  { id: "amber", hex: "#E0A03F", name: "Amber" },
  { id: "citron", hex: "#BCC257", name: "Citron" },
  { id: "moss", hex: "#56BE71", name: "Moss" },
  { id: "teal", hex: "#33B9C6", name: "Teal" },
  { id: "sky", hex: "#5AA8F0", name: "Sky" },
  { id: "cobalt", hex: "#4C6FE8", name: "Cobalt" },
  { id: "iris", hex: "#A78BF3", name: "Iris" },
  { id: "orchid", hex: "#C56FDD", name: "Orchid" },
  { id: "rose", hex: "#ED6D92", name: "Rose" },
  { id: "clay", hex: "#C08C5C", name: "Clay" },
  { id: "graphite", hex: "#98A2AE", name: "Graphite" },
];

export const colorHex = (id) => COLORS.find((c) => c.id === id)?.hex || COLORS[11].hex;

/** Shipped categories. Editable and deletable like any other — nothing is fixed. */
export const DEFAULT_CATEGORIES = [
  { id: "cat_skate", name: "Skate", glyph: "skate", color: "ember", order: 0 },
  { id: "cat_coffee", name: "Coffee", glyph: "coffee", color: "clay", order: 1 },
  { id: "cat_music", name: "Music", glyph: "music", color: "iris", order: 2 },
  { id: "cat_photo", name: "Photography", glyph: "camera", color: "sky", order: 3 },
  { id: "cat_urban", name: "Urban", glyph: "city", color: "graphite", order: 4 },
  { id: "cat_nature", name: "Nature", glyph: "leaf", color: "moss", order: 5 },
  { id: "cat_shop", name: "Shopping", glyph: "bag", color: "rose", order: 6 },
  { id: "cat_food", name: "Food", glyph: "food", color: "amber", order: 7 },
  { id: "cat_books", name: "Books", glyph: "book", color: "citron", order: 8 },
  { id: "cat_art", name: "Art", glyph: "palette", color: "orchid", order: 9 },
  { id: "cat_arch", name: "Architecture", glyph: "column", color: "teal", order: 10 },
  { id: "cat_other", name: "Other", glyph: "pin", color: "graphite", order: 11 },
];

export const DEFAULT_SETTINGS = {
  accentMode: "auto",          // auto | cyan | amber | violet | mono
  mapLabels: true,
  mapBuildings: true,
  tapToAdd: false,             // long-press is the default gesture; this adds tap
  haptics: true,
  reverseGeocode: true,        // reverse lookups leave the device — opt-out lives here
  clusterPins: true,
  units: "metric",
  lastCamera: null,            // { lng, lat, zoom, bearing, pitch }
  onboarded: false,
};

export const SETTINGS_KEY = "memory-map.settings";
