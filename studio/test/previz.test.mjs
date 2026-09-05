import { it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { renderPreviz } from '../server/render/previz.mjs';
it('renders a 2s shot to an mp4 with 60 frames', async () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'previz-'));
  const shot = { id: 't', name: 't', fps: 30, width: 640, height: 360, timeOfDay: 'sunset',
    keys: [ { t: 0, m: 'air', eye: [150, 130, 210], look: [0, 12, 0] }, { t: 2, m: 'air', eye: [-60, 120, 210], look: [0, 12, 0] } ] };
  const r = await renderPreviz({ world: 'union-square-sf', shot, outDir: out });
  expect(fs.existsSync(r.mp4)).toBe(true); expect(r.frames).toBe(60);
  const n = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-count_frames', '-show_entries', 'stream=nb_read_frames', '-of', 'csv=p=0', r.mp4]).toString().trim();
  expect(Number(n)).toBe(60);
}, 400000);
