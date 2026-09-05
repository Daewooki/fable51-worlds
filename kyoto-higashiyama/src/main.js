import * as THREE from 'three';
import { PAL } from './core/palette.js';
import { Pipeline } from './core/post.js';
import { buildSky, buildBasin } from './core/sky.js';
import { setOutlineResolution } from './core/outline.js';
import { Player } from './core/player.js';
import { createHud } from './core/hud.js';
import { buildWorld } from './world/index.js';
import { DISTRICT_MODULES, SYSTEMS } from './world/districts.js';
import { createAudio } from './core/audio.js';
import { createTimeOfDay } from './systems/time.js';
import { createCameras, HERO_VIEWS } from './systems/cameras.js';
import { installStudio } from './studio.js';

/* ------------------------------------------------------------------ *
 * 東山 -- entry point.
 *
 * The lighting is the classic two-and-a-half light anime rig:
 *
 *   key     a warm directional sun, quantised by the cel ramp into 3 bands
 *   fill    a strong *cool* directional from the opposite quarter, which
 *           carries the entire shadow side of every surface -- an anime
 *           background has coloured shadows, not dark ones, and this light is
 *           what makes that true rather than the grade pass
 *   bounce  a weak violet up-light so undersides (and there are a great many
 *           undersides here: every eave in Kyoto is a metre deep) never go flat
 *   hemi    a wide sky/ground term with a violet ground colour
 *
 * The shadow camera follows the player on a snapped grid.  Snapping is not
 * optional: an unsnapped shadow camera makes every cast edge crawl as you
 * walk, and on a street of lattice screens that reads as the whole facade
 * shimmering.
 * ------------------------------------------------------------------ */

const canvas = document.getElementById('view');

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: false,
  powerPreference: 'high-performance',
  stencil: false,
  preserveDrawingBuffer: true,   // the shot harness reads the canvas back
});
renderer.setPixelRatio(1);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.setClearColor(new THREE.Color(PAL.fog), 1);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(PAL.fog, 70, 340);

const camera = new THREE.PerspectiveCamera(48, 1, 0.22, 900);
camera.rotation.order = 'YXZ';

/* --------------------------------- light --------------------------------- */
const sun = new THREE.DirectionalLight(PAL.sun, 2.30);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -46;
sun.shadow.camera.right = 46;
sun.shadow.camera.top = 46;
sun.shadow.camera.bottom = -46;
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 260;
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.038;
scene.add(sun, sun.target);

const fill = new THREE.DirectionalLight(PAL.fill, 1.05);
scene.add(fill, fill.target);

const bounce = new THREE.DirectionalLight(PAL.bounce, 0.32);
scene.add(bounce, bounce.target);

const hemi = new THREE.HemisphereLight(PAL.hemiSky, PAL.hemiGround, 1.10);
scene.add(hemi);

/* --------------------------------- world --------------------------------- */
const sky = buildSky(scene, 900);
const basin = buildBasin(scene);

console.time('world');
const world = buildWorld(scene, { districts: DISTRICT_MODULES, systems: SYSTEMS });
console.timeEnd('world');
console.log('[world]', world.stats);

const player = new Player(camera, canvas, world);
const hud = createHud();
const time = createTimeOfDay({ scene, sun, fill, bounce, hemi, sky, renderer });
const cameras = createCameras({ camera, player, world });

const audio = createAudio({ volume: 0.5 });
hud.onStart = () => { audio.start(); player.lock(); };
player.onLockChange = (locked) => hud.setLocked(locked);
canvas.addEventListener('click', () => { audio.start(); if (!player.locked) player.lock(); });
player.onInteract = (target) => { target?.action?.(audio); };
world.audio = audio;

/* ------------------------------- pipeline ------------------------------- */
const pipeline = new Pipeline(renderer, scene, camera);

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  pipeline.setSize(w, h);
  setOutlineResolution(pipeline.size.x, pipeline.size.y);
}
window.addEventListener('resize', resize);
resize();

