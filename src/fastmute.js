// Near-instant audio removal for MP4 / MOV videos (what iPhones and Android
// phones record), without FFmpeg and without reading the video into memory.
//
// An MP4/MOV file is a set of boxes: `moov` holds the index of every track,
// `mdat` holds the actual audio and video bytes. To remove the sound we:
//   1. read only `moov` (a few hundred KB to a few MB),
//   2. rename every audio track box ('trak' with handler 'soun') to 'free',
//      which players skip — same size, so every other offset stays valid,
//   3. replace the audio bytes inside `mdat` with zeros, so the sound is
//      really gone from the file, not just hidden.
// The result is a Blob stitched from lazy slices of the original file plus
// those small replacements: nothing is re-encoded (the picture is bit-for-bit
// the original) and nothing large is copied. It takes milliseconds.
//
// Anything unusual (fragmented MP4, compact sample tables, no video track,
// external data references…) returns null and the caller falls back to FFmpeg.

export const FAST_MUTE_EXT = /\.(mp4|m4v|mov|qt|3gp|3g2)$/i;

const MAX_MOOV = 256 * 1024 * 1024;

const typeAt = (b, o) => String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3]);

async function read(file, start, len) {
  return new Uint8Array(await file.slice(start, start + len).arrayBuffer());
}

// Children of a box held in memory: [{ type, start, size, hdr }], offsets relative to `buf`.
function children(buf, dv, start, end) {
  const out = [];
  let pos = start;
  while (pos + 8 <= end) {
    let size = dv.getUint32(pos);
    const type = typeAt(buf, pos + 4);
    let hdr = 8;
    if (size === 1) {
      size = Number(dv.getBigUint64(pos + 8));
      hdr = 16;
    } else if (size === 0) size = end - pos;
    if (size < hdr || pos + size > end) throw new Error(`bad box ${type}`);
    out.push({ type, start: pos, size, hdr });
    pos += size;
  }
  return out;
}

const find = (list, type) => list.find((b) => b.type === type);

// Byte ranges [start, end) of every chunk of one track, from its sample tables.
function chunkRanges(buf, dv, stbl) {
  const kids = children(buf, dv, stbl.start + stbl.hdr, stbl.start + stbl.size);
  const stsz = find(kids, 'stsz');
  const stsc = find(kids, 'stsc');
  const stco = find(kids, 'stco') || find(kids, 'co64');
  if (!stsz || !stsc || !stco) throw new Error('missing sample tables'); // e.g. stz2

  // Chunk offsets
  let p = stco.start + stco.hdr + 4;
  const nChunks = dv.getUint32(p);
  p += 4;
  const offsets = new Array(nChunks);
  for (let i = 0; i < nChunks; i++) {
    if (stco.type === 'co64') {
      offsets[i] = Number(dv.getBigUint64(p));
      p += 8;
    } else {
      offsets[i] = dv.getUint32(p);
      p += 4;
    }
  }

  // Sample sizes
  p = stsz.start + stsz.hdr + 4;
  const constSize = dv.getUint32(p);
  const nSamples = dv.getUint32(p + 4);
  const sizesAt = p + 8;
  const sampleSize = (i) => (constSize ? constSize : dv.getUint32(sizesAt + i * 4));

  // Samples per chunk (run-length table)
  p = stsc.start + stsc.hdr + 4;
  const nRuns = dv.getUint32(p);
  p += 4;
  const runs = [];
  for (let i = 0; i < nRuns; i++, p += 12) runs.push({ first: dv.getUint32(p), per: dv.getUint32(p + 4) });

  const ranges = [];
  let sample = 0;
  for (let c = 0, r = 0; c < nChunks; c++) {
    while (r + 1 < runs.length && runs[r + 1].first <= c + 1) r++;
    const per = runs[r]?.per || 0;
    let bytes = 0;
    if (constSize) bytes = constSize * per;
    else for (let k = 0; k < per && sample + k < nSamples; k++) bytes += sampleSize(sample + k);
    sample += per;
    if (bytes > 0) ranges.push([offsets[c], offsets[c] + bytes]);
  }
  return ranges;
}

