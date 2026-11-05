/**
 * Tray icon drawn in code (no binary assets): a rounded square with a check (ok)
 * or an exclamation mark (attention). Encoded as PNG with zlib.
 */
import { nativeImage, type NativeImage } from "electron";
import { deflateSync } from "node:zlib";

type Rgb = [number, number, number];
export type TrayTone = "ok" | "warn" | "off";
const TONES: Record<TrayTone, Rgb> = { ok: [15, 110, 115], warn: [196, 50, 28], off: [120, 128, 138] };

function crc32(buf: Buffer) {
  let c = ~0;
  for (const b of buf) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}
function chunk(type: string, data: Buffer) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size: number, pixel: (x: number, y: number) => [number, number, number, number]) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) raw.set(pixel(x, y), y * (size * 4 + 1) + 1 + x * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr.set([8, 6, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** Signed distance helpers in unit space (0..1). */
const segDist = (px: number, py: number, ax: number, ay: number, bx: number, by: number) => {
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
};

function draw(size: number, tone: TrayTone): Buffer {
  const [r, g, b] = TONES[tone];
  const S = 4; // supersampling
  return png(size, (x, y) => {
    let bg = 0, fg = 0;
    for (let sy = 0; sy < S; sy++)
      for (let sx = 0; sx < S; sx++) {
        const u = (x + (sx + 0.5) / S) / size, v = (y + (sy + 0.5) / S) / size;
        // rounded square
        const qx = Math.max(Math.abs(u - 0.5) - 0.3, 0), qy = Math.max(Math.abs(v - 0.5) - 0.3, 0);
        if (Math.hypot(qx, qy) <= 0.18) bg++;
        // glyph
        const w = 0.075;
        const on =
          tone === "warn"
            ? segDist(u, v, 0.5, 0.25, 0.5, 0.58) < w || Math.hypot(u - 0.5, v - 0.74) < w * 1.1
            : segDist(u, v, 0.28, 0.52, 0.44, 0.68) < w || segDist(u, v, 0.44, 0.68, 0.73, 0.33) < w;
        if (on) fg++;
      }
    const a = bg / (S * S), f = fg / (S * S);
    const mix = (c: number) => Math.round(c * (1 - f) + 255 * f);
    return [mix(r), mix(g), mix(b), Math.round(255 * a)];
  });
}

export function trayIcon(tone: TrayTone): NativeImage {
  const img = nativeImage.createFromBuffer(draw(16, tone), { scaleFactor: 1 });
  img.addRepresentation({ scaleFactor: 2, buffer: draw(32, tone) });
  return img;
}