/* ---------------------------------- keys --------------------------------- */
window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  switch (e.code) {
    case 'KeyO':
      pipeline.enabled.ink = !pipeline.enabled.ink;
      hud.flash(pipeline.enabled.ink ? 'ink on' : 'ink off');
      break;
    case 'KeyG':
      pipeline.enabled.grade = !pipeline.enabled.grade;
      hud.flash(pipeline.enabled.grade ? 'grade on' : 'grade off');
      break;
    case 'KeyT': {
      const name = time.cycle();
      pipeline.setGrade(time.grade);
      hud.flash(name);
      break;
    }
    case 'KeyP':
      cameras.toggleOverview();
      hud.flash(cameras.overview ? 'overview  ·  P to return' : 'back on the ground');
      break;
    case 'KeyF':
      cameras.togglePhoto();
      hud.flash(cameras.photo ? 'photo mode' : '');
      break;
    case 'KeyM': {
      const off = audio.toggle();
      hud.flash(off ? 'sound off' : 'sound on');
      break;
    }
    case 'F1':
      hud.toggleDebug();
      e.preventDefault();
      break;
    default: break;
  }
});

/* --------------------------------- loop ---------------------------------- */
const clock = new THREE.Clock();
const shadowFocus = new THREE.Vector3();
let elapsed = 0;
let frames = 0, fpsAccum = 0, fps = 0;

function frame() {
  /* A deterministic capture -- the tour film -- drives the camera, the world
   * clock and the render itself on a fixed dt, and this loop would fight it:
   * it re-renders from the player's own camera between the recorder setting a
   * frame and the recorder screenshotting it, and it advances every animation
   * at wall-clock rate rather than at the output frame rate.  So the recorder
   * parks it and takes over.  `clock.getDelta()` is still called, to swallow
   * the paused interval instead of dumping it into the first live frame. */
  if (window.__paused) { clock.getDelta(); requestAnimationFrame(frame); return; }

  const dt = Math.min(clock.getDelta(), 1 / 20);
  elapsed += dt;

  cameras.update(dt);
  if (!cameras.overview) player.update(dt);
  world.update(dt, elapsed);
  time.update(dt);

  /* The sun follows the player, snapped to a 2 m grid.  The snap is what stops
   * the shadow edges crawling; 2 m is a whole shadow texel at this map size. */
  shadowFocus.set(
    Math.round(player.pos.x / 2) * 2,
    Math.round(player.pos.y / 2) * 2,
    Math.round(player.pos.z / 2) * 2
  );
  time.aim(shadowFocus);

  sky.dome.position.copy(camera.position);
  sky.clouds.position.set(camera.position.x, 0, camera.position.z);

  /* Sound is driven from where the player actually is: the surface under
   * their feet picks the footstep, and proximity to the canal, the temple's
   * waterfall and the arterial drives the three beds. */
  {
    const surf = world.surfaceAt(player.pos.x, player.pos.z);
    const px = player.pos.x, pz = player.pos.z;
    const near = (x, z, r) => Math.max(0, 1 - Math.hypot(px - x, pz - z) / r);
    audio.update(dt, {
      x: px, z: pz,
      surface: surf ? surf.surface : 'earth',
      moving: Math.hypot(player.vel.x, player.vel.z),
      running: player.keys.has('ShiftLeft') || player.keys.has('ShiftRight'),
      near: {
        water: Math.max(near(-500, -780, 55) * 0.16, near(548, 459, 45) * 0.30),
        leaves: 0.02 + near(560, 430, 260) * 0.06 + near(120, -560, 160) * 0.05,
        town: 0.02 + near(-190, -300, 320) * 0.05,
      },
    });
  }

  const hovered = player.locked && !cameras.overview
    ? player.pick(world.interactables) : null;
  hud.setPrompt(hovered ? `E  ·  ${hovered.label}` : '');
  if (player.locked) hud.setPlace(world.districtAt(player.pos.x, player.pos.z));
  hud.update(dt);

  fpsAccum += dt; frames++;
  if (fpsAccum > 0.5) { fps = frames / fpsAccum; frames = 0; fpsAccum = 0; }
  if (hud.debugOn) {
    const info = pipeline.sceneInfo || renderer.info.render;
    hud.setDebug(
      `${fps.toFixed(0)} fps\n` +
      `${info.calls} calls\n` +
      `${(info.triangles / 1000).toFixed(0)}k tris\n` +
      `x ${player.pos.x.toFixed(1)}  z ${player.pos.z.toFixed(1)}  y ${player.pos.y.toFixed(1)}\n` +
      `yaw ${player.yaw.toFixed(3)}  pitch ${player.pitch.toFixed(3)}\n` +
      `${time.name}`
    );
  }

  pipeline.render();
  requestAnimationFrame(frame);
}
frame();

