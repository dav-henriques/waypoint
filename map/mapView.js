/**
 * mapView.js — everything the map knows how to do.
 *
 * Markers are DOM elements rather than a symbol layer. That costs a little
 * performance at very high counts and buys total control of the thing the user
 * looks at most: pins can use CSS transitions, backdrop blur, the app's own
 * glyphs and per-pin colour without round-tripping through a sprite sheet. For
 * a personal archive — hundreds of places, not hundreds of thousands — it is
 * unambiguously the right trade.
 *
 * Clustering is done here rather than in the source, because screen-space
 * grouping (a fixed pixel grid) matches what the eye considers "overlapping"
 * far better than geographic grouping does.
 */

import { h } from "../utils/dom.js";
import { icon } from "../components/Icon.js";
import { longPress } from "../utils/gestures.js";
import { haptic } from "../utils/haptics.js";
import { buildStyle, buildFallbackStyle, ATTRIBUTION } from "./style.js";
import * as store from "../services/store.js";

const DEFAULT_CAMERA = { lng: -46.6565, lat: -23.5613, zoom: 13.4, bearing: 0, pitch: 0 };
const CLUSTER_CELL = 68;      // px — roughly two pin diameters
const CLUSTER_MAX_ZOOM = 15.5;

export function createMapView({ container, onSelect, onLongPress, onCameraIdle }) {
  const maplibregl = window.maplibregl;
  if (!maplibregl) throw new Error("MapLibre failed to load");

  const saved = store.getSetting("lastCamera");
  const camera = saved || DEFAULT_CAMERA;

  const map = new maplibregl.Map({
    container,
    style: buildStyle({
      labels: store.getSetting("mapLabels"),
      buildings: store.getSetting("mapBuildings"),
    }),
    center: [camera.lng, camera.lat],
    zoom: camera.zoom,
    bearing: camera.bearing || 0,
    pitch: camera.pitch || 0,
    attributionControl: false,
    // Rotation via two fingers is delightful; via keyboard-less drag it is an
    // accident waiting to happen on a phone.
    dragRotate: false,
    pitchWithRotate: false,
    maxZoom: 19,
    minZoom: 2,
    fadeDuration: 180,
    refreshExpiredTiles: false,
  });

  map.touchZoomRotate.disableRotation();
  map.addControl(
    new maplibregl.AttributionControl({ compact: true, customAttribution: ATTRIBUTION }),
    "bottom-left"
  );

  /* ---- Vector → raster failover ---------------------------------------- */
  let usedFallback = false;
  let tileErrors = 0;
  map.on("error", (e) => {
    const msg = String(e?.error?.message || "");
    if (usedFallback) return;
    if (/source|tile|fetch|Failed|NetworkError/i.test(msg)) {
      if (++tileErrors < 4) return;
      usedFallback = true;
      console.warn("[map] vector tiles unavailable — falling back to raster");
      map.setStyle(buildFallbackStyle());
    }
  });

  /* ---- Markers ---------------------------------------------------------- */

  const pool = new Map();       // placeId -> { marker, el }
  const clusters = [];          // live cluster markers
  let places = [];
  let selectedId = null;
  let dimCategory = null;       // when a filter is on, others fade rather than vanish

  function buildPinElement(place) {
    const colour = store.placeColor(place);
    const el = h("div.pin", { style: { "--pc": colour }, dataset: { id: place.id } }, [
      h("div.pin__halo"),
      h("div.pin__body", [icon(store.placeGlyph(place), { size: 15, stroke: 1.9 })]),
      place.favorite ? h("div.pin__fav", [icon("star", { size: 9, stroke: 2.6, solid: true })]) : null,
    ]);
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      haptic("light");
      onSelect?.(place.id);
    });
    return el;
  }

  function ensureMarker(place) {
    let entry = pool.get(place.id);
    if (!entry) {
      const el = buildPinElement(place);
      const marker = new maplibregl.Marker({ element: el, anchor: "center" })
        .setLngLat([place.lng, place.lat])
        .addTo(map);
      entry = { marker, el, rev: place.rev };
      pool.set(place.id, entry);
      // Entrance: pins arrive, they do not appear.
      requestAnimationFrame(() => el.setAttribute("data-in", ""));
    } else if (entry.rev !== place.rev) {
      // Colour, glyph or position may have changed. Rebuilding the marker is
      // cheaper to reason about than mutating MapLibre's internals, and a pin
      // edit is rare enough that the churn is invisible.
      entry.marker.remove();
      const el = buildPinElement(place);
      const marker = new maplibregl.Marker({ element: el, anchor: "center" })
        .setLngLat([place.lng, place.lat])
        .addTo(map);
      entry = { marker, el, rev: place.rev };
      pool.set(place.id, entry);
      el.setAttribute("data-in", "");
    }
    return entry;
  }

  function clearClusters() {
    while (clusters.length) clusters.pop().remove();
  }

  /**
   * Screen-space grid clustering. Everything currently on screen is projected
   * once, bucketed by pixel cell, and any cell holding more than one pin
   * becomes a single count bubble.
   */
  function recomputeMarkers() {
    const zoom = map.getZoom();
    const bounds = map.getBounds();
    const pad = 0.25;
    const west = bounds.getWest() - (bounds.getEast() - bounds.getWest()) * pad;
    const east = bounds.getEast() + (bounds.getEast() - bounds.getWest()) * pad;
    const south = bounds.getSouth() - (bounds.getNorth() - bounds.getSouth()) * pad;
    const north = bounds.getNorth() + (bounds.getNorth() - bounds.getSouth()) * pad;

    const visible = places.filter(
      (p) => p.lng >= west && p.lng <= east && p.lat >= south && p.lat <= north
    );

    clearClusters();
    const shouldCluster =
      store.getSetting("clusterPins") && zoom < CLUSTER_MAX_ZOOM && visible.length > 6;

    const singles = [];
    if (!shouldCluster) {
      singles.push(...visible);
    } else {
      const cells = new Map();
      for (const place of visible) {
        const pt = map.project([place.lng, place.lat]);
        const key = `${Math.floor(pt.x / CLUSTER_CELL)}:${Math.floor(pt.y / CLUSTER_CELL)}`;
        if (!cells.has(key)) cells.set(key, []);
        cells.get(key).push(place);
      }
      for (const group of cells.values()) {
        // Never hide the pin the user is currently looking at.
        if (group.length === 1 || group.some((p) => p.id === selectedId)) {
          singles.push(...group);
          continue;
        }
        addCluster(group);
      }
    }

    const keep = new Set(singles.map((p) => p.id));
    for (const [id, entry] of pool) {
      if (keep.has(id)) continue;
      entry.marker.remove();
      pool.delete(id);
    }
    for (const place of singles) {
      const entry = ensureMarker(place);
      entry.el.classList.toggle("is-selected", place.id === selectedId);
      entry.el.classList.toggle("is-dimmed", !!dimCategory && place.categoryId !== dimCategory);
    }
  }

  function addCluster(group) {
    const lng = group.reduce((s, p) => s + p.lng, 0) / group.length;
    const lat = group.reduce((s, p) => s + p.lat, 0) / group.length;
    // The bubble borrows the colour of whichever category dominates it.
    const counts = new Map();
    for (const p of group) {
      const c = store.placeColor(p);
      counts.set(c, (counts.get(c) || 0) + 1);
    }
    const dominant = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];

    const el = h(
      "div.cluster",
      { style: { "--pc": dominant }, dataset: { size: group.length > 9 ? "lg" : "sm" } },
      [h("span.cluster__n.num", String(group.length))]
    );
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      haptic("light");
      fitTo(group, { padding: 90 });
    });
    const marker = new window.maplibregl.Marker({ element: el, anchor: "center" })
      .setLngLat([lng, lat])
      .addTo(map);
    requestAnimationFrame(() => el.setAttribute("data-in", ""));
    clusters.push(marker);
  }

  /* ---- Camera ----------------------------------------------------------- */

  const persist = () => {
    const c = map.getCenter();
    store.setSetting("lastCamera", {
      lng: c.lng,
      lat: c.lat,
      zoom: map.getZoom(),
      bearing: map.getBearing(),
      pitch: map.getPitch(),
    });
  };

  let idleTimer = null;
  map.on("move", () => {
    container.setAttribute("data-moving", "");
  });
  map.on("moveend", () => {
    container.removeAttribute("data-moving");
    recomputeMarkers();
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      persist();
      onCameraIdle?.(map.getCenter(), map.getZoom());
    }, 240);
  });
  map.on("zoom", () => recomputeMarkers());

  /* ---- Long press to remember a place ----------------------------------- */

  const ghost = h("div.map-ghost", [h("div.map-ghost__ring"), h("div.map-ghost__dot")]);
  container.append(ghost);

  longPress(
    container,
    ({ x, y }) => {
      const rect = container.getBoundingClientRect();
      const point = map.unproject([x - rect.left, y - rect.top]);
      haptic("heavy");
      ghost.setAttribute("data-drop", "");
      setTimeout(() => ghost.removeAttribute("data-drop"), 520);
      ghost.removeAttribute("data-arm");
      onLongPress?.({ lat: point.lat, lng: point.lng });
    },
    {
      delay: 460,
      tolerance: 14,
      onProgress: (on, pos) => {
        if (on && pos) {
          const rect = container.getBoundingClientRect();
          ghost.style.left = `${pos.x - rect.left}px`;
          ghost.style.top = `${pos.y - rect.top}px`;
          ghost.setAttribute("data-arm", "");
        } else {
          ghost.removeAttribute("data-arm");
        }
      },
    }
  );

  map.on("click", (e) => {
    if (e.originalEvent.target.closest(".pin, .cluster")) return;
    if (store.getSetting("tapToAdd")) {
      haptic("medium");
      onLongPress?.({ lat: e.lngLat.lat, lng: e.lngLat.lng });
    } else {
      onSelect?.(null);
    }
  });

  /* ---- User location ---------------------------------------------------- */

  let userMarker = null;
  let accuracyMarker = null;

  function showUser(position) {
    if (!position) return;
    if (!userMarker) {
      const el = h("div.userdot", [h("div.userdot__pulse"), h("div.userdot__core")]);
      userMarker = new maplibregl.Marker({ element: el, anchor: "center" })
        .setLngLat([position.lng, position.lat])
        .addTo(map);
    } else {
      userMarker.setLngLat([position.lng, position.lat]);
    }
  }

  /* ---- Public surface --------------------------------------------------- */

  function fitTo(list, { padding = 70, maxZoom = 16 } = {}) {
    if (!list?.length) return;
    if (list.length === 1) {
      map.easeTo({ center: [list[0].lng, list[0].lat], zoom: Math.max(map.getZoom(), 15), duration: 700 });
      return;
    }
    const b = new window.maplibregl.LngLatBounds();
    list.forEach((p) => b.extend([p.lng, p.lat]));
    map.fitBounds(b, {
      padding: { top: padding + 40, bottom: padding + 160, left: padding, right: padding },
      maxZoom,
      duration: 800,
    });
  }

  return {
    map,

    setPlaces(next) {
      places = next || [];
      recomputeMarkers();
    },

    setSelected(id) {
      selectedId = id;
      for (const [pid, entry] of pool) entry.el.classList.toggle("is-selected", pid === id);
      recomputeMarkers();
    },

    setCategoryFilter(categoryId) {
      dimCategory = categoryId;
      recomputeMarkers();
    },

    focus(place, { offsetY = -110, zoom } = {}) {
      if (!place) return;
      map.easeTo({
        center: [place.lng, place.lat],
        zoom: zoom ?? Math.max(map.getZoom(), 15.6),
        offset: [0, offsetY],
        duration: 760,
        easing: (t) => 1 - Math.pow(1 - t, 3),
      });
    },

    fitTo,

    flyTo(lngLat, zoom = 15) {
      map.flyTo({ center: [lngLat.lng, lngLat.lat], zoom, duration: 1400, curve: 1.3 });
    },

    showUser,

    centerOnUser(position, { zoom = 15.6 } = {}) {
      showUser(position);
      map.easeTo({ center: [position.lng, position.lat], zoom, duration: 900 });
    },

    center: () => map.getCenter(),
    zoom: () => map.getZoom(),

    restyle() {
      if (usedFallback) return;
      map.setStyle(
        buildStyle({
          labels: store.getSetting("mapLabels"),
          buildings: store.getSetting("mapBuildings"),
        })
      );
      map.once("styledata", () => recomputeMarkers());
    },

    resize: () => map.resize(),

    setInteractive(on) {
      const handlers = ["scrollZoom", "boxZoom", "dragPan", "keyboard", "doubleClickZoom", "touchZoomRotate"];
      handlers.forEach((k) => (on ? map[k]?.enable() : map[k]?.disable()));
    },

    destroy() {
      clearClusters();
      pool.forEach((e) => e.marker.remove());
      pool.clear();
      map.remove();
    },
  };
}
