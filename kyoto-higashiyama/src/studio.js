import * as THREE from 'three';
import { setOutlineResolution } from './core/outline.js';

/* ------------------------------------------------------------------ *
 * MV Studio adapter.
 *
 * This world was not written for MV Studio; it was written to be walked.  The
 * studio drives a *different* shape: it wants a `window.__twin` object with an
 * `app` that looks like union-square-sf's engine (a `renderer`, an
 * `updatables` list, an `elapsed` clock) and a `world` with a collision/terrain
 * pair, plus a postMessage bridge so the Director UI can fly the camera from
 * the parent frame.  None of that exists here, so this file is the whole of
 * the translation and nothing outside it changes: `main.js` gains one guarded
 * call at the end and is otherwise untouched.
 *
 * The three things that make the translation non-obvious:
 *
 *   1. **Rendering goes through the post pipeline, not the renderer.**  The
 *      studio's previz loop calls `app.renderer.render(app.scene, cam)` once
 *      per frame.  Handing it the real `THREE.WebGLRenderer` would draw the
 *      raw scene straight to the canvas -- no ink, no grade, no FXAA -- which
 *      is to say it would not look like this world at all.  So `app.renderer`
 *      is a shim whose `render()` runs `Pipeline.render()`.  The real renderer
 *      is still reachable as `app.renderer.real` / `__twin.renderer`.
 *
 *   2. **The frame loop does per-frame work that isn't in the world graph.**
 *      `main.js` aims the shadow camera at a snapped focus and parks the sky
 *      dome on the camera every frame.  With the loop parked (see 3) nobody
 *      does that, and a camera flown a few hundred metres leaves the shadow
 *      frustum -- and the sky -- behind.  The shim does both before it renders,
 *      so it holds for the previz path and for `renderOnce()` alike.
 *
 *   3. **The world's own loop has to stop.**  The studio sets the camera and
 *      then screenshots; a live rAF loop re-renders from the *player's* camera
 *      in between, and `player.update()` puts the camera back on the walker's
 *      head. `main.js` already honours `window.__paused` for its tour recorder,
 *      so that is the lever used here, plus the player's pointer lock is
 *      neutered so a click in the Director UI's iframe cannot grab the mouse.
 *
 * Limitation, recorded deliberately: this world is procedural, with no GLB
 * assets and no asset manifest, so the studio's VARCO asset-override hook has
 * nothing to override here.  VARCO styling for Kyoto is Seedance style
 * references only.  See studio/README.md.
 * ------------------------------------------------------------------ */

/** studio time-of-day vocabulary (day|sunset|night) -> this world's STATES keys. */
const TIME_TO_STATE = {
  day: 'day', sunset: 'sunset', night: 'dusk',
  // the world's own extra states, accepted as themselves
  morning: 'morning', dusk: 'dusk',
};

/** `?q=` / `?quality=` -> Pipeline.forceScale (supersample factor). */
const QUALITY_SCALE = { low: 1, med: 1.25, medium: 1.25, high: 1.5 };

const POS_INTERVAL_MS = 250;
const LOOK_DIST = 10;

