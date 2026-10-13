// Generates the app icons (original geometric mark: three adjacent slides sharing one continuous gradient).
// Pure Node (zlib), no image libraries. Run: node scripts/gen-icons.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const PUBLIC = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
mkdirSync(PUBLIC, { recursive: true });

const BG = [0x16, 0x16, 0x1a];
const STOPS = [
  [0, [0xff, 0x9a, 0x6a]],
  [0.5, [0xff, 0x4f, 0x8b]],
  [1, [0x5b, 0x3b, 0xff]],
];

function gradient(t) {
  t = Math.min(1, Math.max(0, t));
  for (let i = 1; i < STOPS.length; i++) {
    if (t <= STOPS[i][0]) {
      const [t0, c0] = STOPS[i - 1];
      const [t1, c1] = STOPS[i];
      const k = (t - t0) / (t1 - t0);
      return c0.map((v, j) => v + (c1[j] - v) * k);
    }
  }
  return STOPS[STOPS.length - 1][1];
}

// signed distance to a rounded rect (negative inside)
function sdRoundRect(px, py, x, y, w, h, r) {
  const cx = x + w / 2;
  const cy = y + h / 2;
  const qx = Math.abs(px - cx) - (w / 2 - r);
  const qy = Math.abs(py - cy) - (h / 2 - r);
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
}

/**
 * Layout in a 64-unit design space (matches public/icon.svg). `pad` shrinks the mark
 * towards the center for maskable icons (safe zone). `rounded` clips the whole
 * tile to a rounded square (regular icons) or leaves it full-bleed (maskable / apple).
 */
function render(size, { pad = 0, rounded = true }) {
  const SS = 3; // supersampling per axis
  const raw = Buffer.alloc(size * (size * 4 + 1));
  const slides = [8, 25, 42].map((x) => ({ x, y: 12, w: 14, h: 40, r: 4 }));
  const unit = size / 64;
  const scale = 1 - pad * 2;
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const u = ((x + (sx + 0.5) / SS) / size) * 64; // design coords
          const v = ((y + (sy + 0.5) / SS) / size) * 64;
          let tileA = 1;
          if (rounded) tileA = sdRoundRect(u, v, 0, 0, 64, 64, 14) < 0 ? 1 : 0;
          if (!tileA) continue;
          // map through the safe-zone scale about the center
          const mu = (u - 32) / scale + 32;
          const mv = (v - 32) / scale + 32;
          let col = BG;
          for (const s of slides) {
            if (sdRoundRect(mu, mv, s.x, s.y, s.w, s.h, s.r) < 0) {
              col = gradient((mu - 8) / 48);
              break;
            }
          }
          r += col[0];
          g += col[1];
          b += col[2];
          a += 1;
        }
      }
      const n = SS * SS;
      const o = y * (size * 4 + 1) + 1 + x * 4;
      raw[o] = a ? Math.round(r / a) : 0;
      raw[o + 1] = a ? Math.round(g / a) : 0;
      raw[o + 2] = a ? Math.round(b / a) : 0;
      raw[o + 3] = Math.round((a / n) * 255);
    }
  }
  void unit;
  return raw;
}

const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};
function png(size, raw) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const outputs = [
  ['icon-192.png', 192, { rounded: true }],
  ['icon-512.png', 512, { rounded: true }],
  ['icon-maskable-512.png', 512, { rounded: false, pad: 0.1 }],
  ['apple-touch-icon.png', 180, { rounded: false, pad: 0.06 }],
  ['favicon-32.png', 32, { rounded: true }],
];
for (const [name, size, opts] of outputs) {
  writeFileSync(join(PUBLIC, name), png(size, render(size, opts)));
  console.log('wrote', name);
}

writeFileSync(
  join(PUBLIC, 'icon.svg'),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <defs>
    <linearGradient id="g" gradientUnits="userSpaceOnUse" x1="8" y1="0" x2="56" y2="0">
      <stop offset="0" stop-color="#ff9a6a"/>
      <stop offset="0.5" stop-color="#ff4f8b"/>
      <stop offset="1" stop-color="#5b3bff"/>
    </linearGradient>
  </defs>
  <rect width="64" height="64" rx="14" fill="#16161a"/>
  <rect x="8" y="12" width="14" height="40" rx="4" fill="url(#g)"/>
  <rect x="25" y="12" width="14" height="40" rx="4" fill="url(#g)"/>
  <rect x="42" y="12" width="14" height="40" rx="4" fill="url(#g)"/>
</svg>
`,
);
console.log('wrote icon.svg');
