/**
 * Sheet.js — the iOS bottom sheet, rebuilt rather than approximated.
 *
 * Four details separate a sheet that feels native from one that doesn't, and
 * all four are here:
 *
 *   1. Detents. The sheet rests at defined heights, and a release snaps to the
 *      nearest one after momentum is projected forward — so a flick goes where
 *      the user aimed, not where their finger happened to stop.
 *   2. Scroll handoff. Dragging inside scrollable content only moves the sheet
 *      when the content is already at its top and the gesture is downward.
 *      Getting this wrong is the single loudest "this is a web page" tell.
 *   3. Rubber banding. Past the top detent the sheet still moves, with
 *      resistance. Hard stops feel broken; elastic ones feel solid.
 *   4. The presenting view recedes. The shell scales back and dims behind the
 *      sheet, which is what makes the sheet read as being in front of
 *      something rather than pasted onto it.
 */

import { h, on, reflow } from "../utils/dom.js";
import { draggable } from "../utils/gestures.js";
import { spring, project, rubberBand, clamp, prefersReducedMotion } from "../utils/motion.js";
import { haptic } from "../utils/haptics.js";

let openCount = 0;

export function createSheet({
  detents = [0.94],
  initial = 0,
  dismissible = true,
  onDismiss,
  onDetentChange,
  scrimOpacity = 0.55,
  className = "",
} = {}) {
  const grabber = h("div.sheet__grabber", [h("span")]);
  const content = h("div.sheet__content");
  const sheet = h(`div.sheet${className ? "." + className : ""}`, [grabber, content]);
  const scrim = h("div.sheet-scrim");
  const root = h("div.sheet-host", { hidden: true }, [scrim, sheet]);
  document.body.append(root);

  let topInset = 0;
  let maxHeight = 0;
  let offsets = [];      // translateY per detent, descending order = taller first
  let index = initial;
  let y = 0;
  let dragging = false;
  let animation = null;
  let presented = false;

  const scrollers = () => content.querySelectorAll("[data-scroll]");

  function measure() {
    topInset = (parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--sa-t")) || 0) + 12;
    maxHeight = window.innerHeight - topInset;
    sheet.style.height = `${maxHeight}px`;
    offsets = detents.map((d) => {
      let visible;
      if (d === "auto") {
        // Natural content height, clamped so an auto sheet never fills the
        // screen by accident.
        const natural = content.scrollHeight + grabber.offsetHeight + 8;
        visible = clamp(natural, 180, maxHeight);
      } else {
        visible = clamp(d * window.innerHeight, 120, maxHeight);
      }
      return maxHeight - visible;
    });
  }

  function setY(next) {
    y = next;
    sheet.style.transform = `translate3d(0, ${next.toFixed(2)}px, 0)`;
    const closed = maxHeight;
    const progress = 1 - clamp(next / closed, 0, 1);
    scrim.style.opacity = String(progress * scrimOpacity);
    document.documentElement.style.setProperty("--sheet-progress", progress.toFixed(3));
  }

  function animateTo(target, velocity = 0) {
    animation?.cancel();
    if (prefersReducedMotion()) {
      setY(target);
      return Promise.resolve();
    }
    animation = spring(y, target, setY, {
      stiffness: 260,
      damping: 32,
      velocity,
      restDelta: 0.4,
    });
    return animation;
  }

  function snapTo(nextIndex, velocity = 0) {
    index = clamp(nextIndex, 0, offsets.length - 1);
    onDetentChange?.(index);
    return animateTo(offsets[index], velocity);
  }

  async function present() {
    if (presented) return;
    presented = true;
    root.hidden = false;
    measure();
    setY(maxHeight);
    reflow(sheet);
    openCount++;
    document.body.setAttribute("data-sheet", String(openCount));
    scrim.setAttribute("data-on", "");
    haptic("light");
    await snapTo(initial);
  }

  async function dismiss(velocity = 0) {
    if (!presented) return;
    presented = false;
    scrim.removeAttribute("data-on");
    openCount = Math.max(0, openCount - 1);
    if (openCount === 0) document.body.removeAttribute("data-sheet");
    else document.body.setAttribute("data-sheet", String(openCount));
    await animateTo(maxHeight, velocity);
    root.hidden = true;
    onDismiss?.();
  }

  /* ---- Gesture ---------------------------------------------------------- */

  let startY = 0;
  let handoff = null;   // the scroller that owns this gesture, if any

  const isInScroller = (target) => target?.closest?.("[data-scroll]");

  draggable(sheet, {
    axis: "y",
    threshold: 5,
    shouldStart(e) {
      // Interactive controls keep their own gestures.
      if (e.target.closest("input, textarea, select, [data-no-drag]")) return false;
      const scroller = isInScroller(e.target);
      handoff = scroller || null;
      return true;
    },
    onStart() {
      // A scrolled-down list owns the gesture until it reaches the top.
      if (handoff && handoff.scrollTop > 0) return;
      dragging = true;
      startY = y;
      animation?.cancel();
      sheet.setAttribute("data-dragging", "");
    },
    onMove({ delta, event }) {
      if (!dragging) {
        // Re-arm: the list has just hit its top and the finger is still moving
        // down. From this point the sheet takes over.
        if (handoff && handoff.scrollTop <= 0 && delta > 0) {
          dragging = true;
          startY = y;
          sheet.setAttribute("data-dragging", "");
        } else {
          return;
        }
      }
      if (handoff) handoff.style.overflowY = "hidden";
      let next = startY + delta;
      const top = offsets[offsets.length - 1];
      if (next < top) next = top + rubberBand(next - top, maxHeight * 0.6);
      if (!dismissible) {
        const bottom = offsets[0];
        if (next > bottom) next = bottom + rubberBand(next - bottom, maxHeight * 0.4);
      }
      setY(next);
      event.preventDefault?.();
    },
    onEnd({ velocity }) {
      if (handoff) handoff.style.overflowY = "";
      if (!dragging) return;
      dragging = false;
      sheet.removeAttribute("data-dragging");

      // Where momentum would carry it, then snap to whatever is nearest there.
      // `velocity` arrives in px/second; project() wants px/millisecond, and
      // 0.99 (rather than a scroll view's 0.998) keeps a sheet's throw short
      // enough that it never sails past the detent you were aiming at.
      const projected = y + project(velocity / 1000, 0.99);

      if (dismissible) {
        const lowest = offsets[0];
        const closed = maxHeight;
        if (projected > lowest + (closed - lowest) * 0.42 || velocity > 1100) {
          haptic("light");
          dismiss(velocity);
          return;
        }
      }

      let best = 0;
      let bestD = Infinity;
      offsets.forEach((o, i) => {
        const d = Math.abs(o - projected);
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      });
      if (best !== index) haptic("select");
      snapTo(best, velocity);
    },
  });

  if (dismissible) {
    scrim.addEventListener("click", () => dismiss());
  }

  const offResize = on(window, "resize", () => {
    if (!presented) return;
    measure();
    setY(offsets[clamp(index, 0, offsets.length - 1)]);
  });

  return {
    el: root,
    content,
    sheet,
    present,
    dismiss,
    snapTo,
    /** Re-measure after content changes — required for "auto" detents. */
    remeasure() {
      if (!presented) return;
      const prev = offsets[index];
      measure();
      if (offsets[index] !== prev) animateTo(offsets[index]);
    },
    setDetents(next) {
      detents = next;
      measure();
      snapTo(clamp(index, 0, offsets.length - 1));
    },
    get isOpen() {
      return presented;
    },
    destroy() {
      offResize();
      animation?.cancel();
      root.remove();
    },
  };
}

/**
 * A one-shot sheet around arbitrary content, with an optional Cancel/Save bar.
 * Returns a promise that resolves with whatever `onSave` returned, or null.
 */
export function presentSheet({ title, body, primary, onPrimary, detents, dismissible = true, secondary = "Cancel" }) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    const sheet = createSheet({
      detents: detents || ["auto"],
      dismissible,
      onDismiss: () => {
        finish(null);
        setTimeout(() => sheet.destroy(), 60);
      },
    });

    const bar = title
      ? h("div.sheet__bar", [
          h("button.tbtn", { "data-quiet": true, onclick: () => sheet.dismiss() }, secondary),
          h("div.sheet__title.t3.truncate", title),
          primary
            ? h(
                "button.tbtn",
                {
                  "data-strong": true,
                  onclick: async () => {
                    const value = await onPrimary?.();
                    if (value === false) return;
                    finish(value);
                    sheet.dismiss();
                  },
                },
                primary
              )
            : h("span"),
        ])
      : null;

    sheet.content.append(...[bar, body].filter(Boolean));
    sheet.present();
  });
}
