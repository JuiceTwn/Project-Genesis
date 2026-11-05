import { INF } from './constants';
import { W, H } from './dims';
import { COST } from './constants';

/** Mulberry32 seeded PRNG. */
export function mk(seed: number): () => number { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }


/** Distance field from `sources` over the terrain. Edge costs are small integers (<= 4), so this is Dial's bucket algorithm: linear in the number of tiles,
    no heap, no allocation per node. Output is identical to a plain Dijkstra. Tiles with cost >= INF are walls. */
const RING = 8;   // > the largest finite edge cost (4), a power of two
export function makeField(tiles: ArrayLike<number>, sources: number[]): Uint16Array {
  const w = W, h = H, N = w * h, dist = new Uint16Array(N).fill(INF), cost = COST;
  const ring: number[][] = []; for (let r = 0; r < RING; r++) ring.push([]);
  let pending = 0;
  for (const s of sources) { if (dist[s] !== 0) { dist[s] = 0; ring[0].push(s); pending++; } }
  for (let d = 0; pending > 0; d++) {
    const cur = ring[d & (RING - 1)];
    for (let k = 0; k < cur.length; k++) {
      const i = cur[k]; pending--;
      if (dist[i] !== d) continue;   // a shorter route was found after this entry was queued
      const x = i % w, y = (i / w) | 0;
      let ni: number, c: number, nd: number;
      if (x + 1 < w) { ni = i + 1; c = cost[tiles[ni]]; if (c < INF && (nd = d + c) < dist[ni]) { dist[ni] = nd; ring[nd & (RING - 1)].push(ni); pending++; } }
      if (x > 0) { ni = i - 1; c = cost[tiles[ni]]; if (c < INF && (nd = d + c) < dist[ni]) { dist[ni] = nd; ring[nd & (RING - 1)].push(ni); pending++; } }
      if (y + 1 < h) { ni = i + w; c = cost[tiles[ni]]; if (c < INF && (nd = d + c) < dist[ni]) { dist[ni] = nd; ring[nd & (RING - 1)].push(ni); pending++; } }
      if (y > 0) { ni = i - w; c = cost[tiles[ni]]; if (c < INF && (nd = d + c) < dist[ni]) { dist[ni] = nd; ring[nd & (RING - 1)].push(ni); pending++; } }
    }
    cur.length = 0;
  }
  return dist;
}

export function b64(u8: Uint8Array): string { if (typeof Buffer !== 'undefined') return Buffer.from(u8).toString('base64'); let s = ''; for (let i = 0; i < u8.length; i += 8192) s += String.fromCharCode.apply(null, Array.from(u8.subarray(i, i + 8192))); return btoa(s); }
export function tkLess(tick: number, until: number): boolean { return tick < until; }
