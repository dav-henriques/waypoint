/**
 * CollectionEditor.js — create or rename a collection.
 * Small sheet, three fields, no ceremony.
 */

import { h, mount } from "../utils/dom.js";
import { icon } from "../components/Icon.js";
import { createSheet } from "../components/Sheet.js";
import { confirm } from "../components/ActionSheet.js";
import { toast } from "../components/Toast.js";
import { field, colorPicker, glyphPicker } from "../components/Controls.js";
import * as store from "../services/store.js";
import { SUGGESTED_COLLECTIONS } from "../models/Collection.js";
import { colorHex } from "../models/schema.js";
import { haptic } from "../utils/haptics.js";

export function openCollectionEditor({ collection = null, onSaved, onDeleted } = {}) {
  const editing = !!collection;
  const draft = {
    id: collection?.id,
    name: collection?.name || "",
    description: collection?.description || "",
    glyph: collection?.glyph || "folder",
    color: collection?.color || "sky",
  };

  const sheet = createSheet({
    detents: [0.86],
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

  function paintPreview() {
    const hex = colorHex(draft.color);
    preview.style.setProperty("--pc", hex);
    mount(preview.querySelector(".cpreview__glyph"), [icon(draft.glyph, { size: 26 })]);
    preview.querySelector(".cpreview__name").textContent = draft.name || "Untitled";
    saveBtn.disabled = !draft.name.trim();
  }

  const nameField = field({
    value: draft.name,
    placeholder: "Collection name",
    size: "title",
    maxLength: 60,
    onInput: (v) => {
      draft.name = v;
      paintPreview();
    },
  });

  const suggestions = !editing
    ? h(
        "div.chiprow__scroll",
        SUGGESTED_COLLECTIONS.map((s) =>
          h(
            "button.chip.chip--ghost",
            {
              onclick: () => {
                draft.name = s.name;
                draft.glyph = s.glyph;
                draft.color = s.color;
                nameField.input.value = s.name;
                rebuild();
              },
            },
            [icon(s.glyph, { size: 15 }), h("span.chip__label", s.name)]
          )
        )
      )
    : null;

  const glyphHost = h("div");
  const colorHost = h("div");

  function rebuild() {
    mount(glyphHost, [
      glyphPicker({
        value: draft.glyph,
        colour: colorHex(draft.color),
        onChange: (g) => {
          draft.glyph = g;
          paintPreview();
        },
      }),
    ]);
    mount(colorHost, [
      colorPicker({
        value: draft.color,
        onChange: (c) => {
          draft.color = c;
          paintPreview();
          rebuild();
        },
      }),
    ]);
    paintPreview();
  }
  rebuild();

  async function save() {
    if (!draft.name.trim()) return;
    const record = await store.saveCollection(draft);
    haptic("success");
    sheet.dismiss();
    onSaved?.(record);
    toast(editing ? "Collection saved" : "Collection created", { glyph: "folder", tone: "success" });
  }

  sheet.content.append(
    h("div.sheet__bar", [
      h("button.tbtn", { "data-quiet": true, onclick: () => sheet.dismiss() }, "Cancel"),
      h("div.sheet__title.t3", editing ? "Edit collection" : "New collection"),
      saveBtn,
    ]),
    h("div.editor", { dataset: { scroll: "true" } }, [
      h("div.editor__inner", [
        preview,
        h("div.group", { style: { margin: "0 0 20px" } }, [
          nameField,
          h("div.hairline"),
          field({
            value: draft.description,
            placeholder: "What holds this together?",
            size: "sub",
            multiline: true,
            onInput: (v) => (draft.description = v),
          }),
        ]),
        suggestions
          ? h("div.editor__section", [
              h("div.cap.editor__label", "Or start from"),
              h("div.chiprow.chiprow--onglass", [suggestions]),
            ])
          : null,
        h("div.editor__section", [
          h("div.cap.editor__label", "Colour"),
          h("div.group", { style: { margin: 0 } }, [colorHost]),
        ]),
        h("div.editor__section", [
          h("div.cap.editor__label", "Icon"),
          h("div.group", { style: { margin: 0 } }, [glyphHost]),
        ]),
        editing
          ? h(
              "button.btn.btn--danger.btn--wide",
              {
                onclick: async () => {
                  const ok = await confirm({
                    title: `Delete "${collection.name}"?`,
                    message: "The places inside stay on your map.",
                  });
                  if (!ok) return;
                  await store.deleteCollection(collection.id);
                  haptic("success");
                  sheet.dismiss();
                  onDeleted?.(collection.id);
                  toast("Collection deleted", { glyph: "trash" });
                },
              },
              [icon("trash", { size: 18 }), "Delete collection"]
            )
          : null,
      ]),
    ])
  );

  sheet.present();
  return sheet;
}
