import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

// Resolve absolute paths from this config file's own location, since `vite --config
// app/vite.config.ts` may be invoked from a cwd other than `app/` (e.g. `studio/`).
const appDir = fileURLToPath(new URL('.', import.meta.url));
const studioDir = fileURLToPath(new URL('..', import.meta.url));

// iOS Safari only exposes DeviceOrientationEvent.requestPermission() (and only fires
// orientation events at all) on a secure context, so the phone page needs HTTPS to work on
// an iPhone (plain http is fine on Android, and for desktop testing). Generate a local cert
// with mkcert once:
//   mkcert -install && mkcert -key-file studio/.certs/localhost-key.pem -cert-file studio/.certs/localhost.pem localhost <lan-ip>
// (swap <lan-ip> for the machine's actual LAN address, e.g. from `GET /api/lan-ip`.)
// If the cert files aren't present, the dev server just falls back to plain http.
const certDir = fileURLToPath(new URL('../.certs/', import.meta.url));
const keyPath = certDir + 'localhost-key.pem';
const certPath = certDir + 'localhost.pem';
const httpsOpts = fs.existsSync(keyPath) && fs.existsSync(certPath)
  ? { key: fs.readFileSync(keyPath), cert: fs.readFileSync(certPath) }
  : undefined;

export default defineConfig({
  root: appDir,
  server: {
    port: 5180,
    strictPort: true,
    https: httpsOpts,
    // `../../schemas/*.mjs` imports from app source resolve outside `root`; allow the
    // whole studio dir so Vite's dev server will serve them.
    fs: { allow: [studioDir] },
    proxy: {
      '/api': 'http://localhost:5190',
      '/files': 'http://localhost:5190',
      '/ws': { target: 'ws://localhost:5190', ws: true },
    },
  },
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        phone: fileURLToPath(new URL('./phone/index.html', import.meta.url)),
      },
    },
  },
});
