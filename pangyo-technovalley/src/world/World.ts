// World assembly: loads recon data, builds terrain, streets, plaza, buildings; owns the collision world.
import * as THREE from 'three';
import { BASE } from '../assets/Assets';
import { CollisionWorld } from '../player/Collision';
import { Terrain } from './Terrain';
import { Streets } from './Streets';
import { StreetSpec } from './StreetGrid';
import { Buildings, GisBuilding, BuildingOverride, BuildingInfo } from './Buildings';
import { Plaza, PlazaSpec } from './Plaza';
import { FacadeBuilder } from './facade/FacadeBuilder';
import { autoSpec } from './facade/AutoSpec';
import type { FacadeSpec } from './facade/FacadeSpec';
import type { StorefrontReg } from './HeroContext';
import { logoKey } from '../materials/Signage';
import { localBbox } from '../geo/geo';

export interface GisData { origin: any; buildings: GisBuilding[]; buildingParts: GisBuilding[]; streets: any[]; pois: any[]; trees: any[]; lamps: any[]; signals: any[]; crossings: any[]; hydrants: any[]; benches: any[]; bollards?: any[]; plaza?: any; intersections: any[] }

/** One entry of `data/hero.json`: an OSM building whose massing is replaced by a hero module. */
export interface HeroEntry { osmId: string; module: string; yaw?: number; footprintFit?: boolean }

/** Fetch an optional data file. Missing/invalid ⇒ null plus one console.info line (feature off, no crash). */
export async function optionalData<T>(file: string, what: string): Promise<T | null> {
  try {
    const r = await fetch(`${BASE}data/${file}`);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const j = await r.json();
    return j as T;
  } catch {
    console.info(`[world] no data/${file} — ${what} disabled`);
    return null;
  }
}

export class World {
  group = new THREE.Group();
  collision = new CollisionWorld();
  terrain!: Terrain;
  streets!: Streets;
  buildings!: Buildings;
  /** Built only when `data/plaza.json` exists (this world may have no plaza at all). */
  plaza: Plaza | null = null;
  gis!: GisData;
  streetSpecs: StreetSpec[] = [];
  /** `data/streets_spec.json` (required): the fitted, axis-aligned street model. */
  streetSpecData: { meta?: any; streets: StreetSpec[] } | null = null;
  heightOverrides: Record<string, BuildingOverride> = {};
  heroEntries: HeroEntry[] = [];
  plazaSpec: PlazaSpec | null = null;
  heroIds = new Set<string>();           // buildings built entirely by hero modules (no massing geometry, no massing collision)
  facades!: FacadeBuilder;
  facadeSpecs: FacadeSpec[] = [];
  detailedIds = new Set<string>();
  storefronts: StorefrontReg[] = [];
  detailRadius = 230;
  streamRadius = 420;   // façade cells farther than this from the viewer are hidden (massing stays)
  overrides: Record<string, BuildingOverride> = {};
  treeSpots: [number, number, number][] = [];
  constructor() { this.group.name = 'world'; }

  async loadData(progress: (msg: string, f: number) => void) {
    progress('elevation', 0.05);
    const elev = await (await fetch(`${BASE}data/elevation.json`)).json();
    progress('gis', 0.15);
    this.gis = await (await fetch(`${BASE}data/gis.json`)).json();
    // required: the fitted street model
    this.streetSpecData = await (await fetch(`${BASE}data/streets_spec.json`)).json();
    // optional place content
    const ov = await optionalData<Record<string, BuildingOverride & { _README?: any }>>('heights_override.json', 'building height/style overrides');
    if (ov) for (const [k, v] of Object.entries(ov)) { if (k.startsWith('_')) continue; this.heightOverrides[k] = v as BuildingOverride; }
    this.plazaSpec = await optionalData<PlazaSpec>('plaza.json', 'plaza');
    const hero = await optionalData<HeroEntry[]>('hero.json', 'hero modules');
    if (Array.isArray(hero)) { this.heroEntries = hero; for (const h of hero) if (h.osmId) this.heroIds.add(h.osmId); }
    return elev;
  }

