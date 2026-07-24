/**
 * CollectionDetailPage.js — one collection, pushed onto the stack.
 * A pushed page rather than a sheet, because it has its own back gesture and
 * its own place in history.
 */

import { h, mount, bindScrollShadow } from "../utils/dom.js";
import { icon } from "../components/Icon.js";
import { placeCard } from "../components/PlaceCard.js";
import { openPlaceDetail } from "./PlaceDetail.js";
import { openCollectionEditor } from "./CollectionEditor.js";
import { actionSheet } from "../components/ActionSheet.js";
import { toast } from "../components/Toast.js";
import * as store from "../services/store.js";
import { colorHex } from "../models/schema.js";
import { formatCount } from "../utils/format.js";
import { haptic } from "../utils/haptics.js";

export function createCollectionDetailPage({ collectionId, onBack, onFocusPlace }) {
  const body = h("div.coldetail");
  const scroll = h("div.page__scroll", [body]);

  const title = h("div.navbar__title", "");
  const navbar = h("div.navbar", [
    h("div.navbar__side", [
      h("button.tbtn", { onclick: () => onBack?.() }, [
        h("span.row", [icon("chevronLeft", { size: 20 }), "Library"]),
      ]),
    ]),
    title,
    h("div.navbar__side", { "data-end": true }, [
      h("button.tbtn", { onclick: () => menu() }, [icon("more", { size: 20 })]),
    ]),
  ]);

  const el = h("div.page", [navbar, scroll]);
  bindScrollShadow(scroll, navbar);

  async function menu() {
    const collection = store.getCollection(collectionId);
    if (!collection) return;
    const choice = await actionSheet({
      title: collection.name,
      actions: [
        { id: "edit", label: "Edit collection", glyph: "pencil" },
        { id: "add", label: "Add places", glyph: "plus" },
      ],
    });
    if (choice === "edit") {
      openCollectionEditor({
        collection,
        onSaved: render,
        onDeleted: () => onBack?.(),
      });
    } else if (choice === "add") {
      addPlaces();
    }
  }

  async function addPlaces() {
    const collection = store.getCollection(collectionId);
    const candidates = store.allPlaces().filter((p) => !collection.placeIds.includes(p.id));
    if (!candidates.length) {
      toast("Every place is already in here", { glyph: "check" });
      return;
    }
    const choice = await actionSheet({
      title: "Add to " + collection.name,
      actions: candidates.slice(0, 12).map((p) => ({
        id: p.id,
        label: p.title || "Untitled",
        glyph: store.placeGlyph(p),
      })),
    });
    if (!choice) return;
    await store.setPlaceInCollection(collectionId, choice, true);
    haptic("success");
    render();
  }

  function render() {
    const collection = store.getCollection(collectionId);
    if (!collection) {
      onBack?.();
      return;
    }
    const places = store.placesInCollection(collectionId);
    const hex = colorHex(collection.color);
    title.textContent = collection.name;

    mount(body, [
      h("div.coldetail__head", { style: { "--pc": hex } }, [
        h("div.coldetail__glyph", [icon(collection.glyph, { size: 30 })]),
        h("h1.display", collection.name),
        collection.description
          ? h("p.body.dim.coldetail__desc", collection.description)
          : null,
        h("div.cap.dimmer", formatCount(places.length, "place")),
      ]),

      places.length
        ? h(
            "div.plist.stagger",
            places.map((p) =>
              placeCard(p, {
                onClick: (place) => {
                  haptic("light");
                  openPlaceDetail(place.id, {
                    onChanged: render,
                    onDeleted: render,
                    detents: [0.6, 0.94],
                  });
                  onFocusPlace?.(place.id);
                },
              })
            )
          )
        : h("div.empty", [
            h("div.empty__mark", [icon("folder", { size: 24 })]),
            h("div.t3", "Nothing collected yet"),
            h("div.sub.dimmer", "Open a place and tap Collect to file it here."),
            h("button.btn.btn--ghost.btn--sm", { onclick: addPlaces, style: { marginTop: "8px" } }, [
              icon("plus", { size: 16 }),
              "Add places",
            ]),
          ]),
    ]);

    const list = body.querySelector(".plist");
    if (list) {
      Array.from(list.children).forEach((c, i) =>
        c.style.setProperty("--i", String(Math.min(i, 12)))
      );
    }
  }

  let unsubscribe = null;

  return {
    el,
    onEnter() {
      render();
      unsubscribe = store.on("change", render);
    },
    onLeave() {
      unsubscribe?.();
      unsubscribe = null;
    },
    onDestroy() {
      unsubscribe?.();
    },
  };
}
