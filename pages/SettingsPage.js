/**
 * SettingsPage.js — appearance, map, privacy, data.
 *
 * Nothing here is a preference for its own sake: every switch either changes
 * how the map is drawn, or controls whether anything leaves the device. The
 * cloud-sync row is present and honest about being unbuilt, because the seam
 * exists in services/sync.js and hiding it would be the coy option.
 */

import { h, mount, bindScrollShadow } from "../utils/dom.js";
import { icon } from "../components/Icon.js";
import { toggle, segmented } from "../components/Controls.js";
import { actionSheet, confirm } from "../components/ActionSheet.js";
import { toast } from "../components/Toast.js";
import * as store from "../services/store.js";
import * as db from "../services/db.js";
import { getStatus as syncStatus } from "../services/sync.js";
import {
  buildArchive, buildGeoJSON, downloadJSON, archiveFilename, importArchive, readFileAsText,
} from "../services/export.js";
import { loadSample, removeSample, hasSample } from "../services/sample.js";
import { setAccentMode } from "../utils/theme.js";
import { setHapticsEnabled, haptic } from "../utils/haptics.js";
import { formatBytes, formatCount } from "../utils/format.js";

const VERSION = "1.0.0";

export function createSettingsPage({ onRestyleMap } = {}) {
  const body = h("div.settings");
  const scroll = h("div.page__scroll", [body]);
  const header = h("div.hd", [h("div.hd__title", [h("h1.display", "Settings")])]);
  const el = h("div.page.settingspage", [header, scroll]);
  bindScrollShadow(scroll, header, 2);

  const importInput = h("input", {
    type: "file",
    accept: "application/json,.json,.geojson",
    onchange: async (e) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file) return;
      await runImport(file);
    },
  });

  async function runImport(file) {
    const mode = await actionSheet({
      title: "Import data",
      message: file.name,
      actions: [
        { id: "merge", label: "Merge with what's here", glyph: "layers" },
        { id: "replace", label: "Replace everything", glyph: "refresh", danger: true },
      ],
    });
    if (!mode) return;
    const busy = toast("Importing…", { glyph: "download", duration: 60000 });
    try {
      const text = await readFileAsText(file);
      const result = await importArchive(text, { mode });
      busy.close();
      haptic("success");
      toast(
        `Imported ${formatCount(result.places, "place")}${result.photos ? ` and ${formatCount(result.photos, "photo")}` : ""}`,
        { glyph: "check", tone: "success" }
      );
      render();
    } catch (err) {
      busy.close();
      haptic("error");
      toast(err.message || "That file couldn't be read", { glyph: "info", tone: "error" });
    }
  }

  async function exportArchive(includePhotos) {
    const busy = toast("Preparing archive…", { glyph: "upload", duration: 120000 });
    try {
      const archive = await buildArchive({ includePhotos });
      downloadJSON(archive, archiveFilename());
      busy.close();
      haptic("success");
      toast("Archive saved", { glyph: "check", tone: "success" });
    } catch (err) {
      busy.close();
      toast("Export failed", { glyph: "info", tone: "error" });
      console.error(err);
    }
  }

  let usage = { usage: 0, quota: 0 };

  async function render() {
    const settings = store.getSettings();
    const sync = syncStatus();
    const sampleLoaded = hasSample();

    mount(body, [
      /* ---- Appearance -------------------------------------------------- */
      h("div.settings__section", [
        h("div.cap.settings__label", "Appearance"),
        h("div.group", [
          h("div.row-item.row-item--stack", [
            h("div.row-item__text", [
              h("div.body", "Accent"),
              h(
                "div.foot.dimmer",
                settings.accentMode === "auto"
                  ? "Shifts through the day — cold at dawn, warm at dusk"
                  : "Fixed"
              ),
            ]),
          ]),
          h("div.settings__segwrap", [
            segmented({
              value: settings.accentMode,
              options: [
                { id: "auto", label: "Auto" },
                { id: "cyan", label: "Cyan" },
                { id: "amber", label: "Amber" },
                { id: "violet", label: "Violet" },
                { id: "mono", label: "Mono" },
              ],
              onChange: (v) => {
                store.setSetting("accentMode", v);
                setAccentMode(v);
                render();
              },
            }),
          ]),
        ]),
      ]),

      /* ---- Map --------------------------------------------------------- */
      h("div.settings__section", [
        h("div.cap.settings__label", "Map"),
        h("div.group", [
          toggle({
            label: "Place names",
            sublabel: "Cities and neighbourhoods on the map",
            glyph: "text",
            value: settings.mapLabels,
            onChange: (v) => {
              store.setSetting("mapLabels", v);
              onRestyleMap?.();
            },
          }),
          toggle({
            label: "Buildings",
            sublabel: "Building footprints when zoomed in",
            glyph: "city",
            value: settings.mapBuildings,
            onChange: (v) => {
              store.setSetting("mapBuildings", v);
              onRestyleMap?.();
            },
          }),
          toggle({
            label: "Group nearby pins",
            glyph: "layers",
            value: settings.clusterPins,
            onChange: (v) => store.setSetting("clusterPins", v),
          }),
          toggle({
            label: "Tap map to add",
            sublabel: "Off means only press-and-hold adds a place",
            glyph: "plus",
            value: settings.tapToAdd,
            onChange: (v) => store.setSetting("tapToAdd", v),
          }),
        ]),
      ]),

      /* ---- Privacy ------------------------------------------------------ */
      h("div.settings__section", [
        h("div.cap.settings__label", "Privacy"),
        h("div.group", [
          toggle({
            label: "Look up addresses",
            sublabel: "Sends coordinates to OpenStreetMap to name a place",
            glyph: "globe",
            value: settings.reverseGeocode,
            onChange: (v) => store.setSetting("reverseGeocode", v),
          }),
          toggle({
            label: "Haptics",
            glyph: "sparkle",
            value: settings.haptics,
            onChange: (v) => {
              store.setSetting("haptics", v);
              setHapticsEnabled(v);
              if (v) haptic("success");
            },
          }),
        ]),
        h(
          "p.settings__note.foot.faint",
          "Everything else stays on this device. There is no account, no server and no analytics."
        ),
      ]),

      /* ---- Data --------------------------------------------------------- */
      h("div.settings__section", [
        h("div.cap.settings__label", "Your data"),
        h("div.group", [
          h("button.row-item", { onclick: () => exportArchive(true) }, [
            h("span.row-item__glyph", [icon("upload", { size: 20 })]),
            h("span.row-item__text", [
              h("div.body", "Export everything"),
              h("div.foot.dimmer", "JSON archive including photos"),
            ]),
            h("span.row-item__chev", [icon("chevronRight", { size: 16 })]),
          ]),
          h("button.row-item", { onclick: () => downloadJSON(buildGeoJSON(), archiveFilename("geojson")) }, [
            h("span.row-item__glyph", [icon("globe", { size: 20 })]),
            h("span.row-item__text", [
              h("div.body", "Export as GeoJSON"),
              h("div.foot.dimmer", "Opens in any mapping tool"),
            ]),
            h("span.row-item__chev", [icon("chevronRight", { size: 16 })]),
          ]),
          h("button.row-item", { onclick: () => importInput.click() }, [
            h("span.row-item__glyph", [icon("download", { size: 20 })]),
            h("span.row-item__text", [h("div.body", "Import")]),
            h("span.row-item__chev", [icon("chevronRight", { size: 16 })]),
          ]),
          h("div.row-item", [
            h("span.row-item__glyph", [icon("database", { size: 20 })]),
            h("span.row-item__text", [
              h("div.body", "Storage used"),
              usage.quota
                ? h(
                    "div.foot.dimmer",
                    `${formatBytes(usage.usage)} of about ${formatBytes(usage.quota)} available`
                  )
                : null,
            ]),
            h("span.row-item__value", formatBytes(usage.usage)),
          ]),
        ]),
      ]),

      /* ---- Sample ------------------------------------------------------- */
      h("div.settings__section", [
        h("div.group", [
          h(
            "button.row-item",
            {
              onclick: async () => {
                if (sampleLoaded) {
                  const n = await removeSample();
                  haptic("success");
                  toast(`Removed ${formatCount(n, "sample place")}`, { glyph: "trash" });
                } else {
                  const n = await loadSample();
                  haptic("success");
                  toast(`Added ${formatCount(n, "place")} around São Paulo`, {
                    glyph: "sparkle",
                    tone: "success",
                  });
                }
                render();
              },
            },
            [
              h("span.row-item__glyph", [icon("sparkle", { size: 20 })]),
              h("span.row-item__text", [
                h("div.body", sampleLoaded ? "Remove sample places" : "Add sample places"),
                h("div.foot.dimmer", "A dozen real spots, to see the app with something in it"),
              ]),
              h("span.row-item__chev", [icon("chevronRight", { size: 16 })]),
            ]
          ),
        ]),
      ]),

      /* ---- Sync --------------------------------------------------------- */
      h("div.settings__section", [
        h("div.cap.settings__label", "Sync"),
        h("div.group", [
          h("div.row-item.is-disabled", [
            h("span.row-item__glyph", [icon("cloud", { size: 20 })]),
            h("span.row-item__text", [
              h("div.body", "Cloud sync"),
              h(
                "div.foot.dimmer",
                sync.available ? sync.provider : "Not connected — every record is already sync-ready"
              ),
            ]),
            h("span.row-item__value", "Soon"),
          ]),
        ]),
      ]),

      /* ---- Danger ------------------------------------------------------- */
      h("div.settings__section", [
        h("div.group", [
          h(
            "button.row-item",
            {
              onclick: async () => {
                const ok = await confirm({
                  title: "Erase everything?",
                  message: `${formatCount(store.placeCount(), "place")}, every photo and every collection. This cannot be undone.`,
                  confirmLabel: "Erase all data",
                });
                if (!ok) return;
                await store.resetEverything();
                haptic("error");
                toast("Everything erased", { glyph: "trash" });
                render();
              },
            },
            [
              h("span.row-item__glyph", { style: { color: "var(--danger)" } }, [
                icon("trash", { size: 20 }),
              ]),
              h("span.row-item__text", [
                h("div.body", { style: { color: "var(--danger)" } }, "Erase all data"),
              ]),
            ]
          ),
        ]),
      ]),

      /* ---- About -------------------------------------------------------- */
      h("div.settings__about", [
        h("div.settings__mark", [icon("pin", { size: 20 })]),
        h("div.t3", "Memory Map"),
        h("div.foot.faint", `Version ${VERSION}`),
        h(
          "p.foot.faint.settings__credit",
          "Map data © OpenStreetMap contributors. Tiles by OpenFreeMap. Rendered with MapLibre GL."
        ),
      ]),

      importInput,
    ]);
  }

  let unsubscribe = null;

  return {
    el,
    id: "settings",
    async onEnter() {
      render();
      usage = await db.estimateUsage();
      render();
      unsubscribe = store.on("change", render);
    },
    onLeave() {
      unsubscribe?.();
      unsubscribe = null;
    },
    onReselect() {
      scroll.scrollTo({ top: 0, behavior: "smooth" });
    },
    onDestroy() {
      unsubscribe?.();
    },
  };
}
