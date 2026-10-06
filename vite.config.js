import { defineConfig } from 'vite';

// Hosts that can't send HTTP headers (e.g. GitHub Pages) still get a strict
// Content-Security-Policy via <meta>. Production builds only, because Vite's
// dev server injects inline scripts.
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval' https://accounts.google.com https://apis.google.com https://www.gstatic.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://accounts.google.com",
  'font-src https://fonts.gstatic.com',
  "img-src 'self' data: blob: https://*.googleusercontent.com https://ssl.gstatic.com https://www.gstatic.com",
  "connect-src 'self' https://www.googleapis.com https://content.googleapis.com https://accounts.google.com https://oauth2.googleapis.com",
  'frame-src https://accounts.google.com https://docs.google.com https://drive.google.com https://content.googleapis.com',
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  'upgrade-insecure-requests',
].join('; ');

const cspMeta = {
  name: 'csp-meta',
  apply: 'build',
  transformIndexHtml: (html) =>
    html.replace('<meta charset="utf-8" />', `<meta charset="utf-8" />\n  <meta http-equiv="Content-Security-Policy" content="${CSP}" />`),
};

export default defineConfig({
  // Relative base: the site works at a domain root or under a sub-path
  // such as https://<user>.github.io/<repo>/.
  base: './',
  plugins: [cspMeta],
  // FFmpeg.wasm spawns its own worker; pre-bundling breaks its relative URLs.
  optimizeDeps: { exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util'] },
  worker: { format: 'es' },
  build: { target: 'es2020', sourcemap: false },
  server: {
    headers: { 'Cross-Origin-Opener-Policy': 'same-origin-allow-popups' },
  },
});
