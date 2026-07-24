# Memory Map

A personal map of the places worth remembering. Dark, mobile-first, installable
from Safari, and entirely local — no account, no server, no analytics.

---

## Run it

The app uses native ES modules, so it must be **served** rather than opened from
the filesystem (`file://` blocks module imports). Any static server works:

```bash
cd memory-map
python3 -m http.server 8000
#  → http://localhost:8000
```

or

```bash
npx serve .
```

There is no build step, no bundler and no `npm install`. What you edit is what
runs.

## Put it on your phone

The PWA behaviour — standalone window, no browser chrome, home-screen icon —
requires HTTPS. The fastest route:

1. Drag the folder onto [netlify.com/drop](https://app.netlify.com/drop), or push
   it to a repo and turn on GitHub Pages.
2. Open the URL in **Safari** on the iPhone.
3. Share → **Add to Home Screen**.

Launched from the home screen it runs full-bleed under the notch and the home
indicator, keeps its own history stack, and works offline.

---

## Architecture

```
index.html            app shell, stylesheet manifest
app.js                composition root — the only file that knows about all the others
manifest.webmanifest  PWA metadata
sw.js                 service worker: app shell + map tile caching

/models               plain data + factories. No DOM, no I/O.
  schema.js             stores, colour palette, default categories, settings
  Place.js  Category.js  Collection.js

/services             everything stateful or asynchronous
  db.js                 IndexedDB wrapper, migrations, soft deletes
  store.js              the in-memory truth + reactive change events
  media.js              photo ingest, downscaling, blob storage
  geo.js                geolocation + Nominatim reverse geocoding (opt-out)
  export.js             JSON archive + GeoJSON, import with merge/replace
  sync.js               the seam where a backend will attach (see below)
  sample.js             optional starter places

/utils                dependency-free primitives
  dom.js                h() / mount() — the whole view layer, ~90 lines
  router.js             tab roots + navigation stack + interactive back swipe
  gestures.js           drag with directional lock, long-press, edge swipe
  motion.js             spring, rubber-band, momentum projection
  theme.js              the time-of-day accent
  events.js  format.js  id.js  haptics.js

/components           reusable UI
  Sheet.js              iOS bottom sheet: detents, scroll handoff, rubber band
  Ribbon.js             the two-axis browser
  Icon.js               the whole icon set, hand-drawn on a 24px grid
  Controls.js  TabBar.js  ActionSheet.js  Toast.js  PlaceCard.js  Gallery.js
  Ambient.js            the background field

/map
  style.js              hand-written dark vector map style
  mapView.js            markers, clustering, camera, long-press to add

/pages                one file per screen
/styles                tokens.css first; nothing hard-codes a colour or duration
/assets/vendor         MapLibre GL, vendored (no CDN)
```

### The three decisions that shape everything else

**The whole archive lives in memory.** A thousand places is a rich lifetime of
them, and a thousand plain objects is nothing to hold. `store.js` loads
everything once at boot, so every read afterwards is synchronous. That is why no
screen in this app has a loading state, and why search runs on every keystroke
with no debounce.

**Colour is never the only encoding.** Twelve category colours cannot all be
perceptually separable — the maths does not allow it. So every pin, chip, legend
row and chart bar carries a glyph and a name as well. The reasoning, and the two
collisions that were still worth fixing by hand, are documented at the top of
`models/schema.js`.

**Every record is already sync-ready.** Client-minted globally unique IDs,
`updatedAt` and a monotonic `rev` on every row, and deletions written as
tombstones rather than real deletes.

---

## Adding cloud sync later

`services/sync.js` defines the adapter interface and implements the merge
policy (last-write-wins on `updatedAt`, which `store.mergeIn()` already does).
Adding Firebase, Supabase or your own API means writing one object:

```js
registerAdapter({
  name: "firebase",
  signIn, signOut, currentUser,
  pull: (cursor) => ({ places, categories, collections, cursor }),
  push: ({ places, categories, collections }) => ({ cursor }),
});
```

No change to the store, the models, or a single view. The Settings screen
already has the row; it switches from "Soon" to live when an adapter registers.

---

## Map data

Vector tiles come from **OpenFreeMap** (OpenStreetMap data, no API key, no
account, no usage ceiling), rendered through a dark style written from scratch
in `map/style.js`. If the vector source ever fails, `mapView.js` falls back to
raster tiles automatically — a slightly less beautiful map beats a broken one.

Reverse geocoding uses **Nominatim**, rate-limited to one request per second and
cached per rounded coordinate, per their usage policy. It is the only thing in
the app that touches the network on your behalf, and Settings → Privacy → *Look
up addresses* turns it off permanently.

To swap tile providers, change `TILE_SOURCE` and `GLYPH_SOURCE` at the top of
`map/style.js`. Any OpenMapTiles-schema vector source drops straight in.

---

## Notes

- **Long-press the map** to remember a place. The **+** tab positions a pin with
  a reticle first, then opens the editor. Tap-to-add is off by default and lives
  in Settings.
- **Haptics** are wired everywhere but silent on iOS — Safari does not expose the
  Taptic Engine to web apps. Android gets them now; iPhone gets them free if
  Safari ever ships the API.
- **Photos** are resampled twice on import (1600px display copy, 420px
  thumbnail) and stored as blobs in IndexedDB. Grids never decode a full-size
  image to draw a 100px square.
- **Export** writes a JSON archive with photos inlined, plus GeoJSON, because an
  export should also be an exit.

Map data © OpenStreetMap contributors. Tiles by OpenFreeMap. Rendered with
MapLibre GL.
