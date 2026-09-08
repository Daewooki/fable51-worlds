// Street furniture from GLB props (instanced). Nothing here names a place: everything is derived from the fitted street
// specs (`data/streets_spec.json`), the OSM prop bins in `gis.json` (trees/lamps/signals/crossings/hydrants/benches/bollards)
// and — when it exists — `data/plaza.json`. This world's OSM extract has no street furniture at all, so the placement rules
// below (lamps every ~30 m, trees every ~12 m on wide sidewalks, benches near the origin block, signals at major crossings)
// generate it procedurally; wherever OSM does carry the objects, those positions win.
import * as THREE from 'three';
import { Assets } from '../assets/Assets';
import type { World } from './World';
import type { App } from '../app/App';
import { Rng } from '../util/Rng';
import { pointInPolygon } from '../util/Geometry2D';
import { mergeGeometries as mergeBufferGeos } from 'three/addons/utils/BufferGeometryUtils.js';
import type { StreetSpec } from './StreetGrid';

export interface SignalHead { mesh: THREE.Object3D; lamps: Record<string, THREE.Mesh>; axis: 'ns' | 'ew'; x: number; z: number }

/** Procedural placement rules (metres). */
const LAMP_SPACING = 30, LAMP_CURB_OFFSET = 0.8;
const TREE_SPACING = 12, TREE_MIN_SIDEWALK = 3.0, TREE_CROSSING_CLEAR = 6;
const BENCH_RADIUS = 140, BENCH_SPACING = 45;      // benches only on the origin block
const MAJOR_WIDTH = 12;                            // a street this wide counts as "major" for signals
const EXTENT = 620;                                // props are placed within this box around the origin
const DENSE_RADIUS = 250;                          // beyond this, street trees are thinned to keep the triangle budget sane

export class Props {
  group = new THREE.Group();
  rng = new Rng(4242);
  signals: SignalHead[] = [];
  lampPositions: [number, number, number][] = [];
  plazaLampPositions: [number, number, number][] = [];
  constructor(public world: World, public app: App) { this.group.name = 'props'; }

