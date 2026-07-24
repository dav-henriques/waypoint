/**
 * dom.js — a 90-line view layer.
 *
 * There is no framework here on purpose. `h()` builds elements, `mount()`
 * swaps children, and everything else is the platform. The whole app renders
 * through these functions, which keeps the bundle at zero and the call stack
 * shallow enough to debug from a phone.
 */

const SVG_NS = "http://www.w3.org/2000/svg";
const SVG_TAGS = new Set([
  "svg", "path", "circle", "rect", "line", "polyline", "polygon",
  "g", "defs", "linearGradient", "radialGradient", "stop", "ellipse",
  "text", "tspan", "clipPath", "mask", "filter", "feGaussianBlur",
]);

/**
 * h("div.card", { onclick }, [child, "text"])
 *
 * The tag string supports `tag.class.class#id`, which removes the bulk of
 * className plumbing from call sites.
 */
export function h(tag, props, children) {
  // Allow h(tag, children)
  if (Array.isArray(props) || typeof props === "string" || props instanceof Node) {
    children = props;
    props = null;
  }
  props = props || {};

  let name = tag;
  let id = null;
  const classes = [];
  const hashAt = name.indexOf("#");
  if (hashAt > -1) {
    id = name.slice(hashAt + 1).split(".")[0];
    name = name.slice(0, hashAt) + name.slice(hashAt + 1 + id.length);
  }
  const parts = name.split(".");
  name = parts.shift() || "div";
  classes.push(...parts.filter(Boolean));

  const el = SVG_TAGS.has(name)
    ? document.createElementNS(SVG_NS, name)
    : document.createElement(name);

  if (id) el.id = id;

  for (const key in props) {
    const val = props[key];
    if (val === null || val === undefined || val === false) continue;

    if (key === "class" || key === "className") {
      classes.push(...String(val).split(/\s+/).filter(Boolean));
    } else if (key === "style") {
      if (typeof val === "string") el.setAttribute("style", val);
      else for (const k in val) {
        if (val[k] === null || val[k] === undefined) continue;
        if (k.startsWith("--")) el.style.setProperty(k, val[k]);
        else el.style[k] = val[k];
      }
    } else if (key === "dataset") {
      for (const k in val) if (val[k] !== null && val[k] !== undefined) el.dataset[k] = val[k];
    } else if (key.startsWith("on") && typeof val === "function") {
      el.addEventListener(key.slice(2), val, key === "ontouchstart" ? { passive: true } : undefined);
    } else if (key === "ref" && typeof val === "function") {
      val(el);
    } else if (key === "html") {
      el.innerHTML = val;
    } else if (key === "text") {
      el.textContent = val;
    } else if (val === true) {
      el.setAttribute(key, "");
    } else if (key in el && !SVG_TAGS.has(name) && key !== "list" && key !== "type") {
      try { el[key] = val; } catch { el.setAttribute(key, val); }
    } else {
      el.setAttribute(key, val);
    }
  }

  if (classes.length) {
    if (SVG_TAGS.has(name)) el.setAttribute("class", classes.join(" "));
    else el.className = classes.join(" ");
  }

  append(el, children);
  return el;
}

export function append(parent, children) {
  if (children === null || children === undefined || children === false) return parent;
  if (Array.isArray(children)) {
    for (const c of children) append(parent, c);
    return parent;
  }
  parent.append(children instanceof Node ? children : document.createTextNode(String(children)));
  return parent;
}

export function mount(parent, children) {
  parent.textContent = "";
  append(parent, children);
  return parent;
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/** Add index-based stagger delays to a list's children. */
export function stagger(container, from = 0, step = 1) {
  Array.from(container.children).forEach((c, i) => {
    c.style.setProperty("--i", String(from + i * step));
  });
  return container;
}

/** Resolve once the element's animations have all settled. */
export function afterAnimations(el) {
  const running = el.getAnimations ? el.getAnimations({ subtree: true }) : [];
  if (!running.length) return Promise.resolve();
  return Promise.allSettled(running.map((a) => a.finished));
}

export const raf = () => new Promise((r) => requestAnimationFrame(() => r()));
export const nextFrame = async () => { await raf(); await raf(); };
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Force style flush so a just-set property animates instead of jumping. */
export const reflow = (el) => el.offsetHeight;

export function on(target, type, fn, opts) {
  target.addEventListener(type, fn, opts);
  return () => target.removeEventListener(type, fn, opts);
}

/** Attach a scroll listener that toggles [data-scrolled] on a nav bar. */
export function bindScrollShadow(scroller, bar, threshold = 4) {
  const update = () => {
    if (scroller.scrollTop > threshold) bar.setAttribute("data-scrolled", "");
    else bar.removeAttribute("data-scrolled");
  };
  scroller.addEventListener("scroll", update, { passive: true });
  update();
}
