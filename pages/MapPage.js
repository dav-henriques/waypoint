/**
 * MapPage.js — the home screen, which is to say: the map, and almost nothing.
 *
 * Chrome is kept to a count on the left and two controls on the right, and
 * even those fade out while the map is moving. Every control that could live
 * behind a gesture does: a place is added by holding the map, a pin is opened
 * by tapping it, and filters live one tap deep in a sheet rather than
 * permanently occupying the top of the screen.
 */

import { h, mount } from "../utils/dom.js";
import { icon } from "../components/Icon.js";
import { createMapView } from "../map/mapView.js";
import { openPlaceDetail } from "./PlaceDetail.js";
import { openPlaceEditor } from "./PlaceEditor.js";
import { createSheet } from "../components/Sheet.js";
import { chip, toggle } from "../components/Controls.js";
import { toast } from "../components/Toast.js";
import * as store from "../services/store.js";
import { currentPosition } from "../services/geo.js";
import { haptic } from "../utils/haptics.js";
import { colorHex } from "../models/schema.js";
import { formatCount } from "../utils/format.js";

export function createMapPage({ onAmbientCovered, onPlacementChange } = {}) {
  const canvas = h("div.map__canvas");
  const countPill = h("div.mapcount.glass", [h("span.mapcount__n.num"), h("span.mapcount__l.cap")]);

  const locateBtn = h("button.orb", { "aria-label": "Show my location" }, [
    icon("locate", { size: 20 }),
  ]);
  const filterBtn = h("button.orb", { "aria-label": "Filter places" }, [
    icon("layers", { size: 20 }),
  ]);

  const reticle = h("div.reticle", [
    h("div.reticle__pulse"),
    h("div.reticle__ring"),
    h("div.reticle__dot"),
  ]);

  const placeBar = h("div.placebar.glass", [
    h("button.tbtn", { "data-quiet": true, onclick: () => exitPlacement() }, "Cancel"),
    h("div.placebar__hint.foot.dimmer", "Move the map"),
    h("button.tbtn", { "data-strong": true, onclick: () => confirmPlacement() }, "Place"),
  ]);

  const hint = h("div.maphint", [
    h("div.maphint__inner.glass", [
      icon("pin", { size: 16 }),
      h("span.sub", "Press and hold anywhere to remember a place"),
    ]),
  ]);

  const chrome = h("div.mapchrome", [
    h("div.mapchrome__top", [countPill, h("div.mapchrome__orbs", [locateBtn, filterBtn])]),
    hint,
  ]);

  const el = h("div.page.mappage", [canvas, chrome, reticle, placeBar]);

  let view = null;
  let filterCategory = null;
  let favouritesOnly = false;
  let placing = false;
  let detail = null;
  let userPos = null;

  /* ---- Data ------------------------------------------------------------- */

  function visiblePlaces() {
    let list = store.allPlaces();
    if (favouritesOnly) list = list.filter((p) => p.favorite);
    return list;
  }

  function refresh() {
    if (!view) return;
    const list = visiblePlaces();
    view.setPlaces(list);
    view.setCategoryFilter(filterCategory);

    const shown = filterCategory
      ? list.filter((p) => p.categoryId === filterCategory).length
      : list.length;
    countPill.querySelector(".mapcount__n").textContent = String(shown);
    countPill.querySelector(".mapcount__l").textContent = shown === 1 ? "place" : "places";
    countPill.classList.toggle("is-empty", shown === 0);

    hint.classList.toggle("is-on", store.placeCount() === 0);
    filterBtn.toggleAttribute("data-on", !!filterCategory || favouritesOnly);
  }

  /* ---- Selection -------------------------------------------------------- */

  function select(id) {
    if (!id) {
      view?.setSelected(null);
      return;
    }
    const place = store.getPlace(id);
    if (!place) return;
    view.setSelected(id);
    view.focus(place);
    detail = openPlaceDetail(id, {
      onChanged: refresh,
      onDeleted: () => {
        view.setSelected(null);
        refresh();
      },
    });
    detail?.sheet.el.addEventListener("transitionend", () => {}, { once: true });
    // Deselect when the sheet finally goes away.
    const observer = setInterval(() => {
      if (detail && !detail.sheet.isOpen) {
        clearInterval(observer);
        view.setSelected(null);
      }
    }, 400);
  }

  /* ---- Placement mode --------------------------------------------------- */

  // Placement takes over the bottom of the screen entirely: its bar stands in
  // for the tab bar rather than sitting on top of it. Two bars competing for
  // the same 58px is how a Cancel button ends up unreachable.
  function enterPlacement() {
    if (placing) return;
    placing = true;
    el.setAttribute("data-placing", "");
    onPlacementChange?.(true);
    haptic("light");
  }

  function exitPlacement() {
    if (!placing) return;
    placing = false;
    el.removeAttribute("data-placing");
    onPlacementChange?.(false);
  }

  function confirmPlacement() {
    const center = view.center();
    haptic("medium");
    exitPlacement();
    openPlaceEditor({
      coords: { lat: center.lat, lng: center.lng },
      onSaved: (place) => {
        refresh();
        setTimeout(() => {
          view.setSelected(place.id);
          view.focus(place);
        }, 200);
      },
    });
  }

  /* ---- Filters ---------------------------------------------------------- */

  function openFilters() {
    const sheet = createSheet({
      detents: ["auto"],
      onDismiss: () => setTimeout(() => sheet.destroy(), 60),
    });

    const chipsHost = h("div.filters__chips");

    const renderChips = () => {
      const counts = new Map();
      for (const p of store.allPlaces()) {
        counts.set(p.categoryId, (counts.get(p.categoryId) || 0) + 1);
      }
      mount(chipsHost, [
        chip({
          label: "All places",
          glyph: "globe",
          active: !filterCategory,
          onClick: () => {
            filterCategory = null;
            renderChips();
            refresh();
          },
        }),
        ...store
          .allCategories()
          .filter((c) => counts.get(c.id))
          .map((c) =>
            chip({
              label: c.name,
              glyph: c.glyph,
              colour: colorHex(c.color),
              count: counts.get(c.id) || 0,
              active: filterCategory === c.id,
              onClick: () => {
                filterCategory = filterCategory === c.id ? null : c.id;
                renderChips();
                refresh();
              },
            })
          ),
      ]);
    };
    renderChips();

    sheet.content.append(
      h("div.sheet__bar", [
        h("span"),
        h("div.sheet__title.t3", "Show on map"),
        h("button.tbtn", { "data-strong": true, onclick: () => sheet.dismiss() }, "Done"),
      ]),
      h("div.filters", [
        chipsHost,
        h("div.group", { style: { margin: "16px 0 0" } }, [
          toggle({
            label: "Favourites only",
            glyph: "heart",
            tint: "var(--danger)",
            value: favouritesOnly,
            onChange: (v) => {
              favouritesOnly = v;
              refresh();
            },
          }),
          toggle({
            label: "Group nearby pins",
            glyph: "layers",
            value: store.getSetting("clusterPins"),
            onChange: (v) => {
              store.setSetting("clusterPins", v);
              refresh();
            },
          }),
        ]),
      ])
    );
    sheet.present();
  }

  /* ---- Location --------------------------------------------------------- */

  async function locate() {
    haptic("light");
    locateBtn.setAttribute("data-busy", "");
    const position = await currentPosition();
    locateBtn.removeAttribute("data-busy");
    if (!position) {
      toast("Location unavailable", { glyph: "info", tone: "error" });
      return;
    }
    userPos = position;
    view.centerOnUser(position);
    locateBtn.setAttribute("data-on", "");
  }

  locateBtn.addEventListener("click", locate);
  filterBtn.addEventListener("click", () => {
    haptic("select");
    openFilters();
  });

  /* ---- Lifecycle -------------------------------------------------------- */

  let unsubscribe = null;
  let created = false;

  const page = {
    el,
    id: "map",

    onEnter() {
      onAmbientCovered?.(true);
      if (!created) {
        created = true;
        // Deferred to the first paint so the shell animates in before WebGL
        // initialisation blocks the main thread.
        requestAnimationFrame(() => {
          try {
            view = createMapView({
              container: canvas,
              onSelect: select,
              onLongPress: (coords) => {
                openPlaceEditor({
                  coords,
                  onSaved: (place) => {
                    refresh();
                    setTimeout(() => {
                      view.setSelected(place.id);
                      view.focus(place);
                    }, 200);
                  },
                });
              },
            });
            refresh();
            unsubscribe = store.on("change", refresh);
          } catch (err) {
            console.error("[map] failed to initialise", err);
            mount(
              canvas,
              h("div.empty", [
                h("div.empty__mark", [icon("globe", { size: 26 })]),
                h("div.t3", "The map couldn't start"),
                h("div.sub.dimmer", "Check your connection and reopen the app."),
              ])
            );
          }
        });
      } else {
        setTimeout(() => view?.resize(), 60);
        refresh();
      }
    },

    onLeave() {
      onAmbientCovered?.(false);
      exitPlacement();
    },

    onReselect() {
      // Tapping Map while already on Map recentres on everything you have.
      const list = visiblePlaces();
      if (list.length > 1) view?.fitTo(list);
      else if (userPos) view?.centerOnUser(userPos);
      haptic("light");
    },

    /** Called by the tab bar's Add button. */
    beginPlacement() {
      enterPlacement();
    },

    focusPlace(id) {
      const place = store.getPlace(id);
      if (!place || !view) return;
      view.setSelected(id);
      view.focus(place);
    },

    restyle() {
      view?.restyle();
    },

    onDestroy() {
      unsubscribe?.();
      view?.destroy();
    },
  };

  return page;
}
