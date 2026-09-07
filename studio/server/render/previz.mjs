import fs from 'node:fs'; import path from 'node:path'; import { spawnSync } from 'node:child_process';
import { sample, duration } from '../../schemas/keys.mjs';
import { launchWorld } from './browser.mjs';

const INSTALL = `(() => {
  const app = window.__twin.app, W2 = window.__twin.world;
  for (const id of ['prompt','toast','tour-title','crosshair','hud','toolbar','help','ref-ctl','loading']) { const n = document.getElementById(id); if (n) n.style.display = 'none'; }
  const cap = document.createElement('div'); cap.id = 'd-cap'; cap.style.cssText = 'position:fixed;left:50%;bottom:7%;transform:translateX(-50%);font:500 22px/1.3 Inter,Helvetica,Arial,sans-serif;color:#fff;text-shadow:0 2px 14px rgba(0,0,0,.9);z-index:99;opacity:0;white-space:nowrap'; document.body.appendChild(cap);
  const fade = document.createElement('div'); fade.id = 'd-fade'; fade.style.cssText = 'position:fixed;inset:0;background:#000;z-index:100;pointer-events:none;opacity:0'; document.body.appendChild(fade);
  const SKIP = new Set(['WalkControls','OrbitMode','Tour','Interaction']);
  const ups = app.updatables.filter((u) => !SKIP.has(u?.constructor?.name)); app.updatables.length = 0;
  window.__demo = { foot: 0, ups, frame(s, fadeV, capOp, t, dt) {
    const cam = app.camera;
    if (s.air) cam.position.set(s.eye[0], s.eye[1], s.eye[2]);
    else { const [x, z] = s.pos; const target = s.cut ? W2.collision.floorAt(x, z, W2.terrain.heightAt(x, z) + 0.6, 100) : W2.collision.floorAt(x, z, this.foot);
      this.foot = s.cut ? target : this.foot + (target - this.foot) * Math.min(1, dt * 9);
      const bob = s.moving ? Math.sin(t * 5.6) * 0.035 + Math.sin(t * 11.2) * 0.012 : Math.sin(t * 1.4) * 0.008;
      cam.position.set(x + (s.moving ? Math.sin(t * 2.8) * 0.05 : 0), this.foot + 1.68 + bob, z); }
    cam.lookAt(s.look[0], s.look[1], s.look[2]); cam.fov = s.fov; cam.updateProjectionMatrix();
    document.getElementById('d-fade').style.opacity = String(fadeV);
    const c = document.getElementById('d-cap'); c.textContent = s.cap; c.style.opacity = String(capOp);
    for (const u of this.ups) u.update(dt, (app.elapsed += dt));
    app.time.update(cam.position, null, cam.position.y); app.renderer.render(app.scene, cam);
  } };
  window.__twin.setMode('orbit');
})()`;

export async function renderPreviz({ world, shot, outDir, onProgress, onWarn }) {
  const FPS = shot.fps, total = Math.round(duration(shot.keys) * FPS);
  if (total < 1) throw new Error('shot has no duration');
  const frames = path.join(outDir, 'frames'); fs.rmSync(frames, { recursive: true, force: true }); fs.mkdirSync(frames, { recursive: true });
  const { browser, page, softwareRender } = await launchWorld({ world, width: shot.width, height: shot.height, time: shot.timeOfDay });
  try {
    await page.evaluate(INSTALL);
    // Collision warning (does not block the render): probe the path at 10 Hz the same way the
    // Director does, and report blocked stretches so a bad shot is visible in the job log.
    try {
      const pts = [];
      for (let t = 0; t <= duration(shot.keys) + 1e-9; t += 0.1) { const s = sample(shot.keys, +t.toFixed(3), FPS); pts.push([+t.toFixed(3), s.air ? s.eye : [s.pos[0], 1.68, s.pos[1]], s.air]); }
      const hits = await page.evaluate((p) => (window.__twin.probePath ? window.__twin.probePath({ points: p.map((q) => q[1]), clearance: 1.0 }) : null), pts);
      if (hits) {
        const bad = pts.filter((p, i) => hits[i]?.blocked);
        if (bad.length) { const t0 = bad[0][0], t1 = bad[bad.length - 1][0]; onWarn?.(`camera passes through structures in ${bad.length} of ${pts.length} samples (${t0}s–${t1}s) — use "Fix path" in the Director`); }
      }
    } catch (e) { onWarn?.(`path probe skipped: ${String(e?.message || e)}`); }
    let lastTime = shot.timeOfDay;
    for (let f = 0; f < total; f++) {
      const t = f / FPS, s = sample(shot.keys, t, FPS);
      const keyTime = shot.keys.filter((k) => k.time && k.t <= t).pop()?.time; if (keyTime && keyTime !== lastTime) { await page.evaluate((p) => window.__twin.setTime(p), keyTime); lastTime = keyTime; }
      const cutFade = shot.keys.some((k) => k.cut && Math.abs(k.t - t) < 0.3) ? 1 - Math.min(1, Math.abs(shot.keys.find((k) => k.cut && Math.abs(k.t - t) < 0.3).t - t) / 0.3) : 0;
      await page.evaluate(([s, fadeV, capOp, t, dt]) => window.__demo.frame(s, fadeV, capOp, t, dt), [s, cutFade, s.cap ? 0.95 : 0, t, 1 / FPS]);
      await page.screenshot({ path: path.join(frames, `${String(f).padStart(5, '0')}.png`) });
      onProgress?.(f + 1, total);
    }
  } finally { await browser.close(); }
  const mp4 = path.join(outDir, 'previz.mp4');
  const ff = spawnSync('ffmpeg', ['-y', '-framerate', String(FPS), '-i', path.join(frames, '%05d.png'), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', mp4], { encoding: 'utf8' });
  if (ff.status !== 0) throw new Error(`ffmpeg failed: ${ff.stderr.slice(-800)}`);
  return { mp4, frames: total, softwareRender };
}

if (process.argv[1] && process.argv[1].endsWith('previz.mjs')) {
  const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
  const project = JSON.parse(fs.readFileSync(arg('project'), 'utf8')); const shot = project.shots.find((s) => s.id === arg('shot'));
  if (!shot) { console.error('shot not found'); process.exit(1); }
  const out = arg('out', path.join(path.dirname(arg('project')), 'shots', shot.id)); fs.mkdirSync(out, { recursive: true });
  const r = await renderPreviz({ world: project.world, shot, outDir: out, onProgress: (f, n) => { if (f % 30 === 0) console.log('frame', f, '/', n); } });
  console.log(JSON.stringify(r));
}
