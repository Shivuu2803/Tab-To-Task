/**
 * Packs dist/ into a store-ready zip.
 *
 * Written by hand rather than shelling out:
 *   - `zip` is not present on a stock Windows box
 *   - PowerShell's Compress-Archive writes BACKSLASH path separators, which
 *     violates the ZIP spec (entries must use "/") and the Chrome Web Store
 *     rejects or mangles such archives
 *
 * Produces a flat archive with manifest.json at the root, which is what both
 * the Chrome and Edge stores require.
 *
 * Run with: npm run build && npm run zip
 */
import { deflateRawSync } from 'node:zlib';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = resolve(ROOT, 'dist');

if (!existsSync(DIST)) {
  console.error('dist/ not found. Run `npm run build` first.');
  process.exit(1);
}

/** Every file under dist/, with POSIX-style relative names. */
function walk(dir, prefix = '') {
  const files = [];
  for (const entry of readdirSync(dir).sort()) {
    const full = join(dir, entry);
    const name = prefix ? `${prefix}/${entry}` : entry;
    if (statSync(full).isDirectory()) files.push(...walk(full, name));
    else files.push({ name, data: readFileSync(full) });
  }
  return files;
}

function crc32(buf) {
  let crc = 0xffffffff;
  for (const byte of buf) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** MS-DOS date/time, the only timestamp format a basic zip entry carries. */
function dosTime(date) {
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1);
  const day = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { time, day };
}

function buildZip(files, date = new Date()) {
  const { time, day } = dosTime(date);
  const locals = [];
  const centrals = [];
  let offset = 0;

  for (const file of files) {
    const nameBuf = Buffer.from(file.name, 'utf8');
    const crc = crc32(file.data);
    const compressed = deflateRawSync(file.data, { level: 9 });
    // Fall back to stored when deflate makes the entry bigger (tiny files).
    const useDeflate = compressed.length < file.data.length;
    const body = useDeflate ? compressed : file.data;
    const method = useDeflate ? 8 : 0;

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); // local file header signature
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0x0800, 6); // flags: UTF-8 names
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(day, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(file.data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28); // extra field length

    locals.push(local, nameBuf, body);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); // central directory signature
    central.writeUInt16LE(20, 4); // version made by
    central.writeUInt16LE(20, 6); // version needed
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(day, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(file.data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(0, 38); // external attributes
    central.writeUInt32LE(offset, 42);

    centrals.push(central, nameBuf);
    offset += local.length + nameBuf.length + body.length;
  }

  const localPart = Buffer.concat(locals);
  const centralPart = Buffer.concat(centrals);

  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); // end of central directory
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralPart.length, 12);
  end.writeUInt32LE(localPart.length, 16);

  return Buffer.concat([localPart, centralPart, end]);
}

const files = walk(DIST);
if (!files.some((f) => f.name === 'manifest.json')) {
  console.error('dist/manifest.json is missing — the store will reject this build.');
  process.exit(1);
}

const { version } = JSON.parse(readFileSync(resolve(DIST, 'manifest.json'), 'utf8'));
const out = resolve(ROOT, `tab-to-task-${version}.zip`);
writeFileSync(out, buildZip(files));

const kb = (statSync(out).size / 1024).toFixed(1);
console.log(`Packed ${files.length} files into ${out} (${kb} kB)`);
