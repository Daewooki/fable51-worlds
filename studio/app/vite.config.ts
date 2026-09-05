import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

// Resolve absolute paths from this config file's own location, since `vite --config
// app/vite.config.ts` may be invoked from a cwd other than `app/` (e.g. `studio/`).
const appDir = fileURLToPath(new URL('.', import.meta.url));
const studioDir = fileURLToPath(new URL('..', import.meta.url));

export default defineConfig({
  root: appDir,
  server: {
    port: 5180,
    strictPort: true,
    // `../../schemas/*.mjs` imports from app source resolve outside `root`; allow the
    // whole studio dir so Vite's dev server will serve them.
    fs: { allow: [studioDir] },
    proxy: {
      '/api': 'http://localhost:5190',
      '/files': 'http://localhost:5190',
      '/ws': { target: 'ws://localhost:5190', ws: true },
    },
  },
  build: { outDir: 'dist' },
});
