/**
 * SearchPage.js — instant, local, and never a spinner.
 *
 * Because the whole archive lives in memory, results are computed on every
 * keystroke with no debounce and no async boundary. The empty state is not
 * empty: with no query it shows the tags and categories you actually use,
 * which turns the search screen into a browsing screen the rest of the time.
 */

import { h, mount, bindScrollShadow } from "../utils/dom.js";
import { icon } from "../components/Icon.js";
import { chip } from "../components/Controls.js";
import { placeCard } from "../components/PlaceCard.js";
import { openPlaceDetail } from "./PlaceDetail.js";
import * as store from "../services/store.js";
import { normalise, formatCount } from "../utils/format.js";
import { haptic } from "../utils/haptics.js";
import { colorHex } from "../models/schema.js";

export function createSearchPage({ onFocusPlace } = {}) {
  let query = "";
  let activeTag = null;
  let activeCategory = null;

  const input = h("input.searchbar__input", {
    type: "search",
    placeholder: "Search your places",
    enterkeyhint: "search",
    autocomplete: "off",
    autocorrect: "off",
    spellcheck: false,
    oninput: (e) => {
      query = e.target.value;
      clearBtn.classList.toggle("is-on", !!query);
      render();
    },
  });

  const clearBtn = h(
    "button.searchbar__clear",
    {
      onclick: () => {
        query = "";
        input.value = "";
        clearBtn.classList.remove("is-on");
        input.focus();
        render();
      },
    },
    [icon("close", { size: 14, stroke: 2.2 })]
  );

  const bar = h("div.searchbar", [
    h("div.searchbar__field", [icon("search", { size: 18 }), input, clearBtn]),
  ]);

  const results = h("div.search__results");
  const scroll = h("div.page__scroll", [results]);

  const header = h("div.hd", [
    h("div.hd__title", [h("h1.display", "Search")]),
  ]);

  const el = h("div.page.searchpage", [header, bar, scroll]);
  bindScrollShadow(scroll, bar, 2);

  function open(place) {
    haptic("light");
    openPlaceDetail(place.id, {
      onChanged: render,
      onDeleted: render,
      detents: [0.6, 0.94],
    });
    onFocusPlace?.(place.id);
  }

  function matchesFilters(place) {
    if (activeCategory && place.categoryId !== activeCategory) return false;
    if (activeTag && !(place.tags || []).some((t) => normalise(t) === normalise(activeTag))) {
      return false;
    }
    return true;
  }

  function render() {
    const hasQuery = query.trim().length > 0;
    const base = hasQuery ? store.search(query) : store.allPlaces();
    const list = base.filter(matchesFilters);

    const tags = store.allTags();
    const categories = store.allCategories();
    const counts = new Map();
    for (const p of store.allPlaces()) {
      counts.set(p.categoryId, (counts.get(p.categoryId) || 0) + 1);
    }

    const filterRow = h("div.chiprow", [
      h("div.chiprow__scroll", [
        ...categories
          .filter((c) => counts.get(c.id))
          .map((c) =>
            chip({
              label: c.name,
              glyph: c.glyph,
              colour: colorHex(c.color),
              count: counts.get(c.id),
              active: activeCategory === c.id,
              onClick: () => {
                activeCategory = activeCategory === c.id ? null : c.id;
                render();
              },
            })
          ),
      ]),
    ]);

    const tagRow = tags.length
      ? h("div.chiprow", [
          h("div.chiprow__scroll", [
            ...tags.slice(0, 24).map((t) =>
              chip({
                label: `#${t.tag}`,
                count: t.count,
                active: normalise(activeTag) === normalise(t.tag),
                onClick: () => {
                  activeTag = normalise(activeTag) === normalise(t.tag) ? null : t.tag;
                  render();
                },
              })
            ),
          ]),
        ])
      : null;

    const listEl = list.length
      ? h(
          "div.plist.stagger",
          list.slice(0, 300).map((p) => placeCard(p, { onClick: open }))
        )
      : null;
    if (listEl) {
      Array.from(listEl.children).forEach((c, i) =>
        c.style.setProperty("--i", String(Math.min(i, 12)))
      );
    }

    mount(results, [
      h("div.search__filters", [
        h("div.cap.search__label", "Categories"),
        filterRow,
        tagRow ? h("div.cap.search__label", { style: { marginTop: "18px" } }, "Tags") : null,
        tagRow,
      ]),

      h("div.search__count.cap", [
        hasQuery || activeCategory || activeTag
          ? `${formatCount(list.length, "result")}`
          : `${formatCount(list.length, "place")}`,
      ]),

      listEl ||
        h("div.empty", [
          h("div.empty__mark", [icon(hasQuery ? "search" : "pin", { size: 24 })]),
          h("div.t3", hasQuery ? "Nothing matches" : "Nothing here yet"),
          h(
            "div.sub.dimmer",
            hasQuery
              ? "Try a shorter word, or a tag."
              : "Places you add will be searchable the moment you save them."
          ),
        ]),
    ]);
  }

  let unsubscribe = null;

  return {
    el,
    id: "search",
    onEnter() {
      render();
      unsubscribe = store.on("change", render);
    },
    onLeave() {
      unsubscribe?.();
      unsubscribe = null;
      input.blur();
    },
    onReselect() {
      input.focus();
      scroll.scrollTo({ top: 0, behavior: "smooth" });
    },
    onDestroy() {
      unsubscribe?.();
    },
  };
}