  async build(progress: (msg: string, f: number) => void) {
    const elev = await this.loadData(progress);
    progress('terrain', 0.3);
    this.terrain = new Terrain(elev.samples, localBbox());
    this.group.add(this.terrain.mesh);
    this.streetSpecs = this.makeStreetSpecs();
    // ground height for walking: sidewalk level except on roadways
    this.collision.terrain = (x, z) => this.terrain.heightAt(x, z) + (this.isRoad(x, z) ? Streets.ROAD_Y : Streets.SIDEWALK_Y);
    progress('streets', 0.45);
    this.streets = new Streets(this.streetSpecs, this.terrain, this.collision);
    this.group.add(this.streets.group);
    progress('plaza', 0.55);
    if (this.plazaSpec) { this.plaza = new Plaza(this.plazaSpec, this.terrain, this.collision); this.group.add(this.plaza.group); }
    progress('buildings', 0.62);
    // authored façade specs
    const facadeIdx = await optionalData<{ files?: string[] }>('facades/index.json', 'authored facade specs');
    for (const f of facadeIdx?.files || []) { try { const arr = await (await fetch(`${BASE}data/facades/${f}`)).json(); this.facadeSpecs.push(...arr); } catch (e) { console.warn('facade file failed', f, e); } }
    const detailIds = new Set<string>();
    const byId = new Map<string, FacadeSpec>();
    const gb = this.gis.buildings;
    for (const sp of this.facadeSpecs) {
      let id = sp.osmId;
      if (!id && sp.address) id = gb.find((b) => (b.address || '').toLowerCase() === sp.address!.toLowerCase())?.osmId;
      if (!id && sp.name) id = gb.find((b) => (b.name || '').toLowerCase() === sp.name!.toLowerCase())?.osmId;
      if (id) {
        const prev = byId.get(id);
        if (prev) { // merge: first authored spec wins, later files contribute extra storefront bays / edges
          prev.storefronts = [...(prev.storefronts || []), ...(sp.storefronts || []).filter((b) => !(prev.storefronts || []).some((q) => q.edge === b.edge && Math.abs(q.from - b.from) < 0.5))];
          for (const e of sp.edges) if (typeof e.edge === 'number' && !prev.edges.some((q) => q.edge === e.edge)) prev.edges.push(e);
        } else { byId.set(id, sp); detailIds.add(id); }
      }
    }
    // auto-detail every street-facing building near the origin
    for (const b of gb) { if (Math.hypot(b.centroid[0], b.centroid[1]) < this.detailRadius && !this.heroIds.has(b.osmId)) detailIds.add(b.osmId); }
    for (const p of this.gis.buildingParts) { if ((p.heightM ?? 0) > 40 && Math.hypot(p.centroid[0], p.centroid[1]) < this.detailRadius) detailIds.add(p.osmId); }   // tower parts
    this.detailedIds = detailIds;
    const noGeometry = new Set([...this.heroIds, ...detailIds]);
    const plazaPoly = this.gis.plaza?.footprint || (this.plazaSpec ? [[this.plazaSpec.bounds.xMin, this.plazaSpec.bounds.zMin], [this.plazaSpec.bounds.xMax, this.plazaSpec.bounds.zMin], [this.plazaSpec.bounds.xMax, this.plazaSpec.bounds.zMax], [this.plazaSpec.bounds.xMin, this.plazaSpec.bounds.zMax]] as [number, number][] : null);
    this.buildings = new Buildings(this.gis.buildings, this.gis.buildingParts, this.terrain, this.collision, { ...this.heightOverrides, ...this.overrides }, noGeometry, plazaPoly, this.heroIds);
    this.group.add(this.buildings.group);
    progress('façades', 0.68);
    this.facades = new FacadeBuilder(this);
    let n = 0;
    // storefront census → tenants for auto-detailed buildings (address match: street + house number/range)
    const census: any[] = (await optionalData<any[]>('storefronts.json', 'storefront census')) || [];
    const parseAddr = (a: string) => { const m = /^(\d+)(?:\s*[-–]\s*(\d+))?\s+([A-Za-z'.]+)/.exec(a || ''); return m ? { lo: +m[1], hi: +(m[2] || m[1]), street: m[3].replace(/[.']/g, '').toLowerCase() } : null; };
    const tenantsFor = (info: BuildingInfo): { street: string; tenant: any }[] => {
      const b = info.b; const hn = (b.tags['addr:housenumber'] || '').split(/[;,]/).map((x) => x.trim()).filter(Boolean); const street = (b.tags['addr:street'] || info.address || '').replace(/ (Street|Avenue|Lane|St|Ave|Ln)$/i, '').replace(/[.']/g, '').toLowerCase();
      if (!hn.length || !street) return [];
      let lo = Infinity, hi = -Infinity; for (const h of hn) { const m = /^(\d+)(?:-(\d+))?/.exec(h); if (!m) continue; lo = Math.min(lo, +m[1]); hi = Math.max(hi, +(m[2] || m[1])); }
      if (!Number.isFinite(lo)) return [];
      const out: { street: string; tenant: any }[] = [];
      for (const c of census) {
        const pa = parseAddr(c.address); if (!pa || pa.street !== street) continue;
        if (pa.lo < lo || pa.lo > hi) continue;
        if (/unresolved/i.test(c.name) || !c.name) continue;
        out.push({ street, tenant: c });
      }
      return out;
    };
    const streetOfEdge = (a: [number, number], b: [number, number]) => {
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]); if (len < 1) return null;
      const t = [(b[0] - a[0]) / len, (b[1] - a[1]) / len], nn = [t[1], -t[0]]; const mid = [(a[0] + b[0]) / 2 + nn[0] * 8, (a[1] + b[1]) / 2 + nn[1] * 8];
      for (const st of this.streetSpecs) { const d = st.axis === 'ns' ? Math.abs(mid[0] - st.c) : Math.abs(mid[1] - st.c); const along = st.axis === 'ns' ? mid[1] : mid[0]; if (d < st.width / 2 + st.sidewalk + 2 && along > Math.min(st.from, st.to) && along < Math.max(st.from, st.to) && ((st.axis === 'ns') === (Math.abs(nn[0]) > Math.abs(nn[1])))) return st.name.replace(/ (Street|Avenue|Lane)$/, '').replace(/[.']/g, '').toLowerCase(); }
      return null;
    };
    for (const id of detailIds) {
      const info = this.buildings.infos.get(id); if (!info) continue;
      let spec = byId.get(id) ?? autoSpec(info, n++);
      if (spec && !byId.has(id)) {
        // auto spec: attach census tenants along the matching street edge
        const tl = tenantsFor(info);
        if (tl.length) {
          spec = { ...spec, storefronts: [...(spec.storefronts || [])] };
          const fp = info.footprint;
          const byStreet = new Map<string, any[]>(); for (const t of tl) { const arr = byStreet.get(t.street) || []; arr.push(t.tenant); byStreet.set(t.street, arr); }
          for (const [street, list] of byStreet) {
            let best = -1, bestLen = 0;
            for (let i = 0; i < fp.length; i++) { const a = fp[i], bb = fp[(i + 1) % fp.length]; if (streetOfEdge(a, bb) === street) { const l = Math.hypot(bb[0] - a[0], bb[1] - a[1]); if (l > bestLen) { bestLen = l; best = i; } } }
            if (best < 0 || bestLen < 6) continue;
            const pad = 1.0, inner = bestLen - 2 * pad, w = Math.min(9, inner / list.length);
            list.slice(0, Math.max(1, Math.floor(inner / 3.5))).forEach((c, k) => {
              const from = pad + k * (inner / list.length) + (inner / list.length - w) / 2;
              const vacant = /vacant|closed/i.test(c.status || '');
              spec!.storefronts!.push({ edge: best, from, to: from + w, module: vacant ? 'wall' : (w > 6 ? 'storefront_bay_4.0x5.0' : 'storefront_bay_3.0x4.5'), tenant: vacant ? undefined : { name: c.name, brand: logoKey(c.name) || undefined, signType: 'fascia', category: c.category, status: c.status, confidence: c.confidence, address: c.address, illuminated: /hotel|cafe|restaurant|pharmacy|bank/.test(c.category || '') } });
            });
          }
        }
      }
      if (!spec) { this.buildings.addMassing(info); continue; }
      try { this.facades.build(info, spec); } catch (e) { console.warn('facade build failed', info.name || info.id, e); this.buildings.addMassing(info); }
    }
    this.buildings.flushMassing();
    await this.facades.finalize();
    this.storefronts.push(...this.facades.storefronts);
    this.group.add(this.facades.group);
  }

  /** Distance streaming: toggle façade cell meshes by distance to the viewer (call every ~0.5 s). */
  stream(cam: THREE.Vector3) {
    if (!this.facades) return;
    for (const o of this.facades.group.children) {
      const m = /^(facade:|.*\|)/.test(o.name) ? o : null; if (!m) continue;
      const k = o.name.includes('|') ? o.name.split('|')[0].replace('facade:', '') : null; if (!k || k === 'pool') continue;   // cell-keyed meshes + cell-keyed module pools
      const [cx, cz] = k.split(',').map(Number); if (!Number.isFinite(cx)) continue;
      const x = (cx + 0.5) * 130, z = (cz + 0.5) * 130;
      o.visible = Math.hypot(x - cam.x, z - cam.z) < this.streamRadius + 64;
    }
  }
  isSidewalk(x: number, z: number): boolean {
    for (const s of this.streetSpecs) {
      const hw = s.width / 2 + s.sidewalk;
      if (s.axis === 'ns') { if (Math.abs(x - s.c) <= hw && z >= Math.min(s.from, s.to) - hw && z <= Math.max(s.from, s.to) + hw) return true; }
      else if (Math.abs(z - s.c) <= hw && x >= Math.min(s.from, s.to) - hw && x <= Math.max(s.from, s.to) + hw) return true;
    }
    return false;
  }
  isRoad(x: number, z: number): boolean {
    for (const s of this.streetSpecs) {
      const hw = s.width / 2;
      if (s.axis === 'ns') { if (Math.abs(x - s.c) <= hw && z >= Math.min(s.from, s.to) - hw && z <= Math.max(s.from, s.to) + hw) return true; }
      else if (Math.abs(z - s.c) <= hw && x >= Math.min(s.from, s.to) - hw && x <= Math.max(s.from, s.to) + hw) return true;
    }
    return false;
  }

  /** Maximum lanes the analytic street geometry will build for one carriageway. */
  static MAX_LANES = 6;

  /**
   * Street specifications, straight from data/streets_spec.json (built by tools/geo/build_streets.mjs).
   * No street is named in code: the file is the single source of truth. `lanes` is clamped to 1..MAX_LANES
   * because the analytic lane/marking model degenerates on the very wide OSM lane counts of trunk roads.
   */
  makeStreetSpecs(): StreetSpec[] {
    const raw = this.streetSpecData?.streets;
    if (!Array.isArray(raw) || !raw.length) { console.warn('[world] data/streets_spec.json has no streets — the world will have no roads'); return []; }
    return raw.map((s: any): StreetSpec => ({
      name: String(s.name),
      axis: s.axis === 'ns' ? 'ns' : 'ew',
      c: +s.c, from: +s.from, to: +s.to,
      width: Math.max(3, +s.width),
      sidewalk: Math.max(0, s.sidewalk ?? 3),
      lanes: Math.max(1, Math.min(World.MAX_LANES, Math.round(s.lanes ?? 2))),
      oneway: s.oneway ?? null,
      parking: { left: !!s.parking?.left, right: !!s.parking?.right },
      ...(s.centerLine ? { centerLine: s.centerLine } : {}),
      ...(s.surface ? { surface: s.surface } : {}),
      ...(s.pedestrian ? { pedestrian: true } : {}),
      ...(s.transitLane ? { transitLane: s.transitLane } : {}),
      ...(s.transitRail ? { transitRail: true } : {}),
    }));
  }
}
