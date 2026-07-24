/**
 * LibraryPage.js — everything that isn't the map, on two axes.
 *
 * The horizontal rail picks a context; the vertical column holds its content.
 * This is where the PSP's idea earns its place in a 2026 phone app: five
 * shelves that would otherwise have needed five tabs (and a tab bar has room
 * for five things total, of which one is already the map) collapse into one
 * screen that is browsed with a thumb flick.
 */

import { h, mount, bindScrollShadow } from "../utils/dom.js";
import { icon } from "../components/Icon.js";
import { createRibbon, createColumn } from "../components/Ribbon.js";
import { placeCard } from "../components/PlaceCard.js";
import { createStatsView } from "./StatsView.js";
import { openPlaceDetail } from "./PlaceDetail.js";
import { openCollectionEditor } from "./CollectionEditor.js";
import { openCategoryEditor } from "./CategoryEditor.js";
import * as store from "../services/store.js";
import { colorHex } from "../models/schema.js";
import { formatCount } from "../utils/format.js";
import { haptic } from "../utils/haptics.js";

const SHELVES = [
  { id: "collections", label: "Collections", glyph: "folder" },
  { id: "favourites", label: "Favourites", glyph: "heart" },
  { id: "all", label: "All places", glyph: "pin" },
  { id: "categories", label: "Categories", glyph: "tag" },
  { id: "stats", label: "Statistics", glyph: "chart" },
];

export function createLibraryPage({ onOpenCollection, onFocusPlace }) {
  const column = createColumn();
  const ribbon = createRibbon({
    items: SHELVES,
    value: "collections",
    onChange: () => render(),
  });

  const header = h("div.hd", [h("div.hd__title", [h("h1.display", "Library")])]);
  const scroll = h("div.page__scroll", [column.el]);
  const el = h("div.page.librarypage", [header, ribbon.el, scroll]);
  bindScrollShadow(scroll, ribbon.el, 2);

  const stats = createStatsView({
    onOpenPlace: (id) => openPlace(store.getPlace(id)),
  });

  function openPlace(place) {
    if (!place) return;
    haptic("light");
    openPlaceDetail(place.id, {
      onChanged: render,
      onDeleted: render,
      detents: [0.6, 0.94],
    });
    onFocusPlace?.(place.id);
  }

  function placeList(places, empty) {
    if (!places.length) return empty;
    const list = h(
      "div.plist.stagger",
      places.map((p) => placeCard(p, { onClick: openPlace }))
    );
    Array.from(list.children).forEach((c, i) =>
      c.style.setProperty("--i", String(Math.min(i, 12)))
    );
    return list;
  }

  function renderCollections() {
    const collections = store.allCollections();
    return [
      h("div.colgrid", [
        ...collections.map((c) => {
          const count = c.placeIds.filter((id) => store.getPlace(id)).length;
          return h(
            "button.ccard",
            {
              style: { "--pc": colorHex(c.color) },
              onclick: () => {
                haptic("light");
                onOpenCollection?.(c.id);
              },
            },
            [
              h("div.ccard__glyph", [icon(c.glyph, { size: 22 })]),
              h("div.ccard__text", [
                h("div.t3.truncate", c.name),
                h("div.ccard__count.foot.dimmer", formatCount(count, "place")),
              ]),
              h("span.row-item__chev", [icon("chevronRight", { size: 17 })]),
            ]
          );
        }),
        h(
          "button.ccard.ccard--new",
          {
            onclick: () => {
              haptic("light");
              openCollectionEditor({ onSaved: render });
            },
          },
          [
            h("div.ccard__glyph", [icon("plus", { size: 22 })]),
            h("div.ccard__text", [h("div.t3", "New collection")]),
          ]
        ),
      ]),
      !collections.length
        ? h("div.empty", [
            h("div.empty__mark", [icon("folder", { size: 24 })]),
            h("div.t3", "Group places that belong together"),
            h(
              "div.sub.dimmer",
              "Best coffee, skate spots, places to shoot at golden hour — whatever the thread is."
            ),
          ])
        : null,
    ];
  }

  function renderCategories() {
    const counts = new Map();
    for (const p of store.allPlaces()) {
      counts.set(p.categoryId, (counts.get(p.categoryId) || 0) + 1);
    }
    return [
      h("div.group", { style: { marginInline: "var(--gutter)" } }, [
        ...store.allCategories().map((c) =>
          h(
            "button.row-item",
            {
              onclick: () => {
                haptic("light");
                openCategoryEditor({ category: c, onSaved: render, onDeleted: render });
              },
            },
            [
              h(
                "span.row-item__glyph",
                { style: { color: colorHex(c.color) } },
                [icon(c.glyph, { size: 20 })]
              ),
              h("span.row-item__text.body", c.name),
              h("span.row-item__value.num", String(counts.get(c.id) || 0)),
              h("span.row-item__chev", [icon("chevronRight", { size: 16 })]),
            ]
          )
        ),
      ]),
      h(
        "button.btn.btn--ghost.btn--wide",
        {
          style: { margin: "0 var(--gutter)", width: "calc(100% - var(--gutter) * 2)" },
          onclick: () => {
            haptic("light");
            openCategoryEditor({ onSaved: render });
          },
        },
        [icon("plus", { size: 18 }), "New category"]
      ),
    ];
  }

  function render() {
    const shelf = ribbon.value;

    ribbon.setCounts({
      collections: store.allCollections().length,
      favourites: store.favorites().length,
      all: store.placeCount(),
      categories: store.allCategories().length,
      stats: "",
    });

    if (shelf === "collections") {
      column.set(renderCollections());
    } else if (shelf === "favourites") {
      column.set(
        placeList(
          store.favorites(),
          h("div.empty", [
            h("div.empty__mark", [icon("heart", { size: 24 })]),
            h("div.t3", "No favourites yet"),
            h("div.sub.dimmer", "Tap the heart on a place to keep it close."),
          ])
        )
      );
    } else if (shelf === "all") {
      column.set(
        placeList(
          store.allPlaces(),
          h("div.empty", [
            h("div.empty__mark", [icon("pin", { size: 24 })]),
            h("div.t3", "Your map is empty"),
            h("div.sub.dimmer", "Hold anywhere on the map to remember your first place."),
          ])
        )
      );
    } else if (shelf === "categories") {
      column.set(renderCategories());
    } else {
      stats.refresh();
      column.set([stats]);
    }

    scroll.scrollTop = 0;
  }

  let unsubscribe = null;

  return {
    el,
    id: "collections",
    onEnter() {
      render();
      unsubscribe = store.on("change", render);
    },
    onLeave() {
      unsubscribe?.();
      unsubscribe = null;
    },
    onReselect() {
      scroll.scrollTo({ top: 0, behavior: "smooth" });
    },
    onDestroy() {
      unsubscribe?.();
    },
  };
}
