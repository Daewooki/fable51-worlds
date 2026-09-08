#!/usr/bin/env node
/**
 * fetch_elevation.mjs — samples ground elevation on a 25 m grid over the world bbox and writes
 * src/data/recon/elevation.json in the same shape as union-square-sf's recon file:
 *   { source, fetchedAt, grid:{spacingM,rows,cols,bbox}, stats, origin, crosscheck,
 *     samples:[{lat,lon,elev_m}], intersections:[], buildingCentroids:[] }
 *
 * Primary source : OpenTopoData `srtm30m` (https://api.opentopodata.org/v1/srtm30m) —
 *                  ≤ 100 locations per request, ≤ 1 request/second, public SRTM 1-arcsec data.
 * Fallback       : AWS Terrarium terrain tiles (s3.amazonaws.com/elevation-tiles-prod/terrarium/14/{x}/{y}.png),
 *                  height = (R * 256 + G + B / 256) - 32768. PNGs are decoded here with node:zlib plus a
 *                  minimal chunk/filter reader (8-bit RGB/RGBA, filters 0-4) so the tools stay dependency-free.
 * A sample that fails in both sources is dropped (build_gis interpolates over the gaps).
 *
 * The result is committed so the world builds offline; this script is a no-op when the file already
 * exists. Pass --refresh to re-sample.
 *
 * Run: node tools/geo/fetch_elevation.mjs [--refresh]
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { BBOX, GRID_SPACING_M, M_PER_DEG_LAT, M_PER_DEG_LON, FALLBACK_ORIGIN } from './constants.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT_PATH = path.join(ROOT, 'src/data/recon/elevation.json');
const OTD_URL = 'https://api.opentopodata.org/v1/srtm30m';
const TERRARIUM_URL = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium';
const TERRARIUM_ZOOM = 14;
const BATCH = 100;
const SOURCE = 'OpenTopoData srtm30m (https://api.opentopodata.org/v1/srtm30m), SRTM 1-arcsec, metres above EGM96 geoid; per-point fallback AWS Terrarium tiles (zoom 14) where the API failed';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const r2 = (v) => Math.round(v * 100) / 100;

// ---------------------------------------------------------------------------
// Grid
// ---------------------------------------------------------------------------
/** Regular lat/lon grid covering BBOX at ~spacing metres; rows/cols derived from the metric size. */
export function makeGrid(bbox = BBOX, spacingM = GRID_SPACING_M) {
  const heightM = (bbox.north - bbox.south) * M_PER_DEG_LAT;
  const widthM = (bbox.east - bbox.west) * M_PER_DEG_LON;
  const rows = Math.max(2, Math.round(heightM / spacingM) + 1);
  const cols = Math.max(2, Math.round(widthM / spacingM) + 1);
  const lats = Array.from({ length: rows }, (_, i) => +(bbox.south + ((bbox.north - bbox.south) * i) / (rows - 1)).toFixed(6));
  const lons = Array.from({ length: cols }, (_, j) => +(bbox.west + ((bbox.east - bbox.west) * j) / (cols - 1)).toFixed(6));
  const points = [];
  for (const lat of lats) for (const lon of lons) points.push({ lat, lon });
  return { rows, cols, lats, lons, points, heightM, widthM };
}

// ---------------------------------------------------------------------------
// OpenTopoData
// ---------------------------------------------------------------------------
export async function fetchOpenTopoData(points, { retries = 3 } = {}) {
  const locations = points.map((p) => `${p.lat},${p.lon}`).join('|');
  let lastErr = null;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(`${OTD_URL}?locations=${encodeURIComponent(locations)}`, { headers: { 'User-Agent': 'pangyo-technovalley-world/0.1 (internal prototype)' } });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
      const json = await res.json();
      if (json.status !== 'OK' || !Array.isArray(json.results)) throw new Error(`status=${json.status} ${json.error || ''}`);
      return json.results.map((r) => (r.elevation == null ? null : +r.elevation));
    } catch (e) {
      lastErr = e;
      if (attempt < retries) { console.warn(`  opentopodata attempt ${attempt}/${retries}: ${e.message} — retrying`); await sleep(1500 * attempt); }
    }
  }
  console.warn(`  opentopodata batch failed after ${retries} attempts: ${lastErr?.message}`);
  return null;
}