  async build() {
    const w = this.world, t = w.terrain;
    const gy = (x: number, z: number) => t.heightAt(x, z) + 0.15;
    const has = (n: string) => Assets.has(n);
    const inst = async (name: string, cap: number) => (has(name) ? Assets.instanced(name, cap) : null);
    const lampTall = await inst('street/streetlight_sf_teardrop', 2500);
    const lampPed = await inst('street/streetlight_pedestrian_4m', 2500);
    const lampGlobe = await inst('street/streetlight_plaza_globe', 120);
    const meter = has('street/parking_meter_sf') ? await Assets.instanced('street/parking_meter_sf', 1600, { castShadow: false }) : null;
    const hydrant = await inst('street/hydrant_sf', 200);
    const trash = await inst('street/trashcan_black', 400);
    const bench = await inst('street/bench_wood', 200);
    const benchPlaza = await inst('street/bench_plaza', 200);
    const bikeRack = await inst('street/bike_rack', 200);
    const signPole = await inst('street/street_sign_pole', 200);
    const utility = await inst('street/utility_box', 200);
    const bollard = await inst('street/bollard_steel', 400);
    const treeGrate = await inst('street/tree_grate', 2500);
    const curbRamp = await inst('street/curb_ramp', 400);

    // --- crossing points: OSM crossings when the extract has them, otherwise every street intersection ---
    const junctions = w.streets.crossings;
    const osmCrossings = (w.gis.crossings || []).filter((c: any) => Number.isFinite(c.x) && Number.isFinite(c.z));
    const crossingPts: { x: number; z: number }[] = osmCrossings.length
      ? osmCrossings.map((c: any) => ({ x: c.x, z: c.z }))
      : junctions.map((c) => ({ x: c.x, z: c.z }));
    const nearCrossing = (x: number, z: number, d: number) => {
      for (const c of crossingPts) if (Math.abs(c.x - x) < d && Math.abs(c.z - z) < d) return true;
      for (const c of junctions) if (Math.abs(c.x - x) < d + c.a.width / 2 && Math.abs(c.z - z) < d + c.b.width / 2) return true;
      return false;
    };
    const inBounds = (x: number, z: number) => Math.abs(x) < EXTENT && Math.abs(z) < EXTENT;
    const onPlaza = (x: number, z: number) => !!w.plaza && w.plaza.contains(x, z);
    const at = (s: StreetSpec, along: number, across: number): [number, number] => (s.axis === 'ns' ? [across, along] : [along, across]);

    for (const s of w.streetSpecs) {
      if (s.pedestrian) continue;
      const hw = s.width / 2, lo = Math.min(s.from, s.to), hi = Math.max(s.from, s.to);
      // --- streetlights: both kerbs, every LAMP_SPACING m, LAMP_CURB_OFFSET m back from the kerb line ---
      const ped = s.width < 10;                       // narrow street → 4 m pedestrian lantern, else the tall highway mast
      for (let d = lo + 10; d < hi - 6; d += LAMP_SPACING) {
        for (const side of [-1, 1]) {
          const [x, z] = at(s, d, s.c + side * (hw + LAMP_CURB_OFFSET));
          if (!inBounds(x, z) || nearCrossing(x, z, 9)) continue;
          const rot = s.axis === 'ns' ? (side > 0 ? Math.PI / 2 : -Math.PI / 2) : side > 0 ? Math.PI : 0;
          (ped ? lampPed : lampTall)?.add([x, gy(x, z), z], rot);
          this.lampPositions.push([x, gy(x, z) + (ped ? 4.6 : 7.6), z]);
        }
      }
      // --- street trees on sidewalks at least TREE_MIN_SIDEWALK wide ---
      if (s.sidewalk >= TREE_MIN_SIDEWALK) {
        for (let d = lo + 14; d < hi - 12; d += TREE_SPACING) for (const side of [-1, 1]) {
          const [x, z] = at(s, d, s.c + side * (hw + Math.min(1.6, s.sidewalk / 2)));
          if (!inBounds(x, z) || nearCrossing(x, z, TREE_CROSSING_CLEAR) || onPlaza(x, z)) continue;
          if (this.rng.next() < 0.15) continue;
          if (Math.hypot(x, z) > DENSE_RADIUS && this.rng.next() < 0.6) continue;
          treeGrate?.add([x, gy(x, z) + 0.005, z], 0);
          this.world.treeSpots.push([x, gy(x, z), z]);
        }
      }
      // --- parking meters where the spec has a parking lane ---
      for (const side of [-1, 1]) {
        if (!(side < 0 ? s.parking.left : s.parking.right)) continue;
        for (let d = lo + 14; d < hi - 10; d += 6.2) {
          const [x, z] = at(s, d, s.c + side * (hw + 0.5));
          if (!inBounds(x, z) || nearCrossing(x, z, 12)) continue;
          meter?.add([x, gy(x, z), z], this.rng.range(-0.1, 0.1) + (s.axis === 'ns' ? 0 : Math.PI / 2));
        }
      }
      // --- bins / bike racks / utility cabinets, sparsely ---
      for (let d = lo + 20; d < hi - 10; d += 48) for (const side of [-1, 1]) {
        const [x, z] = at(s, d, s.c + side * (hw + 1.0));
        if (!inBounds(x, z) || nearCrossing(x, z, 6)) continue;
        const r = this.rng.next();
        if (r < 0.4) trash?.add([x, gy(x, z), z], this.rng.range(0, 6.28));
        else if (r < 0.7) bikeRack?.add([x, gy(x, z), z], s.axis === 'ns' ? 0 : Math.PI / 2);
        else utility?.add([x, gy(x, z), z], s.axis === 'ns' ? Math.PI / 2 : 0);
      }
      // --- benches: origin block only, facing the street ---
      for (let d = lo + 18; d < hi - 12; d += BENCH_SPACING) for (const side of [-1, 1]) {
        const [x, z] = at(s, d, s.c + side * (hw + Math.max(1.2, s.sidewalk - 1.4)));
        if (Math.hypot(x, z) > BENCH_RADIUS || nearCrossing(x, z, 10) || onPlaza(x, z)) continue;
        const rot = s.axis === 'ns' ? (side > 0 ? -Math.PI / 2 : Math.PI / 2) : side > 0 ? 0 : Math.PI;
        bench?.add([x, gy(x, z), z], rot);
        this.world.collision.addBox(x, z, 1.8, 0.7, gy(x, z), gy(x, z) + 0.9, rot);
      }
    }

    // --- OSM-mapped props (this extract has none of these except a few benches; the code stays generic) ---
    for (const p of w.gis.trees || []) { if (!inBounds(p.x, p.z)) continue; this.world.treeSpots.push([p.x, gy(p.x, p.z), p.z]); treeGrate?.add([p.x, gy(p.x, p.z) + 0.005, p.z], 0); }
    for (const p of w.gis.lamps || []) { if (!inBounds(p.x, p.z)) continue; lampPed?.add([p.x, gy(p.x, p.z), p.z], 0); this.lampPositions.push([p.x, gy(p.x, p.z) + 4.6, p.z]); }
    for (const p of w.gis.hydrants || []) { if (inBounds(p.x, p.z)) hydrant?.add([p.x, gy(p.x, p.z), p.z], 0); }
    for (const p of w.gis.benches || []) { if (inBounds(p.x, p.z)) bench?.add([p.x, gy(p.x, p.z), p.z], 0); }
    for (const p of w.gis.bollards || []) { if (inBounds(p.x, p.z)) bollard?.add([p.x, gy(p.x, p.z), p.z], 0); }
    for (const c of crossingPts) { if (inBounds(c.x, c.z)) curbRamp?.add([c.x, gy(c.x, c.z), c.z], 0); }

    // --- traffic signals: OSM signal nodes snapped to the nearest junction, else every major × major junction ---
    const signalProto = has('street/traffic_signal_post') ? await Assets.load('street/traffic_signal_post') : null;
    const osmSignals = (w.gis.signals || []).filter((s: any) => Number.isFinite(s.x) && Number.isFinite(s.z));
    const signalled = new Set<typeof junctions[number]>();
    if (osmSignals.length) {
      for (const sig of osmSignals) {
        let best: typeof junctions[number] | null = null, bd = 30 * 30;
        for (const j of junctions) { const d = (j.x - sig.x) ** 2 + (j.z - sig.z) ** 2; if (d < bd) { bd = d; best = j; } }
        if (best) signalled.add(best);
      }
    }
    for (const j of junctions) if (j.a.width >= MAJOR_WIDTH && j.b.width >= MAJOR_WIDTH) signalled.add(j);
    const signalSpots: { x: number; z: number; y: number; rot: number; cx: number; cz: number }[] = [];
    for (const c of junctions) {
      if (!c.signal || !signalled.has(c) || !inBounds(c.x, c.z)) continue;
      const hwA = c.a.width / 2, hwB = c.b.width / 2;
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        const x = c.x + sx * (hwA + 0.7), z = c.z + sz * (hwB + 0.7);
        const y = gy(x, z);
        signalSpots.push({ x, z, y, rot: sx < 0 ? (sz < 0 ? Math.PI : Math.PI / 2) : sz < 0 ? -Math.PI / 2 : 0, cx: c.x, cz: c.z });
        if (sx * sz > 0 && hydrant && !(w.gis.hydrants || []).length) hydrant.add([x + sx * 1.2, y, z - sz * 1.0], 0);
        if (sx * sz < 0 && signPole) signPole.add([x + sx * 1.5, y, z + sz * 0.5], 0);
      }
    }
    if (signalProto && signalSpots.length) this.buildSignals(signalProto, signalSpots);

