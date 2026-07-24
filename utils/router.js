/**
 * router.js — tabs at the root, a navigation stack on top.
 *
 * Two rules borrowed wholesale from UIKit, because they are correct:
 *
 *   Tab roots are never destroyed. Switching away from the map and back must
 *   not rebuild a WebGL context or lose scroll position; the page is simply
 *   hidden. Pushed pages, by contrast, are transient and are torn down on pop.
 *
 *   Lateral motion means hierarchy. Push slides in from the right with the
 *   outgoing page parallaxing left; tab switches fade and rise. Using the same
 *   transition for both would tell the user the two are the same kind of move.
 *
 * The browser's own history is driven in step, so the Android back gesture and
 * the standalone PWA back behaviour both work without any extra handling.
 */

import { h } from "./dom.js";
import { edgeSwipeBack } from "./gestures.js";
import { spring, clamp, prefersReducedMotion } from "./motion.js";
import { haptic } from "./haptics.js";

export function createRouter({ container, onTabChange, onStackChange }) {
  const tabs = new Map();       // id -> { page, el }
  const stack = [];             // pushed pages, top last
  let activeTab = null;
  let transitioning = false;

  const ANIM = prefersReducedMotion() ? 1 : 440;

  function mountPage(page, anim) {
    page.el.classList.add("page");
    if (anim) page.el.dataset.anim = anim;
    container.append(page.el);
    page.onEnter?.();
    if (anim) {
      page.el.addEventListener(
        "animationend",
        () => delete page.el.dataset.anim,
        { once: true }
      );
    }
  }

  function unmountPage(page, anim, destroy) {
    if (!anim) {
      page.el.remove();
      if (destroy) page.onDestroy?.();
      return;
    }
    page.el.dataset.anim = anim;
    setTimeout(() => {
      page.el.remove();
      delete page.el.dataset.anim;
      if (destroy) page.onDestroy?.();
    }, ANIM);
  }

  const topPage = () => (stack.length ? stack[stack.length - 1] : tabs.get(activeTab)?.page);

  /* ---- Tabs ------------------------------------------------------------- */

  function registerTab(id, factory) {
    tabs.set(id, { factory, page: null });
  }

  function setTab(id, { animate = true } = {}) {
    if (transitioning) return;
    // Leaving a pushed stack always returns to the root of the tab first.
    while (stack.length) {
      const page = stack.pop();
      unmountPage(page, null, true);
    }
    if (activeTab === id) {
      tabs.get(id)?.page?.onReselect?.();
      return;
    }

    const previous = tabs.get(activeTab);
    const entry = tabs.get(id);
    if (!entry) return;
    if (!entry.page) entry.page = entry.factory();

    activeTab = id;
    if (previous?.page) {
      previous.page.onLeave?.();
      if (animate) {
        previous.page.el.dataset.anim = "tab-out";
        setTimeout(() => {
          previous.page.el.remove();
          delete previous.page.el.dataset.anim;
        }, 240);
      } else {
        previous.page.el.remove();
      }
    }
    mountPage(entry.page, animate ? "tab-in" : null);
    onTabChange?.(id);
    onStackChange?.(0);
    syncHistory();
  }

  /* ---- Stack ------------------------------------------------------------ */

  async function push(page) {
    if (transitioning) return;
    transitioning = true;
    const below = topPage();
    page.el.dataset.pushed = "true";
    mountPage(page, "push-in");
    if (below) {
      below.el.dataset.anim = "push-out";
      below.onLeave?.();
      setTimeout(() => {
        if (below.el.dataset.anim === "push-out") {
          // Keep the parallaxed transform in place while it is covered.
          below.el.style.transform = "translate3d(-26%,0,0)";
          below.el.style.opacity = "0.55";
          delete below.el.dataset.anim;
        }
      }, ANIM);
    }
    stack.push(page);
    onStackChange?.(stack.length);
    syncHistory();
    setTimeout(() => (transitioning = false), ANIM * 0.6);
  }

  function restoreBelow(below) {
    if (!below) return;
    below.el.style.transform = "";
    below.el.style.opacity = "";
    below.onEnter?.();
  }

  async function pop({ animate = true } = {}) {
    if (!stack.length || transitioning) return false;
    transitioning = true;
    const page = stack.pop();
    const below = topPage();
    if (below) {
      below.el.style.transform = "";
      below.el.style.opacity = "";
      if (animate) below.el.dataset.anim = "pop-in";
      below.onEnter?.();
      if (animate) {
        setTimeout(() => delete below.el.dataset.anim, ANIM);
      }
    }
    unmountPage(page, animate ? "pop-out" : null, true);
    onStackChange?.(stack.length);
    setTimeout(() => (transitioning = false), ANIM * 0.6);
    return true;
  }

  /* ---- Interactive back ------------------------------------------------- */
  /* Tracking the finger 1:1 and only committing on release is what separates
     "swipe to go back" from "a button you can also swipe".                   */

  let swipe = null;

  edgeSwipeBack(container, {
    enabled: () => stack.length > 0 && !transitioning,
    onStart() {
      const page = stack[stack.length - 1];
      const below = stack.length > 1 ? stack[stack.length - 2] : tabs.get(activeTab)?.page;
      swipe = { page, below, width: window.innerWidth };
      page.el.style.transition = "none";
      if (below) below.el.style.transition = "none";
      haptic("select");
    },
    onMove(dx) {
      if (!swipe) return;
      const t = clamp(dx / swipe.width, 0, 1);
      swipe.page.el.style.transform = `translate3d(${dx}px,0,0)`;
      if (swipe.below) {
        swipe.below.el.style.transform = `translate3d(${-26 + 26 * t}%,0,0)`;
        swipe.below.el.style.opacity = String(0.55 + 0.45 * t);
      }
    },
    onEnd(commit, dx) {
      if (!swipe) return;
      const { page, below, width } = swipe;
      swipe = null;
      const finish = () => {
        page.el.style.transition = "";
        if (below) below.el.style.transition = "";
      };

      if (commit) {
        haptic("light");
        spring(dx, width, (v) => {
          page.el.style.transform = `translate3d(${v}px,0,0)`;
          const t = clamp(v / width, 0, 1);
          if (below) {
            below.el.style.transform = `translate3d(${-26 + 26 * t}%,0,0)`;
            below.el.style.opacity = String(0.55 + 0.45 * t);
          }
        }, { stiffness: 300, damping: 34 }).then(() => {
          stack.pop();
          page.el.remove();
          page.onDestroy?.();
          restoreBelow(below);
          finish();
          onStackChange?.(stack.length);
          history.state?.depth ? history.back() : null;
        });
      } else {
        spring(dx, 0, (v) => {
          page.el.style.transform = `translate3d(${v}px,0,0)`;
          const t = clamp(v / width, 0, 1);
          if (below) {
            below.el.style.transform = `translate3d(${-26 + 26 * t}%,0,0)`;
            below.el.style.opacity = String(0.55 + 0.45 * t);
          }
        }, { stiffness: 320, damping: 36 }).then(finish);
      }
    },
  });

  /* ---- History ---------------------------------------------------------- */

  let suppressHistory = false;

  function syncHistory() {
    if (suppressHistory) return;
    const state = { tab: activeTab, depth: stack.length };
    if (history.state?.depth === undefined) history.replaceState(state, "");
    else if (stack.length > history.state.depth) history.pushState(state, "");
    else history.replaceState(state, "");
  }

  window.addEventListener("popstate", () => {
    if (stack.length) {
      suppressHistory = true;
      pop().finally(() => (suppressHistory = false));
    }
  });

  return {
    registerTab,
    setTab,
    push,
    pop,
    get depth() {
      return stack.length;
    },
    get tab() {
      return activeTab;
    },
    top: topPage,
    getTabPage: (id) => tabs.get(id)?.page || null,
  };
}