/**
 * Returns a File with the audio removed, or null if this file can't be
 * handled quickly (the caller then uses FFmpeg).
 */
export async function fastMute(file) {
  if (!FAST_MUTE_EXT.test(file.name) && !/^video\/(mp4|quicktime|3gpp)/.test(file.type)) return null;
  try {
    // 1) Top-level boxes: read 16-byte headers only.
    const top = [];
    for (let pos = 0; pos < file.size; ) {
      const h = await read(file, pos, 16);
      if (h.length < 8) break;
      const dv = new DataView(h.buffer);
      let size = dv.getUint32(0);
      const type = typeAt(h, 4);
      let hdr = 8;
      if (size === 1) {
        size = Number(dv.getBigUint64(8));
        hdr = 16;
      } else if (size === 0) size = file.size - pos;
      if (size < hdr) return null;
      top.push({ type, start: pos, size, hdr });
      pos += size;
      if (top.length > 4096) return null;
    }
    if (top.some((b) => b.type === 'moof')) return null; // fragmented MP4
    const moovs = top.filter((b) => b.type === 'moov');
    const mdats = top.filter((b) => b.type === 'mdat');
    if (moovs.length !== 1 || !mdats.length || moovs[0].size > MAX_MOOV) return null;
    const moovBox = moovs[0];
    if (moovBox.start + moovBox.size > file.size) return null;

    // 2) Read moov and find the audio and video tracks.
    const moov = await read(file, moovBox.start, moovBox.size);
    const dv = new DataView(moov.buffer);
    const traks = children(moov, dv, moovBox.hdr, moov.length).filter((b) => b.type === 'trak');
    const audio = [];
    let hasVideo = false;
    for (const trak of traks) {
      const mdia = find(children(moov, dv, trak.start + trak.hdr, trak.start + trak.size), 'mdia');
      if (!mdia) continue;
      const mk = children(moov, dv, mdia.start + mdia.hdr, mdia.start + mdia.size);
      const hdlr = find(mk, 'hdlr');
      if (!hdlr) continue;
      const handler = typeAt(moov, hdlr.start + hdlr.hdr + 8);
      if (handler === 'vide') hasVideo = true;
      if (handler !== 'soun') continue;
      const minf = find(mk, 'minf');
      const stbl = minf && find(children(moov, dv, minf.start + minf.hdr, minf.start + minf.size), 'stbl');
      if (!stbl) return null;
      audio.push({ trak, ranges: chunkRanges(moov, dv, stbl) });
    }
    if (!hasVideo) return null;
    if (!audio.length) return file; // already silent

    // 3) Every audio range must sit inside an mdat box.
    const ranges = audio.flatMap((a) => a.ranges).sort((a, b) => a[0] - b[0]);
    const inMdat = ([s, e]) => mdats.some((m) => s >= m.start + m.hdr && e <= m.start + m.size);
    if (!ranges.every(inMdat)) return null;
    for (let i = 1; i < ranges.length; i++) if (ranges[i][0] < ranges[i - 1][1]) return null; // overlap

    // 4) Rename audio tracks to 'free' (same size → no offsets move).
    for (const { trak } of audio) moov.set([0x66, 0x72, 0x65, 0x65], trak.start + 4);

    // 5) Stitch the output: original slices, zeros for audio, the new moov.
    let maxLen = 0;
    for (const [s, e] of ranges) maxLen = Math.max(maxLen, e - s);
    const zero = new Blob([new Uint8Array(maxLen)]);
    const edits = [...ranges.map(([s, e]) => [s, e, zero.slice(0, e - s)]), [moovBox.start, moovBox.start + moovBox.size, new Blob([moov])]];
    edits.sort((a, b) => a[0] - b[0]);
    const parts = [];
    let pos = 0;
    for (const [s, e, blob] of edits) {
      if (s < pos) return null;
      if (s > pos) parts.push(file.slice(pos, s));
      parts.push(blob);
      pos = e;
    }
    if (pos < file.size) parts.push(file.slice(pos));
    const out = new File(parts, file.name, { type: file.type || 'video/mp4', lastModified: file.lastModified });
    return out.size === file.size ? out : null;
  } catch {
    return null;
  }
}
