/**
 * TabBar.js — five destinations, one of which isn't a destination.
 *
 * Add sits in the middle because that is where a thumb rests, but it opens a
 * sheet rather than switching tabs, so it is drawn as a distinct element:
 * accent-tinted, slightly raised, unmistakably an action. Giving it the same
 * treatment as the other four would promise a screen that never arrives.
 */

import { h } from "../utils/dom.js";
import { icon } from "./Icon.js";
import { haptic } from "../utils/haptics.js";

export const TABS = [
  { id: "map", label: "Map", glyph: "map" },
  { id: "search", label: "Search", glyph: "search" },
  { id: "add", label: "Add", glyph: "plus", action: true },
  { id: "collections", label: "Library", glyph: "library" },
  { id: "settings", label: "Settings", glyph: "sliders" },
];

export function createTabBar({ onSelect, onAdd }) {
  const items = new Map();

  const buttons = TABS.map((tab) => {
    const glyph = h("span.tab__glyph", [icon(tab.glyph, { size: 23 })]);
    const el = h(
      `button.tab${tab.action ? ".tab--action" : ""}`,
      {
        dataset: { tab: tab.id },
        "aria-label": tab.label,
        onclick: () => {
          if (tab.action) {
            haptic("medium");
            bump(el);
            onAdd?.();
            return;
          }
          haptic("select");
          bump(el);
          onSelect?.(tab.id);
        },
      },
      [h("span.tab__glow"), glyph, h("span.tab__label.cap", tab.label)]
    );
    items.set(tab.id, el);
    return el;
  });

  const bar = h("nav.tabbar.glass", { role: "tablist" }, buttons);
  const root = h("div.tabbar-host", [bar]);

  /** A single spring on press. Small enough to feel like feedback, not a toy. */
  function bump(el) {
    const glyphEl = el.querySelector(".tab__glyph");
    glyphEl.animate(
      [
        { transform: "scale(1)" },
        { transform: "scale(0.84)", offset: 0.28 },
        { transform: "scale(1.1)", offset: 0.62 },
        { transform: "scale(1)" },
      ],
      { duration: 460, easing: "cubic-bezier(.32,.72,0,1)" }
    );
  }

  return {
    el: root,
    setActive(id) {
      for (const [tabId, el] of items) {
        el.classList.toggle("is-active", tabId === id);
        el.setAttribute("aria-selected", tabId === id ? "true" : "false");
      }
    },
    /** Hidden while a full-screen editor is up. */
    setVisible(visible) {
      root.classList.toggle("is-hidden", !visible);
    },
  };
}
