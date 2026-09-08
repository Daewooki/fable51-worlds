#!/usr/bin/env node
/**
 * fetch_osm.mjs — downloads the Pangyo Techno Valley OSM extract into src/data/recon/osm_raw.json.
 *
 * Source: Overpass API (https://overpass-api.de/api/interpreter), POST body `data=<Overpass QL>`.
 * OSM data © OpenStreetMap contributors, ODbL (https://www.openstreetmap.org/copyright).
 *
 * The dump is committed so the world builds offline; this script is a no-op when the file already
 * exists. Pass --refresh to re-download.
 *
 * Run: node tools/geo/fetch_osm.mjs [--refresh|--augment]   (plain ESM, no deps)
 *   --refresh  re-download everything
 *   --augment  fetch ONLY the ground-cover polygons (landuse/leisure/parking/water) and merge them
 *              into the existing dump, so the committed file's other elements stay byte-identical.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { BBOX, CLIP_MARGIN_M, M_PER_DEG_LAT, M_PER_DEG_LON } from './constants.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT_PATH = path.join(ROOT, 'src/data/recon/osm_raw.json');
const ENDPOINT = 'https://overpass-api.de/api/interpreter';

/** bbox grown by CLIP_MARGIN_M, as the Overpass `(south,west,north,east)` filter string. */
export function bboxFilter(marginM = CLIP_MARGIN_M) {
  const dlat = marginM / M_PER_DEG_LAT, dlon = marginM / M_PER_DEG_LON;
  const s = (BBOX.south - dlat).toFixed(6), w = (BBOX.west - dlon).toFixed(6);
  const n = (BBOX.north + dlat).toFixed(6), e = (BBOX.east + dlon).toFixed(6);
  return `(${s},${w},${n},${e})`;
}

/**
 * Ground-cover polygons: land use, parks/greens, surface car parks and water.
 * Split out of `overpassQuery` so `--augment` can ask for exactly these without
 * re-downloading (and re-diffing) the buildings/roads dump.
 */
export function landuseClauses(bb = bboxFilter()) {
  return [
    `  way["landuse"]${bb};`,
    `  relation["landuse"]${bb};`,
    `  way["amenity"="parking"]${bb};`,
    `  way["natural"~"^(water|wood|scrub|grassland|sand|wetland|bare_rock)$"]${bb};`,
    `  relation["natural"="water"]${bb};`,
    `  way["waterway"="riverbank"]${bb};`,
  ];
}

export function landuseQuery(bb = bboxFilter()) {
  return ['[out:json][timeout:180];', '(', ...landuseClauses(bb), ')', ';', 'out geom;'].join('\n');
}

export function overpassQuery(bb = bboxFilter()) {
  return [
    '[out:json][timeout:180];',
    '(',
    //  massing
    `  way["building"]${bb};`,
    `  relation["building"]${bb};`,
    `  way["building:part"]${bb};`,
    //  streets and paths
    `  way["highway"]${bb};`,
    //  street furniture / vegetation (dedicated bins in gis.json)
    `  node["highway"~"^(street_lamp|traffic_signals|crossing)$"]${bb};`,
    `  node["natural"="tree"]${bb};`,
    `  node["amenity"~"^(bench|drinking_water|waste_basket|bicycle_parking|shelter|cafe|restaurant|fast_food|bank|pharmacy|convenience|parking|atm|toilets|post_box|vending_machine|kindergarten|school|library|hospital|clinic)$"]${bb};`,
    `  node["emergency"="fire_hydrant"]${bb};`,
    `  node["barrier"="bollard"]${bb};`,
    //  POIs
    `  node["shop"]${bb};`,
    `  node["office"]${bb};`,
    `  node["tourism"]${bb};`,
    `  node["public_transport"]${bb};`,
    `  node["railway"~"^(station|subway_entrance|tram_stop)$"]${bb};`,
    `  way["shop"]${bb};`,
    `  way["office"]${bb};`,
    `  way["tourism"]${bb};`,
    `  way["leisure"]${bb};`,
    `  way["railway"="platform"]${bb};`,
    //  ground cover polygons (the `landuse` bin of gis.json: block fill between the fitted streets)
    ...landuseClauses(bb),
    ')',
    ';',
    'out geom;',
  ].join('\n');
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function fetchOverpass(query, { retries = 3, endpoint = ENDPOINT } = {}) {
  let lastErr = null;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'pangyo-technovalley-world/0.1 (internal prototype)' },
        body: new URLSearchParams({ data: query }).toString(),
      });
      if (!res.ok) throw new Error(`Overpass HTTP ${res.status} ${res.statusText}`);
      const text = await res.text();
      const json = JSON.parse(text);
      if (!Array.isArray(json.elements)) throw new Error('Overpass response has no elements array');
      return json;
    } catch (e) {
      lastErr = e;
      const wait = 5000 * attempt;
      console.warn(`Overpass attempt ${attempt}/${retries} failed: ${e.message}${attempt < retries ? ` — retrying in ${wait / 1000}s` : ''}`);
      if (attempt < retries) await sleep(wait);
    }
  }
  throw lastErr;
}

/** Merge `extra.elements` into an existing dump, keyed by `type/id`. Returns the number of new elements. */
export function mergeElements(base, extra) {
  const seen = new Set(base.elements.map((e) => `${e.type}/${e.id}`));
  let added = 0;
  for (const e of extra.elements || []) { const k = `${e.type}/${e.id}`; if (seen.has(k)) continue; seen.add(k); base.elements.push(e); added++; }
  return added;
}

async function main() {
  const refresh = process.argv.includes('--refresh');
  const augment = process.argv.includes('--augment');
  if (augment) {
    // Add only the ground-cover polygons to the committed dump, leaving every other element byte-identical.
    if (!fs.existsSync(OUT_PATH)) throw new Error('--augment needs an existing osm_raw.json (run without flags first)');
    const base = JSON.parse(fs.readFileSync(OUT_PATH, 'utf8'));
    console.log(`augmenting with landuse/leisure/parking/water polygons ${bboxFilter()} …`);
    const extra = await fetchOverpass(landuseQuery());
    const added = mergeElements(base, extra);
    fs.writeFileSync(OUT_PATH, JSON.stringify(base));
    console.log(`merged ${added} new elements (fetched ${extra.elements.length}); ${OUT_PATH} is now ${(fs.statSync(OUT_PATH).size / 1e6).toFixed(2)} MB`);
    return;
  }
  if (fs.existsSync(OUT_PATH) && !refresh) {
    const mb = (fs.statSync(OUT_PATH).size / 1e6).toFixed(2);
    console.log(`osm_raw.json present (${mb} MB) — skipping fetch (use --refresh to re-download)`);
    return;
  }
  const query = overpassQuery();
  console.log(`fetching Overpass ${bboxFilter()} …`);
  const json = await fetchOverpass(query);
  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify(json));
  const counts = json.elements.reduce((a, e) => ((a[e.type] = (a[e.type] || 0) + 1), a), {});
  console.log(`wrote ${OUT_PATH} (${(fs.statSync(OUT_PATH).size / 1e6).toFixed(2)} MB)`, JSON.stringify({ ...counts, buildings: json.elements.filter((e) => e.tags?.building).length }));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) await main();
