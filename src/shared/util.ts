import { TRAITS, TRAIT_W, INF } from './constants';
import { W, H } from './dims';
import { COST } from './constants';

/** Mulberry32 seeded PRNG. */
export function mk(seed: number): () => number { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }


export function rollTraits(rf: () => number): string[] {
  const n = rf() < 0.7 ? 1 : 2, out = [], tot = TRAIT_W.reduce((a, b) => a + b, 0);
  let guard = 0;
  while (out.length < n && guard++ < 20) { let r = rf() * tot, i = 0; for (; i < TRAITS.length - 1; i++) { r -= TRAIT_W[i]; if (r <= 0) break; } if (!out.includes(TRAITS[i])) out.push(TRAITS[i]); }
  if (out.includes('lazy') && out.includes('ambitious')) out.splice(out.indexOf('lazy'), 1);
  return out;
}

export function makeField(tiles: ArrayLike<number>, sources: number[]): Uint16Array {
  const N = W * H, dist = new Uint16Array(N).fill(INF), heap = [];
  const push = k => { let i = heap.length; heap.push(k); while (i > 0) { const p = (i - 1) >> 1; if (heap[p] <= k) break; heap[i] = heap[p]; i = p; } heap[i] = k; };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { let i = 0; const n = heap.length; for (;;) { let c = 2 * i + 1; if (c >= n) break; if (c + 1 < n && heap[c + 1] < heap[c]) c++; if (heap[c] >= last) break; heap[i] = heap[c]; i = c; } heap[i] = last; } return top; };
  for (const s of sources) { dist[s] = 0; push(s); }
  while (heap.length) {
    const k = pop(), d = Math.floor(k / 32768), i = k - d * 32768;
    if (d > dist[i]) continue;
    const x = i % W, y = (i / W) | 0;
    for (let q = 0; q < 4; q++) {
      const nx = x + (q === 0 ? 1 : q === 1 ? -1 : 0), ny = y + (q === 2 ? 1 : q === 3 ? -1 : 0);
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const ni = ny * W + nx, c = COST[tiles[ni]];
      if (c >= INF) continue;
      const nd = d + c;
      if (nd < dist[ni]) { dist[ni] = nd; push(nd * 32768 + ni); }
    }
  }
  return dist;
}

export function b64(u8: Uint8Array): string { if (typeof Buffer !== 'undefined') return Buffer.from(u8).toString('base64'); let s = ''; for (let i = 0; i < u8.length; i += 8192) s += String.fromCharCode.apply(null, Array.from(u8.subarray(i, i + 8192))); return btoa(s); }
export function tkLess(tick: number, until: number): boolean { return tick < until; }
