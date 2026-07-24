/**
 * sample.js — a starter map, offered rather than imposed.
 *
 * The spec is explicit that there is no onboarding, and there isn't: the app
 * opens straight onto the map. But an empty map is a poor first impression of
 * something whose whole argument is "this fills up over years", so Settings
 * offers to drop a handful of real places in São Paulo so the interface can be
 * seen doing its job. One tap adds them, one tap removes them again.
 */

import { createPlace } from "../models/Place.js";
import * as store from "./store.js";

const SAMPLE_TAG = "sample";

const PLACES = [
  {
    title: "Vale do Anhangabaú",
    description: "Wide open concrete under the viaduct. Best light late afternoon, and the ledges are polished from decades of use.",
    lat: -23.5455, lng: -46.6386, categoryId: "cat_skate",
    address: "Vale do Anhangabaú, Centro Histórico, São Paulo, Brazil",
    tags: ["ledges", "concrete", "golden hour"], favorite: true,
  },
  {
    title: "Coffee Lab",
    description: "The bar where you can watch every step. Ask what they're cupping.",
    lat: -23.5566, lng: -46.6923, categoryId: "cat_coffee",
    address: "Rua Fradique Coutinho, Vila Madalena, São Paulo, Brazil",
    tags: ["filter", "quiet mornings"],
  },
  {
    title: "Baixo Augusta at 2am",
    description: "Everything open, nothing planned. The city at its least organised and most itself.",
    lat: -23.5535, lng: -46.6534, categoryId: "cat_urban",
    address: "Rua Augusta, Consolação, São Paulo, Brazil",
    tags: ["night", "noise"],
  },
  {
    title: "Edifício Copan — the curve",
    description: "Niemeyer's wave. Stand across the street at dusk and the whole facade turns into one line.",
    lat: -23.5466, lng: -46.6428, categoryId: "cat_arch",
    address: "Avenida Ipiranga, República, São Paulo, Brazil",
    tags: ["niemeyer", "modernism"], favorite: true,
  },
  {
    title: "Parque Ibirapuera — the marquise",
    description: "Concrete canopy, endless shade, and the only place in the city that feels genuinely unhurried.",
    lat: -23.5874, lng: -46.6576, categoryId: "cat_nature",
    address: "Parque Ibirapuera, Vila Mariana, São Paulo, Brazil",
    tags: ["sunday", "shade"],
  },
  {
    title: "Galeria do Rock",
    description: "Five floors of record stores, patches and shops that shouldn't still exist. They do.",
    lat: -23.5443, lng: -46.6398, categoryId: "cat_music",
    address: "Avenida São João, Centro, São Paulo, Brazil",
    tags: ["vinyl", "vintage"], favorite: true,
  },
  {
    title: "Beco do Batman",
    description: "Repainted constantly, so it is never the same wall twice. Go early before the tour groups.",
    lat: -23.5546, lng: -46.6906, categoryId: "cat_art",
    address: "Rua Gonçalo Afonso, Vila Madalena, São Paulo, Brazil",
    tags: ["murals", "changes often"],
  },
  {
    title: "Terraço Itália",
    description: "The view that explains the scale of the place. Coffee costs what the view is worth.",
    lat: -23.5464, lng: -46.6444, categoryId: "cat_photo",
    address: "Avenida Ipiranga, República, São Paulo, Brazil",
    tags: ["skyline", "high up"],
  },
  {
    title: "Livraria da Vila",
    description: "The rotating shelf doors. An architecture joke that also works as a bookshop.",
    lat: -23.5678, lng: -46.6866, categoryId: "cat_books",
    address: "Rua Fradique Coutinho, Pinheiros, São Paulo, Brazil",
    tags: ["design", "afternoon"],
  },
  {
    title: "Mercado Municipal",
    description: "Go for the mortadella sandwich, stay for the stained glass nobody looks up at.",
    lat: -23.5419, lng: -46.6295, categoryId: "cat_food",
    address: "Rua da Cantareira, Centro, São Paulo, Brazil",
    tags: ["lunch", "loud"],
  },
  {
    title: "Feira da Benedito Calixto",
    description: "Saturdays only. Second-hand cameras near the back, if you get there before eleven.",
    lat: -23.5636, lng: -46.6862, categoryId: "cat_shop",
    address: "Praça Benedito Calixto, Pinheiros, São Paulo, Brazil",
    tags: ["saturday", "second hand"], visited: false,
  },
  {
    title: "Minhocão, closed to cars",
    description: "An elevated motorway that becomes a park on Sundays. Walking it changes how the city reads.",
    lat: -23.5384, lng: -46.6537, categoryId: "cat_urban",
    address: "Elevado Presidente João Goulart, Santa Cecília, São Paulo, Brazil",
    tags: ["sunday", "walk", "rooftops"], favorite: true,
  },
  {
    title: "Praça Roosevelt",
    description: "Concrete tiers, theatre kids, and skating until well past dark.",
    lat: -23.5462, lng: -46.6470, categoryId: "cat_skate",
    address: "Praça Roosevelt, Consolação, São Paulo, Brazil",
    tags: ["nights", "banks"],
  },
  {
    title: "Ponte Estaiada at blue hour",
    description: "Twenty minutes a day when the cables and the sky are the same brightness.",
    lat: -23.6132, lng: -46.6935, categoryId: "cat_photo",
    address: "Ponte Octávio Frias de Oliveira, Brooklin, São Paulo, Brazil",
    tags: ["blue hour", "tripod"], visited: false,
  },
];

const COLLECTIONS = [
  { name: "Skate Spots", glyph: "skate", color: "ember", match: (p) => p.categoryId === "cat_skate" },
  { name: "Photo Locations", glyph: "camera", color: "sky", match: (p) => p.categoryId === "cat_photo" },
  {
    name: "Sunday Walk",
    glyph: "route",
    color: "citron",
    description: "The long loop, no destination.",
    match: (p) => ["Minhocão, closed to cars", "Parque Ibirapuera — the marquise", "Vale do Anhangabaú"].includes(p.title),
  },
];

export async function loadSample() {
  const created = [];
  for (const input of PLACES) {
    const place = createPlace({
      ...input,
      tags: [...(input.tags || []), SAMPLE_TAG],
      date: randomRecentDate(),
    });
    created.push(await store.savePlace(place));
  }

  for (const spec of COLLECTIONS) {
    const placeIds = created.filter(spec.match).map((p) => p.id);
    if (!placeIds.length) continue;
    await store.saveCollection({
      name: spec.name,
      glyph: spec.glyph,
      color: spec.color,
      description: spec.description || "",
      placeIds,
    });
  }

  return created.length;
}

export async function removeSample() {
  let removed = 0;
  for (const place of store.allPlaces()) {
    if (!(place.tags || []).includes(SAMPLE_TAG)) continue;
    await store.deletePlace(place.id);
    removed++;
  }
  for (const collection of store.allCollections()) {
    if (!COLLECTIONS.some((c) => c.name === collection.name)) continue;
    if (collection.placeIds.length === 0) await store.deleteCollection(collection.id);
  }
  return removed;
}

export const hasSample = () =>
  store.allPlaces().some((p) => (p.tags || []).includes(SAMPLE_TAG));

/** Spread the sample across the last ten months so the charts have a shape. */
function randomRecentDate() {
  const days = Math.floor(Math.random() * 300);
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}
