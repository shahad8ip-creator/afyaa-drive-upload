// Crops the supplied logo (already transparent) into web-sized PNGs:
//  brand/logo-full.png – drop mark + association name calligraphy
//  brand/mark.png      – drop mark only (header, favicon)
import sharp from 'sharp';
const src = 'scripts/logo-source.png';
async function cut(region, out, width) {
  const buf = await sharp(src).extract(region).png().toBuffer();
  await sharp(buf).trim({ threshold: 1 }).resize({ width, withoutEnlargement: true }).png({ compressionLevel: 9 }).toFile(out);
  console.log(out, await sharp(out).metadata().then((m) => `${m.width}x${m.height}`));
}
await cut({ left: 560, top: 160, width: 800, height: 760 }, 'public/brand/logo-full.png', 640);
await cut({ left: 740, top: 160, width: 440, height: 630 }, 'public/brand/mark.png', 256);
const bg = { r: 251, g: 248, b: 242, alpha: 1 };
await sharp('public/brand/mark.png').resize(140, 140, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).extend({ top: 20, bottom: 20, left: 20, right: 20, background: { r: 0, g: 0, b: 0, alpha: 0 } }).flatten({ background: bg }).png().toFile('public/brand/apple-touch-icon.png');
await sharp('public/brand/mark.png').resize(64, 64, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toFile('public/brand/favicon.png');
