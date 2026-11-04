/* Seeded noise, fBm and a binary heap used by terrain generation. */
export function mk(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

export function Noise(seed) {
  const r = mk(seed), p = new Uint8Array(512), g = [[1, 1], [-1, 1], [1, -1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]];
  const b = []; for (let i = 0; i < 256; i++) b.push(i);
  for (let i = 255; i > 0; i--) { const j = (r() * (i + 1)) | 0; const t = b[i]; b[i] = b[j]; b[j] = t; }
  for (let i = 0; i < 512; i++) p[i] = b[i & 255];
  const F2 = 0.5 * (Math.sqrt(3) - 1), G2 = (3 - Math.sqrt(3)) / 6;
  return (xin, yin) => {
    const s = (xin + yin) * F2, i = Math.floor(xin + s), j = Math.floor(yin + s), t = (i + j) * G2;
    const x0 = xin - (i - t), y0 = yin - (j - t), i1 = x0 > y0 ? 1 : 0, j1 = x0 > y0 ? 0 : 1;
    const x1 = x0 - i1 + G2, y1 = y0 - j1 + G2, x2 = x0 - 1 + 2 * G2, y2 = y0 - 1 + 2 * G2, ii = i & 255, jj = j & 255;
    let n = 0, t0 = 0.5 - x0 * x0 - y0 * y0;
    if (t0 > 0) { t0 *= t0; const q = g[p[ii + p[jj]] & 7]; n += t0 * t0 * (q[0] * x0 + q[1] * y0); }
    let t1 = 0.5 - x1 * x1 - y1 * y1;
    if (t1 > 0) { t1 *= t1; const q = g[p[ii + i1 + p[jj + j1]] & 7]; n += t1 * t1 * (q[0] * x1 + q[1] * y1); }
    let t2 = 0.5 - x2 * x2 - y2 * y2;
    if (t2 > 0) { t2 *= t2; const q = g[p[ii + 1 + p[jj + 1]] & 7]; n += t2 * t2 * (q[0] * x2 + q[1] * y2); }
    return Math.max(-1, Math.min(1, 55 * n));
  };
}
export function fbm(n, x, y, oct, gain = 0.5) { let a = 1, f = 1, s = 0, nz = 0; for (let o = 0; o < oct; o++) { s += a * n(x * f, y * f); nz += a; a *= gain; f *= 2.03; } return s / nz; }

export class Heap {
  k: number[]; v: any[]; lk: number;
  constructor() { this.k = []; this.v = []; this.lk = 0; }
  get size() { return this.k.length; }
  push(key, val) { const K = this.k, V = this.v; let i = K.length; K.push(key); V.push(val); while (i > 0) { const p = (i - 1) >> 1; if (K[p] <= key) break; K[i] = K[p]; V[i] = V[p]; i = p; } K[i] = key; V[i] = val; }
  pop() { const K = this.k, V = this.v, tk = K[0], tv = V[0], lk = K.pop(), lv = V.pop(), n = K.length; if (n) { let i = 0; for (;;) { let c = 2 * i + 1; if (c >= n) break; if (c + 1 < n && K[c + 1] < K[c]) c++; if (K[c] >= lk) break; K[i] = K[c]; V[i] = V[c]; i = c; } K[i] = lk; V[i] = lv; } this.lk = tk; return tv; }
}
export const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
export const D4 = [[1, 0], [-1, 0], [0, 1], [0, -1]], D8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
