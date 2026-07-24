/**
 * gestures.js — pointer primitives shared by the sheet, the map and the
 * navigation stack.
 *
 * All of these speak Pointer Events and set touch-action deliberately, which
 * is what keeps them from fighting native scrolling on iOS.
 */

import { createVelocityTracker } from "./motion.js";

/**
 * Vertical or horizontal drag with a directional lock.
 *
 * The lock matters more than it sounds: until the finger has moved ~8px we
 * don't know whether the user meant to drag the sheet or scroll its content.
 * Deciding early and sticking with the decision is exactly what iOS does, and
 * skipping it is the single most common reason a web sheet feels wrong.
 */
export function draggable(el, {
  axis = "y",
  onStart,
  onMove,
  onEnd,
  shouldStart,
  threshold = 6,
} = {}) {
  let active = false;
  let locked = false;
  let pid = null;
  let startX = 0;
  let startY = 0;
  const vel = createVelocityTracker();

  const down = (e) => {
    if (active || (e.pointerType === "mouse" && e.button !== 0)) return;
    if (shouldStart && shouldStart(e) === false) return;
    active = true;
    locked = false;
    pid = e.pointerId;
    startX = e.clientX;
    startY = e.clientY;
    vel.reset();
    vel.add(axis === "y" ? e.clientY : e.clientX, e.timeStamp);
  };

  const move = (e) => {
    if (!active || e.pointerId !== pid) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    const primary = axis === "y" ? dy : dx;
    const secondary = axis === "y" ? dx : dy;

    if (!locked) {
      if (Math.abs(primary) < threshold && Math.abs(secondary) < threshold) return;
      // Cross-axis intent wins: abandon rather than fight the scroller.
      if (Math.abs(secondary) > Math.abs(primary)) {
        active = false;
        return;
      }
      locked = true;
      el.setPointerCapture?.(pid);
      onStart?.({ x: startX, y: startY, event: e });
    }

    vel.add(axis === "y" ? e.clientY : e.clientX, e.timeStamp);
    onMove?.({ dx, dy, delta: primary, event: e });
    if (e.cancelable) e.preventDefault();
  };

  const finish = (e) => {
    if (!active || (pid !== null && e.pointerId !== pid)) return;
    const wasLocked = locked;
    active = false;
    locked = false;
    el.releasePointerCapture?.(pid);
    pid = null;
    if (wasLocked) {
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      onEnd?.({ dx, dy, delta: axis === "y" ? dy : dx, velocity: vel.get(), event: e });
    }
  };

  el.addEventListener("pointerdown", down);
  el.addEventListener("pointermove", move, { passive: false });
  el.addEventListener("pointerup", finish);
  el.addEventListener("pointercancel", finish);

  return () => {
    el.removeEventListener("pointerdown", down);
    el.removeEventListener("pointermove", move);
    el.removeEventListener("pointerup", finish);
    el.removeEventListener("pointercancel", finish);
  };
}

/**
 * Long press with a movement tolerance. Fires once, and only if the finger
 * stayed put — panning a map must never be mistaken for a hold.
 */
export function longPress(el, onFire, { delay = 480, tolerance = 12, onProgress } = {}) {
  let timer = null;
  let startX = 0;
  let startY = 0;
  let pid = null;
  let fired = false;

  const cancel = () => {
    clearTimeout(timer);
    timer = null;
    if (!fired) onProgress?.(0);
    pid = null;
  };

  const down = (e) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (timer) cancel();
    pid = e.pointerId;
    fired = false;
    startX = e.clientX;
    startY = e.clientY;
    onProgress?.(1, { x: startX, y: startY });
    timer = setTimeout(() => {
      fired = true;
      timer = null;
      onFire({ x: startX, y: startY, event: e });
    }, delay);
  };

  const move = (e) => {
    if (!timer || e.pointerId !== pid) return;
    if (Math.hypot(e.clientX - startX, e.clientY - startY) > tolerance) cancel();
  };

  el.addEventListener("pointerdown", down, { passive: true });
  el.addEventListener("pointermove", move, { passive: true });
  el.addEventListener("pointerup", cancel, { passive: true });
  el.addEventListener("pointercancel", cancel, { passive: true });
  el.addEventListener("pointerleave", cancel, { passive: true });

  return () => {
    cancel();
    el.removeEventListener("pointerdown", down);
    el.removeEventListener("pointermove", move);
    el.removeEventListener("pointerup", cancel);
    el.removeEventListener("pointercancel", cancel);
    el.removeEventListener("pointerleave", cancel);
  };
}

/**
 * Interactive edge-swipe back, matching iOS: only starts within `edge` px of
 * the left border, tracks 1:1, and commits on distance OR velocity.
 */
export function edgeSwipeBack(el, { edge = 26, onStart, onMove, onEnd, enabled }) {
  let armed = false;
  let began = false;
  let pid = null;
  let startX = 0;
  let startY = 0;
  const vel = createVelocityTracker();

  const down = (e) => {
    if (enabled && !enabled()) return;
    if (e.clientX > edge) return;
    armed = true;
    began = false;
    pid = e.pointerId;
    startX = e.clientX;
    startY = e.clientY;
    vel.reset();
  };

  const move = (e) => {
    if (!armed || e.pointerId !== pid) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    if (!began) {
      if (dx < 10) return;
      if (Math.abs(dy) > Math.abs(dx)) {
        armed = false;
        return;
      }
      began = true;
      el.setPointerCapture?.(pid);
      onStart?.();
    }
    vel.add(e.clientX, e.timeStamp);
    onMove?.(Math.max(0, dx));
    if (e.cancelable) e.preventDefault();
  };

  const up = (e) => {
    if (!armed) return;
    armed = false;
    if (!began) return;
    began = false;
    el.releasePointerCapture?.(pid);
    const dx = Math.max(0, e.clientX - startX);
    const v = vel.get();
    onEnd?.(dx + v * 0.16 > window.innerWidth * 0.42 || v > 700, dx);
  };

  el.addEventListener("pointerdown", down, { passive: true });
  el.addEventListener("pointermove", move, { passive: false });
  el.addEventListener("pointerup", up);
  el.addEventListener("pointercancel", up);

  return () => {
    el.removeEventListener("pointerdown", down);
    el.removeEventListener("pointermove", move);
    el.removeEventListener("pointerup", up);
    el.removeEventListener("pointercancel", up);
  };
}
