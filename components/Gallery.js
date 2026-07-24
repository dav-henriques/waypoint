/**
 * Gallery.js — photos, and the full-screen viewer behind them.
 *
 * The viewer supports the one gesture people reach for without being told:
 * drag down to dismiss, with the image tracking the finger, shrinking, and the
 * backdrop clearing as it goes. Release below the threshold and it snaps back.
 * It is the difference between a lightbox and a photo viewer.
 */

import { h, mount } from "../utils/dom.js";
import { icon } from "./Icon.js";
import { photoURL } from "../services/media.js";
import { draggable } from "../utils/gestures.js";
import { spring, clamp } from "../utils/motion.js";
import { haptic } from "../utils/haptics.js";

/** Horizontal strip of thumbnails. */
export function gallery(photoIds, { onOpen, onAdd, editable = false, onRemove } = {}) {
  const strip = h("div.gallery__strip");

  const render = () => {
    mount(strip, [
      ...photoIds.map((id, index) => {
        const cell = h("button.gphoto.press", {
          onclick: () => onOpen?.(index),
          style: { "--i": index },
        });
        photoURL(id, { thumb: true }).then((url) => {
          if (!url) return;
          const img = h("img", { alt: "", src: url });
          img.addEventListener("load", () => img.setAttribute("data-in", ""), { once: true });
          cell.append(img);
        });
        if (editable) {
          cell.append(
            h(
              "span.gphoto__x",
              {
                onclick: (e) => {
                  e.stopPropagation();
                  haptic("warning");
                  onRemove?.(id);
                },
              },
              [icon("close", { size: 12, stroke: 2.4 })]
            )
          );
        }
        return cell;
      }),
      editable
        ? h("button.gphoto.gphoto--add.press", { onclick: () => onAdd?.() }, [
            icon("plus", { size: 22 }),
          ])
        : null,
    ]);
  };

  render();
  const root = h("div.gallery", [strip]);
  root.refresh = (next) => {
    photoIds = next;
    render();
  };
  return root;
}

/** Full-screen viewer. */
export function lightbox(photoIds, startIndex = 0) {
  let index = clamp(startIndex, 0, photoIds.length - 1);

  const stage = h("div.lightbox__stage");
  const counter = h("div.lightbox__counter.cap");
  const backdrop = h("div.lightbox__backdrop");
  const root = h("div.lightbox", [
    backdrop,
    stage,
    h("div.lightbox__bar", [
      h("button.orb.orb--sm", { onclick: () => close() }, [icon("close", { size: 18 })]),
      counter,
    ]),
  ]);

  const track = h("div.lightbox__track");
  stage.append(track);

  photoIds.forEach((id) => {
    const cell = h("div.lightbox__cell");
    photoURL(id).then((url) => {
      if (!url) return;
      const img = h("img", { alt: "", src: url });
      img.addEventListener("load", () => img.setAttribute("data-in", ""), { once: true });
      cell.append(img);
    });
    track.append(cell);
  });

  const setIndex = (next, animate = true) => {
    index = clamp(next, 0, photoIds.length - 1);
    track.style.transition = animate ? "transform var(--d-lg) var(--ease)" : "none";
    track.style.transform = `translate3d(${-index * 100}%, 0, 0)`;
    counter.textContent = photoIds.length > 1 ? `${index + 1} / ${photoIds.length}` : "";
  };

  // Horizontal paging.
  draggable(stage, {
    axis: "x",
    onStart: () => (track.style.transition = "none"),
    onMove: ({ dx }) => {
      const w = stage.offsetWidth;
      let offset = -index * w + dx;
      const min = -(photoIds.length - 1) * w;
      if (offset > 0) offset *= 0.35;
      if (offset < min) offset = min + (offset - min) * 0.35;
      track.style.transform = `translate3d(${offset}px, 0, 0)`;
    },
    onEnd: ({ dx, velocity }) => {
      const w = stage.offsetWidth;
      let next = index;
      if (dx < -w * 0.25 || velocity < -600) next++;
      else if (dx > w * 0.25 || velocity > 600) next--;
      if (next !== index) haptic("select");
      setIndex(next);
    },
  });

  // Vertical drag to dismiss.
  let dragY = 0;
  draggable(root, {
    axis: "y",
    shouldStart: (e) => !e.target.closest("button"),
    onStart: () => {
      stage.style.transition = "none";
    },
    onMove: ({ dy }) => {
      dragY = dy;
      const t = clamp(Math.abs(dy) / 400, 0, 1);
      stage.style.transform = `translate3d(0, ${dy}px, 0) scale(${1 - t * 0.18})`;
      backdrop.style.opacity = String(1 - t * 0.85);
    },
    onEnd: ({ dy, velocity }) => {
      if (Math.abs(dy) > 130 || Math.abs(velocity) > 700) {
        haptic("light");
        close(dy < 0 ? -1 : 1);
        return;
      }
      spring(dragY, 0, (v) => {
        const t = clamp(Math.abs(v) / 400, 0, 1);
        stage.style.transform = `translate3d(0, ${v}px, 0) scale(${1 - t * 0.18})`;
        backdrop.style.opacity = String(1 - t * 0.85);
      }, { stiffness: 320, damping: 34 });
    },
  });

  function close(direction = 1) {
    root.setAttribute("data-out", "");
    stage.style.transition = "transform var(--d-md) var(--ease-exit), opacity var(--d-md) var(--ease-exit)";
    stage.style.transform = `translate3d(0, ${direction * window.innerHeight * 0.6}px, 0) scale(0.8)`;
    stage.style.opacity = "0";
    backdrop.style.opacity = "0";
    setTimeout(() => root.remove(), 340);
  }

  document.body.append(root);
  setIndex(index, false);
  requestAnimationFrame(() => root.setAttribute("data-in", ""));

  return { close };
}
