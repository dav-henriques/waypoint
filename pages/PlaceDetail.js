/**
 * PlaceDetail.js — one place, in full.
 *
 * Presented as a sheet with two detents, so the same object serves both jobs:
 * at the lower detent it is the card that rises when you tap a pin, with the
 * map still visible and still pannable behind it; dragged up it becomes the
 * full record. Building a separate "peek card" and "detail page" would have
 * meant two designs of the same thing that drift apart within a month.
 */

import { h, mount } from "../utils/dom.js";
import { icon } from "../components/Icon.js";
import { createSheet } from "../components/Sheet.js";
import { actionSheet } from "../components/ActionSheet.js";
import { toast } from "../components/Toast.js";
import { lightbox } from "../components/Gallery.js";
import { openPlaceEditor } from "./PlaceEditor.js";
import * as store from "../services/store.js";
import { photoURL } from "../services/media.js";
import { formatCoords, formatDate, relativeDate } from "../utils/format.js";
import { haptic } from "../utils/haptics.js";
import { colorHex } from "../models/schema.js";

export function openPlaceDetail(placeId, { onChanged, onDeleted, detents } = {}) {
  let place = store.getPlace(placeId);
  if (!place) return null;

  const sheet = createSheet({
    detents: detents || [0.44, 0.94],
    initial: 0,
    className: "sheet--detail",
    scrimOpacity: 0.35,
    onDismiss: () => setTimeout(() => sheet.destroy(), 80),
  });

  const body = h("div.detail", { dataset: { scroll: "true" } });
  sheet.content.append(body);

  function render() {
    place = store.getPlace(placeId);
    if (!place) {
      sheet.dismiss();
      return;
    }
    const colour = store.placeColor(place);
    const glyph = store.placeGlyph(place);
    const category = store.getCategory(place.categoryId);
    const collections = store.collectionsForPlace(place.id);

    /* Hero — a photo if there is one, otherwise a colour field with the glyph.
       An empty grey rectangle would be the honest option and the wrong one. */
    const hero = h("div.detail__hero", { style: { "--pc": colour } }, [
      h("div.detail__heroGlyph", [icon(glyph, { size: 30 })]),
      h("div.detail__heroScrim"),
    ]);
    const coverId = place.coverPhoto || place.photos?.[0];
    if (coverId) {
      photoURL(coverId).then((url) => {
        if (!url) return;
        const img = h("img.detail__heroImg", { alt: "", src: url });
        img.addEventListener("load", () => img.setAttribute("data-in", ""), { once: true });
        hero.prepend(img);
        hero.setAttribute("data-photo", "");
        img.addEventListener("click", () => lightbox(place.photos, 0));
      });
    }

    const favBtn = h(
      "button.detail__act",
      {
        dataset: place.favorite ? { on: "true" } : {},
        onclick: async () => {
          haptic(place.favorite ? "select" : "success");
          await store.toggleFavorite(place.id);
          onChanged?.();
          render();
        },
      },
      [
        icon("heart", { size: 19, solid: place.favorite }),
        h("span.cap", place.favorite ? "Saved" : "Favourite"),
      ]
    );

    const actions = h("div.detail__acts", [
      favBtn,
      h(
        "button.detail__act",
        {
          onclick: () =>
            openPlaceEditor({
              place,
              onSaved: () => {
                onChanged?.();
                render();
              },
              onDeleted: (id) => {
                onDeleted?.(id);
                sheet.dismiss();
              },
            }),
        },
        [icon("pencil", { size: 19 }), h("span.cap", "Edit")]
      ),
      h(
        "button.detail__act",
        { onclick: () => chooseCollections() },
        [icon("folder", { size: 19 }), h("span.cap", "Collect")]
      ),
      h(
        "button.detail__act",
        { onclick: () => shareOrCopy() },
        [icon("share", { size: 19 }), h("span.cap", "Share")]
      ),
    ]);

    const meta = h("div.detail__meta", [
      place.address
        ? h("div.detail__metaRow", [
            icon("pin", { size: 16 }),
            h("span.sub.dim", place.address),
          ])
        : null,
      h("div.detail__metaRow", [
        icon("compass", { size: 16 }),
        h("span.sub.dim.num", formatCoords(place.lat, place.lng)),
      ]),
      h("div.detail__metaRow", [
        icon("calendar", { size: 16 }),
        h("span.sub.dim", formatDate(place.date || place.createdAt, { forceYear: true })),
      ]),
      !place.visited
        ? h("div.detail__metaRow", [
            icon("bookmark", { size: 16 }),
            h("span.sub.dim", "Somewhere to go"),
          ])
        : null,
    ]);

    mount(body, [
      hero,
      h("div.detail__inner", [
        h("div.detail__head", [
          h("div.detail__titleRow", [
            h("h1.detail__title.t1", place.title || "Untitled place"),
          ]),
          category
            ? h("div.detail__cat", { style: { "--pc": colorHex(category.color) } }, [
                icon(category.glyph, { size: 14 }),
                h("span.cap", category.name),
              ])
            : null,
        ]),

        actions,

        place.description
          ? h("p.detail__desc.body.dim", place.description)
          : null,

        meta,

        place.tags?.length
          ? h("div.detail__tags", place.tags.map((t) => h("span.tagpill.tagpill--static", t)))
          : null,

        place.photos?.length
          ? h("div.detail__section", [
              h("div.cap.detail__label", `${place.photos.length} photo${place.photos.length > 1 ? "s" : ""}`),
              h(
                "div.pgrid",
                place.photos.map((id, index) => {
                  const cell = h("button.gphoto.press", {
                    style: { "--i": index },
                    onclick: () => lightbox(place.photos, index),
                  });
                  photoURL(id, { thumb: true }).then((url) => {
                    if (!url) return;
                    const img = h("img", { alt: "", src: url });
                    img.addEventListener("load", () => img.setAttribute("data-in", ""), { once: true });
                    cell.append(img);
                  });
                  return cell;
                })
              ),
            ])
          : null,

        place.notes
          ? h("div.detail__section", [
              h("div.cap.detail__label", [icon("lock", { size: 11, stroke: 2 }), " Private notes"]),
              h("div.detail__notes.sub", place.notes),
            ])
          : null,

        collections.length
          ? h("div.detail__section", [
              h("div.cap.detail__label", "In collections"),
              h(
                "div.detail__chips",
                collections.map((c) =>
                  h("span.chip", { style: { "--chip-c": colorHex(c.color) }, dataset: { on: "true" } }, [
                    icon(c.glyph, { size: 15 }),
                    h("span.chip__label", c.name),
                  ])
                )
              ),
            ])
          : null,

        h("div.detail__stamp.foot.faint", [
          `Remembered ${relativeDate(place.createdAt).toLowerCase()}`,
          place.updatedAt !== place.createdAt
            ? ` · edited ${relativeDate(place.updatedAt).toLowerCase()}`
            : "",
        ]),
      ]),
    ]);
  }

  async function chooseCollections() {
    const all = store.allCollections();
    if (!all.length) {
      toast("Create a collection in the Library first", { glyph: "folder" });
      return;
    }
    const current = new Set(store.collectionsForPlace(place.id).map((c) => c.id));
    const choice = await actionSheet({
      title: "Add to collection",
      actions: all.map((c) => ({
        id: c.id,
        label: current.has(c.id) ? `${c.name}  ✓` : c.name,
        glyph: c.glyph,
      })),
    });
    if (!choice) return;
    const nowMember = !current.has(choice);
    await store.setPlaceInCollection(choice, place.id, nowMember);
    haptic("success");
    onChanged?.();
    render();
    toast(nowMember ? "Added to collection" : "Removed from collection", { glyph: "folder" });
  }

  async function shareOrCopy() {
    const text = `${place.title}\n${place.address || ""}\nhttps://www.openstreetmap.org/?mlat=${place.lat}&mlon=${place.lng}#map=17/${place.lat}/${place.lng}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: place.title, text });
        return;
      } catch { /* user cancelled */ }
    }
    try {
      await navigator.clipboard.writeText(text);
      toast("Copied to clipboard", { glyph: "check", tone: "success" });
    } catch {
      toast("Couldn't share this place", { glyph: "info", tone: "error" });
    }
  }

  render();
  sheet.present();
  return { sheet, refresh: render };
}
