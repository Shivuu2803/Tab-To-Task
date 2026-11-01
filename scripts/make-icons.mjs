/**
 * Generates the four icon PNGs the manifest requires.
 *
 * Hand-rolled encoder rather than a dependency: sharp/canvas are heavy native
 * installs for what is a rounded square and a checkmark, and the project is
 * meant to cost nothing to build.
 *
 * Run with: npm run icons
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');
const SIZES = [16, 32, 48, 128];

const BRAND = [79, 70, 229]; // #4f46e5, matches --color-brand-600
const MARK = [255, 255, 255];

/** Signed distance to a rounded rectangle, for anti-aliased edges. */
function roundedRectSdf(x, y, halfW, halfH, radius) {
  const dx = Math.abs(x) - (halfW - radius);
  const dy = Math.abs(y) - (halfH - radius);
  const outside = Math.hypot(Math.max(dx, 0), Math.max(dy, 0));
  return outside + Math.min(Math.max(dx, dy), 0) - radius;
}

/** Signed distance to a thick line segment — two of these make the checkmark. */
function segmentSdf(px, py, ax, ay, bx, by, thickness) {
  const vx = bx - ax;
  const vy = by - ay;
  const wx = px - ax;
  const wy = py - ay;
  const t = Math.max(0, Math.min(1, (wx * vx + wy * vy) / (vx * vx + vy * vy)));
  return Math.hypot(wx - t * vx, wy - t * vy) - thickness;
}

function renderIcon(size) {
  const pixels = Buffer.alloc(size * size * 4);
  // Supersample so edges stay smooth at 16px, where aliasing is most visible.
  const SS = 4;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let bgCov = 0;
      let markCov = 0;

      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          // Normalised to [-1, 1] so the shape math is resolution independent.
          const nx = ((x + (sx + 0.5) / SS) / size) * 2 - 1;
          const ny = ((y + (sy + 0.5) / SS) / size) * 2 - 1;

          if (roundedRectSdf(nx, ny, 0.94, 0.94, 0.3) <= 0) bgCov++;

          // Checkmark: short stroke down-right, long stroke up-right.
          const thickness = size <= 16 ? 0.13 : 0.11;
          const d = Math.min(
            segmentSdf(nx, ny, -0.42, 0.04, -0.12, 0.36, thickness),
            segmentSdf(nx, ny, -0.12, 0.36, 0.44, -0.36, thickness),
          );
          if (d <= 0) markCov++;
        }
      }

      const total = SS * SS;
      const alpha = bgCov / total;
      const mark = markCov / total;
      const offset = (y * size + x) * 4;

      // Composite the white mark over the brand fill, then premultiply nothing
      // — PNG wants straight alpha.
      for (let c = 0; c < 3; c++) {
        pixels[offset + c] = Math.round(BRAND[c] * (1 - mark) + MARK[c] * mark);
      }
      pixels[offset + 3] = Math.round(alpha * 255);
    }
  }

  return pixels;
}

function crc32(buf) {
  let crc = 0xffffffff;
  for (const byte of buf) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function encodePng(pixels, size) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  // 10..12 stay zero: deflate, adaptive filtering, no interlace.

  // Each scanline is prefixed with its filter byte (0 = none).
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    const rowStart = y * (size * 4 + 1);
    raw[rowStart] = 0;
    pixels.copy(raw, rowStart + 1, y * size * 4, (y + 1) * size * 4);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync(OUT_DIR, { recursive: true });
for (const size of SIZES) {
  const file = resolve(OUT_DIR, `icon${size}.png`);
  writeFileSync(file, encodePng(renderIcon(size), size));
  console.log(`wrote icons/icon${size}.png`);
}
