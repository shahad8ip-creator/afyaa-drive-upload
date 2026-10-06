// Copies the single-threaded FFmpeg WebAssembly core into public/ so it is
// served from our own origin (no third-party CDN sees the user's activity).
import { mkdirSync, copyFileSync, existsSync } from 'node:fs';
const src = 'node_modules/@ffmpeg/core/dist/esm';
const dest = 'public/ffmpeg';
if (existsSync(src)) {
  mkdirSync(dest, { recursive: true });
  for (const f of ['ffmpeg-core.js', 'ffmpeg-core.wasm']) copyFileSync(`${src}/${f}`, `${dest}/${f}`);
  console.log('FFmpeg core copied to public/ffmpeg');
}
