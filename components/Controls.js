/**
 * Controls.js — the form vocabulary.
 *
 * Every control here is borderless by default and gains definition from
 * spacing and a single hairline rather than from a box. Boxes multiply: eight
 * outlined fields in a column is a tax form. The app needs eight fields; it
 * does not need to look like one.
 */

import { h } from "../utils/dom.js";
import { icon } from "./Icon.js";
import { haptic } from "../utils/haptics.js";
import { COLORS } from "../models/schema.js";
import { GLYPH_LIBRARY } from "./Icon.js";

/* ---- Text -------------------------------------------------------------- */

export function field({
  label,
  value = "",
  placeholder = "",
  multiline = false,
  onInput,
  size = "body",
  maxLength,
  autofocus = false,
  inputmode,
  enterkeyhint,
}) {
  const input = multiline
    ? h("textarea.field__input", {
        placeholder,
        rows: 1,
        maxLength,
        enterkeyhint,
        oninput: (e) => {
          autogrow(e.target);
          onInput?.(e.target.value);
        },
        onkeydown: (e) => {
          // A single-line-in-spirit field (the place name) still uses a
          // textarea so it can wrap; Return should dismiss, not add a line.
          if (e.key === "Enter" && enterkeyhint === "next") {
            e.preventDefault();
            e.target.blur();
          }
        },
      })
    : h("input.field__input", {
        type: "text",
        placeholder,
        maxLength,
        inputmode,
        enterkeyhint,
        autocomplete: "off",
        autocorrect: "on",
        spellcheck: false,
        oninput: (e) => onInput?.(e.target.value),
      });

  input.value = value || "";
  input.classList.add(`field__input--${size}`);
  if (autofocus) requestAnimationFrame(() => input.focus());
  if (multiline) requestAnimationFrame(() => autogrow(input));

  const root = h("label.field", [
    label ? h("span.field__label.cap", label) : null,
    input,
  ]);
  root.input = input;
  return root;
}

