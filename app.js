/**
 * app.js — composition root.
 *
 * Everything above this file is a module that knows nothing about the others.
 * This is the only place that wires them together, which is what keeps the
 * dependency graph a tree rather than a web, and is why adding a screen later
 * means adding a file rather than editing six.
 */

import { h } from "./utils/dom.js";
import { createRouter } from "./utils/router.js";
import { initTheme, setAccentMode } from "./utils/theme.js";
import { setHapticsEnabled } from "./utils/haptics.js";
import { createAmbient } from "./components/Ambient.js";
import { createTabBar } from "./components/TabBar.js";
import { toast } from "./components/Toast.js";
import * as store from "./services/store.js";
import { requestPersistence } from "./services/db.js";
import { createMapPage } from "./pages/MapPage.js";
import { createSearchPage } from "./pages/SearchPage.js";
import { createLibraryPage } from "./pages/LibraryPage.js";
import { createSettingsPage } from "./pages/SettingsPage.js";
import { createCollectionDetailPage } from "./pages/CollectionDetailPage.js";
import { openPlaceEditor } from "./pages/PlaceEditor.js";

async function boot() {
  const root = document.getElementById("app");

  // Settings are read synchronously from localStorage so the first painted
  // frame already has the right accent — no flash of the wrong colour.
  await store.init();
  initTheme(store.getSetting("accentMode"));
  setHapticsEnabled(store.getSetting("haptics"));
  requestPersistence();

  const ambient = createAmbient();
  const stack = h("#stack");
  root.append(ambient.el, stack);

  let mapPage = null;

  const router = createRouter({
    container: stack,
    onTabChange: (id) => tabBar.setActive(id),
    onStackChange: (depth) => tabBar.setVisible(depth === 0),
  });

  const tabBar = createTabBar({
    onSelect: (id) => router.setTab(id),
    onAdd: () => {
      // Add always begins on the map: you position first, then describe. On
      // any other tab that means switching there, which is also the honest
      // answer to "where is this going to end up?".
      if (router.tab !== "map") {
        router.setTab("map");
        setTimeout(() => mapPage?.beginPlacement(), 320);
      } else {
        mapPage.beginPlacement();
      }
    },
  });

  /* ---- Tabs -------------------------------------------------------------- */

  router.registerTab("map", () => {
    mapPage = createMapPage({
      onAmbientCovered: (covered) => ambient.setCovered(covered),
      onPlacementChange: (placing) => tabBar.setVisible(!placing),
    });
    return mapPage;
  });

  const focusOnMap = (placeId) => {
    // Opening a place from a list quietly moves the map underneath, so that
    // dismissing the sheet lands you somewhere meaningful.
    router.getTabPage("map")?.focusPlace?.(placeId);
  };

  router.registerTab("search", () => createSearchPage({ onFocusPlace: focusOnMap }));

  router.registerTab("collections", () =>
    createLibraryPage({
      onFocusPlace: focusOnMap,
      onOpenCollection: (collectionId) =>
        router.push(
          createCollectionDetailPage({
            collectionId,
            onBack: () => router.pop(),
            onFocusPlace: focusOnMap,
          })
        ),
    })
  );

  router.registerTab("settings", () =>
    createSettingsPage({
      onRestyleMap: () => router.getTabPage("map")?.restyle?.(),
    })
  );

  root.append(tabBar.el);
  router.setTab("map", { animate: false });
  tabBar.setActive("map");

  /* ---- Global affordances ------------------------------------------------ */

  // A shared "add here" entry point for anything that needs one later.
  window.addEventListener("memorymap:add", (e) => {
    openPlaceEditor({ coords: e.detail, onSaved: () => {} });
  });

  document.documentElement.classList.add("is-ready");

  /* ---- Service worker ---------------------------------------------------- */

  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    try {
      await navigator.serviceWorker.register("./sw.js", { scope: "./" });
    } catch (err) {
      console.warn("[app] service worker not registered", err);
    }
  }

  // Keep the accent honest if the app has been open across a sunset.
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) setAccentMode(store.getSetting("accentMode"));
  });
}

boot().catch((err) => {
  console.error("[app] failed to start", err);
  document.getElementById("app").append(
    h("div.empty", { style: { position: "absolute", inset: "0", placeContent: "center" } }, [
      h("div.t3", "Memory Map couldn't start"),
      h("div.sub.dimmer", err.message || "Try reloading."),
    ])
  );
});