// ---------------------------------------------------------------------------
// Terrarium tiles (fallback) — minimal PNG decoder, no npm deps
// ---------------------------------------------------------------------------
/** Decode an 8-bit RGB/RGBA PNG buffer to { width, height, channels, data:Uint8Array }. */
export function decodePng(buf) {
  if (buf.length < 8 || buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG');
  let off = 8, ihdr = null;
  const idat = [];
  while (off + 8 <= buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('latin1', off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') ihdr = { width: data.readUInt32BE(0), height: data.readUInt32BE(4), bitDepth: data[8], colorType: data[9], interlace: data[12] };
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    off += 12 + len;
  }
  if (!ihdr) throw new Error('PNG has no IHDR');
  if (ihdr.bitDepth !== 8) throw new Error(`unsupported PNG bit depth ${ihdr.bitDepth}`);
  if (ihdr.interlace) throw new Error('interlaced PNG not supported');
  const channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[ihdr.colorType];
  if (!channels) throw new Error(`unsupported PNG colour type ${ihdr.colorType}`);
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const { width, height } = ihdr;
  const stride = width * channels;
  const out = new Uint8Array(width * height * channels);
  let p = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[p++];
    const line = raw.subarray(p, p + stride); p += stride;
    const cur = out.subarray(y * stride, (y + 1) * stride);
    const prior = y > 0 ? out.subarray((y - 1) * stride, y * stride) : null;
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? cur[i - channels] : 0;
      const b = prior ? prior[i] : 0;
      const c = prior && i >= channels ? prior[i - channels] : 0;
      let v = line[i];
      switch (filter) {
        case 0: break;
        case 1: v += a; break;
        case 2: v += b; break;
        case 3: v += (a + b) >> 1; break;
        case 4: {
          const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c);
          v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; break;
        }
        default: throw new Error(`unknown PNG filter ${filter}`);
      }
      cur[i] = v & 0xff;
    }
  }
  return { width, height, channels, data: out };
}

export const lonToTileX = (lon, z) => ((lon + 180) / 360) * 2 ** z;
export const latToTileY = (lat, z) => {
  const s = Math.sin((lat * Math.PI) / 180);
  return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * 2 ** z;
};
export const terrariumHeight = (r, g, b) => r * 256 + g + b / 256 - 32768;

const tileCache = new Map();
async function terrariumTile(x, y, z) {
  const key = `${z}/${x}/${y}`;
  if (tileCache.has(key)) return tileCache.get(key);
  const res = await fetch(`${TERRARIUM_URL}/${z}/${x}/${y}.png`, { headers: { 'User-Agent': 'pangyo-technovalley-world/0.1 (internal prototype)' } });
  if (!res.ok) throw new Error(`terrarium HTTP ${res.status} for ${key}`);
  const img = decodePng(Buffer.from(await res.arrayBuffer()));
  tileCache.set(key, img);
  return img;
}

