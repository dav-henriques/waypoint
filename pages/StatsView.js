/**
 * StatsView.js — the shape of a year of walking around.
 *
 * Two charts, both deliberately minimal:
 *
 *   Twelve months of activity is a single series, so it gets a single hue (the
 *   time-of-day accent) and no legend — the heading names it. Only the busiest
 *   month and the current one are labelled; a number over every bar is noise.
 *
 *   The category breakdown is direct-labelled on every row with a glyph, a
 *   name and a count, so identity never rests on colour. The bar simply
 *   borrows the colour that category already owns everywhere else.
 *
 * Both have hit targets and a tap-to-read value, because a chart you cannot
 * interrogate is a picture.
 */

import { h, mount } from "../utils/dom.js";
import { icon } from "../components/Icon.js";
import * as store from "../services/store.js";
import { formatCount, formatDate } from "../utils/format.js";
import { colorHex } from "../models/schema.js";
import { haptic } from "../utils/haptics.js";

export function createStatsView({ onOpenPlace } = {}) {
  const root = h("div.stats");

  function statTile(value, label, { accent = false, glyph } = {}) {
    return h(`div.stat${accent ? ".stat--accent" : ""}`, [
      glyph ? h("div.stat__glyph", [icon(glyph, { size: 16 })]) : null,
      h("div.stat__value.num", String(value)),
      h("div.stat__label.cap", label),
    ]);
  }

  function monthsChart(months) {
    const max = Math.max(1, ...months.map((m) => m.count));
    const peak = months.reduce((a, b) => (b.count > a.count ? b : a), months[0]);
    const readout = h("div.chart__readout.foot.dimmer", "");

    const bars = months.map((m, i) => {
      const ratio = m.count / max;
      const bar = h(
        "button.chart__bar",
        {
          style: { "--r": ratio.toFixed(3), "--i": String(i) },
          dataset: {
            now: i === months.length - 1 ? "true" : null,
            zero: m.count === 0 ? "true" : null,
          },
          "aria-label": `${m.full}: ${formatCount(m.count, "place")}`,
          onclick: () => {
            haptic("select");
            readout.textContent = `${m.full} · ${formatCount(m.count, "place")}`;
          },
        },
        [
          h("span.chart__fill"),
          // Selective labels only: the peak and the current month.
          m.count > 0 && (m === peak || i === months.length - 1)
            ? h("span.chart__val.num", String(m.count))
            : null,
        ]
      );
      return h("div.chart__slot", [bar, h("span.chart__tick.cap", m.label)]);
    });

    return h("div.chart", [
      h("div.chart__plot", bars),
      h("div.chart__base"),
      readout,
    ]);
  }

  function categoryChart(breakdown) {
    const max = Math.max(1, ...breakdown.map((b) => b.count));
    return h(
      "div.bars",
      breakdown.map((b, i) =>
        h("div.bars__row", { style: { "--i": String(i) } }, [
          h("span.bars__glyph", { style: { "--pc": colorHex(b.category.color) } }, [
            icon(b.category.glyph, { size: 15 }),
          ]),
          h("span.bars__name.sub.truncate", b.category.name),
          h("span.bars__track", [
            h("span.bars__fill", {
              style: {
                "--pc": colorHex(b.category.color),
                "--w": `${(b.count / max) * 100}%`,
              },
            }),
          ]),
          h("span.bars__count.foot.num", String(b.count)),
        ])
      )
    );
  }

  function render() {
    const s = store.statistics();

    if (!s.total) {
      mount(root, [
        h("div.empty", [
          h("div.empty__mark", [icon("chart", { size: 24 })]),
          h("div.t3", "Nothing to count yet"),
          h("div.sub.dimmer", "Add a few places and this page starts telling you things."),
        ]),
      ]);
      return;
    }

    mount(root, [
      h("div.stats__grid", [
        statTile(s.total, s.total === 1 ? "Place" : "Places", { accent: true }),
        statTile(s.favorites, "Favourites"),
        statTile(s.photos, "Photos"),
        statTile(s.cities || "—", s.cities === 1 ? "City" : "Cities"),
      ]),

      h("div.stats__section", [
        h("div.cap.stats__label", "Places added, last 12 months"),
        monthsChart(s.months),
      ]),

      s.categoryBreakdown.length
        ? h("div.stats__section", [
            h("div.cap.stats__label", "By category"),
            categoryChart(s.categoryBreakdown),
          ])
        : null,

      h("div.stats__section", [
        h("div.cap.stats__label", "Highlights"),
        h("div.group", { style: { margin: 0 } }, [
          s.topCategory
            ? h("div.row-item", [
                h(
                  "span.row-item__glyph",
                  { style: { color: colorHex(s.topCategory.category.color) } },
                  [icon(s.topCategory.category.glyph, { size: 20 })]
                ),
                h("span.row-item__text", [
                  h("div.body", "Most collected"),
                  h("div.foot.dimmer", formatCount(s.topCategory.count, "place")),
                ]),
                h("span.row-item__value", s.topCategory.category.name),
              ])
            : null,

          h("div.row-item", [
            h("span.row-item__glyph", [icon("clock", { size: 20 })]),
            h("span.row-item__text", [h("div.body", "Added this month")]),
            h("span.row-item__value.num", String(s.thisMonth)),
          ]),

          h("div.row-item", [
            h("span.row-item__glyph", [icon("bookmark", { size: 20 })]),
            h("span.row-item__text", [
              h("div.body", "Still to visit"),
              h("div.foot.dimmer", "Places you saved but haven't reached"),
            ]),
            h("span.row-item__value.num", String(s.unvisited)),
          ]),

          s.oldest
            ? h(
                "button.row-item",
                { onclick: () => onOpenPlace?.(s.oldest.id) },
                [
                  h("span.row-item__glyph", [icon("sparkle", { size: 20 })]),
                  h("span.row-item__text", [
                    h("div.body.truncate", "First place"),
                    h("div.foot.dimmer.truncate", s.oldest.title),
                  ]),
                  h("span.row-item__value", formatDate(s.oldest.date || s.oldest.createdAt)),
                  h("span.row-item__chev", [icon("chevronRight", { size: 16 })]),
                ]
              )
            : null,

          s.newest && s.newest !== s.oldest
            ? h(
                "button.row-item",
                { onclick: () => onOpenPlace?.(s.newest.id) },
                [
                  h("span.row-item__glyph", [icon("pin", { size: 20 })]),
                  h("span.row-item__text", [
                    h("div.body.truncate", "Newest place"),
                    h("div.foot.dimmer.truncate", s.newest.title),
                  ]),
                  h("span.row-item__value", formatDate(s.newest.date || s.newest.createdAt)),
                  h("span.row-item__chev", [icon("chevronRight", { size: 16 })]),
                ]
              )
            : null,
        ]),
      ]),

      s.cityList.length
        ? h("div.stats__section", [
            h("div.cap.stats__label", `Cities explored · ${s.cityList.length}`),
            h(
              "div.stats__cities",
              s.cityList.map((c) => h("span.tagpill.tagpill--static", c))
            ),
          ])
        : null,
    ]);
  }

  render();
  root.refresh = render;
  return root;
}
