/**
 * PlaceCard.js — how a place looks in a list.
 *
 * Two variants share one structure so the app has a single idea of "a place in
 * a row": `row` for dense lists, `wide` for the featured item at the top of a
 * collection. The thumbnail loads asynchronously and fades in; there is no
 * placeholder shimmer, because a shimmer on a dark surface reads as a glitch.
 */

import { h } from "../utils/dom.js";
import { icon } from "./Icon.js";
import * as store from "../services/store.js";
import { photoURL } from "../services/media.js";
import { relativeDate, shortAddress, formatDistance } from "../utils/format.js";

export function placeCard(place, { variant = "row", onClick, distance, showCategory = true } = {}) {
  const colour = store.placeColor(place);
  const glyph = store.placeGlyph(place);
  const category = store.getCategory(place.categoryId);
  const photoId = place.coverPhoto || place.photos?.[0];

  const thumb = h("div.pcard__thumb", { style: { "--pc": colour } }, [
    h("div.pcard__thumbGlyph", [icon(glyph, { size: variant === "wide" ? 24 : 20 })]),
  ]);

  if (photoId) {
    photoURL(photoId, { thumb: true }).then((url) => {
      if (!url) return;
      const img = h("img.pcard__img", { alt: "", loading: "lazy", src: url });
      img.addEventListener("load", () => img.setAttribute("data-in", ""), { once: true });
      thumb.append(img);
    });
  }

  const meta = [
    showCategory && category ? category.name : null,
    place.address ? shortAddress(place.address) : null,
    distance !== undefined ? formatDistance(distance) : null,
  ].filter(Boolean);

  return h(
    `div.pcard.pcard--${variant}.press`,
    {
      dataset: { id: place.id },
      onclick: () => onClick?.(place),
      role: "button",
    },
    [
      thumb,
      h("div.pcard__text", [
        h("div.pcard__title.t3.truncate", place.title || "Untitled place"),
        meta.length
          ? h("div.pcard__meta.foot.dimmer.truncate", meta.join(" · "))
          : place.description
          ? h("div.pcard__meta.foot.dimmer.truncate", place.description)
          : null,
        variant === "wide" && place.description
          ? h("div.pcard__desc.sub.dim.clamp-2", place.description)
          : null,
      ]),
      h("div.pcard__side", [
        place.favorite ? h("span.pcard__fav", [icon("heart", { size: 14, solid: true })]) : null,
        h("span.pcard__date.foot.faint", relativeDate(place.date || place.createdAt)),
      ]),
    ]
  );
}

/** A compact, horizontally-scrolling variant used under the map. */
export function placeTile(place, { onClick } = {}) {
  const colour = store.placeColor(place);
  const photoId = place.coverPhoto || place.photos?.[0];
  const tile = h(
    "button.ptile.press",
    { style: { "--pc": colour }, onclick: () => onClick?.(place) },
    [
      h("div.ptile__media", [h("div.ptile__glyph", [icon(store.placeGlyph(place), { size: 18 })])]),
      h("div.ptile__title.sub.truncate", place.title || "Untitled"),
      h("div.ptile__meta.foot.faint.truncate", store.getCategory(place.categoryId)?.name || ""),
    ]
  );
  if (photoId) {
    photoURL(photoId, { thumb: true }).then((url) => {
      if (!url) return;
      const img = h("img.ptile__img", { alt: "", src: url });
      img.addEventListener("load", () => img.setAttribute("data-in", ""), { once: true });
      tile.querySelector(".ptile__media").append(img);
    });
  }
  return tile;
}
