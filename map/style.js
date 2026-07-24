/**
 * style.js — the map, drawn by hand.
 *
 * No off-the-shelf dark theme survives contact with this app: they all render
 * roads as filled ribbons with casings, which produces a grey mesh that fights
 * every pin on top of it. So the whole style is built here from the
 * OpenMapTiles schema with one governing rule — the map is a substrate, not
 * content. Streets are hairlines that gain weight only as you zoom in, water
 * is barely separable from land, and there is no colour anywhere except the
 * pins the user put there.
 *
 * Tiles come from OpenFreeMap: OpenStreetMap data, no API key, no account, no
 * usage ceiling. The raster fallback below exists because a map that fails to
 * load is a broken app, and a slightly less beautiful map is not.
 */

export const TILE_SOURCE = "https://tiles.openfreemap.org/planet";
export const GLYPH_SOURCE = "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf";

const FONT = ["Noto Sans Medium", "Noto Sans Regular"];
const FONT_LIGHT = ["Noto Sans Regular"];

const INK = "#05070a";
const WATER = "#070c13";
const PARK = "#080d0a";

/** rgba white at a given alpha — every line in the map is one of these. */
const w = (a) => `rgba(255,255,255,${a})`;

/** Zoom-interpolated line width. */
const width = (stops) => ({
  type: "exponential",
  base: 1.45,
  stops,
});

