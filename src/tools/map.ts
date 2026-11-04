/* Renders a generated country to PNG for eyeballing worldgen:  npm run map -- [seed] [out.png] [scale] */
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import * as Gen from '../worldgen';

const seed = +(process.argv[2] || 1337), out = process.argv[3] || 'map.png', S = +(process.argv[4] || 6);
const t0 = Date.now(), m = Gen.generate(seed, { pop: 480 });
console.log(`gen ${Date.now() - t0} ms, ${m.W}x${m.H}, settlements: ${m.settlements.map((s: any) => `${Gen.TIERS[s.tier][0]}@${s.x},${s.y}`).join(' ')}`);

const col: Record<number, number[]> = { 0: [120, 160, 80], 1: [110, 80, 50], 2: [150, 90, 70], 3: [60, 110, 170], 4: [170, 190, 100], 5: [50, 100, 50], 6: [140, 100, 60], 7: [110, 150, 190], 8: [225, 210, 160], 9: [120, 115, 110] };
const w = m.W * S, h = m.H * S, px = Buffer.alloc(w * h * 3);
const set = (x: number, y: number, c: number[]) => { for (let b = 0; b < S; b++) for (let a = 0; a < S; a++) { const o = ((y * S + b) * w + x * S + a) * 3; px[o] = c[0]; px[o + 1] = c[1]; px[o + 2] = c[2]; } };
for (let y = 0; y < m.H; y++) for (let x = 0; x < m.W; x++) {
  const i = y * m.W + x; let c = col[m.t[i]].slice();
  if (m.t[i] === 3) c = m.wk[i] === 1 ? [30, 70, 130] : [70, 130, 190]; else { const k = 0.8 + m.h[i] * 0.5; c = c.map(v => Math.min(255, v * k)); }
  set(x, y, c);
}
for (const p of m.plots) for (let b = 0; b < 3; b++) for (let a = 0; a < 3; a++) set(p.x + a, p.y + b, p.rural ? [200, 200, 90] : [190, 110, 90]);
for (const s of m.settlements) for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) set(s.x + a, s.y + b, s.tier === 0 ? [255, 0, 0] : s.tier === 1 ? [255, 120, 0] : [255, 220, 0]);

// minimal PNG encoder
const crcT = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (b: Buffer) => { let c = 0xffffffff; for (const v of b) c = crcT[(c ^ v) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (t: string, d: Buffer) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]), c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
const raw = Buffer.alloc((w * 3 + 1) * h); for (let y = 0; y < h; y++) { raw[y * (w * 3 + 1)] = 0; px.copy(raw, y * (w * 3 + 1) + 1, y * w * 3, (y + 1) * w * 3); }
writeFileSync(out, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
console.log('wrote', out);
