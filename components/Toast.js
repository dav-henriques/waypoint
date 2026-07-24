/**
 * Toast.js — brief confirmation, top of screen, out of the thumb's way.
 * Undo lives here too, which is why destructive actions can be instant.
 */

import { h } from "../utils/dom.js";
import { icon } from "./Icon.js";
import { haptic } from "../utils/haptics.js";

let host = null;

function ensureHost() {
  if (host) return host;
  host = h("div.toast-host");
  document.body.append(host);
  return host;
}

export function toast(message, { glyph, action, onAction, duration = 2600, tone } = {}) {
  const root = ensureHost();
  let timer = null;

  const el = h("div.toast.glass", { dataset: tone ? { tone } : {} }, [
    glyph ? icon(glyph, { size: 18 }) : null,
    h("span.toast__text.callout.truncate", message),
    action
      ? h(
          "button.toast__action",
          {
            onclick: () => {
              haptic("light");
              onAction?.();
              close();
            },
          },
          action
        )
      : null,
  ]);

  function close() {
    clearTimeout(timer);
    el.setAttribute("data-out", "");
    el.addEventListener("animationend", () => el.remove(), { once: true });
    setTimeout(() => el.remove(), 500);
  }

  // Only one at a time; a stack of toasts is a bug report waiting to happen.
  root.querySelectorAll(".toast").forEach((t) => t.remove());
  root.append(el);
  timer = setTimeout(close, duration);
  el.addEventListener("click", (e) => {
    if (!e.target.closest(".toast__action")) close();
  });

  return { close };
}