    // --- plaza furniture from data/plaza.json (absent in this world) ---
    const plaza = w.plaza;
    if (plaza) {
      for (const [x, y, z] of plaza.spec.lamps || []) { lampGlobe?.add([x, y, z], 0); this.plazaLampPositions.push([x, y + 4.6, z]); }
      for (const [x, y, z, yaw] of plaza.spec.benches || []) benchPlaza?.add([x, y, z], yaw || 0);
    }

    // --- rooftop mechanical boxes on large flat roofs (massing buildings only) ---
    const utilBig = await inst('street/utility_box', 1600);
    for (const info of w.buildings.infos.values()) {
      if (info.b.areaM2 < 400 || info.height < 12) continue;
      if (w.detailedIds.has(info.id) || (info.b as any).__part) continue;
      const [cx, cz] = info.b.centroid; if (!inBounds(cx, cz)) continue;
      const n = Math.min(6, Math.floor(info.b.areaM2 / 500));
      for (let i = 0, tries = 0; i < n && tries < 30; tries++) {
        const ang = this.rng.range(0, 6.28), r = this.rng.range(2, Math.sqrt(info.b.areaM2) * 0.3);
        const x = cx + Math.cos(ang) * r, z = cz + Math.sin(ang) * r;
        if (!pointInPolygon(x, z, info.footprint)) continue;
        utilBig?.add([x, info.topY, z], this.rng.range(0, 3.14), [this.rng.range(1.5, 3.2), this.rng.range(0.9, 1.6), this.rng.range(1.5, 3.0)]);
        i++;
      }
    }

