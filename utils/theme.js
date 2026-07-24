/**
 * theme.js — the app's colour changes with the hour.
 *
 * The XMB shifted its wave colour by month; that single detail is most of why
 * the console felt alive rather than shipped. Here the cadence is a day
 * instead of a year, because a map of where you have been is something you
 * open at 7am and at midnight and those should not look the same.
 *
 * Keyframes are interpolated continuously — there is no moment where the
 * colour "switches". Hue takes the short way around the wheel.
 */

import { createEmitter } from "./events.js";
import { lerp } from "./motion.js";

const emitter = createEmitter();
export const onThemeChange = (fn) => emitter.on("change", fn);

/**
 * hour → { accent: [h,s,l], amb1, amb2 }
 * amb values are the two tints painted into the ambient field.
 */
const DAY = [
  { at: 0.0,  accent: [252, 68, 68], amb1: [252, 46, 26], amb2: [240, 34, 7] },
  { at: 4.0,  accent: [230, 62, 66], amb1: [228, 52, 24], amb2: [232, 32, 6] },
  { at: 6.5,  accent: [206, 78, 68], amb1: [212, 48, 32], amb2: [220, 22, 9] },
  { at: 9.0,  accent: [196, 80, 62], amb1: [196, 56, 27], amb2: [206, 24, 8] },
  { at: 12.5, accent: [186, 58, 60], amb1: [188, 42, 26], amb2: [200, 18, 8] },
  { at: 16.0, accent: [42, 88, 64],  amb1: [34, 58, 24],  amb2: [28, 22, 7] },
  { at: 18.5, accent: [20, 92, 64],  amb1: [12, 62, 25],  amb2: [348, 24, 8] },
  { at: 20.5, accent: [318, 64, 68], amb1: [306, 44, 22], amb2: [300, 26, 7] },
  { at: 22.5, accent: [262, 70, 68], amb1: [258, 48, 24], amb2: [250, 30, 7] },
  { at: 24.0, accent: [252, 68, 68], amb1: [252, 46, 26], amb2: [240, 34, 7] },
];

/** Fixed alternatives, for people who would rather the app hold still. */
const FIXED = {
  cyan:  { accent: [198, 82, 64], amb1: [206, 54, 26], amb2: [214, 26, 8] },
  amber: { accent: [30, 90, 62],  amb1: [22, 56, 23],  amb2: [20, 20, 7] },
  violet:{ accent: [258, 70, 68], amb1: [254, 48, 25], amb2: [248, 30, 7] },
  mono:  { accent: [24, 92, 58],  amb1: [220, 6, 20],  amb2: [220, 6, 6] },
};

function shortHueLerp(a, b, t) {
  let d = ((b - a + 540) % 360) - 180;
  return (a + d * t + 360) % 360;
}

function lerpHSL(a, b, t) {
  return [
    shortHueLerp(a[0], b[0], t),
    lerp(a[1], b[1], t),
    lerp(a[2], b[2], t),
  ];
}

const css = ([h, s, l], alpha) =>
  alpha === undefined
    ? `hsl(${h.toFixed(1)} ${s.toFixed(1)}% ${l.toFixed(1)}%)`
    : `hsl(${h.toFixed(1)} ${s.toFixed(1)}% ${l.toFixed(1)}% / ${alpha})`;

export function paletteForHour(hour) {
  let i = 0;
  while (i < DAY.length - 2 && DAY[i + 1].at <= hour) i++;
  const a = DAY[i];
  const b = DAY[i + 1];
  const t = (hour - a.at) / (b.at - a.at);
  return {
    accent: lerpHSL(a.accent, b.accent, t),
    amb1: lerpHSL(a.amb1, b.amb1, t),
    amb2: lerpHSL(a.amb2, b.amb2, t),
  };
}

let mode = "auto";
let current = null;
let timer = null;

export function getPalette() {
  return current || paletteForHour(new Date().getHours());
}

export function getAccentHex() {
  const [h, s, l] = getPalette().accent;
  return hslToHex(h, s, l);
}

export function hslToHex(h, s, l) {
  s /= 100;
  l /= 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const to = (x) => Math.round(255 * x).toString(16).padStart(2, "0");
  return `#${to(f(0))}${to(f(8))}${to(f(4))}`;
}

function apply(p) {
  current = p;
  const root = document.documentElement.style;
  const [h, s, l] = p.accent;
  root.setProperty("--a-h", h.toFixed(1));
  root.setProperty("--a-s", `${s.toFixed(1)}%`);
  root.setProperty("--a-l", `${l.toFixed(1)}%`);
  root.setProperty("--amb-1", css(p.amb1));
  root.setProperty("--amb-2", css(p.amb2));
  emitter.emit("change", p);
}

export function setAccentMode(next) {
  mode = next || "auto";
  refresh();
}

export function getAccentMode() {
  return mode;
}

function refresh() {
  if (mode !== "auto" && FIXED[mode]) {
    apply(FIXED[mode]);
    return;
  }
  const now = new Date();
  apply(paletteForHour(now.getHours() + now.getMinutes() / 60));
}

/** A single tileable noise field, used to keep large dark gradients from banding. */
export const GRAIN_URL = (() => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="180" height="180">
    <filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="3" stitchTiles="stitch"/>
    <feColorMatrix type="saturate" values="0"/></filter>
    <rect width="180" height="180" filter="url(#n)" opacity="0.55"/></svg>`;
  return `url("data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.replace(/\s+/g, " "))}")`;
})();

export function initTheme(initialMode = "auto") {
  document.documentElement.style.setProperty("--grain", GRAIN_URL);
  mode = initialMode;
  refresh();
  // Re-evaluate every two minutes: fine enough that a sunset drifts rather
  // than steps, cheap enough to be invisible on a battery graph.
  clearInterval(timer);
  timer = setInterval(refresh, 120000);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) refresh();
  });
}
