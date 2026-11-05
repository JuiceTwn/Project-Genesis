/* Canvas 2D renderer: the procedural map (terrain layer, buildings, dots, labels, weather, speech bubbles).
   Everything it draws comes from the RenderView, the Theme (colours, icons, sprite names) and optionally a SpriteAtlas and a terrain painter,
   so a new look is a new Theme/atlas, and a new graphics API is a new Renderer behind the same interface. */
import { CATALOG } from '../../sim/personality';
import { THEME, type Theme } from './theme';
import { SpriteAtlas } from './sprites';
import type { Renderer, RenderView, TerrainPainter, DotView, Bubble } from './types';
import type { BldView, SettView, StatsMsg, DetailMsg } from '../../shared/protocol';
import type { Camera } from './camera';

const TRI = Object.fromEntries(CATALOG.map(t => [t.id, t.emoji]));
const T0 = 12;
interface LabelItem { d: DotView; x: number; y: number; R: number; pri: number }
const clamp01 = (v: number) => v < 0 ? 0 : v > 1 ? 1 : v;

export interface Canvas2DOptions { theme?: Theme; sprites?: SpriteAtlas; terrain?: TerrainPainter }

/** Wrap a speech line to a few short rows so long sentences stay readable. */
function wrapLine(c: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const words = text.split(' '), rows: string[] = []; let row = '';
  for (const wd of words) { const t = row ? row + ' ' + wd : wd; if (row && c.measureText(t).width > maxW) { rows.push(row); row = wd; } else row = t; }
  if (row) rows.push(row); return rows.slice(0, 4);
}

