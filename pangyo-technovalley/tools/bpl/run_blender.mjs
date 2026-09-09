#!/usr/bin/env node
/**
 * run_blender.mjs — `npm run assets`: regenerate the hero GLB kit with the portable Blender.
 *
 * Blender's `--python` exits 0 even when the script raised: a budget overrun in gen_pangyo.py
 * (`raise SystemExit(...)`) printed an error and the build carried on regardless. `--python-exit-code 1`
 * is what makes that a failed build — and it has to be passed BEFORE `--python`, because Blender
 * processes its arguments in order.
 *
 * Blender itself is not committed (portable zip under tools/blender/, git-ignored): the path is
 * resolved relative to THIS package, so a repo path containing a space is fine (fileURLToPath).
 *
 * Run: npm run assets        [-- <extra blender args>]
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const PKG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const BLENDER_DIR = path.join(PKG, 'tools', 'blender');
const SCRIPT = path.join(PKG, 'tools', 'bpl', 'gen_pangyo.py');

/** First `blender.exe`/`blender` one level under tools/blender/ (the unpacked portable build). */
function findBlender() {
  // BLENDER env var wins (any platform), then the unpacked portable build under tools/blender/,
  // then the usual macOS app-bundle locations.
  if (process.env.BLENDER && fs.existsSync(process.env.BLENDER)) return process.env.BLENDER;
  const names = process.platform === 'win32' ? ['blender.exe']
    : process.platform === 'darwin' ? ['blender', path.join('Blender.app', 'Contents', 'MacOS', 'Blender'), path.join('Contents', 'MacOS', 'Blender')]
    : ['blender'];
  if (fs.existsSync(BLENDER_DIR)) {
    for (const n of names) {
      const direct = path.join(BLENDER_DIR, n);
      if (fs.existsSync(direct)) return direct;
    }
    for (const d of fs.readdirSync(BLENDER_DIR, { withFileTypes: true })) {
      if (!d.isDirectory()) continue;
      for (const n of names) {
        const p = path.join(BLENDER_DIR, d.name, n);
        if (fs.existsSync(p)) return p;
      }
    }
  }
  if (process.platform === 'darwin') {
    for (const p of ['/Applications/Blender.app/Contents/MacOS/Blender', path.join(process.env.HOME || '', 'Applications', 'Blender.app', 'Contents', 'MacOS', 'Blender')]) {
      if (fs.existsSync(p)) return p;
    }
  }
  return null;
}

const blender = findBlender();
if (!blender) {
  console.error(
    `no Blender found under ${BLENDER_DIR}\n` +
    'The hero-module generator needs a portable Blender 4.2 LTS build, which is NOT committed:\n' +
    '  1. download Blender 4.2 LTS from https://www.blender.org/download/lts/ (Windows: portable .zip; macOS: .dmg)\n' +
    `  2. Windows: unpack so that ${path.join(BLENDER_DIR, '<blender-4.2.x-windows-x64>', 'blender.exe')} exists\n` +
    '     macOS: drag Blender.app into /Applications (found automatically) or into tools/blender/, or set BLENDER=/path/to/Blender.app/Contents/MacOS/Blender\n' +
    '  3. re-run `npm run assets`\n' +
    '(the PyPI `bpy` wheel is not an option here: bpy >= 4.2 needs Python 3.11)'
  );
  process.exit(1);
}

const args = ['--background', '--python-exit-code', '1', '--python', SCRIPT, ...process.argv.slice(2)];
console.log(`$ ${blender} ${args.join(' ')}`);
const r = spawnSync(blender, args, { stdio: 'inherit', cwd: PKG });
if (r.error) { console.error(r.error.message); process.exit(1); }
process.exit(r.status ?? 1);
