/**
 * CategoryEditor.js — categories are data, not a fixed enum.
 * Same sheet shape as the collection editor, deliberately: two things that
 * behave alike should look alike.
 */

import { h, mount } from "../utils/dom.js";
import { icon } from "../components/Icon.js";
import { createSheet } from "../components/Sheet.js";
import { confirm } from "../components/ActionSheet.js";
import { toast } from "../components/Toast.js";
import { field, colorPicker, glyphPicker } from "../components/Controls.js";
import * as store from "../services/store.js";
import { colorHex } from "../models/schema.js";
import { haptic } from "../utils/haptics.js";

export function openCategoryEditor({ category = null, onSaved, onDeleted } = {}) {
  const editing = !!category;
  const draft = {
    id: category?.id,
    name: category?.name || "",
    glyph: category?.glyph || "pin",
    color: category?.color || "sky",
    order: category?.order,
  };
  const inUse = editing ? store.placesInCategory(category.id).length : 0;

  const sheet = createSheet({
    detents: [0.82],
    onDismiss: () => setTimeout(() => sheet.destroy(), 80),
  });

  const preview = h("div.cpreview", [
    h("div.cpreview__glyph"),
    h("div.cpreview__name.t2", draft.name || "Untitled"),
  ]);

  const saveBtn = h(
    "button.tbtn",
    { "data-strong": true, onclick: () => save() },
    editing ? "Save" : "Create"
  );

  function paint() {
    preview.style.setProperty("--pc", colorHex(draft.color));
    mount(preview.querySelector(".cpreview__glyph"), [icon(draft.glyph, { size: 26 })]);
    preview.querySelector(".cpreview__name").textContent = draft.name || "Untitled";
    saveBtn.disabled = !draft.name.trim();
  }

  const glyphHost = h("div");
  const colorHost = h("div");

  function rebuild() {
    mount(glyphHost, [
      glyphPicker({
        value: draft.glyph,
        colour: colorHex(draft.color),
        onChange: (g) => {
          draft.glyph = g;
          paint();
        },
      }),
    ]);
    mount(colorHost, [
      colorPicker({
        value: draft.color,
        onChange: (c) => {
          draft.color = c;
          paint();
          rebuild();
        },
      }),
    ]);
    paint();
  }
  rebuild();

  async function save() {
    if (!draft.name.trim()) return;
    const record = await store.saveCategory(draft);
    haptic("success");
    sheet.dismiss();
    onSaved?.(record);
    toast(editing ? "Category saved" : "Category created", { glyph: "check", tone: "success" });
  }

  sheet.content.append(
    h("div.sheet__bar", [
      h("button.tbtn", { "data-quiet": true, onclick: () => sheet.dismiss() }, "Cancel"),
      h("div.sheet__title.t3", editing ? "Edit category" : "New category"),
      saveBtn,
    ]),
    h("div.editor", { dataset: { scroll: "true" } }, [
      h("div.editor__inner", [
        preview,
        h("div.group", { style: { margin: "0 0 20px" } }, [
          field({
            value: draft.name,
            placeholder: "Category name",
            size: "title",
            maxLength: 40,
            onInput: (v) => {
              draft.name = v;
              paint();
            },
          }),
        ]),
        h("div.editor__section", [
          h("div.cap.editor__label", "Colour"),
          h("div.group", { style: { margin: 0 } }, [colorHost]),
        ]),
        h("div.editor__section", [
          h("div.cap.editor__label", "Icon"),
          h("div.group", { style: { margin: 0 } }, [glyphHost]),
        ]),
        editing && store.allCategories().length > 1
          ? h(
              "button.btn.btn--danger.btn--wide",
              {
                onclick: async () => {
                  const ok = await confirm({
                    title: `Delete "${category.name}"?`,
                    message: inUse
                      ? `${inUse} place${inUse > 1 ? "s" : ""} will move to another category.`
                      : "Nothing is using it.",
                  });
                  if (!ok) return;
                  await store.deleteCategory(category.id);
                  haptic("success");
                  sheet.dismiss();
                  onDeleted?.(category.id);
                  toast("Category deleted", { glyph: "trash" });
                },
              },
              [icon("trash", { size: 18 }), "Delete category"]
            )
          : null,
      ]),
    ])
  );

  sheet.present();
  return sheet;
}
