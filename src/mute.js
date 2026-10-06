// Removes the audio track from a video entirely on the user's device, using
// FFmpeg compiled to WebAssembly and served from this site's own origin.
// The video stream is copied bit-for-bit (`-c:v copy`): no re-encoding, so
// resolution, frame rate and picture quality are exactly the original's.
// The original video is never sent to any processing server.

import { FFmpeg } from '@ffmpeg/ffmpeg';

let ff = null;
let loading = null;
let n = 0;

async function load() {
  if (ff) return ff;
  if (!loading) {
    loading = (async () => {
      const inst = new FFmpeg();
      await inst.load({
        coreURL: new URL(`${import.meta.env.BASE_URL}ffmpeg/ffmpeg-core.js`, document.baseURI).href,
        wasmURL: new URL(`${import.meta.env.BASE_URL}ffmpeg/ffmpeg-core.wasm`, document.baseURI).href,
      });
      ff = inst;
      return inst;
    })().finally(() => {
      loading = null;
    });
  }
  return loading;
}

// Warm up in the background once the user ticks "mute" so the first video
// doesn't wait for the ~30 MB engine download.
export function preloadMuter() {
  load().catch(() => {});
}

export function abortMute() {
  if (ff) {
    try {
      ff.terminate();
    } catch {}
    ff = null;
  }
}

export class MuteError extends Error {}

export async function muteVideo(file, { onProgress } = {}) {
  const inst = await load();
  const id = ++n;
  const dir = `/in${id}`;
  const dot = file.name.lastIndexOf('.');
  const ext = dot > 0 ? file.name.slice(dot + 1).toLowerCase() : 'mp4';
  const out = `/out${id}.${ext}`;
  const progress = ({ progress }) => onProgress?.(Math.max(0, Math.min(1, progress)));
  const logs = [];
  const log = ({ message }) => {
    logs.push(message);
    if (logs.length > 40) logs.shift();
  };
  inst.on('progress', progress);
  inst.on('log', log);
  try {
    // WORKERFS reads the file lazily from disk instead of copying it into memory.
    await inst.createDir(dir);
    await inst.mount('WORKERFS', { files: [file] }, dir);
    const code = await inst.exec([
      '-hide_banner',
      '-i', `${dir}/${file.name}`,
      '-map', '0:v',
      '-c', 'copy',
      '-an', '-sn', '-dn',
      '-map_metadata', '0',
      out,
    ]);
    if (code !== 0) throw new MuteError(logs.slice(-6).join('\n') || `ffmpeg exit ${code}`);
    const data = await inst.readFile(out);
    return new File([data], file.name, { type: file.type || 'video/mp4', lastModified: file.lastModified });
  } catch (e) {
    if (e instanceof MuteError) throw e;
    // Out-of-memory or a terminated worker leaves the instance unusable.
    abortMute();
    throw new MuteError(String(e?.message || e));
  } finally {
    if (ff === inst) {
      inst.off('progress', progress);
      inst.off('log', log);
      await inst.deleteFile(out).catch(() => {});
      await inst.unmount(dir).catch(() => {});
      await inst.deleteDir(dir).catch(() => {});
    }
  }
}
