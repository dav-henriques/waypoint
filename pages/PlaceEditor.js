/**
 * PlaceEditor.js — the sheet where a place is written down.
 *
 * The spec asks for thirteen fields. Thirteen fields in a column is a form,
 * and nobody fills in a form on a street corner, so the screen is ordered by
 * how likely each field is to be touched: a name and a category are all that
 * is required to save, everything below that is optional and visibly so.
 * The address arrives on its own from the reverse geocoder while you type.
 */

import { h, mount } from "../utils/dom.js";
import { icon } from "../components/Icon.js";
import { createSheet } from "../components/Sheet.js";
import { confirm } from "../components/ActionSheet.js";
import { toast } from "../components/Toast.js";
import { gallery, lightbox } from "../components/Gallery.js";
import {
  field, toggle, chip, chipRow, colorPicker, tagInput, dateField,
} from "../components/Controls.js";
import * as store from "../services/store.js";
import { importPhotos, deletePhoto, attachPhotosToPlace } from "../services/media.js";
import { reverseGeocode } from "../services/geo.js";
import { formatCoords } from "../utils/format.js";
import { haptic } from "../utils/haptics.js";
import { colorHex } from "../models/schema.js";

export function openPlaceEditor({ place = null, coords = null, onSaved, onDeleted } = {}) {
  const editing = !!place;
  const draft = {
    id: place?.id,
    title: place?.title || "",
    description: place?.description || "",
    lat: place?.lat ?? coords?.lat,
    lng: place?.lng ?? coords?.lng,
    address: place?.address || "",
    categoryId: place?.categoryId || store.allCategories()[0]?.id || "cat_other",
    color: place?.color ?? null,
    tags: [...(place?.tags || [])],
    photos: [...(place?.photos || [])],
    favorite: !!place?.favorite,
    visited: place?.visited !== undefined ? place.visited : true,
    date: place?.date || new Date().toISOString().slice(0, 10),
    notes: place?.notes || "",
  };
  const collectionMembership = new Set(
    editing ? store.collectionsForPlace(place.id).map((c) => c.id) : []
  );

  let saved = false;

  const sheet = createSheet({
    detents: [0.94],
    dismissible: true,
    onDismiss: async () => {
      setTimeout(() => sheet.destroy(), 80);
      // Photos imported into a draft that was thrown away should not linger.
      if (!saved && !editing) {
        for (const id of draft.photos) await deletePhoto(id).catch(() => {});
      }
    },
  });

  /* ---- Header ----------------------------------------------------------- */

  const saveBtn = h(
    "button.tbtn",
    { "data-strong": true, onclick: () => save() },
    editing ? "Save" : "Add"
  );
  const updateSaveState = () => {
    saveBtn.disabled = !draft.title.trim();
  };

  const bar = h("div.sheet__bar", [
    h("button.tbtn", { "data-quiet": true, onclick: () => sheet.dismiss() }, "Cancel"),
    h("div.sheet__title.t3", editing ? "Edit place" : "New place"),
    saveBtn,
  ]);

  /* ---- Location --------------------------------------------------------- */

  const addressLine = h("div.loc__address.foot.dimmer.truncate", draft.address || "Looking up address…");
  const locationCard = h("div.loc", [
    h("div.loc__glyph", [icon("pin", { size: 18 })]),
    h("div.loc__text", [
      h("div.loc__coords.sub.num", formatCoords(draft.lat, draft.lng, 4)),
      addressLine,
    ]),
  ]);

  if (!draft.address) {
    reverseGeocode(draft.lat, draft.lng).then((address) => {
      draft.address = address;
      addressLine.textContent = address || "No address found";
      addressLine.classList.toggle("faint", !address);
    });
  }

  /* ---- Fields ----------------------------------------------------------- */

  // Multiline, despite being a single-value field: place names are written by
  // people, not chosen from a list, and "Beco do Batman, the wall at the far
  // end" should wrap rather than scroll out of sight one character at a time.
  const titleField = field({
    value: draft.title,
    placeholder: "Name this place",
    size: "title",
    multiline: true,
    maxLength: 90,
    enterkeyhint: "next",
    onInput: (v) => {
      draft.title = v.replace(/\n/g, " ");
      updateSaveState();
    },
  });

  const descField = field({
    value: draft.description,
    placeholder: "What is it? Why does it matter?",
    multiline: true,
    size: "sub",
    maxLength: 800,
    onInput: (v) => (draft.description = v),
  });

  /* ---- Category & colour ------------------------------------------------ */

  const categoryChips = h("div.chiprow__scroll");
  const swatchHost = h("div");

  function renderCategoryChips() {
    mount(
      categoryChips,
      store.allCategories().map((c) =>
        chip({
          label: c.name,
          glyph: c.glyph,
          colour: colorHex(c.color),
          active: draft.categoryId === c.id,
          onClick: () => {
            draft.categoryId = c.id;
            renderCategoryChips();
            renderSwatches();
          },
        })
      )
    );
  }

  function renderSwatches() {
    mount(swatchHost, [
      colorPicker({
        value: draft.color,
        allowInherit: true,
        onChange: (id) => (draft.color = id),
      }),
    ]);
  }

  renderCategoryChips();
  renderSwatches();

  /* ---- Photos ----------------------------------------------------------- */

  const fileInput = h("input", {
    type: "file",
    accept: "image/*",
    multiple: true,
    onchange: async (e) => {
      const files = Array.from(e.target.files || []);
      e.target.value = "";
      if (!files.length) return;
      const busy = toast(`Adding ${files.length} photo${files.length > 1 ? "s" : ""}…`, {
        glyph: "image",
        duration: 20000,
      });
      const records = await importPhotos(files, draft.id || null);
      busy.close();
      draft.photos.push(...records.map((r) => r.id));
      photoStrip.refresh(draft.photos);
      haptic("success");
    },
  });

  const photoStrip = gallery(draft.photos, {
    editable: true,
    onAdd: () => fileInput.click(),
    onOpen: (index) => lightbox(draft.photos, index),
    onRemove: async (id) => {
      draft.photos = draft.photos.filter((p) => p !== id);
      await deletePhoto(id);
      photoStrip.refresh(draft.photos);
    },
  });

  /* ---- Collections ------------------------------------------------------ */

  const collectionChips = h("div.chiprow__scroll");

  function renderCollectionChips() {
    const all = store.allCollections();
    mount(collectionChips, [
      ...all.map((c) =>
        chip({
          label: c.name,
          glyph: c.glyph,
          colour: colorHex(c.color),
          active: collectionMembership.has(c.id),
          onClick: () => {
            if (collectionMembership.has(c.id)) collectionMembership.delete(c.id);
            else collectionMembership.add(c.id);
            renderCollectionChips();
          },
        })
      ),
      !all.length
        ? h("div.foot.faint", { style: { padding: "8px 0" } }, "No collections yet")
        : null,
    ]);
  }
  renderCollectionChips();

  /* ---- Toggles ---------------------------------------------------------- */

  const favToggle = toggle({
    label: "Favourite",
    glyph: "heart",
    value: draft.favorite,
    tint: "var(--danger)",
    onChange: (v) => (draft.favorite = v),
  });

  const visitedToggle = toggle({
    label: "I've been here",
    sublabel: "Off means somewhere you want to go",
    glyph: "check",
    value: draft.visited,
    onChange: (v) => (draft.visited = v),
  });

  /* ---- Body ------------------------------------------------------------- */

  const body = h("div.editor", { dataset: { scroll: "true" } }, [
    h("div.editor__inner", [
      locationCard,

      h("div.group", { style: { margin: "0 0 20px" } }, [titleField, h("div.hairline"), descField]),

      h("div.editor__section", [
        h("div.cap.editor__label", "Category"),
        h("div.chiprow.chiprow--onglass", [categoryChips]),
      ]),

      h("div.editor__section", [
        h("div.cap.editor__label", "Colour"),
        h("div.group", { style: { margin: 0 } }, [swatchHost]),
      ]),

      h("div.editor__section", [
        h("div.cap.editor__label", "Photos"),
        photoStrip,
      ]),

      h("div.editor__section", [
        h("div.cap.editor__label", "Tags"),
        h("div.group", { style: { margin: 0 } }, [
          tagInput({
            value: draft.tags,
            suggestions: store.allTags().slice(0, 10),
            onChange: (v) => (draft.tags = v),
          }),
        ]),
      ]),

      store.allCollections().length
        ? h("div.editor__section", [
            h("div.cap.editor__label", "Collections"),
            h("div.chiprow.chiprow--onglass", [collectionChips]),
          ])
        : null,

      h("div.group", { style: { margin: "0 0 20px" } }, [
        favToggle,
        visitedToggle,
        dateField({
          value: draft.date,
          label: "Date",
          onChange: (v) => (draft.date = v),
        }),
      ]),

      h("div.editor__section", [
        h("div.cap.editor__label", [icon("lock", { size: 11, stroke: 2 }), " Private notes"]),
        h("div.group", { style: { margin: 0 } }, [
          field({
            value: draft.notes,
            placeholder: "Only you will ever read this",
            multiline: true,
            size: "sub",
            onInput: (v) => (draft.notes = v),
          }),
        ]),
      ]),

      editing
        ? h(
            "button.btn.btn--danger.btn--wide",
            {
              style: { marginTop: "8px" },
              onclick: async () => {
                const ok = await confirm({
                  title: `Delete "${place.title || "this place"}"?`,
                  message: "This removes the pin, its photos and its notes.",
                });
                if (!ok) return;
                await store.deletePlace(place.id);
                haptic("success");
                saved = true;
                sheet.dismiss();
                onDeleted?.(place.id);
                toast("Place deleted", { glyph: "trash" });
              },
            },
            [icon("trash", { size: 18 }), "Delete place"]
          )
        : null,

      fileInput,
    ]),
  ]);

  /* ---- Save ------------------------------------------------------------- */

  async function save() {
    if (!draft.title.trim()) {
      haptic("warning");
      titleField.input.focus();
      return;
    }
    const record = await store.savePlace(draft);
    await attachPhotosToPlace(record.photos, record.id);

    // Reconcile collection membership in both directions.
    for (const c of store.allCollections()) {
      const shouldBeIn = collectionMembership.has(c.id);
      const isIn = c.placeIds.includes(record.id);
      if (shouldBeIn !== isIn) await store.setPlaceInCollection(c.id, record.id, shouldBeIn);
    }

    saved = true;
    haptic("success");
    sheet.dismiss();
    onSaved?.(record);
    toast(editing ? "Saved" : "Place remembered", { glyph: "check", tone: "success" });
  }

  updateSaveState();
  sheet.content.append(bar, body);
  sheet.present();
  return sheet;
}
