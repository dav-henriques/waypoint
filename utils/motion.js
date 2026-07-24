/**
 * motion.js — the physics that make dragging feel like matter.
 *
 * Three ideas do almost all the work:
 *   rubberBand()  resistance past a boundary, so limits feel elastic not hard
 *   project()     where a flick would land, so a release respects intent
 *   spring()      critically-ish damped settle, so nothing ever "arrives flat"
 */

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const inverseLerp = (a, b, v) => (b === a ? 0 : (v - a) / (b - a));

export const prefersReducedMotion = () =>
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

/**
 * UIKit's rubber-band curve. `offset` is how far past the edge the finger has
 * travelled; the return is how far the content should actually move.
 * Constant 0.55 matches the feel of a UIScrollView closely enough that the
 * difference is not perceptible.
 */
export function rubberBand(offset, dimension, constant = 0.55) {
  if (dimension <= 0) return 0;
  const sign = Math.sign(offset) || 1;
  const x = Math.abs(offset);
  return sign * ((1 - 1 / (x * constant / dimension + 1)) * dimension);
}

/**
 * Where momentum would carry a flick. The decelerationRate is UIKit's
 * "normal" value; the algebra below is the closed form of its exponential
 * decay integral.
 */
export function project(velocity, decelerationRate = 0.998) {
  return (velocity * decelerationRate) / (1 - decelerationRate);
}

/** Pick the nearest value in `points` to `value`. */
export function nearest(value, points) {
  let best = points[0];
  let bestD = Infinity;
  for (const p of points) {
    const d = Math.abs(p - value);
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return best;
}

/**
 * Run a spring from `from` to `to`, calling `onUpdate(value)` each frame.
 * Returns a promise that resolves on settle, plus a `.cancel()` on it.
 *
 * Tuning notes: stiffness 240 / damping 30 is the "sheet" feel — quick but
 * never bouncy. Raise stiffness for smaller travel; raise damping to kill
 * overshoot entirely.
 */
export function spring(
  from,
  to,
  onUpdate,
  { stiffness = 240, damping = 30, mass = 1, velocity = 0, restDelta = 0.15 } = {}
) {
  let cancelled = false;
  let value = from;
  let v = velocity;
  let last = performance.now();

  if (prefersReducedMotion()) {
    onUpdate(to);
    const done = Promise.resolve();
    done.cancel = () => {};
    return done;
  }

  const done = new Promise((resolve) => {
    const step = (now) => {
      if (cancelled) return resolve(false);
      // Fixed sub-steps keep the simulation stable when a frame is dropped.
      let dt = Math.min((now - last) / 1000, 0.064);
      last = now;
      const steps = Math.max(1, Math.ceil(dt / 0.004));
      const sdt = dt / steps;
      for (let i = 0; i < steps; i++) {
        const f = -stiffness * (value - to) - damping * v;
        v += (f / mass) * sdt;
        value += v * sdt;
      }
      if (Math.abs(value - to) < restDelta && Math.abs(v) < restDelta * 8) {
        onUpdate(to);
        return resolve(true);
      }
      onUpdate(value);
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });

  done.cancel = () => {
    cancelled = true;
  };
  return done;
}

/** Tracks pointer velocity over a short window — resistant to a jittery last frame. */
export function createVelocityTracker(window = 90) {
  let samples = [];
  return {
    reset() {
      samples = [];
    },
    add(value, time = performance.now()) {
      samples.push({ value, time });
      const cutoff = time - window;
      while (samples.length > 2 && samples[0].time < cutoff) samples.shift();
    },
    /** px per second */
    get() {
      if (samples.length < 2) return 0;
      const a = samples[0];
      const b = samples[samples.length - 1];
      const dt = (b.time - a.time) / 1000;
      if (dt <= 0) return 0;
      return (b.value - a.value) / dt;
    },
  };
}