export function buildStyle({ labels = true, buildings = true } = {}) {
  const layers = [
    {
      id: "background",
      type: "background",
      paint: { "background-color": INK },
    },

    /* ---- Ground cover: present, but only just ---------------------------- */
    {
      id: "landcover-wood",
      type: "fill",
      source: "omt",
      "source-layer": "landcover",
      filter: ["in", "class", "wood", "forest"],
      paint: { "fill-color": "#0a1210", "fill-opacity": 0.55 },
    },
    {
      id: "park",
      type: "fill",
      source: "omt",
      "source-layer": "park",
      paint: { "fill-color": PARK, "fill-opacity": 0.8 },
    },
    {
      id: "landuse-urban",
      type: "fill",
      source: "omt",
      "source-layer": "landuse",
      filter: ["in", "class", "residential", "commercial", "industrial"],
      paint: { "fill-color": "#070910", "fill-opacity": 0.6 },
    },

    /* ---- Water ---------------------------------------------------------- */
    {
      id: "water",
      type: "fill",
      source: "omt",
      "source-layer": "water",
      paint: { "fill-color": WATER },
    },
    {
      id: "water-edge",
      type: "line",
      source: "omt",
      "source-layer": "water",
      paint: { "line-color": w(0.06), "line-width": width([[8, 0.4], [14, 1]]) },
    },
    {
      id: "waterway",
      type: "line",
      source: "omt",
      "source-layer": "waterway",
      paint: {
        "line-color": "#0b1420",
        "line-width": width([[9, 0.5], [16, 2.4]]),
      },
    },

    /* ---- Buildings: mass without detail ---------------------------------- */
    ...(buildings
      ? [
          {
            id: "building",
            type: "fill",
            source: "omt",
            "source-layer": "building",
            minzoom: 14,
            paint: {
              "fill-color": w(0.032),
              "fill-opacity": {
                type: "exponential",
                base: 1,
                stops: [[14, 0], [15.5, 1]],
              },
              "fill-outline-color": w(0.055),
            },
          },
        ]
      : []),

    /* ---- The road network, as line weight only --------------------------- */
    {
      id: "road-path",
      type: "line",
      source: "omt",
      "source-layer": "transportation",
      filter: ["in", "class", "path", "track", "footway", "pedestrian"],
      minzoom: 14,
      layout: { "line-cap": "round" },
      paint: {
        "line-color": w(0.05),
        "line-width": width([[14, 0.4], [18, 1.4]]),
        "line-dasharray": [2, 2.5],
      },
    },
    {
      id: "road-minor",
      type: "line",
      source: "omt",
      "source-layer": "transportation",
      filter: ["in", "class", "minor", "service"],
      minzoom: 12,
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": w(0.062),
        "line-width": width([[12, 0.3], [15, 0.9], [18, 3.2]]),
      },
    },
    {
      id: "road-tertiary",
      type: "line",
      source: "omt",
      "source-layer": "transportation",
      filter: ["==", "class", "tertiary"],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": w(0.085),
        "line-width": width([[9, 0.4], [13, 1], [18, 5]]),
      },
    },
    {
      id: "road-secondary",
      type: "line",
      source: "omt",
      "source-layer": "transportation",
      filter: ["==", "class", "secondary"],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": w(0.105),
        "line-width": width([[8, 0.5], [13, 1.3], [18, 6.5]]),
      },
    },
    {
      id: "road-primary",
      type: "line",
      source: "omt",
      "source-layer": "transportation",
      filter: ["in", "class", "primary", "trunk"],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": w(0.135),
        "line-width": width([[6, 0.5], [13, 1.8], [18, 9]]),
      },
    },
    {
      id: "road-motorway",
      type: "line",
      source: "omt",
      "source-layer": "transportation",
      filter: ["==", "class", "motorway"],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": w(0.19),
        "line-width": width([[5, 0.6], [13, 2.4], [18, 11]]),
      },
    },
    {
      id: "rail",
      type: "line",
      source: "omt",
      "source-layer": "transportation",
      filter: ["==", "class", "rail"],
      minzoom: 11,
      paint: {
        "line-color": w(0.07),
        "line-width": width([[11, 0.5], [18, 1.6]]),
        "line-dasharray": [3, 3],
      },
    },
    {
      id: "boundary",
      type: "line",
      source: "omt",
      "source-layer": "boundary",
      filter: ["<=", "admin_level", 4],
      paint: {
        "line-color": w(0.13),
        "line-width": width([[3, 0.5], [10, 1.2]]),
        "line-dasharray": [3, 2],
      },
    },
  ];

  /* ---- Labels: few, small, wide ------------------------------------------
     Only settlement names survive. Street names and POIs are exactly the
     clutter this design is trying to remove, and the pins are the point.     */
  if (labels) {
    layers.push(
      {
        id: "label-city",
        type: "symbol",
        source: "omt",
        "source-layer": "place",
        filter: ["in", "class", "city", "town"],
        layout: {
          "text-field": "{name}",
          "text-font": FONT,
          "text-size": { stops: [[4, 10.5], [8, 12.5], [13, 15]] },
          "text-letter-spacing": 0.12,
          "text-transform": "uppercase",
          "text-max-width": 8,
          "text-padding": 14,
        },
        paint: {
          "text-color": w(0.6),
          "text-halo-color": "rgba(0,0,0,0.75)",
          "text-halo-width": 1.1,
          "text-halo-blur": 1,
        },
      },
      {
        id: "label-suburb",
        type: "symbol",
        source: "omt",
        "source-layer": "place",
        filter: ["in", "class", "suburb", "neighbourhood", "village", "hamlet"],
        minzoom: 11,
        layout: {
          "text-field": "{name}",
          "text-font": FONT_LIGHT,
          "text-size": { stops: [[11, 10], [15, 12]] },
          "text-letter-spacing": 0.1,
          "text-transform": "uppercase",
          "text-max-width": 9,
          "text-padding": 16,
        },
        paint: {
          "text-color": w(0.36),
          "text-halo-color": "rgba(0,0,0,0.7)",
          "text-halo-width": 1,
        },
      },
      {
        id: "label-water",
        type: "symbol",
        source: "omt",
        "source-layer": "water_name",
        minzoom: 8,
        layout: {
          "text-field": "{name}",
          "text-font": FONT_LIGHT,
          "text-size": 11,
          "text-letter-spacing": 0.14,
          "text-transform": "uppercase",
          "symbol-placement": "line",
        },
        paint: { "text-color": "rgba(150,190,230,0.3)" },
      }
    );
  }

  return {
    version: 8,
    name: "Memory Map — Night",
    glyphs: GLYPH_SOURCE,
    sources: {
      omt: { type: "vector", url: TILE_SOURCE },
    },
    layers,
  };
}

/**
 * Raster fallback. Used only if the vector source fails — a dark basemap that
 * loads is better than an elegant one that doesn't.
 */
export function buildFallbackStyle() {
  return {
    version: 8,
    name: "Memory Map — Night (raster)",
    sources: {
      carto: {
        type: "raster",
        tiles: [
          "https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png",
          "https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png",
          "https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png",
        ],
        tileSize: 256,
        attribution: "© OpenStreetMap contributors © CARTO",
      },
    },
    layers: [
      { id: "background", type: "background", paint: { "background-color": INK } },
      {
        id: "carto",
        type: "raster",
        source: "carto",
        paint: { "raster-opacity": 0.85, "raster-saturation": -0.35, "raster-contrast": 0.1 },
      },
    ],
  };
}

export const ATTRIBUTION = "© OpenStreetMap contributors";
