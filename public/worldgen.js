/* Dotville worldgen: a whole little country from seeded noise.
   Pipeline: simplex fBm terrain (domain-warped, island mask + a bay) -> sea level by quantile -> priority-flood
   hydrology (flow direction + accumulation => rivers, lakes) -> moisture/forest -> site suitability
   (flat, fertile, fresh water, harbor, river mouth, confluence, ford) -> capital on the best trade site
   with a big hinterland -> towns/villages/hamlets by Christaller spacing (x sqrt3 per tier) -> least-cost
   orthogonal roads with bridges and fords (roads reuse roads, so trunks emerge) -> per-settlement layout:
   market square + ring road, quay on the shoreline, street branches that grow outward with distance decay,
   burgage-style frontage plots, rural plots along trunk roads.
   The same grow/frontage routines are reused at runtime so towns keep expanding. UMD; no dependencies. */
(function (root) {
'use strict';
const T = { GRASS: 0, ROAD: 1, BLOCK: 2, WATER: 3, OPEN: 4, TREE: 5, BRIDGE: 6, FORD: 7, SAND: 8, ROCK: 9 };
const TIERS = ['capital', 'town', 'village', 'hamlet'];
const SQ = [[7, 5], [5, 3], [5, 3], [3, 3]];           // square size per tier (w,h)
const URBAN_R = [26, 16, 10, 6];                          // urban radius per tier
const BRANCH_L = [15, 11, 8, 4];                         // max street branch length per tier
const SPACING = [0, 27, 15.6, 9.5];                      // Christaller: each tier ~sqrt(3) closer than the one above

function mk(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

function Noise(seed) {
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
function fbm(n, x, y, oct, gain = 0.5) { let a = 1, f = 1, s = 0, nz = 0; for (let o = 0; o < oct; o++) { s += a * n(x * f, y * f); nz += a; a *= gain; f *= 2.03; } return s / nz; }

class Heap {
  constructor() { this.k = []; this.v = []; this.lk = 0; }
  get size() { return this.k.length; }
  push(key, val) { const K = this.k, V = this.v; let i = K.length; K.push(key); V.push(val); while (i > 0) { const p = (i - 1) >> 1; if (K[p] <= key) break; K[i] = K[p]; V[i] = V[p]; i = p; } K[i] = key; V[i] = val; }
  pop() { const K = this.k, V = this.v, tk = K[0], tv = V[0], lk = K.pop(), lv = V.pop(), n = K.length; if (n) { let i = 0; for (;;) { let c = 2 * i + 1; if (c >= n) break; if (c + 1 < n && K[c + 1] < K[c]) c++; if (K[c] >= lk) break; K[i] = K[c]; V[i] = V[c]; i = c; } K[i] = lk; V[i] = lv; } this.lk = tk; return tv; }
}
const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const D4 = [[1, 0], [-1, 0], [0, 1], [0, -1]], D8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

function generate(seed, opt = {}) {
  const W = opt.W || 144, H = opt.H || 108, N = W * H, R = mk(seed * 977 + 13);
  const nE = Noise(seed + 11), nW = Noise(seed + 23), nM = Noise(seed + 37), nF = Noise(seed + 51);
  const idx = (x, y) => y * W + x;

  /* ---- 1. terrain: warped fBm + island mask + a bay on a random side ---- */
  const ang = R() * Math.PI * 2, ox = Math.cos(ang), oy = Math.sin(ang), h = new Float32Array(N);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const px = x / 34, py = y / 34;
    const qx = px + 0.8 * nW(px * 0.6 + 5.2, py * 0.6), qy = py + 0.8 * nW(px * 0.6, py * 0.6 + 9.1);
    const e = fbm(nE, qx, qy, 6) * 0.5 + 0.5;
    const dx = (x / W - 0.5) * 2, dy = (y / H - 0.5) * 2;
    const d = Math.hypot(dx * 0.92, dy) + 0.2 * fbm(nW, px * 1.4 + 20, py * 1.4, 3);
    const mask = 1 - sm(0.5, 1.0, d), bay = sm(0.05, 0.95, dx * ox + dy * oy);
    h[idx(x, y)] = e * 0.64 + mask * 0.36 - bay * 0.3;
  }
  const sorted = Float32Array.from(h).sort(), sea = sorted[Math.floor(N * (opt.sea || 0.31))], hmax = sorted[N - 1];
  const isSea = new Uint8Array(N), eN = new Float32Array(N);
  // only the ocean connected to the map edge counts as sea; inland lows become lakes below
  {
    const q = [], seen = new Uint8Array(N);
    for (let i = 0; i < N; i++) { const x = i % W, y = (i / W) | 0; if ((x === 0 || y === 0 || x === W - 1 || y === H - 1) && h[i] <= sea) { seen[i] = 1; q.push(i); } }
    for (let qi = 0; qi < q.length; qi++) { const i = q[qi], x = i % W, y = (i / W) | 0; isSea[i] = 1; for (const [a, b] of D4) { const nx = x + a, ny = y + b; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue; const ni = idx(nx, ny); if (!seen[ni] && h[ni] <= sea) { seen[ni] = 1; q.push(ni); } } }
    for (let i = 0; i < N; i++) eN[i] = h[i] <= sea ? 0 : (h[i] - sea) / (hmax - sea);
  }

  /* ---- 2. moisture (noise + proximity to the sea) ---- */
  const dSea = bfs(isSea, W, H);
  const moist = new Float32Array(N);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = idx(x, y); moist[i] = Math.min(1, Math.max(0, (fbm(nM, x / 30, y / 30, 4) * 0.5 + 0.5) * 0.8 + 0.25 * Math.exp(-dSea[i] / 14) - eN[i] * 0.12)); }

  /* ---- 3. hydrology: priority flood from the sea => flow tree => accumulation => rivers & lakes ---- */
  const fe = Float32Array.from(h), parent = new Int32Array(N).fill(-1), done = new Uint8Array(N), order = [], hp = new Heap();
  for (let i = 0; i < N; i++) if (isSea[i]) { done[i] = 1; }
  for (let i = 0; i < N; i++) if (isSea[i]) { const x = i % W, y = (i / W) | 0; for (const [a, b] of D4) { const nx = x + a, ny = y + b; if (nx >= 0 && ny >= 0 && nx < W && ny < H && !isSea[idx(nx, ny)]) { hp.push(h[i], i); break; } } }
  for (let i = 0; i < N; i++) { const x = i % W, y = (i / W) | 0; if (!isSea[i] && (x === 0 || y === 0 || x === W - 1 || y === H - 1)) { done[i] = 1; hp.push(h[i], i); } }
  while (hp.size) {
    const c = hp.pop(), x = c % W, y = (c / W) | 0; order.push(c);
    for (const [a, b] of D8) {
      const nx = x + a, ny = y + b; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const ni = idx(nx, ny); if (done[ni]) continue; done[ni] = 1;
      fe[ni] = Math.max(h[ni], fe[c] + (a && b ? 2e-5 : 1.4e-5)); parent[ni] = c; hp.push(fe[ni], ni);
    }
  }
  const acc = new Float32Array(N); for (let i = 0; i < N; i++) acc[i] = isSea[i] ? 0 : 0.55 + moist[i];
  for (let k = order.length - 1; k >= 0; k--) { const c = order[k]; if (parent[c] >= 0 && !isSea[c]) acc[parent[c]] += acc[c]; }
  // lakes: filled basins deeper than a threshold, in clumps of 5+
  const lake = new Uint8Array(N);
  { const cand = new Uint8Array(N), seen = new Uint8Array(N); for (let i = 0; i < N; i++) if (!isSea[i] && fe[i] - h[i] > 0.0045) cand[i] = 1;
    for (let i = 0; i < N; i++) if (cand[i] && !seen[i]) { const comp = [i]; seen[i] = 1; for (let qi = 0; qi < comp.length; qi++) { const c = comp[qi], x = c % W, y = (c / W) | 0; for (const [a, b] of D4) { const nx = x + a, ny = y + b; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue; const ni = idx(nx, ny); if (cand[ni] && !seen[ni]) { seen[ni] = 1; comp.push(ni); } } } if (comp.length >= 6) for (const c of comp) lake[c] = 1; } }
  const landCells = []; for (let i = 0; i < N; i++) if (!isSea[i] && !lake[i]) landCells.push(i);
  const accSorted = landCells.map(i => acc[i]).sort((a, b) => b - a);
  const thr = Math.max(14, accSorted[Math.floor(landCells.length * (opt.rivers || 0.022))] || 30), big = thr * 7;
  const wk = new Uint8Array(N);                    // 0 land, 1 sea, 2 lake, 3 river
  for (let i = 0; i < N; i++) wk[i] = isSea[i] ? 1 : lake[i] ? 2 : 0;
  for (const i of landCells) if (acc[i] >= thr && eN[i] < 0.9) wk[i] = 3;
  for (const i of landCells) if (acc[i] >= big && wk[i] === 3) { const x = i % W, y = (i / W) | 0; for (const [a, b] of [[1, 0], [0, 1]]) { const nx = x + a, ny = y + b; if (nx < W && ny < H && wk[idx(nx, ny)] === 0) wk[idx(nx, ny)] = 3; } }
  const water = new Uint8Array(N); for (let i = 0; i < N; i++) water[i] = wk[i] ? 1 : 0;
  const dFresh = bfs(wk, W, H, v => v >= 2), dWater = bfs(water, W, H);

  /* ---- 4. base tiles: water, beach, rock, forest ---- */
  const t = new Uint8Array(N), rc = new Uint8Array(N), qm = new Uint8Array(N), pm = new Int32Array(N).fill(-1);
  for (let i = 0; i < N; i++) {
    if (wk[i]) { t[i] = T.WATER; continue; }
    const f = fbm(nF, (i % W) / 14 + 40, ((i / W) | 0) / 14, 4) * 0.5 + 0.5;
    if (eN[i] > 0.91) t[i] = T.ROCK;
    else if (dSea[i] <= 1 && eN[i] < 0.07) t[i] = T.SAND;
    else if (f > 0.6 - moist[i] * 0.14 && eN[i] < 0.8) t[i] = T.TREE;
  }
  // main landmass (largest 4-connected walkable-ish region) so every settlement can be linked by road
  const comp = new Int32Array(N).fill(-1); let bestC = -1, bestN = 0, nc = 0;
  for (let i = 0; i < N; i++) if (comp[i] < 0 && !water[i] && t[i] !== T.ROCK) { const q = [i]; comp[i] = nc; for (let qi = 0; qi < q.length; qi++) { const c = q[qi], x = c % W, y = (c / W) | 0; for (const [a, b] of D4) { const nx = x + a, ny = y + b; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue; const ni = idx(nx, ny); if (comp[ni] < 0 && !water[ni] && t[ni] !== T.ROCK) { comp[ni] = nc; q.push(ni); } } } if (q.length > bestN) { bestN = q.length; bestC = nc; } nc++; }
  // (rivers may split the land; treat comps across rivers as one for siting by dilating through river cells)
  const main = new Uint8Array(N);
  { const q = []; for (let i = 0; i < N; i++) if (comp[i] === bestC) { main[i] = 1; q.push(i); }
    for (let qi = 0; qi < q.length; qi++) { const c = q[qi], x = c % W, y = (c / W) | 0; for (const [a, b] of D8) { const nx = x + a, ny = y + b; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue; const ni = idx(nx, ny); if (!main[ni] && !isSea[ni] && !lake[ni] && t[ni] !== T.ROCK) { main[ni] = 1; q.push(ni); } } } }

  /* ---- 5. site suitability ---- */
  const flat = new Float32Array(N), fert = new Float32Array(N), harbor = new Float32Array(N), bonus = { mouth: new Float32Array(N), conf: new Float32Array(N), ford: new Float32Array(N) };
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const i = idx(x, y); let s = 0; for (const [a, b] of D4) s = Math.max(s, Math.abs(eN[idx(x + a, y + b)] - eN[i]));
    flat[i] = Math.max(0, 1 - s / 0.045);
    fert[i] = Math.max(0, Math.min(1, (0.25 + moist[i] * 0.75) * (1 - Math.min(1, eN[i] / 0.9)) + (dFresh[i] <= 3 ? 0.18 : 0)));
  }
  for (let y = 6; y < H - 6; y++) for (let x = 6; x < W - 6; x++) {
    const i = idx(x, y); if (water[i] || dSea[i] > 2) continue;
    let ws = 0, tot = 0; for (let b = -6; b <= 6; b++) for (let a = -6; a <= 6; a++) if (a * a + b * b <= 36) { tot++; if (isSea[idx(x + a, y + b)]) ws++; }
    const r = ws / tot; harbor[i] = Math.max(0, 1 - Math.abs(r - 0.4) / 0.4);   // sheltered bay: partly enclosed by land
  }
  const stamp = (arr, c, rad, v) => { const x = c % W, y = (c / W) | 0; for (let b = -rad; b <= rad; b++) for (let a = -rad; a <= rad; a++) { const nx = x + a, ny = y + b; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue; const k = idx(nx, ny), w = v * Math.exp(-Math.hypot(a, b) / (rad * 0.45)); if (w > arr[k]) arr[k] = w; } };
  const upstream = new Uint8Array(N);
  for (const i of landCells) if (wk[i] === 3 && parent[i] >= 0 && wk[parent[i]] === 3) upstream[parent[i]]++;
  for (const i of landCells) if (wk[i] === 3) {
    if (parent[i] >= 0 && wk[parent[i]] === 1) stamp(bonus.mouth, i, 6, 1);
    if (upstream[i] >= 2) stamp(bonus.conf, i, 6, 1);
    if (acc[i] < thr * 3.5) stamp(bonus.ford, i, 4, 0.8);
  }
  // room to grow: share of clear, flat land within radius 10 (towns need space, not just a good port)
  const room = new Float32Array(N);
  { const JJ = new Float64Array((W + 1) * (H + 1));
    for (let y = 0; y < H; y++) { let row = 0; for (let x = 0; x < W; x++) { const i = idx(x, y); row += (!water[i] && t[i] !== T.ROCK && flat[i] > 0.3 && eN[i] < 0.85) ? 1 : 0; JJ[(y + 1) * (W + 1) + x + 1] = JJ[y * (W + 1) + x + 1] + row; } }
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const x0 = Math.max(0, x - 10), x1 = Math.min(W, x + 11), y0 = Math.max(0, y - 10), y1 = Math.min(H, y + 11); room[idx(x, y)] = (JJ[y1 * (W + 1) + x1] - JJ[y0 * (W + 1) + x1] - JJ[y1 * (W + 1) + x0] + JJ[y0 * (W + 1) + x0]) / ((x1 - x0) * (y1 - y0)); } }
  const site = new Float32Array(N); let smax = 0;
  for (let y = 7; y < H - 7; y++) for (let x = 7; x < W - 7; x++) {
    const i = idx(x, y); if (!main[i] || water[i] || (t[i] !== T.GRASS && t[i] !== T.SAND && t[i] !== T.TREE) || flat[i] < 0.25 || eN[i] > 0.8) continue;
    let fs = 0, c = 0; for (let b = -5; b <= 5; b += 2) for (let a = -5; a <= 5; a += 2) { fs += fert[idx(x + a, y + b)] * flat[idx(x + a, y + b)]; c++; }
    const wd = Math.min(dFresh[i], dSea[i]), wa = wd <= 3 ? 1 : 0.4 + 0.6 * Math.exp(-(wd - 3) / 8);
    let rel = 0; for (let b = -4; b <= 4; b += 4) for (let a = -4; a <= 4; a += 4) rel = Math.max(rel, Math.abs(eN[idx(x + a, y + b)] - eN[i]));
    const s = 0.9 * flat[i] + 1.1 * (fs / c) + 0.8 * wa + 1.0 * harbor[i] + 0.9 * bonus.mouth[i] + 0.8 * bonus.conf[i] + 0.4 * bonus.ford[i] + 0.3 * Math.min(1, rel / 0.1);
    site[i] = s * (0.25 + 0.75 * Math.pow(room[i], 2.2)); if (site[i] > smax) smax = site[i];
  }
  for (let i = 0; i < N; i++) site[i] /= smax || 1;
  // hinterland = how much good farmland a town could serve (box sum of fert*flat, radius 11 via integral image)
  const II = new Float64Array((W + 1) * (H + 1));
  for (let y = 0; y < H; y++) { let row = 0; for (let x = 0; x < W; x++) { row += main[idx(x, y)] && !water[idx(x, y)] ? fert[idx(x, y)] * flat[idx(x, y)] : 0; II[(y + 1) * (W + 1) + x + 1] = II[y * (W + 1) + x + 1] + row; } }
  const hint = new Float32Array(N); let hmx = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const x0 = Math.max(0, x - 11), x1 = Math.min(W, x + 12), y0 = Math.max(0, y - 11), y1 = Math.min(H, y + 12); const v = II[y1 * (W + 1) + x1] - II[y0 * (W + 1) + x1] - II[y1 * (W + 1) + x0] + II[y0 * (W + 1) + x0]; hint[idx(x, y)] = v; if (v > hmx) hmx = v; }
  for (let i = 0; i < N; i++) hint[i] /= hmx || 1;
  let cx = 0, cy = 0, cn = 0; for (let i = 0; i < N; i++) if (main[i] && !water[i]) { cx += i % W; cy += (i / W) | 0; cn++; } cx /= cn; cy /= cn;
  let maxDc = 1; for (let i = 0; i < N; i++) if (main[i]) maxDc = Math.max(maxDc, Math.hypot((i % W) - cx, ((i / W) | 0) - cy));

  const map = { W, H, seed, t, wk, h: eN, m: moist, rc, qm, pm, sea: sea, acc, thr, fert, flat, site, hint, settlements: [], plots: [], rm: new Uint8Array(N), ring: new Uint8Array(N), sid: new Int16Array(N).fill(-1) };
  map.idx = idx;

  /* ---- 6. settlements: capital on the best trade site, then towns/villages/hamlets by CPT spacing ---- */
  const fitsSquare = (x, y, tier) => {
    const [sw, sh] = SQ[tier], hw = (sw >> 1) + 1, hh = (sh >> 1) + 1;
    for (let b = -hh; b <= hh; b++) for (let a = -hw; a <= hw; a++) { const nx = x + a, ny = y + b; if (nx < 3 || ny < 3 || nx >= W - 3 || ny >= H - 3) return false; const k = idx(nx, ny); if (water[k] || t[k] === T.ROCK || pm[k] !== -1 || map.rm[k]) return false; }
    return true;
  };
  const place = (x, y, tier) => {
    const s = { id: map.settlements.length, tier, x, y, name: '', score: site[idx(x, y)], coastal: dSea[idx(x, y)] <= 8, river: dFresh[idx(x, y)] <= 7, trade: 0, R: URBAN_R[tier], need: 0, pop: 0 };
    map.settlements.push(s);
    const [sw, sh] = SQ[tier], hw = sw >> 1, hh = sh >> 1;
    for (let b = -hh - 1; b <= hh + 1; b++) for (let a = -hw - 1; a <= hw + 1; a++) {
      const k = idx(x + a, y + b), edge = Math.abs(a) === hw + 1 || Math.abs(b) === hh + 1;
      if (edge) { t[k] = T.ROAD; rc[k] = 2; map.ring[k] = 1; } else { t[k] = T.OPEN; pm[k] = -2; }
      map.sid[k] = s.id;
    }
    return s;
  };
  const trade = i => Math.max(harbor[i], bonus.mouth[i], bonus.conf[i], (dFresh[i] <= 2 && acc[nearRiver(i)] > thr * 2.5) ? 0.8 : 0);
  const nearRiver = i => { const x = i % W, y = (i / W) | 0; let best = i, bv = -1; for (let b = -3; b <= 3; b++) for (let a = -3; a <= 3; a++) { const nx = x + a, ny = y + b; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue; const k = idx(nx, ny); if (wk[k] === 3 && acc[k] > bv) { bv = acc[k]; best = k; } } return best; };
  // trade potential felt within ~9 tiles of a harbor / river mouth / confluence / navigable river (a capital needs a port nearby, not on a spit)
  const tn = new Float32Array(N);
  for (let i = 0; i < N; i++) { if (!main[i] || water[i]) continue; const v = trade(i); if (v < 0.45) continue; const x = i % W, y = (i / W) | 0;
    for (let b = -9; b <= 9; b++) for (let a = -9; a <= 9; a++) { const nx = x + a, ny = y + b; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue; const w = v * (1 - Math.hypot(a, b) / 10); if (w > tn[idx(nx, ny)]) tn[idx(nx, ny)] = w; } }
  { let bi = -1, bv = -1;
    for (let y = 9; y < H - 9; y++) for (let x = 9; x < W - 9; x++) {
      const i = idx(x, y); if (site[i] < 0.3 || tn[i] < 0.3 || room[i] < 0.62) continue;
      const cen = 1 - Math.hypot(x - cx, y - cy) / maxDc, v = site[i] * (0.35 + 0.65 * hint[i]) * (0.4 + 0.6 * cen) * (0.5 + 0.5 * tn[i]);
      if (v > bv && fitsSquare(x, y, 0)) { bv = v; bi = i; }
    }
    if (bi < 0) for (let y = 9; y < H - 9; y++) for (let x = 9; x < W - 9; x++) { const i = idx(x, y), v = site[i] * hint[i]; if (v > bv && fitsSquare(x, y, 0)) { bv = v; bi = i; } }
    const c = place(bi % W, (bi / W) | 0, 0); c.trade = tn[bi];
  }
  const cand = []; for (let i = 0; i < N; i++) if (site[i] > 0.24) cand.push(i);
  // fill the lattice: every pick maximizes site quality x how much uncovered market area it serves (farthest-point flavour of CPT)
  for (const [tier, maxN, minScore] of [[1, opt.towns || 4, 0.34], [2, opt.villages || 7, 0.3], [3, opt.hamlets || 9, 0.26]]) {
    for (let n = 0; n < maxN; n++) {
      let bi = -1, bv = 0;
      for (const i of cand) {
        if (site[i] < minScore) continue; const x = i % W, y = (i / W) | 0; let dmin = 1e9, ok = true;
        for (const s of map.settlements) { const d = Math.hypot(s.x - x, s.y - y); if (s.tier <= tier ? d < SPACING[tier] : d < SPACING[tier] * 0.75) { ok = false; break; } if (d < dmin) dmin = d; }
        if (!ok) continue;
        const v = site[i] * (0.3 + 0.7 * Math.min(1, dmin / (SPACING[tier] * 2.2))) * (0.5 + 0.5 * hint[i]);
        if (v > bv && fitsSquare(x, y, tier)) { bv = v; bi = i; }
      }
      if (bi < 0) break; const s = place(bi % W, (bi / W) | 0, tier); s.trade = trade(bi);
    }
  }
  // population shares: rank-size (1/rank) with a primate capital
  { const ss = map.settlements.slice().sort((a, b) => a.tier - b.tier || b.score - a.score); let tot = 0;
    ss.forEach((s, r) => { s.share = (s.tier === 0 ? 1.5 : 1) / (r + 1); tot += s.share; }); for (const s of map.settlements) s.share /= tot; }

  /* ---- 7. roads: least-cost orthogonal paths, reusing existing roads; bridges + fords where rivers must be crossed ---- */
  const gA = new Float32Array(N * 4), cA = new Int32Array(N * 4), clA = new Uint8Array(N * 4), TURN = 2.0;
  const tcost = (i, j) => {
    const tt = t[i]; let c;
    if (tt === T.ROAD || tt === T.BRIDGE) c = 0.35; else if (tt === T.FORD) c = 0.5; else if (tt === T.OPEN) c = 0.9; else if (tt === T.GRASS) c = 1; else if (tt === T.SAND) c = 1.1; else if (tt === T.TREE) c = 3;
    else if (tt === T.WATER) { if (wk[i] === 3) c = acc[i] < thr * 3.5 ? 5 : 16 + (acc[i] > big ? 14 : 0); else return 1e9; } else return 1e9;
    return c + Math.abs(eN[i] - eN[j]) * 55;
  };
  const route = (ax, ay, bx, by) => {
    gA.fill(1e9); cA.fill(-1); clA.fill(0);
    const hq = new Heap(), tgt = idx(bx, by), hf = (x, y) => (Math.abs(x - bx) + Math.abs(y - by)) * 0.34;
    for (let d = 0; d < 4; d++) { const s = idx(ax, ay) * 4 + d; gA[s] = 0; hq.push(hf(ax, ay), s); }
    let end = -1;
    while (hq.size) {
      const st = hq.pop(), i = st >> 2, d = st & 3; if (clA[st]) continue; clA[st] = 1; if (i === tgt) { end = st; break; }
      const x = i % W, y = (i / W) | 0, gc = gA[st];
      for (let q = 0; q < 4; q++) { const nx = x + D4[q][0], ny = y + D4[q][1]; if (nx < 1 || ny < 1 || nx >= W - 1 || ny >= H - 1) continue; const ni = idx(nx, ny), c = tcost(ni, i); if (c >= 1e8) continue; const ng = gc + c + (q !== d ? TURN : 0), ns = ni * 4 + q; if (ng < gA[ns]) { gA[ns] = ng; cA[ns] = st; hq.push(ng + hf(nx, ny), ns); } }
    }
    if (end < 0) return false;
    const path = []; for (let s = end; s >= 0; s = cA[s]) path.push(s >> 2);
    for (const i of path) {
      if (rc[i] < 255) rc[i]++;
      if (t[i] === T.WATER) t[i] = acc[i] < thr * 3.5 ? T.FORD : T.BRIDGE; else if (t[i] === T.GRASS || t[i] === T.SAND || t[i] === T.TREE) t[i] = T.ROAD;
    }
    return true;
  };
  const S = map.settlements, linked = new Set([0]), edges = new Set();
  const link = (a, b) => { if (route(a.x, a.y, b.x, b.y)) { edges.add(Math.min(a.id, b.id) * 100 + Math.max(a.id, b.id)); return true; } return false; };
  const order2 = S.slice(1).sort((a, b) => a.tier - b.tier || Math.hypot(a.x - S[0].x, a.y - S[0].y) - Math.hypot(b.x - S[0].x, b.y - S[0].y));
  for (const s of order2) {
    let best = null, bd = 1e9; for (const o of S) if (linked.has(o.id) && o.tier <= s.tier) { const d = Math.hypot(o.x - s.x, o.y - s.y); if (d < bd) { bd = d; best = o; } }
    if (!best) for (const o of S) if (linked.has(o.id)) { const d = Math.hypot(o.x - s.x, o.y - s.y); if (d < bd) { bd = d; best = o; } }
    if (best && link(s, best)) linked.add(s.id);
  }
  // loops: second-nearest neighbour for towns, sometimes villages
  for (const s of S) {
    if (s.tier > 2) continue; if (s.tier === 2 && R() > 0.45) continue;
    const near = S.filter(o => o !== s && o.tier <= Math.max(1, s.tier) && !edges.has(Math.min(s.id, o.id) * 100 + Math.max(s.id, o.id))).sort((a, b) => Math.hypot(a.x - s.x, a.y - s.y) - Math.hypot(b.x - s.x, b.y - s.y))[0];
    if (near && Math.hypot(near.x - s.x, near.y - s.y) < (s.tier === 2 ? 30 : 52)) link(s, near);
  }
  map.linked = linked;

  /* ---- 8. quays on shorelines, then streets + plots per settlement ---- */
  const L = makeLayout(map);
  for (const s of S) L.quay(s, R);
  for (const s of S) {
    s.needPlots = Math.round(Math.max(6, (map.pop || 480) * s.share / 4 * (s.tier === 3 ? 2.4 : s.tier === 2 ? 2.2 : 1.8)) + (s.tier <= 1 ? 12 : 4));
    // street skeleton first (so cross streets exist before frontage fills the flanks), then plots
    let guard = 0; while (L.roadTiles(s) < s.needPlots * 0.9 && guard++ < 500) L.branch(s, R, null, 0.12);
    L.frontage(s, R); guard = 0;
    while (L.freePlots(s) < s.needPlots && guard++ < 80) { if (L.branch(s, R, null, 0.5)) L.frontage(s, R); else break; }
  }
  for (const s of S) L.rural(s, R);
  return map;
}

