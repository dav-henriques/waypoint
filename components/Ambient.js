/**
 * Ambient.js — the field behind everything.
 *
 * Three slow lights and one drifting ribbon, painted onto a deliberately tiny
 * canvas (about 220px wide) and stretched to fill the screen. Because every
 * shape here is low-frequency, the browser's bilinear upscale is
 * indistinguishable from rendering at full resolution — and costs roughly a
 * hundredth as much. The grain overlay in CSS hides the banding that would
 * otherwise give the trick away.
 *
 * It idles at 30fps, sleeps when the tab is hidden, and sleeps when the map is
 * covering it. Ambient motion should never be the reason a phone gets warm.
 */

import { h } from "../utils/dom.js";
import { onThemeChange, getPalette } from "../utils/theme.js";
import { prefersReducedMotion } from "../utils/motion.js";

const W = 220;

export function createAmbient() {
  const canvas = h("canvas");
  const root = h("#ambient", [canvas]);
  const ctx = canvas.getContext("2d", { alpha: false });

  let h_ = 380;
  let running = false;
  let sleeping = false;
  let raf = 0;
  let last = 0;
  let t = 0;
  let palette = getPalette();

  const resize = () => {
    const ratio = window.innerHeight / Math.max(1, window.innerWidth);
    h_ = Math.round(W * ratio);
    canvas.width = W;
    canvas.height = h_;
    draw(true);
  };

  const hsl = ([hh, s, l], a = 1, dl = 0) =>
    `hsl(${hh} ${s}% ${Math.max(0, Math.min(100, l + dl))}% / ${a})`;

  function blob(x, y, r, colour, alpha) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, hsl(colour, alpha));
    g.addColorStop(0.55, hsl(colour, alpha * 0.42));
    g.addColorStop(1, hsl(colour, 0));
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }

  function draw(force) {
    const { amb1, amb2, accent } = palette;

    // Base: near-black, faintly cooled by the second ambient tint.
    ctx.fillStyle = hsl(amb2, 1, -2);
    ctx.fillRect(0, 0, W, h_);

    ctx.globalCompositeOperation = "lighter";

    // Three lights on incommensurable periods, so the composition never
    // visibly repeats.
    const a = t * 0.00021;
    blob(
      W * (0.22 + Math.sin(a * 1.0) * 0.16),
      h_ * (0.2 + Math.cos(a * 0.77) * 0.1),
      W * 0.95,
      amb1,
      0.3
    );
    blob(
      W * (0.84 + Math.cos(a * 0.62) * 0.18),
      h_ * (0.42 + Math.sin(a * 0.85) * 0.14),
      W * 0.8,
      accent,
      0.05
    );
    blob(
      W * (0.5 + Math.sin(a * 0.43 + 2) * 0.3),
      h_ * (0.86 + Math.cos(a * 0.55) * 0.1),
      W * 1.05,
      amb1,
      0.17
    );

    // The ribbon. One sine crossed with a slower sine so the amplitude
    // breathes — this is the descendant of the XMB wave, turned down until it
    // is barely there.
    const cy = h_ * 0.56;
    const grad = ctx.createLinearGradient(0, cy - 60, W, cy + 60);
    grad.addColorStop(0, hsl(accent, 0));
    grad.addColorStop(0.45, hsl(accent, 0.05));
    grad.addColorStop(0.72, hsl(amb1, 0.07, 14));
    grad.addColorStop(1, hsl(accent, 0));
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(-4, h_ + 4);
    for (let x = -4; x <= W + 4; x += 4) {
      const p = x / W;
      const amp = 16 + Math.sin(a * 1.9 + p * 2.2) * 12;
      const y = cy + Math.sin(p * 3.6 + a * 2.6) * amp + Math.sin(p * 8 - a * 1.7) * 4;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(W + 4, h_ + 4);
    ctx.closePath();
    ctx.fill();

    ctx.globalCompositeOperation = "source-over";

    // A faint vignette pulls attention back to the middle of the screen.
    const v = ctx.createRadialGradient(W / 2, h_ * 0.45, W * 0.22, W / 2, h_ * 0.5, W * 1.1);
    v.addColorStop(0, "rgba(0,0,0,0)");
    v.addColorStop(1, "rgba(0,0,0,0.55)");
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, W, h_);
  }

  function loop(now) {
    if (!running) return;
    raf = requestAnimationFrame(loop);
    if (now - last < 33) return; // 30fps is plenty for something this slow
    t += now - last;
    last = now;
    if (!sleeping) draw();
  }

  const start = () => {
    if (running) return;
    running = true;
    last = performance.now();
    raf = requestAnimationFrame(loop);
  };

  const stop = () => {
    running = false;
    cancelAnimationFrame(raf);
  };

  window.addEventListener("resize", resize);
  document.addEventListener("visibilitychange", () => (document.hidden ? stop() : start()));
  onThemeChange((p) => {
    palette = p;
    draw(true);
  });

  resize();
  if (prefersReducedMotion()) {
    // Still paint one frame — the composition is half the point, the motion
    // is the other half, and only one of them is a problem.
    draw(true);
  } else {
    start();
  }

  return {
    el: root,
    /** Called by the router: no reason to animate pixels nobody can see. */
    setCovered(covered) {
      sleeping = covered;
    },
    destroy() {
      stop();
      window.removeEventListener("resize", resize);
    },
  };
}