export function installStudio({
  scene, camera, renderer, pipeline, world, player, hud, time, cameras, sky,
} = {}) {
  const params = new URLSearchParams(window.location.search);
  const studio = params.get('studio') === '1';
  const qa = params.get('qa') === '1';
  // Everything else in the query string (life, mode, seed, ...) is ignored by
  // design: the studio sends params meant for the other world too.
  if (!studio && !qa) return null;

  /* ---------------------------- chrome off ---------------------------- */
  if (studio || params.get('ui') === '0') {
    // `#start` is a sibling of `#hud`, not a child, so hiding the HUD alone
    // leaves the full-screen opening plate over every rendered frame.
    for (const id of ['hud', 'start']) {
      const n = document.getElementById(id);
      if (n) { n.style.display = 'none'; n.style.pointerEvents = 'none'; }
    }
  }

  /* --------------------------- render quality -------------------------- */
  const qualityKey = params.get('quality') || params.get('q');
  if (qualityKey && QUALITY_SCALE[qualityKey]) {
    pipeline.forceScale = QUALITY_SCALE[qualityKey];
    resizePipeline();
  }

  function resizePipeline() {
    const w = window.innerWidth, h = window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    pipeline.setSize(w, h);
    setOutlineResolution(pipeline.size.x, pipeline.size.y);
  }

  /* ------------------------- per-frame plumbing ------------------------ */
  const shadowFocus = new THREE.Vector3();
  function syncFrame(cam) {
    // Same snapped focus main.js uses: a 2 m grid, which is one shadow texel
    // at this map size and is what stops cast edges crawling.
    shadowFocus.set(
      Math.round(cam.position.x / 2) * 2,
      Math.round(cam.position.y / 2) * 2,
      Math.round(cam.position.z / 2) * 2
    );
    time.aim(shadowFocus);
    if (sky) {
      sky.dome.position.copy(cam.position);
      sky.clouds.position.set(cam.position.x, 0, cam.position.z);
    }
    cam.updateMatrixWorld(true);
  }

  /** Stands in for a THREE.WebGLRenderer, but draws through the post stack. */
  const rendererShim = {
    real: renderer,
    domElement: renderer.domElement,
    get info() { return renderer.info; },
    render(sc, cam) {
      const c = cam || camera;
      if (sc && pipeline.scene !== sc) pipeline.scene = sc;
      if (pipeline.camera !== c) pipeline.camera = c;
      syncFrame(c);
      pipeline.render();
    },
    setSize(w, h) { pipeline.setSize(w, h); setOutlineResolution(pipeline.size.x, pipeline.size.y); },
  };

  /* ------------------------------- app --------------------------------- */
  // One updatable stands in for the whole engine loop: the studio empties
  // `updatables` and re-drives whatever it kept, so everything that must tick
  // per previz frame has to be reachable from this single entry.
  const app = {
    camera,
    scene,
    renderer: rendererShim,
    pipeline,
    elapsed: 0,
    updatables: [{
      update(dt, elapsed) {
        world.update(dt, elapsed);
        time.update(dt); // no-op in this world; kept so the contract holds
      },
    }],
    // The studio calls `app.time.update(camPos, null, camPos.y)` each frame to
    // let a world re-light around the camera. This world's lighting follows the
    // camera in `syncFrame` instead, so this is deliberately inert.
    time: { update() {} },
  };

  /* ------------------------------ world -------------------------------- */
  // `heightAt` already resolves platforms, cuts and terraces, which is exactly
  // what the studio's walk keys want from both of these.
  const twinWorld = {
    raw: world,
    collision: { floorAt: (x, z /* fromY, maxDrop */) => world.heightAt(x, z) },
    terrain: { heightAt: (x, z) => world.heightAt(x, z) },
  };

  /* ------------------------------- twin -------------------------------- */
  const dirVec = new THREE.Vector3();
  const pos = () => {
    camera.getWorldDirection(dirVec);
    return {
      eye: [camera.position.x, camera.position.y, camera.position.z],
      look: [
        camera.position.x + dirVec.x * LOOK_DIST,
        camera.position.y + dirVec.y * LOOK_DIST,
        camera.position.z + dirVec.z * LOOK_DIST,
      ],
      fov: camera.fov,
    };
  };

  const setTime = (p) => {
    const key = TIME_TO_STATE[p] || 'day';
    time.set(key);
    // `time.set` moves the lights; the grade lives on the pipeline and has to
    // be switched with it or a night frame renders with the noon grade.
    pipeline.setGrade(time.grade);
    return true;
  };

  const setCameraRaw = ({ eye, look, fov }) => {
    camera.position.set(eye[0], eye[1], eye[2]);
    camera.lookAt(look[0], look[1], look[2]);
    if (fov) { camera.fov = fov; camera.updateProjectionMatrix(); }
    renderOnce();
    return true;
  };

  const freeze = (v) => { window.__paused = !!v; return true; };
  const renderOnce = () => { rendererShim.render(scene, camera); };

  const twin = {
    ready: null,           // replaced with the settled promise below
    app,
    world: twinWorld,
    renderer,              // the real one, for anything that needs readPixels
    pipeline,
    setTime,
    setMode() { return true; },  // this world has no walk/orbit/tour modes
    freeze,
    renderOnce,
    pos,
    setCameraRaw,
    stats: () => (window.__stats ? window.__stats() : world.stats),
    heroViews: () => (window.__scene?.HERO_VIEWS || []),
  };

  /* --------------------- park the world's own loop --------------------- */
  // Only under `studio=1`. `qa=1` alone is this world's OWN automation surface
  // (tools/capture.mjs and friends), which expects a live frame loop and a live
  // player; parking those for it would change behaviour that has nothing to do
  // with the studio. The studio always passes both flags.
  //
  // main.js has already built the world and rendered one frame by the time this
  // runs (it calls `frame()` before this module's entry point), so the pause
  // lands after a complete first frame, as the contract requires.
  if (studio) {
    window.__paused = true;
    if (player) {
      player.frozen = true;
      player.locked = false;
      player.keys.clear();
      player.lock = () => {};      // canvas click / hud start must not grab the pointer
    }
    if (hud) hud.onStart = null;
    if (cameras && cameras.overview) cameras.setOverview(false);
  }

  /* ------------------------- initial time of day ----------------------- */
  const t = params.get('time');
  if (t) setTime(t);

  twin.ready = new Promise((resolve) => {
    // One more rAF so the pipeline has certainly presented a frame at the
    // studio's viewport size before anything screenshots it.
    requestAnimationFrame(() => { renderOnce(); resolve(true); });
  });

  window.__twin = twin;

  if (studio) installBridge(twin);
  return twin;
}