function autogrow(el) {
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight}px`;
}

/* ---- Toggle ------------------------------------------------------------ */

export function toggle({ label, sublabel, glyph, value = false, onChange, tint }) {
  const knob = h("span.switch__knob");
  const sw = h("span.switch", { dataset: value ? { on: "true" } : {} }, [knob]);

  const root = h(
    "button.row-item.press-none",
    {
      onclick: () => {
        value = !value;
        haptic(value ? "light" : "select");
        if (value) sw.setAttribute("data-on", "true");
        else sw.removeAttribute("data-on");
        onChange?.(value);
      },
    },
    [
      glyph ? h("span.row-item__glyph", { style: tint ? { color: tint } : {} }, [icon(glyph, { size: 20 })]) : null,
      h("span.row-item__text", [
        h("div.body", label),
        sublabel ? h("div.foot.dimmer", { style: { marginTop: "1px" } }, sublabel) : null,
      ]),
      sw,
    ]
  );
  root.setValue = (v) => {
    value = v;
    if (v) sw.setAttribute("data-on", "true");
    else sw.removeAttribute("data-on");
  };
  return root;
}

/* ---- Segmented --------------------------------------------------------- */

/**
 * The selection indicator is a single element that slides between segments,
 * rather than a background that fades in and out per item. It is more code and
 * it is the entire difference between "tabs" and "a control".
 */
export function segmented({ options, value, onChange, className = "" }) {
  const indicator = h("span.segmented__indicator");
  const buttons = options.map((opt) =>
    h(
      "button.segmented__item",
      {
        dataset: { value: opt.id },
        onclick: () => {
          if (value === opt.id) return;
          value = opt.id;
          haptic("select");
          update(true);
          onChange?.(opt.id);
        },
      },
      [opt.glyph ? icon(opt.glyph, { size: 16 }) : null, h("span", opt.label)]
    )
  );

  const root = h(`div.segmented${className ? "." + className : ""}`, [indicator, ...buttons]);

  function update(animate) {
    const active = buttons.find((b) => b.dataset.value === value) || buttons[0];
    buttons.forEach((b) => b.classList.toggle("is-active", b === active));
    if (!active) return;
    indicator.style.transition = animate
      ? "transform var(--d-md) var(--ease), width var(--d-md) var(--ease)"
      : "none";
    indicator.style.width = `${active.offsetWidth}px`;
    indicator.style.transform = `translateX(${active.offsetLeft}px)`;
  }

  // Widths are unknown until layout; measure on the next frame and on resize.
  requestAnimationFrame(() => update(false));
  new ResizeObserver(() => update(false)).observe(root);

  root.setValue = (v) => {
    value = v;
    update(true);
  };
  return root;
}

/* ---- Chips ------------------------------------------------------------- */

export function chip({ label, glyph, colour, active = false, onClick, count }) {
  const el = h(
    "button.chip",
    {
      dataset: active ? { on: "true" } : {},
      style: colour ? { "--chip-c": colour } : {},
      onclick: (e) => {
        haptic("select");
        onClick?.(e);
      },
    },
    [
      glyph ? icon(glyph, { size: 16, stroke: 1.7 }) : null,
      h("span.chip__label", label),
      count !== undefined ? h("span.chip__count.num", String(count)) : null,
    ]
  );
  return el;
}

/** A horizontally scrolling row of chips with edge fades. */
export function chipRow(children, { className = "" } = {}) {
  return h(`div.chiprow${className ? "." + className : ""}`, [
    h("div.chiprow__scroll", children),
  ]);
}

/* ---- Colour ------------------------------------------------------------ */

export function colorPicker({ value, onChange, allowInherit = false }) {
  let current = value;
  const swatches = [];

  const make = (id, hex, label) => {
    const el = h(
      "button.swatch",
      {
        style: { "--sc": hex },
        dataset: current === id ? { on: "true" } : {},
        "aria-label": label,
        onclick: () => {
          current = id;
          haptic("select");
          swatches.forEach((s) =>
            s.dataset.id === id ? s.setAttribute("data-on", "true") : s.removeAttribute("data-on")
          );
          onChange?.(id);
        },
      },
      [h("span.swatch__fill"), h("span.swatch__ring")]
    );
    el.dataset.id = id;
    swatches.push(el);
    return el;
  };

  const items = [];
  if (allowInherit) items.push(make(null, "transparent", "Match category"));
  items.push(...COLORS.map((c) => make(c.id, c.hex, c.name)));

  return h("div.swatches", items);
}

/* ---- Glyph ------------------------------------------------------------- */

export function glyphPicker({ value, onChange, colour }) {
  let current = value;
  const buttons = GLYPH_LIBRARY.map((name) => {
    const el = h(
      "button.glyphpick",
      {
        dataset: current === name ? { on: "true" } : {},
        style: colour ? { "--gc": colour } : {},
        onclick: () => {
          current = name;
          haptic("select");
          buttons.forEach((b) =>
            b.dataset.glyph === name ? b.setAttribute("data-on", "true") : b.removeAttribute("data-on")
          );
          onChange?.(name);
        },
      },
      [icon(name, { size: 21 })]
    );
    el.dataset.glyph = name;
    return el;
  });
  return h("div.glyphgrid", buttons);
}

/* ---- Tags -------------------------------------------------------------- */

export function tagInput({ value = [], onChange, suggestions = [] }) {
  let tags = [...value];
  const list = h("div.tags");
  const input = h("input.tags__input", {
    type: "text",
    placeholder: tags.length ? "Add another" : "Add a tag",
    enterkeyhint: "done",
    autocomplete: "off",
    onkeydown: (e) => {
      if (e.key === "Enter" || e.key === ",") {
        e.preventDefault();
        commit(input.value);
      } else if (e.key === "Backspace" && !input.value && tags.length) {
        remove(tags[tags.length - 1]);
      }
    },
    onblur: () => commit(input.value),
  });

  function commit(raw) {
    const clean = String(raw).trim().replace(/^#/, "");
    if (!clean) return;
    if (!tags.some((t) => t.toLowerCase() === clean.toLowerCase())) {
      tags.push(clean);
      onChange?.(tags);
    }
    input.value = "";
    render();
  }

  function remove(tag) {
    tags = tags.filter((t) => t !== tag);
    onChange?.(tags);
    render();
  }

  function render() {
    list.textContent = "";
    tags.forEach((t) =>
      list.append(
        h("button.tagpill", { onclick: () => { haptic("select"); remove(t); } }, [
          h("span", t),
          icon("close", { size: 12, stroke: 2.2 }),
        ])
      )
    );
    list.append(input);
    input.placeholder = tags.length ? "Add another" : "Add a tag";
  }

  render();

  const hints = suggestions.length
    ? h(
        "div.chiprow__scroll.tags__hints",
        suggestions.slice(0, 12).map((s) =>
          h("button.chip.chip--ghost", { onclick: () => commit(s.tag || s) }, [
            h("span.chip__label", s.tag || s),
          ])
        )
      )
    : null;

  return h("div.taginput", [list, hints]);
}

/* ---- Date -------------------------------------------------------------- */

/**
 * The native date input is kept — every platform's own picker beats anything
 * rebuilt in a div, and on iOS it is a wheel the user already knows. Only its
 * chrome is restyled, and the row around it does the labelling.
 */
export function dateField({ value, onChange, label = "Date" }) {
  const input = h("input", {
    type: "date",
    class: "datefield__input",
    onchange: (e) => onChange?.(e.target.value),
  });
  input.value = value || "";
  return h("label.row-item.datefield", [
    h("span.row-item__glyph", [icon("calendar", { size: 20 })]),
    h("span.row-item__text.body", label),
    input,
  ]);
}
