import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "src-tauri", "icons");
mkdirSync(outDir, { recursive: true });

/* Halo logo: an original open ring (halo) with a cool-blue accent arc and a core dot.
   Pure geometric shapes, drawn analytically with 4x supersampling. */

const S = 4; // supersample factor

function insideLogo(x, y, size) {
  const cx = size / 2;
  const cy = size / 2;
  const dx = x - cx;
  const dy = y - cy;
  const r = Math.hypot(dx, dy);
  const R = size * 0.36; // ring radius
  const thickness = size * 0.085;

  // ring (open at the top-right, gap between -80deg and -20deg measured from +x axis in canvas coords)
  const ang = Math.atan2(dy, dx); // -PI..PI
  const inGap = ang > -1.35 && ang < -0.25;
  if (Math.abs(r - R) <= thickness / 2 && !inGap) {
    return { a: 1, accent: false };
  }
  // accent arc bridging part of the gap (cool blue), slightly thinner
  if (ang > -1.25 && ang < -0.45 && Math.abs(r - R) <= (thickness * 0.7) / 2) {
    return { a: 1, accent: true };
  }
  // core dot
  if (r <= size * 0.075) {
    return { a: 1, accent: true };
  }
  return { a: 0, accent: false };
}

function renderLogo(size) {
  const px = Buffer.alloc(size * size * 4);
  const white = [244, 246, 250];
  const blue = [76, 156, 255];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let hits = 0;
      let accent = 0;
      for (let sy = 0; sy < S; sy++) {
        for (let sx = 0; sx < S; sx++) {
          const s = insideLogo(x + (sx + 0.5) / S, y + (sy + 0.5) / S, size);
          if (s.a) {
            hits++;
            if (s.accent) accent++;
          }
        }
      }
      const cov = hits / (S * S);
      const o = (y * size + x) * 4;
      const mix = hits > 0 ? accent / hits : 0;
      px[o] = Math.round(white[0] * (1 - mix) + blue[0] * mix);
      px[o + 1] = Math.round(white[1] * (1 - mix) + blue[1] * mix);
      px[o + 2] = Math.round(white[2] * (1 - mix) + blue[2] * mix);
      px[o + 3] = Math.round(cov * 255);
    }
  }
  return px;
}

function renderSolid(size) {
  const px = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const o = (y * size + x) * 4;
      px[o] = 18;
      px[o + 1] = 18;
      px[o + 2] = 20;
      px[o + 3] = 255;
    }
  }
  return px;
}

function overlay(logo, solid, size) {
  const out = Buffer.from(solid);
  for (let i = 0; i < size * size; i++) {
    const a = logo[i * 4 + 3] / 255;
    if (a === 0) continue;
    for (let c = 0; c < 3; c++) {
      out[i * 4 + c] = Math.round(logo[i * 4 + c] * a + out[i * 4 + c] * (1 - a));
    }
    out[i * 4 + 3] = 255;
  }
  return out;
}

function crc32(buf) {
  let c;
  const table = [];
  for (let n = 0; n < 256; n++) {
    c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(rgba, size) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function encodeIco(pngs) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngs.length, 4);
  const entries = [];
  const blobs = [];
  let offset = 6 + pngs.length * 16;
  for (const { size, png } of pngs) {
    const e = Buffer.alloc(16);
    e[0] = size >= 256 ? 0 : size;
    e[1] = size >= 256 ? 0 : size;
    e[2] = 0;
    e[3] = 0;
    e.writeUInt16LE(1, 4);
    e.writeUInt16LE(32, 6);
    e.writeUInt32LE(png.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += png.length;
    entries.push(e);
    blobs.push(png);
  }
  return Buffer.concat([header, ...entries, ...blobs]);
}

for (const [size, name] of [
  [32, "32x32.png"],
  [128, "128x128.png"],
  [256, "128x128@2x.png"],
]) {
  writeFileSync(join(outDir, name), encodePng(renderLogo(size), size));
}

// square app icon (logo centered on carbon square) for store/panel contexts
{
  const size = 512;
  const logo = renderLogo(size);
  const solid = renderSolid(size);
  writeFileSync(join(outDir, "icon.png"), encodePng(overlay(logo, solid, size), size));
}

// tray icon: white halo ring on transparent 32px
{
  const size = 32;
  const px = Buffer.alloc(size * size * 4);
  const cx = size / 2, cy = size / 2, R = size * 0.36, th = size * 0.11;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
      const r = Math.hypot(dx, dy);
      const ang = Math.atan2(dy, dx);
      const inGap = ang > -1.35 && ang < -0.25;
      const on = Math.abs(r - R) <= th / 2 && !inGap;
      const dot = r <= size * 0.09;
      const o = (y * size + x) * 4;
      px[o] = dot ? 76 : 244;
      px[o + 1] = dot ? 156 : 246;
      px[o + 2] = dot ? 255 : 250;
      px[o + 3] = on || dot ? 255 : 0;
    }
  }
  writeFileSync(join(outDir, "tray-icon.png"), encodePng(px, size));
}

// .ico with PNG-compressed entries (supported since Vista)
{
  const pngs = [32, 48, 64, 256].map((size) => ({
    size,
    png: encodePng(renderLogo(size), size),
  }));
  writeFileSync(join(outDir, "icon.ico"), encodeIco(pngs));
}

console.log("Icons written to", outDir);