export async function fetchTerrarium(points, z = TERRARIUM_ZOOM) {
  const out = [];
  for (const p of points) {
    try {
      const fx = lonToTileX(p.lon, z), fy = latToTileY(p.lat, z);
      const tx = Math.floor(fx), ty = Math.floor(fy);
      const img = await terrariumTile(tx, ty, z);
      const px = Math.min(img.width - 1, Math.floor((fx - tx) * img.width));
      const py = Math.min(img.height - 1, Math.floor((fy - ty) * img.height));
      const i = (py * img.width + px) * img.channels;
      out.push(r2(terrariumHeight(img.data[i], img.data[i + 1], img.data[i + 2])));
    } catch (e) {
      console.warn(`  terrarium failed for ${p.lat},${p.lon}: ${e.message}`);
      out.push(null);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Sampling driver
// ---------------------------------------------------------------------------
async function sampleAll(points) {
  const elevs = new Array(points.length).fill(null);
  let terrariumUsed = 0;
  for (let i = 0; i < points.length; i += BATCH) {
    const batch = points.slice(i, i + BATCH);
    const t0 = Date.now();
    let vals = await fetchOpenTopoData(batch);
    if (!vals) {
      vals = await fetchTerrarium(batch);
      terrariumUsed += vals.filter((v) => v != null).length;
    }
    for (let k = 0; k < batch.length; k++) elevs[i + k] = vals[k] == null ? null : r2(vals[k]);
    const done = Math.min(i + BATCH, points.length);
    process.stdout.write(`\r  elevation ${done}/${points.length}`);
    const wait = 1100 - (Date.now() - t0); // OpenTopoData: <= 1 request/second
    if (done < points.length && wait > 0) await sleep(wait);
  }
  process.stdout.write('\n');
  return { elevs, terrariumUsed };
}

async function pointElevation(lat, lon) {
  const v = await fetchOpenTopoData([{ lat, lon }]);
  if (v && v[0] != null) return r2(v[0]);
  const t = await fetchTerrarium([{ lat, lon }]);
  return t[0] == null ? null : r2(t[0]);
}

async function main() {
  const refresh = process.argv.includes('--refresh');
  if (fs.existsSync(OUT_PATH) && !refresh) {
    console.log('elevation.json present — skipping fetch (use --refresh to re-sample)');
    return;
  }
  const grid = makeGrid();
  console.log(`sampling ${grid.rows}×${grid.cols} = ${grid.points.length} points on a ${GRID_SPACING_M} m grid (${Math.round(grid.widthM)} × ${Math.round(grid.heightM)} m) …`);
  const { elevs, terrariumUsed } = await sampleAll(grid.points);

  const samples = [];
  let nulls = 0;
  for (let i = 0; i < grid.points.length; i++) {
    if (elevs[i] == null) { nulls++; continue; }
    samples.push({ lat: grid.points[i].lat, lon: grid.points[i].lon, elev_m: elevs[i] });
  }
  if (nulls) console.warn(`dropped ${nulls} sample(s) that failed in both sources`);

  await sleep(1100);
  const crosscheckPoints = [
    { name: 'NCSOFT R&D Center centroid', lat: FALLBACK_ORIGIN.lat, lon: FALLBACK_ORIGIN.lon },
    { name: 'Pangyo Station (판교역)', lat: 37.39485, lon: 127.11165 },
  ];
  const crosscheck = [];
  for (const p of crosscheckPoints) { crosscheck.push({ ...p, srtm30m: await pointElevation(p.lat, p.lon) }); await sleep(1100); }
  const originElev = crosscheck[0].srtm30m;

  const vals = samples.map((s) => s.elev_m);
  const out = {
    source: SOURCE,
    fetchedAt: new Date().toISOString(),
    grid: { spacingM: GRID_SPACING_M, rows: grid.rows, cols: grid.cols, bbox: BBOX },
    stats: {
      samples: samples.length, requested: grid.points.length, nulls, terrariumSamples: terrariumUsed,
      minM: r2(Math.min(...vals)), maxM: r2(Math.max(...vals)), meanM: r2(vals.reduce((a, b) => a + b, 0) / vals.length),
    },
    origin: { name: 'NCSOFT R&D Center centroid (OSM way 694434545)', lat: FALLBACK_ORIGIN.lat, lon: FALLBACK_ORIGIN.lon, elev_m: originElev },
    crosscheck,
    samples,
    intersections: [],
    buildingCentroids: [],
  };
  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify(out));
  console.log(`wrote ${OUT_PATH} (${(fs.statSync(OUT_PATH).size / 1e3).toFixed(0)} KB)`, JSON.stringify(out.stats), 'origin elev', originElev);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) await main();
