#!/usr/bin/env node
// Copies runtime data from src/data/recon to public/data (trimming the big GIS file). Run before dev/build.
// Adapted from union-square-sf/tools/geo/sync_data.mjs; uses fileURLToPath because the repo path may contain spaces.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const src = path.join(root, 'src/data/recon'), dst = path.join(root, 'public/data');
fs.mkdirSync(dst, { recursive: true });

const keepTags = new Set(['building', 'building:levels', 'height', 'name', 'name:en', 'addr:street', 'addr:housenumber', 'start_date', 'building:material', 'roof:shape', 'shop', 'amenity', 'office', 'tourism', 'brand', 'min_height', 'building:min_level', 'building:part']);
const gis = JSON.parse(fs.readFileSync(path.join(src, 'gis.json'), 'utf8'));
for (const list of [gis.buildings, gis.buildingParts]) for (const b of list) {
  const t = {}; for (const k of Object.keys(b.tags || {})) if (keepTags.has(k)) t[k] = b.tags[k]; b.tags = t;
  delete b.centroidGeo;
  b.footprint = b.footprint.map(([x, z]) => [Math.round(x * 100) / 100, Math.round(z * 100) / 100]);
}
for (const s of gis.streets) { delete s.tags; s.points = s.points.map(([x, z]) => [Math.round(x * 100) / 100, Math.round(z * 100) / 100]); }
for (const p of gis.pois) { const t = {}; for (const k of ['shop', 'amenity', 'tourism', 'office', 'brand', 'addr:street', 'addr:housenumber', 'level']) if (p.tags?.[k]) t[k] = p.tags[k]; p.tags = t; }
fs.writeFileSync(path.join(dst, 'gis.json'), JSON.stringify(gis));

for (const f of ['elevation.json', 'streets_spec.json', 'heights_override.json', 'tour.json', 'routes.json', 'viewpoints.json', 'storefronts.json', 'plaza.json', 'hero.json']) {
  const p = path.join(src, f); if (fs.existsSync(p)) fs.copyFileSync(p, path.join(dst, f));
}
// façade specs (optional)
const fdir = path.join(src, '..', 'facades'), fout = path.join(dst, 'facades');
if (fs.existsSync(fdir)) {
  fs.mkdirSync(fout, { recursive: true });
  for (const f of fs.readdirSync(fdir)) if (f.endsWith('.json')) { const txt = fs.readFileSync(path.join(fdir, f), 'utf8'); try { JSON.parse(txt); fs.writeFileSync(path.join(fout, f), txt); } catch (e) { console.error('INVALID JSON', f, e.message); } }
}
console.log('synced data ->', dst, 'gis', (fs.statSync(path.join(dst, 'gis.json')).size / 1024).toFixed(0) + 'KB');
