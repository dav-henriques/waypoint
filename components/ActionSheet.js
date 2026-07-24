/**
 * ActionSheet.js — the iOS action sheet, for destructive and branching choices.
 * Returns the id of the chosen action, or null if dismissed.
 */

import { h } from "../utils/dom.js";
import { icon } from "./Icon.js";
import { createSheet } from "./Sheet.js";
import { haptic } from "../utils/haptics.js";

export function actionSheet({ title, message, actions = [], cancel = "Cancel" }) {
  return new Promise((resolve) => {
    let settled = false;
    const done = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    const sheet = createSheet({
      detents: ["auto"],
      onDismiss: () => {
        done(null);
        setTimeout(() => sheet.destroy(), 60);
      },
      scrimOpacity: 0.5,
    });

    const group = h("div.actions__group", [
      title || message
        ? h("div.actions__title.sub", [
            title ? h("div.callout", { style: { color: "var(--t-2)", fontWeight: 600 } }, title) : null,
            message ? h("div.foot", { style: { marginTop: "4px" } }, message) : null,
          ])
        : null,
      ...actions.map((a) =>
        h(
          "button.actions__btn",
          {
            dataset: a.danger ? { danger: "true" } : {},
            onclick: () => {
              haptic(a.danger ? "warning" : "light");
              done(a.id);
              sheet.dismiss();
            },
          },
          [a.glyph ? icon(a.glyph, { size: 20 }) : null, h("span.grow", a.label)]
        )
      ),
    ]);

    const cancelGroup = h("div.actions__group", [
      h(
        "button.actions__btn",
        { dataset: { cancel: "true" }, onclick: () => sheet.dismiss() },
        cancel
      ),
    ]);

    sheet.content.append(h("div.actions", [group, cancelGroup]));
    sheet.present();
  });
}

/** Yes/no, phrased as a real choice rather than "OK". */
export function confirm({ title, message, confirmLabel = "Delete", danger = true }) {
  return actionSheet({
    title,
    message,
    actions: [{ id: "confirm", label: confirmLabel, danger, glyph: danger ? "trash" : "check" }],
  }).then((r) => r === "confirm");
}