    for (const im of [lampTall, lampPed, lampGlobe, meter, hydrant, trash, bench, benchPlaza, bikeRack, signPole, utility, bollard, treeGrate, curbRamp, utilBig]) if (im) { im.finalize(); this.group.add(im.group); }
    this.app.scene.add(this.group);
    return this;
  }

  /** Signal masts: one instanced body + five instanced lamp lenses (per-instance colour = lit/unlit) + invisible proxy meshes so
   *  TrafficLights can keep driving `material.emissiveIntensity` per mast without any per-signal draw calls. */
  private buildSignals(proto: THREE.Object3D, spots: { x: number; z: number; y: number; rot: number }[]) {
    proto.updateMatrixWorld(true);
    const lampNames = ['lamp_red', 'lamp_amber', 'lamp_green', 'ped_walk', 'ped_stop'];
    const lampColors: Record<string, [THREE.Color, THREE.Color]> = {
      lamp_red: [new THREE.Color(0x2a0404), new THREE.Color(0xff1a1a)], lamp_amber: [new THREE.Color(0x2a1a02), new THREE.Color(0xffa020)], lamp_green: [new THREE.Color(0x032a08), new THREE.Color(0x22ff55)],
      ped_walk: [new THREE.Color(0x0a0a0a), new THREE.Color(0xf4f4f4)], ped_stop: [new THREE.Color(0x2a0404), new THREE.Color(0xff3a1a)],
    };
    const bodyGeos: THREE.BufferGeometry[] = []; const bodyMats: THREE.Material[] = [];
    const lampGeos = new Map<string, THREE.BufferGeometry>();
    proto.traverse((o) => {
      const m = o as THREE.Mesh; if (!m.isMesh) return;
      const g = m.geometry.clone(); g.applyMatrix4(m.matrixWorld);
      if (lampNames.includes(m.name)) { lampGeos.set(m.name, g); return; }
      for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
      bodyGeos.push(g); bodyMats.push(Array.isArray(m.material) ? m.material[0] : m.material);
    });
    const n = spots.length;
    const d = new THREE.Object3D();
    const byMat = new Map<THREE.Material, THREE.BufferGeometry[]>();
    bodyGeos.forEach((g, i) => { const arr = byMat.get(bodyMats[i]) || []; arr.push(g); byMat.set(bodyMats[i], arr); });
    for (const [mat, geos] of byMat) {
      const merged = mergeBufferGeos(geos); if (!merged) continue;
      const im = new THREE.InstancedMesh(merged, mat, n); im.castShadow = true; im.receiveShadow = true; im.name = 'signal_body';
      spots.forEach((sp, i) => { d.position.set(sp.x, sp.y, sp.z); d.rotation.set(0, sp.rot, 0); d.updateMatrix(); im.setMatrixAt(i, d.matrix); });
      im.instanceMatrix.needsUpdate = true; this.group.add(im);
    }
    const lampMeshes = new Map<string, THREE.InstancedMesh>();
    for (const name of lampNames) {
      const g = lampGeos.get(name); if (!g) continue;
      const im = new THREE.InstancedMesh(g, new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), n); im.name = `signal_${name}`; im.castShadow = false;
      spots.forEach((sp, i) => { d.position.set(sp.x, sp.y, sp.z); d.rotation.set(0, sp.rot, 0); d.updateMatrix(); im.setMatrixAt(i, d.matrix); im.setColorAt(i, lampColors[name][0]); });
      im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
      this.group.add(im); lampMeshes.set(name, im);
    }
    const emptyGeo = new THREE.BufferGeometry();
    spots.forEach((sp, i) => {
      const mast = new THREE.Group(); mast.position.set(sp.x, sp.y, sp.z); mast.name = 'signal_proxy';
      const lamps: Record<string, THREE.Mesh> = {};
      for (const name of lampNames) {
        const im = lampMeshes.get(name); if (!im) continue;
        let intensity = 0;
        const proxyMat: any = new THREE.MeshBasicMaterial({ visible: false }); proxyMat.name = `proxy:${name}`; proxyMat.clone = () => proxyMat;
        Object.defineProperty(proxyMat, 'emissiveIntensity', { get: () => intensity, set: (v: number) => { intensity = v; im.setColorAt(i, lampColors[name][v > 0.5 ? 1 : 0]); im.instanceColor!.needsUpdate = true; } });
        const mesh = new THREE.Mesh(emptyGeo, proxyMat); mesh.name = name; mesh.visible = false; mast.add(mesh); lamps[name] = mesh;
      }
      this.group.add(mast);
      this.signals.push({ mesh: mast, lamps, axis: 'ns', x: sp.x, z: sp.z });
    });
  }
}