window.__scene = { scene, camera, renderer, pipeline, world, player, hud, time, cameras,
                  sun, fill, bounce, hemi, sky, basin, THREE, HERO_VIEWS };

/* ------------------------------------------------------------------ *
 * MV Studio.
 *
 * A no-op unless the page was opened with `?studio=1` or `?qa=1`, so ordinary
 * play is untouched.  Everything it does lives in `studio.js`; see the note at
 * the top of that file for why the translation is not a one-liner.
 * ------------------------------------------------------------------ */
installStudio({ scene, camera, renderer, pipeline, world, player, hud, time, cameras, sky });

/* ------------------------------------------------------------------ *
 * The shot harness.
 *
 * Mandatory infrastructure, not a convenience.  Nothing in this project is
 * judged by reading its code; it is judged by looking at 1600x900 renders of
 * it beside photographs of the real street.  See docs/QA.md.
 *
 *   await __shot('ninenzaka-hero', 1600, 900, { pos: [118, 36], yaw: 0.9 })
 * ------------------------------------------------------------------ */
window.__shot = async (name = 'shot', W = 1600, H = 900, opts = {}) => {
  if (opts.overview) {
    cameras.setOverview(opts.overview);
  } else {
    if (cameras.overview) cameras.setOverview(false);
    if (opts.pos) player.teleport(opts.pos[0], opts.pos[1], opts.yaw, opts.pitch);
    else if (opts.yaw !== undefined) { player.yaw = opts.yaw; player.pitch = opts.pitch ?? player.pitch; }
    if (opts.eye !== undefined) player.pos.y = opts.eye;
    player.bob = 0;
    player.applyCamera(0);
  }
  if (opts.time) { time.set(opts.time); pipeline.setGrade(time.grade); }
  if (opts.ink !== undefined) pipeline.enabled.ink = opts.ink;
  if (opts.grade !== undefined) pipeline.enabled.grade = opts.grade;
  if (opts.fov) { camera.fov = opts.fov; }
  pipeline.forceScale = opts.scale || 1.5;

  camera.aspect = W / H;
  camera.updateProjectionMatrix();
  pipeline.setSize(W, H);
  setOutlineResolution(pipeline.size.x, pipeline.size.y);

  shadowFocus.set(
    Math.round(camera.position.x / 2) * 2, Math.round(camera.position.y / 2) * 2,
    Math.round(camera.position.z / 2) * 2
  );
  time.aim(shadowFocus);
  sky.dome.position.copy(camera.position);
  sky.clouds.position.set(camera.position.x, 0, camera.position.z);
  camera.updateMatrixWorld(true);

  pipeline.render();

  const off = document.createElement('canvas');
  const outW = opts.outW || W;
  off.width = outW;
  off.height = Math.round((outW * H) / W);
  off.getContext('2d').drawImage(canvas, 0, 0, off.width, off.height);
  const data = off.toDataURL('image/jpeg', opts.quality || 0.88);
  const r = await fetch('/__shot', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name, data, dir: opts.dir }),
  });
  if (opts.fov) { camera.fov = 48; camera.updateProjectionMatrix(); }
  return r.json();
};

/** Render stats for the QA harness. */
window.__stats = () => ({
  ...world.stats,
  calls: pipeline.sceneInfo?.calls ?? 0,
  triangles: pipeline.sceneInfo?.triangles ?? 0,
  geometries: renderer.info.memory.geometries,
  textures: renderer.info.memory.textures,
  programs: renderer.info.programs?.length ?? 0,
});
