/**
 * Ribbon.js — the XMB idea, kept and modernised.
 *
 * What made the Cross Media Bar satisfying was never the crossed layout; it
 * was that the *selection point is fixed and the content moves through it*.
 * You never hunted for a cursor. One axis chose context, the other chose
 * content, and both were one flick away.
 *
 * So: a horizontal rail whose focal point sits at a fixed x. Items scale and
 * brighten as they pass through it and recede as they leave, selection follows
 * whatever is nearest, and the content column below re-enters with a stagger
 * whenever it changes. It is not a copy of the PSP — there is no cross, no
 * wave behind it, no expanding column — but it is the same idea, which is what
 * was actually worth taking.
 */

import { h, mount } from "../utils/dom.js";
import { icon } from "./Icon.js";
import { haptic } from "../utils/haptics.js";
import { clamp } from "../utils/motion.js";

export function createRibbon({ items, value, onChange }) {
  const rail = h("div.ribbon__rail");
  const root = h("div.ribbon", [rail]);
  const buttons = new Map();
  let current = value || items[0]?.id;
  let focalX = 0;
  let raf = 0;
  let userScrolling = false;
  let settleTimer = 0;

  items.forEach((item) => {
    const el = h(
      "button.ribbon__item",
      {
        dataset: { id: item.id },
        onclick: () => {
          if (current === item.id) return;
          haptic("select");
          select(item.id, true);
        },
      },
      [
        h("span.ribbon__glyph", [icon(item.glyph, { size: 24, stroke: 1.5 })]),
        h("span.ribbon__label", item.label),
        h("span.ribbon__count.num", item.count !== undefined ? String(item.count) : ""),
      ]
    );
    buttons.set(item.id, el);
    rail.append(el);
  });

  /**
   * Distance from the focal point drives scale, opacity and colour.
   * The focal point is the rail's content-box left edge, and an item is
   * measured by its *leading* edge — items are left-aligned, so aligning their
   * centres would make a long label sit visibly off the mark.
   */
  function paint() {
    const railRect = rail.getBoundingClientRect();
    const gutter =
      parseFloat(getComputedStyle(rail).paddingLeft) || 20;
    focalX = railRect.left + gutter;
    let nearest = null;
    let nearestD = Infinity;

    for (const [id, el] of buttons) {
      const rect = el.getBoundingClientRect();
      const d = Math.abs(rect.left - focalX);
      const t = clamp(d / 210, 0, 1);
      el.style.setProperty("--t", t.toFixed(3));
      if (d < nearestD) {
        nearestD = d;
        nearest = id;
      }
    }

    // Selection follows the *user's* scrolling only. A programmatic scroll —
    // the one a tap triggers — must never be allowed to re-derive selection,
    // or a tap on a far item gets overruled by the animation that serves it.
    if (userScrolling && nearest && nearest !== current) {
      current = nearest;
      applyActive();
      haptic("select");
      onChange?.(current);
    }
  }

  /**
   * The last item has to be able to reach the focal point, which means trailing
   * space equal to the rail minus that item. Hard-coding a viewport fraction
   * looks fine until a label is long or the phone is small, and then the last
   * shelf simply cannot be selected.
   */
  function fitTrailingSpace() {
    const last = [...buttons.values()].pop();
    if (!last) return;
    const gutter = parseFloat(getComputedStyle(rail).paddingLeft) || 20;
    const space = Math.max(gutter, rail.clientWidth - last.offsetWidth - gutter);
    rail.style.paddingRight = `${space}px`;
  }

  function applyActive() {
    for (const [id, el] of buttons) el.classList.toggle("is-active", id === current);
  }

  function select(id, scroll) {
    current = id;
    applyActive();
    if (scroll) {
      const el = buttons.get(id);
      const gutter = parseFloat(getComputedStyle(rail).paddingLeft) || 20;
      userScrolling = false;
      rail.scrollTo({ left: el.offsetLeft - gutter, behavior: "smooth" });
    }
    onChange?.(id);
  }

  // A real finger on the rail is what licenses scroll-derived selection.
  const armUserScroll = () => {
    userScrolling = true;
    clearTimeout(settleTimer);
  };
  rail.addEventListener("pointerdown", armUserScroll, { passive: true });
  rail.addEventListener("touchstart", armUserScroll, { passive: true });
  rail.addEventListener("wheel", armUserScroll, { passive: true });

  rail.addEventListener(
    "scroll",
    () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(paint);
      clearTimeout(settleTimer);
      settleTimer = setTimeout(() => (userScrolling = false), 220);
    },
    { passive: true }
  );

  new ResizeObserver(() => {
    fitTrailingSpace();
    paint();
  }).observe(rail);

  requestAnimationFrame(() => {
    fitTrailingSpace();
    applyActive();
    paint();
  });

  return {
    el: root,
    get value() {
      return current;
    },
    setValue: (id) => select(id, true),
    setCounts(map) {
      for (const [id, el] of buttons) {
        const countEl = el.querySelector(".ribbon__count");
        if (map[id] !== undefined) countEl.textContent = String(map[id]);
      }
    },
  };
}

/**
 * The vertical axis. Replaces the column's contents and re-enters them with a
 * stagger, so switching context reads as a movement rather than a redraw.
 */
export function createColumn() {
  const el = h("div.column");
  let token = 0;

  return {
    el,
    set(children) {
      const mine = ++token;
      mount(el, children);
      if (mine !== token) return;
      Array.from(el.children).forEach((child, i) => {
        child.style.setProperty("--i", String(Math.min(i, 14)));
      });
      el.classList.remove("column--enter");
      void el.offsetHeight;
      el.classList.add("column--enter");
    },
  };
}
