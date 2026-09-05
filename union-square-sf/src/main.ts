import * as THREE from 'three';
import { App } from './app/App';
import { Config } from './app/Config';
import { World } from './world/World';
import { WalkControls } from './player/WalkControls';
import { OrbitMode } from './player/OrbitMode';
import { Tour, TourStop } from './player/Tour';
import { Hud } from './debug/Hud';
import { Viewpoints, compassToYaw, yawToCompass } from './debug/Viewpoints';
import { ReferenceMode } from './debug/ReferenceMode';
import { installQa } from './debug/Qa';
import { Assets, BASE } from './assets/Assets';
import { Interaction } from './systems/Interaction';
import { Life } from './life/Life';
import { Props } from './world/Props';
import { Hero, heroExcludeIds } from './world/Hero';
import { Vegetation } from './world/Vegetation';
import { NightLights } from './systems/NightLights';

const loadingEl = document.getElementById('loading')!, bar = document.getElementById('loading-bar')!, msg = document.getElementById('loading-msg')!;
const progress = (m: string, f: number) => { msg.textContent = m; bar.style.width = `${Math.round(f * 100)}%`; };

async function main() {
  const app = new App(document.getElementById('app')!);
  const world = new World();
  app.scene.add(world.group);
  await Assets.loadManifests(['arch', 'street', 'retail', 'vehicles', 'veg', 'people', 'varco']);
  await Assets.loadOverrides();
  for (const id of heroExcludeIds()) world.heroIds.add(id);
  await world.build(progress);
  progress('hero buildings', 0.72);
  const hero = new Hero(world, app);
  await hero.build();
  progress('props', 0.8);
  const props = new Props(world, app);
  await props.build();
  progress('vegetation', 0.85);
  const vegetation = new Vegetation(world, app);
  await vegetation.build();
  await world.plaza.furniture();
  const nightLights = new NightLights(app, Config.quality === 'low' ? 3 : 5);
  nightLights.setPositions([...props.lampPositions, ...props.plazaLampPositions], (x, z) => world.collision.floorAt(x, z, world.terrain.heightAt(x, z) + 0.5, 100));
  app.add(nightLights);
  app.add(vegetation);
  progress('life', 0.9);
  const life = new Life(world, app, props);
  if (!Config.noLife) await life.build();
  app.add(life);
  app.time.set(Config.time);
  document.addEventListener('twin:time', (e: any) => world.plaza.setNight(e.detail.night)); world.plaza.setNight(app.time.nightFactor);

  // --- player / modes ---
  const walk = new WalkControls(app.camera, world.collision, app.renderer.domElement);
  const orbit = new OrbitMode(app.camera, app.renderer.domElement);
  const tour = new Tour(app.camera);
  app.add(walk); app.add(orbit); app.add(tour);
  const interaction = new Interaction(app, world, walk, hero);
  app.add(interaction);
  const hud = new Hud(app);
  const viewpoints = new Viewpoints();
  await viewpoints.load(`${BASE}data/viewpoints.json`);
  const ref = new ReferenceMode();
  let mode: 'walk' | 'orbit' | 'tour' = Config.mode;
  const crosshair = document.getElementById('crosshair')!;
  const tourTitle = document.getElementById('tour-title')!;

  function setMode(m: 'walk' | 'orbit' | 'tour') {
    mode = m;
    walk.enabled = m === 'walk';
    orbit.setEnabled(m === 'orbit');
    if (m === 'tour') tour.start(tourStops()); else if (tour.enabled) tour.stop();
    if (m === 'orbit') { const t = new THREE.Vector3(0, 0, 0); orbit.frame(t, 260, 200, 42); }
    if (m === 'walk') { if (document.pointerLockElement) document.exitPointerLock(); walk.footY = world.collision.floorAt(app.camera.position.x, app.camera.position.z, app.camera.position.y - 1.7, 100); walk.applyLook(); }
    document.querySelectorAll('#toolbar button[data-mode]').forEach((b) => b.classList.toggle('active', (b as HTMLElement).dataset.mode === m));
    crosshair.style.display = m === 'walk' ? 'block' : 'none';
    tourTitle.style.display = m === 'tour' ? 'block' : 'none';
  }
  tour.onStop = (s) => { tourTitle.innerHTML = `${s.title}<small>${s.subtitle || ''}</small>`; if (s.time) app.time.set(s.time); };
  tour.onEnd = () => setMode('walk');

  function tourStops(): TourStop[] {
    return [
      { title: 'Union Square', subtitle: 'San Francisco · aerial', pos: [40, 140, 260], look: [0, 10, 0], duration: 6, hold: 3, time: 'day' },
      { title: 'Dewey Monument', subtitle: 'Victory, 1903 · centre of the square', pos: [-22, 6, 24], look: [0, 16, 0], duration: 7, hold: 3 },
      { title: 'Powell Street', subtitle: 'cable cars · Westin St. Francis', pos: [-68, 1.7, 110], look: [-73, 12, -60], duration: 7, hold: 3 },
      { title: 'Nintendo SAN FRANCISCO', subtitle: '331 Powell St · Powell & Geary', pos: [-62, -0.5, 58], look: [-84, 3, 44], duration: 6, hold: 4 },
      { title: 'Westin St. Francis', subtitle: '335 Powell St · Bliss & Faville, 1904', pos: [-30, 4, 0], look: [-90, 28, 0], duration: 7, hold: 3 },
      { title: 'Apple Union Square', subtitle: '300 Post St · Foster + Partners, 2016', pos: [44, 0.5, -36], look: [44, 6, -66], duration: 7, hold: 4 },
      { title: 'The plaza', subtitle: 'terraces · palms · people', pos: [-30, 3, 30], look: [20, 2, -10], duration: 8, hold: 3 },
      { title: 'Sunset skyline', subtitle: 'Union Square at golden hour', pos: [120, 90, 180], look: [-20, 30, -40], duration: 9, hold: 5, time: 'sunset' },
    ];
  }

  // --- viewpoints UI ---
  const sel = document.getElementById('view-select') as HTMLSelectElement;
  for (const v of viewpoints.list) { const o = document.createElement('option'); o.value = v.id; o.textContent = `${v.id} · ${v.title}`; sel.appendChild(o); }
  function applyView(id: string): boolean {
    const v = viewpoints.get(id); if (!v) return false;
    setMode('walk');
    const p = viewpoints.place(v, world.collision, world.buildings);
    walk.teleport(p.x, p.z, p.yaw, p.pitch, p.y - 1.7);
    app.camera.fov = Config.fov || p.fov; app.camera.updateProjectionMatrix();
    ref.setViewpoint(v);
    hud.show(`${v.id} · ${v.title}`);
    return true;
  }
  sel.addEventListener('change', () => applyView(sel.value));
  ref.onNext = () => { const i = viewpoints.list.findIndex((v) => v.id === ref.current?.id); const n = viewpoints.list[(i + 1) % viewpoints.list.length]; if (n) { sel.value = n.id; applyView(n.id); } };

  // --- toolbar ---
  document.querySelectorAll('#toolbar button[data-mode]').forEach((b) => b.addEventListener('click', () => setMode((b as HTMLElement).dataset.mode as any)));
  const timeSel = document.getElementById('time-select') as HTMLSelectElement; timeSel.value = Config.time;
  timeSel.addEventListener('change', () => app.time.set(timeSel.value as any));
  document.getElementById('btn-ref')!.addEventListener('click', () => ref.setEnabled(!ref.enabled));
  document.getElementById('btn-debug')!.addEventListener('click', () => hud.setVisible(!hud.visible));
  app.renderer.domElement.addEventListener('click', () => { if (mode === 'walk') walk.requestLock(); });
  window.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
    if (e.code === 'Digit1') app.time.set('day'); if (e.code === 'Digit2') app.time.set('sunset'); if (e.code === 'Digit3') app.time.set('night');
    if (e.code === 'Tab') { e.preventDefault(); setMode(mode === 'orbit' ? 'walk' : 'orbit'); }
    if (e.code === 'KeyT') setMode(mode === 'tour' ? 'walk' : 'tour');
    if (e.code === 'KeyR') ref.setEnabled(!ref.enabled);
    if (e.code === 'F1') { e.preventDefault(); hud.setVisible(!hud.visible); }
    if (e.code === 'KeyE') interaction.activate();
    if (e.code === 'KeyF') interaction.toggleFlashlightHint();
  });

  // --- start position: Geary & Powell corner looking NE at the square (or a viewpoint / explicit pos) ---
  hud.setVisible((Config.debug || Config.qa) && Config.ui);
  if (!Config.ui) for (const id of ['toolbar', 'help', 'crosshair', 'prompt']) { const el = document.getElementById(id); if (el) el.style.display = 'none'; }
  setMode(mode);
  if (new URLSearchParams(location.search).get('studio') === '1') { walk.enabled = false; orbit.setEnabled(false); }
  if (Config.view && applyView(Config.view)) { /* placed */ }
  else if (Config.pos) { const [x, y, z] = Config.pos.split(',').map(Number); const [h, p] = (Config.look || '35,0').split(',').map(Number); walk.teleport(x, z, compassToYaw(h), THREE.MathUtils.degToRad(p), Number.isFinite(y) ? y : undefined); }
  else walk.teleport(-64, 60, compassToYaw(35), -0.03);
  if (mode === 'orbit') setMode('orbit');
  if (Config.ref) ref.setEnabled(true);

  let streamT = 0;
  const exteriorGroups = () => ['world', 'props', 'vegetation'].map((n) => app.scene.getObjectByName(n)).filter(Boolean) as THREE.Object3D[];
  app.add({ update: (dt) => { hud.update(mode); streamT += dt; if (streamT > 0.5) { streamT = 0; world.stream(app.camera.position);
    const c = app.camera.position; const below = c.y < world.terrain.heightAt(c.x, c.z) - 2.5;   // windowless lower level → skip the city
    for (const g of exteriorGroups()) g.visible = !below; } } });
  hud.extra = () => interaction.hudLine();
  loadingEl.style.display = 'none';
  app.start();
  // warm-up: force shader compilation for visible materials
  app.renderer.compile(app.scene, app.camera);

  installQa({
    ready: true,
    setView: applyView,
    setCamera: (x, y, z, headingDeg, pitchDeg, fov) => { setMode('walk'); walk.teleport(x, z, compassToYaw(headingDeg), THREE.MathUtils.degToRad(pitchDeg), y - 1.7); if (fov) { app.camera.fov = fov; app.camera.updateProjectionMatrix(); } },
    setTime: (p) => app.time.set(p),
    setMode,
    freeze: (v) => { life.frozen = v; },
    stats: () => ({ ...app.stats(), ...life.stats() }),
    viewpoints: () => viewpoints.list.map((v) => v.id),
    renderOnce: () => app.renderOnce(),
    interact: () => interaction.activate(),
    teleport: (x, z, headingDeg) => walk.teleport(x, z, headingDeg !== undefined ? compassToYaw(headingDeg) : undefined),
    move: (dx, dz, seconds) => new Promise((res) => { const start = performance.now(); const key = dz < 0 ? 'KeyW' : dz > 0 ? 'KeyS' : dx > 0 ? 'KeyD' : 'KeyA'; walk.keys.add(key); setTimeout(() => { walk.keys.delete(key); res(); }, seconds * 1000); void start; }),
    look: (h, p) => { walk.yaw = compassToYaw(h); walk.pitch = THREE.MathUtils.degToRad(p); walk.applyLook(); },
    nearby: () => interaction.nearby(),
    pos: () => ({ x: app.camera.position.x, y: app.camera.position.y, z: app.camera.position.z, heading: yawToCompass(walk.yaw) }),
    lifeStats: () => life.stats(),
    storefronts: () => hero.storefrontList(),
    enter: (id) => interaction.enter(id),
    log: [],
    ...({ buildingAt: (x: number, z: number) => { let best: any = null, bd = 1e9; for (const i of world.buildings.infos.values()) { const d = Math.hypot(i.footprint[0][0] - x, i.footprint[0][1] - z); if (d < bd) { bd = d; best = i; } } return best && { id: best.id, name: best.name, address: best.address, height: best.height, floors: best.floors, style: best.style, floorH: best.floorH, bayW: best.bayW, baseY: best.baseY, fp: best.footprint }; }, world, app, hero, life, props } as any),
  });
  if (new URLSearchParams(location.search).get('studio') === '1') { const { installStudioBridge } = await import('./debug/StudioBridge'); installStudioBridge(app, (window as any).__twin); }
}
main().catch((e) => { console.error(e); msg.textContent = 'Error: ' + (e?.message || e); (window as any).__twinError = String(e?.stack || e); });
