// Draws the toolbar icon (a white open book on a purple rounded square) as PNGs.
// Run with `node scripts/make-icons.mjs`; writes public/icon/<size>.png.
import { mkdirSync, writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

const PURPLE = [100, 64, 191];
const WHITE = [255, 255, 255];
const LEFT_PAGE = [[0.18, 0.3], [0.47, 0.35], [0.47, 0.76], [0.18, 0.71]];
const RIGHT_PAGE = [[0.53, 0.35], [0.82, 0.3], [0.82, 0.71], [0.53, 0.76]];

function inRoundedSquare(x, y, r = 0.22) {
  const cx = Math.min(Math.max(x, r), 1 - r);
  const cy = Math.min(Math.max(y, r), 1 - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}

function inConvex(poly, x, y) {
  let sign = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i];
    const [x2, y2] = poly[(i + 1) % poly.length];
    const cross = (x2 - x1) * (y - y1) - (y2 - y1) * (x - x1);
    if (cross !== 0) {
      if (sign === 0) sign = Math.sign(cross);
      else if (Math.sign(cross) !== sign) return false;
    }
  }
  return true;
}

function render(size) {
  const samples = 4;
  const rows = [];
  for (let py = 0; py < size; py++) {
    const row = [0]; // PNG filter type: none
    for (let px = 0; px < size; px++) {
      let bg = 0, page = 0;
      for (let sy = 0; sy < samples; sy++) {
        for (let sx = 0; sx < samples; sx++) {
          const x = (px + (sx + 0.5) / samples) / size;
          const y = (py + (sy + 0.5) / samples) / size;
          if (!inRoundedSquare(x, y)) continue;
          if (inConvex(LEFT_PAGE, x, y) || inConvex(RIGHT_PAGE, x, y)) page++;
          else bg++;
        }
      }
      const n = samples * samples;
      const alpha = (bg + page) / n;
      const mix = bg + page ? page / (bg + page) : 0;
      const color = PURPLE.map((c, i) => Math.round(c + (WHITE[i] - c) * mix));
      row.push(...color, Math.round(alpha * 255));
    }
    rows.push(Buffer.from(row));
  }
  return png(size, Buffer.concat(rows));
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}
function png(size, raw) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header.set([8, 6, 0, 0, 0], 8); // 8-bit RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const dir = new URL("../public/icon/", import.meta.url);
mkdirSync(dir, { recursive: true });
for (const size of [16, 32, 48, 128]) writeFileSync(new URL(`${size}.png`, dir), render(size));
console.log("wrote public/icon/{16,32,48,128}.png");