/* ------------------------------------------------------------------ *
 * The postMessage bridge.
 *
 * Ported from union-square-sf/src/debug/StudioBridge.ts; same wire format, so
 * studio/app/src/bridge.ts drives either world without knowing which it has.
 *
 *   parent -> world   { type: 'studio:cmd', id, cmd, ...payload }
 *   world  -> parent  { type: 'studio:res', id, ok, data | error }
 *   world  -> parent  { type: 'studio:ready' }  once
 *   world  -> parent  { type: 'studio:pos', pos: {x,y,z} }  every 250 ms
 * ------------------------------------------------------------------ */
function installBridge(twin) {
  const send = (msg) => { if (window.parent !== window) window.parent.postMessage(msg, '*'); };

  const handlers = {
    ping: () => 'pong',
    setCameraRaw: (m) => twin.setCameraRaw(m),
    setTime: (m) => twin.setTime(m.p),
    freeze: (m) => twin.freeze(!!m.v),
    setMode: (m) => twin.setMode(m.m),
    pos: () => twin.pos(),
  };

  window.addEventListener('message', (ev) => {
    // Only the embedding Director UI may drive the camera.
    if (ev.source !== window.parent) return;
    const m = ev.data;
    if (!m || m.type !== 'studio:cmd') return;
    try {
      const h = handlers[m.cmd];
      if (!h) throw new Error(`unknown cmd ${m.cmd}`);
      send({ type: 'studio:res', id: m.id, ok: true, data: h(m) });
    } catch (e) {
      send({ type: 'studio:res', id: m.id, ok: false, error: String((e && e.message) || e) });
    }
  });

  setInterval(() => {
    const c = twin.app.camera.position;
    send({ type: 'studio:pos', pos: { x: c.x, y: c.y, z: c.z } });
  }, POS_INTERVAL_MS);

  send({ type: 'studio:ready' });
}