function bfs(src, W, H, test) {
  const N = W * H, d = new Uint16Array(N).fill(65535), q = [];
  for (let i = 0; i < N; i++) if (test ? test(src[i]) : src[i]) { d[i] = 0; q.push(i); }
  for (let qi = 0; qi < q.length; qi++) { const c = q[qi], x = c % W, y = (c / W) | 0; for (const [a, b] of D4) { const nx = x + a, ny = y + b; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue; const ni = ny * W + nx; if (d[ni] === 65535) { d[ni] = d[c] + 1; q.push(ni); } } }
  return d;
}

/* ---------- layout: quay, street branches, frontage plots (reused at runtime for expansion) ---------- */
function makeLayout(map) {
  const { W, H, t, rc, pm, wk } = map, idx = (x, y) => y * W + x;
  const roadAt = i => t[i] === T.ROAD || t[i] === T.BRIDGE || t[i] === T.FORD;
  const okTile = i => (t[i] === T.GRASS || t[i] === T.SAND || t[i] === T.TREE) && pm[i] === -1;
  const inb = (x, y, m = 3) => x >= m && y >= m && x < W - m && y < H - m;
  const straight = (x, y) => { const u = roadAt(idx(x, y - 1)), d = roadAt(idx(x, y + 1)), l = roadAt(idx(x - 1, y)), r = roadAt(idx(x + 1, y)); if (l && r && !u && !d) return 0; if (u && d && !l && !r) return 1; return -1; };
  const isWaterAdj = (x, y) => { for (const [a, b] of D4) { const k = idx(x + a, y + b); if (t[k] === T.WATER) return true; } return false; };

  function fits(x0, y0) { for (let b = 0; b < 3; b++) for (let a = 0; a < 3; a++) { if (!inb(x0 + a, y0 + b, 2) || !okTile(idx(x0 + a, y0 + b))) return false; } return true; }
  function addPlot(s, x0, y0, dx, dy, rural, rnd) {
    const p = { id: map.plots.length, sid: s.id, x: x0, y: y0, dx, dy, rural: !!rural, used: false, dc: Math.hypot(x0 + 1 - s.x, y0 + 1 - s.y), sq: map.ring[idx(dx, dy)] === 1, quay: map.qm[idx(dx, dy)] === 1, fert: map.fert[idx(x0 + 1, y0 + 1)], bid: -1 };
    for (let b = 0; b < 3; b++) for (let a = 0; a < 3; a++) pm[idx(x0 + a, y0 + b)] = p.id;
    map.plots.push(p); (s.plots = s.plots || []).push(p.id); return p;
  }
  function frontage(s, R, rural, rIn, rOut) {
    const cand = [], rr = rural ? rOut : s.R, ri = rural ? rIn : 0;
    for (let y = Math.max(3, s.y - rr); y <= Math.min(H - 4, s.y + rr); y++) for (let x = Math.max(3, s.x - rr); x <= Math.min(W - 4, s.x + rr); x++) {
      const i = idx(x, y); if (t[i] !== T.ROAD) continue; const d = Math.hypot(x - s.x, y - s.y); if (d > rr || d < ri) continue;
      if (rural && map.sid[i] >= 0 && map.sid[i] !== s.id) continue;
      const ax = straight(x, y); if (ax < 0) continue;
      if (rural) { // only claim tiles for whichever settlement is closest
        let near = s, nd = d; for (const o of map.settlements) { const dd = Math.hypot(x - o.x, y - o.y); if (dd < nd) { nd = dd; near = o; } } if (near !== s) continue; }
      cand.push([d + R() * 2.5, x, y, ax]);
    }
    cand.sort((a, b) => a[0] - b[0]); let n = 0;
    for (const [, x, y, ax] of cand) for (const side of [-1, 1]) {
      let x0, y0; if (ax === 0) { x0 = x - 1; y0 = side < 0 ? y - 3 : y + 1; } else { x0 = side < 0 ? x - 3 : x + 1; y0 = y - 1; }
      if (!fits(x0, y0)) continue;
      if (rural && map.fert[idx(x0 + 1, y0 + 1)] < 0.3) continue;
      if (rural && R() < 0.35) continue;
      addPlot(s, x0, y0, x, y, rural, R); n++;
      if (!rural && s.tier >= 2 && R() < 0.3) { /* leave a gap */ }
    }
    return n;
  }
  function freePlots(s) { let n = 0; for (const id of s.plots || []) { const p = map.plots[id]; if (!p.used && !p.rural) n++; } return n; }
  // grow a street: either a perpendicular branch off a straight road tile (weighted by distance decay) or the
  // extension of a dead end (extW = how much the frontier is preferred). Parish-Muller flavour on a tile grid.
  function roadTilesIn(s) { let n = 0; for (let y = Math.max(1, s.y - s.R); y <= Math.min(H - 2, s.y + s.R); y++) for (let x = Math.max(1, s.x - s.R); x <= Math.min(W - 2, s.x + s.R); x++) if (t[idx(x, y)] === T.ROAD && Math.hypot(x - s.x, y - s.y) <= s.R) n++; return n; }
  function branch(s, R, ptsOut, extW) {
    const rr = s.R, lam = rr * 0.55, rm = map.rm, cands = [];
    for (let y = Math.max(4, s.y - rr); y <= Math.min(H - 5, s.y + rr); y++) for (let x = Math.max(4, s.x - rr); x <= Math.min(W - 5, s.x + rr); x++) {
      const i = idx(x, y); if (t[i] !== T.ROAD) continue; const d = Math.hypot(x - s.x, y - s.y); if (d > rr) continue;
      const ax = straight(x, y);
      if (ax >= 0 && !rm[i]) { cands.push({ w: Math.exp(-d / lam) * (0.35 + R()), x, y, ax, d, dirs: ax === 0 ? [[0, -1], [0, 1]] : [[-1, 0], [1, 0]], root: true }); continue; }
      let n = 0, ex = 0, ey = 0; for (const [a, b] of D4) if (roadAt(idx(x + a, y + b))) { n++; ex = -a; ey = -b; }
      if (n === 1 && !map.ring[i] && !map.qm[i] && t[idx(x + ex, y + ey)] !== T.BRIDGE) cands.push({ w: extW * (0.4 + R()) * (0.5 + d / rr), x, y, ax: -1, d, dirs: [[ex, ey]], root: false });
    }
    if (!cands.length) return false;
    cands.sort((a, b) => b.w - a.w);
    for (let ci = 0; ci < Math.min(10, cands.length); ci++) {
      const c = cands[ci], dirs = R() < 0.5 ? c.dirs : c.dirs.slice().reverse(); let okAny = false;
      for (const [dx, dy] of dirs) {
        if (okAny && R() < 0.35) continue;
        const lx = dy ? 1 : 0, ly = dx ? 1 : 0;
        const Lmax = Math.max(3, Math.round(BRANCH_L[s.tier] * (0.6 + 0.8 * R()) * (1 - 0.5 * c.d / rr))); const tiles = []; let join = false;
        for (let i = 1; i <= Lmax; i++) {
          const bx = c.x + dx * i, by = c.y + dy * i; if (!inb(bx, by, 3)) break; const k = idx(bx, by);
          if (roadAt(k)) { if (i >= 3) join = true; break; }
          if (!okTile(k)) break;
          if (i >= 2) { let bad = false; for (let k = 1; k <= 3 && !bad; k++) if (roadAt(idx(bx + lx * k, by + ly * k)) || roadAt(idx(bx - lx * k, by - ly * k))) bad = true; if (bad) break; }
          tiles.push(k);
        }
        if (tiles.length < (join ? 2 : 3)) continue;
        for (const k of tiles) { t[k] = T.ROAD; rc[k] = 1; map.sid[k] = s.id; if (ptsOut) ptsOut.push(k); }
        if (c.root) for (let a = -5; a <= 5; a++) { const k = c.ax === 0 ? idx(c.x + a, c.y) : idx(c.x, c.y + a); rm[k] = 1; }
        okAny = true;
      }
      if (okAny) return true;
    }
    return false;
  }
  // shoreline promenade for coastal/river settlements
  function quay(s, R) {
    let best = -1, bd = 1e9;
    for (let y = Math.max(4, s.y - 12); y <= Math.min(H - 5, s.y + 12); y++) for (let x = Math.max(4, s.x - 12); x <= Math.min(W - 5, s.x + 12); x++) {
      const i = idx(x, y); if (!okTile(i) || !isWaterAdj(x, y)) continue; if (wk[idx(x + 1, y)] === 3 || wk[idx(x - 1, y)] === 3 || wk[idx(x, y + 1)] === 3 || wk[idx(x, y - 1)] === 3) { if (s.tier > 1) continue; }
      const d = Math.hypot(x - s.x, y - s.y); if (d < bd && d > 4) { bd = d; best = i; }
    }
    if (best < 0 || s.tier > 1 || (!s.coastal && !s.river)) return;
    s.quayAt = best;
    let cur = best, dir = null; const seen = new Set([cur]), tiles = [cur];
    for (const sign of [1, -1]) {
      cur = best; dir = null;
      for (let step = 0; step < 7; step++) {
        const x = cur % W, y = (cur / W) | 0; let nxt = -1, bs = -1;
        for (const [a, b] of D4) { const nx = x + a, ny = y + b; if (!inb(nx, ny, 4)) continue; const k = idx(nx, ny); if (seen.has(k) || !okTile(k) || !isWaterAdj(nx, ny)) continue; const sc = (dir && dir[0] === a && dir[1] === b ? 2 : 0) + R() + (sign > 0 ? a + b : -(a + b)) * 0.3; if (sc > bs) { bs = sc; nxt = k; dir = [a, b]; } }
        if (nxt < 0) break; seen.add(nxt); tiles.push(nxt); cur = nxt;
      }
    }
    for (const k of tiles) { t[k] = T.ROAD; map.qm[k] = 1; rc[k] = 2; map.sid[k] = s.id; }
    // connect the quay to the square with a short least-cost tail (reuse of the main router isn't exposed, so L-shaped)
    let x = best % W, y = (best / W) | 0; const tx = s.x, ty = s.y; let guard = 0;
    while ((x !== tx || y !== ty) && guard++ < 40) {
      const stepX = x !== tx && (Math.abs(x - tx) > Math.abs(y - ty) || y === ty); const nx = x + (stepX ? Math.sign(tx - x) : 0), ny = y + (stepX ? 0 : Math.sign(ty - y)), k = idx(nx, ny);
      if (map.ring[k] || t[k] === T.OPEN) break;
      if (t[k] === T.WATER || t[k] === T.ROCK) break;
      if (t[k] === T.GRASS || t[k] === T.SAND || t[k] === T.TREE) { t[k] = T.ROAD; rc[k] = 1; map.sid[k] = s.id; }
      x = nx; y = ny;
    }
  }
  function rural(s, R) { frontage(s, R, true, s.R * 0.7, s.R + (s.tier === 0 ? 12 : s.tier === 1 ? 11 : 9)); }
  return { frontage: (s, R) => frontage(s, R || Math.random), branch: (s, R, out, w) => branch(s, R || Math.random, out, w === undefined ? 0.5 : w), roadTiles: roadTilesIn, freePlots, quay, rural: (s, R) => rural(s, R || Math.random), fits, addPlot };
}

/* runtime expansion: one more street + frontage; returns {tiles:[idx], plots:[plot]} */
function expand(map, s, R) {
  const L = map._L || (map._L = makeLayout(map)), before = map.plots.length, pts = [];
  let ok = false; for (let k = 0; k < 6 && !ok; k++) ok = L.branch(s, R, pts, 1.2);
  const n = L.frontage(s, R);
  return { tiles: pts, plots: map.plots.slice(before), ok: ok || n > 0 };
}
function freeUrbanPlots(map, s) { return (map._L || (map._L = makeLayout(map))).freePlots(s); }

const api = { T, TIERS, SQ, generate, expand, freeUrbanPlots, Noise, mk, makeLayout };
if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Gen = api;
})(typeof window !== 'undefined' ? window : globalThis);
