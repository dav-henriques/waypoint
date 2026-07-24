/**
 * sw.js — offline, and a map that remembers where you've been.
 *
 * Two caches with deliberately different policies:
 *
 *   The shell is cache-first. It is versioned, it changes only on deploy, and
 *   the app must open instantly with no network — that is the whole difference
 *   between a PWA and a bookmark.
 *
 *   Map tiles are cache-first too, but into a separate bucket with a hard cap
 *   and FIFO eviction. The side effect is the good kind: neighbourhoods you
 *   have already looked at keep working underground, which is exactly where
 *   someone wants to check a map.
 */

const VERSION = "v1.0.0";
const SHELL_CACHE = `memory-map-shell-${VERSION}`;
const TILE_CACHE = "memory-map-tiles";
const TILE_LIMIT = 900;

const SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./app.js",
  "./assets/vendor/maplibre-gl.js",
  "./assets/vendor/maplibre-gl.css",
  "./styles/tokens.css",
  "./styles/reset.css",
  "./styles/base.css",
  "./styles/components/sheet.css",
  "./styles/components/tabbar.css",
  "./styles/components/controls.css",
  "./styles/components/card.css",
  "./styles/components/media.css",
  "./styles/components/toast.css",
  "./styles/components/pin.css",
  "./styles/pages/map.css",
  "./styles/pages/detail.css",
  "./styles/pages/editor.css",
  "./styles/pages/library.css",
  "./styles/pages/search.css",
  "./styles/pages/stats.css",
  "./styles/pages/settings.css",
  "./utils/dom.js",
  "./utils/events.js",
  "./utils/id.js",
  "./utils/motion.js",
  "./utils/gestures.js",
  "./utils/format.js",
  "./utils/haptics.js",
  "./utils/theme.js",
  "./utils/router.js",
  "./models/schema.js",
  "./models/Place.js",
  "./models/Category.js",
  "./models/Collection.js",
  "./services/db.js",
  "./services/store.js",
  "./services/media.js",
  "./services/geo.js",
  "./services/export.js",
  "./services/sync.js",
  "./services/sample.js",
  "./components/Ambient.js",
  "./components/Icon.js",
  "./components/Sheet.js",
  "./components/ActionSheet.js",
  "./components/TabBar.js",
  "./components/Controls.js",
  "./components/Toast.js",
  "./components/PlaceCard.js",
  "./components/Gallery.js",
  "./components/Ribbon.js",
  "./map/style.js",
  "./map/mapView.js",
  "./pages/MapPage.js",
  "./pages/SearchPage.js",
  "./pages/LibraryPage.js",
  "./pages/SettingsPage.js",
  "./pages/StatsView.js",
  "./pages/PlaceDetail.js",
  "./pages/PlaceEditor.js",
  "./pages/CollectionEditor.js",
  "./pages/CategoryEditor.js",
  "./pages/CollectionDetailPage.js",
  "./assets/icons/icon-180.png",
  "./assets/icons/icon-192.png",
  "./assets/icons/icon-512.png",
  "./assets/icons/icon-maskable-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      // addAll is all-or-nothing; one 404 during development would leave the
      // app with no cache at all, so each file is added independently.
      await Promise.all(
        SHELL.map((url) =>
          cache.add(new Request(url, { cache: "reload" })).catch((err) =>
            console.warn("[sw] skipped", url, err.message)
          )
        )
      );
      self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k.startsWith("memory-map-shell-") && k !== SHELL_CACHE)
          .map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

const isTile = (url) =>
  /tiles\.openfreemap\.org|basemaps\.cartocdn\.com|\.pbf($|\?)|\/fonts\//.test(url);

async function trimCache(name, limit) {
  const cache = await caches.open(name);
  const keys = await cache.keys();
  if (keys.length <= limit) return;
  for (const key of keys.slice(0, keys.length - limit)) await cache.delete(key);
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Never cache geocoding: an address lookup must be current, and caching
  // OpenStreetMap's API would breach its usage policy.
  if (url.hostname.includes("nominatim")) return;

  if (isTile(request.url)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(TILE_CACHE);
        const hit = await cache.match(request);
        if (hit) return hit;
        try {
          const response = await fetch(request);
          if (response.ok || response.type === "opaque") {
            cache.put(request, response.clone());
            trimCache(TILE_CACHE, TILE_LIMIT);
          }
          return response;
        } catch (err) {
          return hit || Response.error();
        }
      })()
    );
    return;
  }

  if (url.origin !== location.origin) return;

  event.respondWith(
    (async () => {
      const cached = await caches.match(request, { ignoreSearch: true });
      if (cached) {
        // Refresh in the background so the next launch is current.
        event.waitUntil(
          fetch(request)
            .then((res) => res.ok && caches.open(SHELL_CACHE).then((c) => c.put(request, res)))
            .catch(() => {})
        );
        return cached;
      }
      try {
        return await fetch(request);
      } catch (err) {
        if (request.mode === "navigate") {
          const fallback = await caches.match("./index.html");
          if (fallback) return fallback;
        }
        throw err;
      }
    })()
  );
});