export function createCanvas2DRenderer(cv: HTMLCanvasElement, opts: Canvas2DOptions = {}): Renderer {
  const ctx = cv.getContext('2d')!, theme = opts.theme ?? THEME, atlas = opts.sprites ?? SpriteAtlas.empty;
  let v: RenderView;
  /* The view's fields, rebound at the start of every frame so the drawing code below can use plain names. */
  let cam: Camera, W = 0, H = 0, tiles = '', wk = '', el: Uint8Array = new Uint8Array(0);
  let setts: SettView[] = [], blds: BldView[] = [], dots: DotView[] = [], stat: StatsMsg | null = null, detail: DetailMsg | null = null;
  let sel = -1, dens: Uint8Array | null = null, denseW = 0, denseH = 0, tod = 0, bubbles: Bubble[] = [], occ: number[] = [];
  let cssW = 0, cssH = 0, dpr = 1;
  const sc = () => cam.sc(), toS = (x: number, y: number) => cam.toS(x, y), viewCX = () => cam.viewCX(), viewCY = () => cam.viewCY(), viewW = () => cam.viewW();
  function bind(view: RenderView) {
    v = view; cam = view.camera; W = view.W; H = view.H; tiles = view.tiles; wk = view.wk; el = view.el;
    setts = view.setts; blds = view.blds; dots = view.dots; stat = view.stat; detail = view.detail; sel = view.sel;
    dens = view.dens; denseW = view.denseW; denseH = view.denseH; tod = view.tod; bubbles = view.bubbles; occ = view.occ;
    cssW = cam.cssW; cssH = cam.cssH; dpr = cam.dpr;
  }
  let stat0: HTMLCanvasElement | null = null, terrDirty = false, terrAt = 0, shoreD: Uint8Array | null = null;
  const parts: { x: number; y: number; v: number }[] = [];   // weather particles

  function hash(x: number, y: number) { let h = (x * 374761393 + y * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
  function calcShore() { // distance of water cells from land (for depth shading)
    shoreD = new Uint8Array(W * H).fill(255); const q: number[] = [];
    for (let i = 0; i < W * H; i++) if (wk[i] === '0') { shoreD[i] = 0; q.push(i); }
    for (let h = 0; h < q.length; h++) { const i = q[h], x = i % W, y = (i / W) | 0, d = shoreD[i] + 1; if (d > 12) continue;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue; const j = ny * W + nx; if (shoreD[j] > d) { shoreD[j] = d; q.push(j); } } }
  }
  const E = (x: number, y: number) => el[Math.max(0, Math.min(H - 1, y)) * W + Math.max(0, Math.min(W - 1, x))] / 255;
  const isW = (x: number, y: number) => x < 0 || y < 0 || x >= W || y >= H ? true : wk[y * W + x] !== '0';
  function mix(a: number[], b: number[], t: number) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
  const css = (c: number[]) => `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;
  function buildStatic() {
    if (!shoreD) calcShore();
    if (!stat0) { stat0 = document.createElement('canvas'); stat0.width = W * T0; stat0.height = H * T0; }
    const g = stat0.getContext('2d'), T = tiles;
    if (opts.terrain) { opts.terrain(g, v, T0); terrDirty = false; return; }   // a replacement terrain painter takes over completely
    const tt = (x: number, y: number) => (x < 0 || y < 0 || x >= W || y >= H) ? -1 : +T[y * W + x];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x, t = +T[i], r = hash(x, y), w = wk[i], px = x * T0, py = y * T0;
      let c;
      if (w !== '0') { // water
        const d = shoreD[i], deep = Math.min(1, d / 9);
        c = w === '1' ? mix([86, 160, 196], [28, 74, 120], deep) : w === '2' ? mix([96, 168, 200], [52, 118, 164], Math.min(1, d / 5)) : [84, 158, 204];
        c = mix(c, [255, 255, 255], r * 0.025);
      } else {
        const h = E(x, y), sh = (E(x - 1, y - 1) - E(x + 1, y + 1)) * 5.5;
        const base = t === 8 ? [214, 198, 148] : t === 9 ? [128, 126, 120] : mix(mix([88, 138, 78], [124, 150, 84], Math.min(1, h * 1.8)), [150, 130, 96], Math.max(0, h - 0.55) * 2.2);
        c = [base[0] + sh * 30 + (r - .5) * 7, base[1] + sh * 30 + (r - .5) * 7, base[2] + sh * 26 + (r - .5) * 6];
        if (t === 2) c = mix(c, [128, 108, 80], 0.55);
        if (t === 4) c = [176, 160, 130];
      }
      g.fillStyle = css(c); g.fillRect(px, py, T0 + 0.5, T0 + 0.5);
    }
    // shoreline foam + coast shading
    g.fillStyle = 'rgba(255,255,255,.55)';
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (wk[y * W + x] !== '0') {
      const px = x * T0, py = y * T0;
      if (!isW(x, y - 1)) g.fillRect(px, py, T0, 1.6); if (!isW(x, y + 1)) g.fillRect(px, py + T0 - 1.6, T0, 1.6);
      if (!isW(x - 1, y)) g.fillRect(px, py, 1.6, T0); if (!isW(x + 1, y)) g.fillRect(px + T0 - 1.6, py, 1.6, T0);
    }
    // trees
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (+T[y * W + x] === 5) {
      const px = x * T0, py = y * T0, r = hash(x + 9, y + 3), r2 = hash(x + 4, y + 8);
      for (let k = 0; k < 2; k++) { const cx = px + 3 + (k ? r : r2) * 6 + k * 1.5, cy = py + 3.5 + (k ? r2 : r) * 5 + k * 1.5, rad = 3.6 + (k ? r : r2) * 1.6;
        g.fillStyle = 'rgba(10,40,20,.35)'; g.beginPath(); g.arc(cx + 1, cy + 1.4, rad, 0, 7); g.fill();
        g.fillStyle = `hsl(${120 + r * 20},${34 + r2 * 8}%,${23 + k * 4 + r * 4}%)`; g.beginPath(); g.arc(cx, cy, rad, 0, 7); g.fill();
        g.fillStyle = 'rgba(190,230,140,.18)'; g.beginPath(); g.arc(cx - 1, cy - 1.2, rad * 0.5, 0, 7); g.fill(); }
    }
    // roads (connected strips) / bridges / fords / squares
    const link = (x: number, y: number) => { const t = tt(x, y); return t === 1 || t === 6 || t === 7 || t === 4; };
    const strip = (x: number, y: number, wd: number, col: string) => {
      const cx = x * T0 + T0 / 2, cy = y * T0 + T0 / 2, hw = wd / 2; g.fillStyle = col; g.fillRect(cx - hw, cy - hw, wd, wd);
      if (link(x + 1, y)) g.fillRect(cx, cy - hw, T0 / 2 + 0.5, wd); if (link(x - 1, y)) g.fillRect(x * T0 - 0.5, cy - hw, T0 / 2 + 0.5, wd);
      if (link(x, y + 1)) g.fillRect(cx - hw, cy, wd, T0 / 2 + 0.5); if (link(x, y - 1)) g.fillRect(cx - hw, y * T0 - 0.5, wd, T0 / 2 + 0.5);
    };
    for (const pass of [0, 1]) for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const t = tt(x, y); if (t !== 1 && t !== 6 && t !== 7) continue;
      if (t === 6) { if (pass === 0) { g.fillStyle = 'rgba(30,20,10,.45)'; g.fillRect(x * T0 - 0.5, y * T0 + 1, T0 + 1, T0 + 1); } strip(x, y, pass ? 7 : 9, pass ? '#a07f55' : '#4a3a28'); }
      else if (t === 7) strip(x, y, pass ? 6 : 8, pass ? '#cdbb8a' : 'rgba(255,255,255,.4)');
      else strip(x, y, pass ? 5.5 : 7.5, pass ? '#c9b895' : '#6e6350');
    }
    // plaza cobbles
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (+T[y * W + x] === 4) { const r = hash(x, y * 3); g.fillStyle = 'rgba(90,70,50,.15)'; g.fillRect(x * T0 + r * 8, y * T0 + ((r * 91) % 1) * 9, 2, 2); }
    terrDirty = false;
  }
  function drawBld(b: BldView, s: number, now: number) {
    const [px, py] = toS(b.x, b.y), w = b.w * s, h = b.h * s;
    if (px > cssW + 4 || py > cssH + 4 || px + w < -4 || py + h < -4) return;
    const r = hash(b.x, b.y), st = b.st, ty = b.ty, ex = Math.max(1, s * 0.07);
    const sp = theme.sprites.building(b), drew = sp ? atlas.draw(ctx, sp, px, py, w, h) : false;   // sprite from the atlas, if the theme names one and it exists
    if (drew) { /* sprite replaces the procedural body */ } else if (ty === 1) { // farm: tilled field
      ctx.fillStyle = st === 2 ? '#6b6a45' : '#7a6338'; ctx.fillRect(px, py, w, h);
      ctx.strokeStyle = st === 2 ? '#8d8c5f' : '#a8944f'; ctx.lineWidth = Math.max(1, s * 0.12);
      for (let i = 0.5; i < b.w; i += 0.75) { ctx.beginPath(); ctx.moveTo(px + i * s, py + s * .1); ctx.lineTo(px + i * s, py + h - s * .1); ctx.stroke(); }
    } else if (ty === 5) { // park / square
      ctx.fillStyle = '#4d9a58'; ctx.fillRect(px, py, w, h); ctx.strokeStyle = '#b8a57e'; ctx.lineWidth = Math.max(1, s * .18);
      ctx.beginPath(); ctx.moveTo(px, py + h / 2); ctx.lineTo(px + w, py + h / 2); ctx.moveTo(px + w / 2, py); ctx.lineTo(px + w / 2, py + h); ctx.stroke();
      ctx.fillStyle = '#8fd0e3'; ctx.beginPath(); ctx.arc(px + w / 2, py + h / 2, Math.min(w, h) * .2, 0, 7); ctx.fill(); ctx.fillStyle = '#e8f6fb'; ctx.beginPath(); ctx.arc(px + w / 2, py + h / 2, Math.min(w, h) * .08, 0, 7); ctx.fill();
    } else if (ty === 7) { // dock: pier planks
      ctx.fillStyle = '#6b5236'; ctx.fillRect(px, py, w, h); ctx.strokeStyle = '#947653'; ctx.lineWidth = 1;
      for (let i = 0.3; i < b.h; i += 0.5) { ctx.beginPath(); ctx.moveTo(px, py + i * s); ctx.lineTo(px + w, py + i * s); ctx.stroke(); }
      ctx.fillStyle = '#3f3020'; ctx.fillRect(px, py, ex * 2, ex * 2); ctx.fillRect(px + w - ex * 2, py + h - ex * 2, ex * 2, ex * 2);
    } else {
      const body = ty === 0 ? theme.houses[(r * theme.houses.length) | 0] : (theme.buildingBody[ty] ?? theme.buildingDefault);
      ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.fillRect(px + s * .12, py + s * .18, w, h);
      ctx.fillStyle = st === 1 ? 'rgba(200,170,110,.35)' : body; ctx.fillRect(px, py, w, h);
      if (st !== 1) { ctx.fillStyle = 'rgba(0,0,0,.2)'; ctx.fillRect(px, py, w, h * .3); ctx.fillStyle = 'rgba(255,255,255,.2)'; ctx.fillRect(px, py, w, Math.max(1, h * .1));
        ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.fillRect(px + w / 2 - ex / 2, py, ex, h * .5);
        if (ty === 6) { ctx.fillStyle = '#d6b44c'; ctx.fillRect(px, py, w, Math.max(1, ex * 1.4)); } }
      if (st !== 1 && b.d) { ctx.fillStyle = '#2a2018'; const dx = (b.d[0] - b.x + 0.5) * s, dy = (b.d[1] - b.y + 0.5) * s;
        if (b.d[1] >= b.y + b.h) ctx.fillRect(px + dx - s * .17, py + h - s * .25, s * .34, s * .25); else if (b.d[1] < b.y) ctx.fillRect(px + dx - s * .17, py, s * .34, s * .25);
        else if (b.d[0] < b.x) ctx.fillRect(px, py + dy - s * .17, s * .25, s * .34); else ctx.fillRect(px + w - s * .25, py + dy - s * .17, s * .25, s * .34); }
    }
    if (st === 1) { // scaffold
      ctx.strokeStyle = '#e8c15a'; ctx.lineWidth = Math.max(1, s * .1); ctx.setLineDash([s * .35, s * .25]); ctx.strokeRect(px + 1, py + 1, w - 2, h - 2); ctx.setLineDash([]);
      ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + w, py + h); ctx.moveTo(px + w, py); ctx.lineTo(px, py + h); ctx.globalAlpha = .45; ctx.stroke(); ctx.globalAlpha = 1;
    } else if (st === 2) { // vacant / boarded
      ctx.fillStyle = 'rgba(40,40,50,.45)'; ctx.fillRect(px, py, w, h); ctx.strokeStyle = '#3b2e22'; ctx.lineWidth = Math.max(1, s * .14);
      ctx.beginPath(); ctx.moveTo(px + w * .15, py + h * .2); ctx.lineTo(px + w * .85, py + h * .8); ctx.moveTo(px + w * .85, py + h * .2); ctx.lineTo(px + w * .15, py + h * .8); ctx.stroke();
    }
    if (drew) { /* no emoji icon on a sprite */ } else if (s > 10 && ty !== 0 && ty !== 1 && st === 0 && !(ty === 7)) { ctx.font = `${Math.min(24, s * 1.15)}px system-ui,"Apple Color Emoji","Noto Color Emoji"`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(theme.buildingIcon[ty], px + w / 2, py + h / 2 + s * .08); }
    else if (s > 10 && ty === 7) { ctx.font = `${Math.min(18, s)}px system-ui,"Apple Color Emoji"`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('⚓', px + w / 2, py + h / 2); }
    else if (s > 12 && st === 1) { ctx.font = `${Math.min(20, s)}px system-ui,"Apple Color Emoji"`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('🚧', px + w / 2, py + h / 2); }
    if (st === 0 && ty !== 1 && ty !== 5 && ty !== 7 && occ[b.i] > 0 && dark() > 0.1) { ctx.fillStyle = `rgba(255,214,120,${0.6 * dark() / 0.52})`; ctx.fillRect(px + w * .18, py + h * .45, s * .5, s * .45); if (w > s * 2) ctx.fillRect(px + w * .62, py + h * .45, s * .5, s * .45); }
  }
  
  function dark() { const h = tod * 24; if (h < 5 || h >= 21) return 0.52; if (h < 7.5) return 0.52 * (7.5 - h) / 2.5; if (h >= 18.5) return 0.52 * (h - 18.5) / 2.5; return 0; }
  function rr(x: number, y: number, w: number, h: number, r: number) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  
  /* Dot labels with collision avoidance: nearest-to-centre first, skip any that would overlap one already placed. */
  function drawLabels(q: LabelItem[], s: number) {
    if (!q.length) return;
    q.sort((a, b) => a.pri - b.pri);
    const boxes: number[][] = [], hit = (x0: number, y0: number, x1: number, y1: number) => { for (const b of boxes) if (x0 < b[2] && x1 > b[0] && y0 < b[3] && y1 > b[1]) return true; return false; };
    const MAX = 28; let named = 0;
    ctx.textAlign = 'center';
    for (const { d, x, y, R, pri } of q) {
      const forced = pri < 0;
      if (!forced && named >= MAX) break;
      if (d.fl & 32) continue;
      let placedName = false;
      if (forced || (s > 22 && pri < viewW() * 0.3)) {
        ctx.font = '11px system-ui';
        const w = ctx.measureText(d.name).width + 4, x0 = x - w / 2, y0 = y + R + 1, y1 = y0 + 13;
        if (forced || !hit(x0, y0, x0 + w, y1)) { boxes.push([x0, y0, x0 + w, y1]); ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.fillText(d.name, x, y + R + 11); placedName = true; named++; }
      }
      if (d.traits.length && (forced || placedName || s > 16)) {
        const fs = Math.min(14, s * 0.7), x0 = x - fs / 2, y0 = y - R - 3 - fs, x1 = x + fs / 2, y1 = y - R - 1;
        if (forced || !hit(x0, y0, x1, y1)) { boxes.push([x0, y0, x1, y1]); ctx.font = `${fs}px "Apple Color Emoji","Noto Color Emoji",system-ui`; ctx.fillStyle = '#fff'; ctx.fillText(TRI[d.traits[0]], x, y - R - 3); }
      }
    }
  }
  
  function frame(view: RenderView, now: number) {
    bind(view);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = theme.sea; ctx.fillRect(0, 0, cssW, cssH);   // deep sea beyond the coast (the map floats under the UI)
  const s = sc(), [ox, oy] = toS(0, 0);
  if (!stat0 || (terrDirty && now - terrAt > 400)) { terrAt = now; buildStatic(); }
  ctx.imageSmoothingEnabled = true; ctx.drawImage(stat0, ox, oy, W * s, H * s);
  for (const b of blds) if (b.st !== 3) drawBld(b, s, now);
  const TINT = theme.seasonTint, se = stat ? stat.season : 0, wx = stat ? stat.weather : 0;
  if (TINT[se]) { ctx.fillStyle = TINT[se]; ctx.fillRect(ox, oy, W * s, H * s); }
  const dk = Math.min(0.7, dark() + (wx ? 0.1 : 0));
  if (dk > 0) { ctx.fillStyle = `rgba(${theme.nightRGB},${dk})`; ctx.fillRect(ox, oy, W * s, H * s); }
  // settlement labels
  if (s < 26) { ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; const al = s < 18 ? 1 : (26 - s) / 8;
    for (const t of setts) { const [lx, ly] = toS(t.x + .5, t.y + .5), fs = [15, 12.5, 11, 10][t.t] * (s < 7 ? 1 : 1);
      ctx.globalAlpha = al; ctx.font = `700 ${fs}px system-ui`; const lbl = (t.t === 0 ? '★ ' : '') + t.n + (stat && stat.towns && stat.towns[t.i] && stat.towns[t.i][2] ? ' · ' + stat.towns[t.i][2] : '');
      ctx.lineWidth = 3; ctx.strokeStyle = theme.label.halo; ctx.strokeText(lbl, lx, ly - 2.2 * s - 6); ctx.fillStyle = t.t === 0 ? theme.label.capital : theme.label.other; ctx.fillText(lbl, lx, ly - 2.2 * s - 6); ctx.globalAlpha = 1; } }
  // building labels when zoomed
  if (s > 12) { ctx.font = `600 ${Math.min(13, s * 0.7)}px system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; for (const b of blds) if (b.n && b.ty !== 1 && b.st !== 3) { const [bx, by] = toS(b.x + 1.5, b.y - 0.2); if (bx > -50 && bx < cssW + 50 && by > -20 && by < cssH + 20) { ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillText(b.n, bx + 1, by + 1); ctx.fillStyle = '#f2f5fb'; ctx.fillText(b.n, bx, by); } } }
  // friend lines
  if (sel >= 0 && detail && detail.id === sel) {
    const a = dots[sel], [ax, ay] = toS(a.x, a.y); ctx.strokeStyle = 'rgba(255,130,180,.6)'; ctx.lineWidth = 1.5; ctx.setLineDash([4, 4]);
    for (const [fid] of detail.friends) { const f = dots[fid]; if (f.fl & 1) continue; const [fx, fy] = toS(f.x, f.y); ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(fx, fy); ctx.stroke(); }
    ctx.setLineDash([]);
    if (detail.pid >= 0) { const f = dots[detail.pid]; if (!(f.fl & 1)) { const [fx, fy] = toS(f.x, f.y); ctx.strokeStyle = 'rgba(255,70,110,.9)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(fx, fy); ctx.stroke(); } }
  }
  // zoomed-out overview: a warm glow where people are
  if (dens) {
    ctx.fillStyle = 'rgba(255,214,120,0.5)';
    for (let cy = 0; cy < denseH; cy++) for (let cx = 0; cx < denseW; cx++) {
      const c = dens[cy * denseW + cx]; if (!c) continue;
      const [x, y] = toS((cx + 0.5) * 8, (cy + 0.5) * 8); if (x < -20 || y < -20 || x > cssW + 20 || y > cssH + 20) continue;
      ctx.beginPath(); ctx.arc(x, y, Math.min(s * 4.5, 2 + Math.sqrt(c) * s * 0.3), 0, 6.283); ctx.fill();
    }
  }
  // dots
  const R0 = Math.max(1.9, s * 0.34), lblQ = [];
  for (const d of dots) {
    if (d.fl & 65) continue;
    const [x, y] = toS(d.x, d.y); if (x < -10 || y < -10 || x > cssW + 10 || y > cssH + 10) continue;
    const act = (d.fl >> 1) & 7, R = (d.fl & 128) ? R0 * 0.68 : R0;
    const dsp = theme.sprites.dot(d.job);
    if (!(dsp && atlas.drawCentered(ctx, dsp, x, y, R * 3))) {   // sprite if the theme names one and the atlas has it, else the coloured ring
      ctx.fillStyle = d.col; ctx.beginPath(); ctx.arc(x, y, R, 0, 7); ctx.fill();
      ctx.strokeStyle = (d.fl & 128) ? 'rgba(255,255,255,.7)' : theme.jobRing[d.job]; ctx.lineWidth = Math.max(1, R * 0.38); ctx.stroke();
    }
    if (d.fl & 16) { ctx.fillStyle = '#ffe27a'; ctx.fillRect(x - R * .4, y - R * 1.7, R * .8, R * .8); }
    if (act === 7 && !(d.fl & 32)) { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x + R * 1.1, y - R * 1.1, Math.max(1.3, R * .38), 0, 7); ctx.fill(); }
    if (d.fl & 32) { ctx.strokeStyle = '#ff4d3d'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, R + 3 + Math.abs(Math.sin(now / 90)) * 3, 0, 7); ctx.stroke(); if (s > 7) { ctx.font = `${Math.max(11, R * 3)}px "Apple Color Emoji","Noto Color Emoji",system-ui`; ctx.textAlign = 'center'; ctx.fillStyle = '#fff'; ctx.fillText('💥', x, y - R - 6); } }
    if (d.id === sel || s > 16) lblQ.push({ d, x, y, R, pri: d.id === sel ? -1 : Math.hypot(x - viewCX(), y - viewCY()) });
  }
  drawLabels(lblQ, s);
  const R = R0;
  if (sel >= 0) { const d = dots[sel], [x, y] = toS(d.x, d.y); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, R + 4 + Math.sin(now / 200) * 1.2, 0, 7); ctx.stroke(); }
  // weather
  if (wx) {
    if (!parts.length) for (let i = 0; i < 110; i++) parts.push({ x: Math.random() * 1000, y: Math.random() * 1000, v: 0.6 + Math.random() });
    ctx.strokeStyle = wx === 2 ? 'rgba(255,255,255,.85)' : 'rgba(170,200,255,.55)'; ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = 1;
    for (const q of parts) {
      q.y += (wx === 2 ? 1.2 : 7) * q.v; q.x += (wx === 2 ? Math.sin(now / 700 + q.v * 9) * 0.5 : -1.5) * q.v; if (q.y > cssH) { q.y = -8; q.x = Math.random() * cssW; } if (q.x < 0) q.x += cssW; if (q.x > cssW) q.x -= cssW;
      if (wx === 2) { ctx.beginPath(); ctx.arc(q.x % cssW, q.y, 1.6 * q.v, 0, 7); ctx.fill(); } else { ctx.beginPath(); ctx.moveTo(q.x % cssW, q.y); ctx.lineTo((q.x % cssW) - 2, q.y + 8); ctx.stroke(); }
    }
  }
  // bubbles
  const list = bubbles.length > 16 ? bubbles.slice(-16) : bubbles;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const b of list) {
    let wx, wy;
    if (b.d !== undefined) { const d = dots[b.d]; if (d.fl & 65) continue; wx = d.x; wy = d.y; } else { const B = blds[b.b]; wx = B.x + 1.5; wy = B.y + 0.5; }
    const [x, y0] = toS(wx, wy), age = now - b.t0, life = (b.d === sel && sel >= 0 ? 5200 : 3200) + b.text.length * 40;
    const a = age < 250 ? age / 250 : age > life - 400 && !(b.d === sel) ? Math.max(0, (life - age) / 400) : 1;
    const fs = Math.max(10, Math.min(13, s * 0.8)), y = y0 - R - 6 - Math.min(10, age / 60);
    ctx.globalAlpha = a; ctx.font = `600 ${fs}px system-ui`;
    const rows = wrapLine(ctx, b.text, 150), w = Math.max(...rows.map(r => ctx.measureText(r).width)) + 12, lh = fs + 2, h = rows.length * lh + 6;
    ctx.fillStyle = 'rgba(250,250,252,.95)'; rr(x - w / 2, y - h, w, h, 6); ctx.fill();
    ctx.beginPath(); ctx.moveTo(x - 4, y); ctx.lineTo(x + 4, y); ctx.lineTo(x, y + 5); ctx.fill();
    ctx.fillStyle = '#1b2230'; rows.forEach((r, i) => ctx.fillText(r, x, y - h + 3 + lh * (i + 0.5)));
    ctx.globalAlpha = 1;
  }
  }

  function resize(w: number, h: number, ratio: number) {
    cv.style.width = w + 'px'; cv.style.height = h + 'px'; cv.width = w * ratio; cv.height = h * ratio;
  }
  return { resize, terrainChanged() { terrDirty = true; }, frame };
}
