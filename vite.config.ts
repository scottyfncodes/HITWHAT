import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import preact from '@preact/preset-vite';
import { defineConfig, type Plugin } from 'vite';

const MEDIAPIPE_FILES = ['vision_wasm_internal.js', 'vision_wasm_internal.wasm', 'vision_wasm_nosimd_internal.js', 'vision_wasm_nosimd_internal.wasm'];
const mediapipeDir = () => join(dirname(createRequire(import.meta.url).resolve('@mediapipe/tasks-vision')), 'wasm');

/**
 * Ships MediaPipe's WebAssembly runtime with the app (served at ./mediapipe/),
 * so swing analysis needs no third-party CDN and keeps working offline.
 */
function mediapipeRuntime(): Plugin {
  return {
    name: 'hitwhat-mediapipe',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const m = req.url?.match(/\/mediapipe\/([\w.]+)$/);
        if (!m || !MEDIAPIPE_FILES.includes(m[1])) return next();
        res.setHeader('Content-Type', m[1].endsWith('.wasm') ? 'application/wasm' : 'text/javascript');
        res.end(readFileSync(join(mediapipeDir(), m[1])));
      });
    },
    generateBundle() {
      for (const f of MEDIAPIPE_FILES) this.emitFile({ type: 'asset', fileName: `mediapipe/${f}`, source: readFileSync(join(mediapipeDir(), f)) });
    },
  };
}

/**
 * Emits `sw.js` with a precache list of the exact hashed build output, so the
 * app shell works offline without pulling in a PWA plugin dependency.
 */
function serviceWorker(): Plugin {
  return {
    name: 'hitwhat-service-worker',
    apply: 'build',
    generateBundle(_opts, bundle) {
      // The swing analyzer's runtime (~12 MB) is cached on first use, not at install.
      const files = Object.keys(bundle).filter((f) => !f.endsWith('.map') && !f.startsWith('mediapipe/') && !/vision_bundle|tasks-vision/.test(f));
      const staticFiles = ['manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', 'icons/favicon.svg'];
      const precache = ['./', ...files, ...staticFiles].map((f) => (f === './' ? f : `./${f}`));
      const version = createHash('sha256').update(precache.join('|')).digest('hex').slice(0, 12);
      const template = readFileSync(new URL('./src/sw-template.js', import.meta.url), 'utf8');
      this.emitFile({
        type: 'asset',
        fileName: 'sw.js',
        source: template.replace('__VERSION__', version).replace('__PRECACHE__', JSON.stringify(precache)),
      });
    },
  };
}

export default defineConfig({
  // GitHub Pages serves the app from the repo path (/HITWHAT/); hitwhat.com would serve it
  // from the root. A relative base works for both.
  base: './',
  plugins: [preact(), mediapipeRuntime(), serviceWorker()],
  build: {
    target: 'es2020',
    sourcemap: false,
  },
  server: { port: 5173 },
  preview: { port: 4173 },
  test: {
    include: ['tests/unit/**/*.test.ts', 'tests/unit/**/*.test.tsx'],
    environment: 'node',
  },
} as never);
