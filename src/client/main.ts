// Client for Dotville. Messages are typed by ../shared/protocol.ts.
import { CATALOG, TRAIT } from '../sim/personality';
import { renderIssue, GAZETTE_CSS } from '../shared/gazette';
import { rollKey } from '../shared/feed';
import { DAY_TICKS } from '../shared/reality';
import type { ServerMsg, ClientMsg, EvMsg, InitMsg, BldView, SettView, StatsMsg, DetailMsg, ArcView } from '../shared/protocol';
declare const Sim: any;   // provided by demo.ts when running without a server
(() => {
'use strict';
const $ = (s: string): any => document.querySelector(s);   // any: the page's elements are known by id, not by type
const LOCAL = !!window.__LOCAL__ || /[?&]local/.test(location.search);
const JOBCOL = ['#7bd36b', '#f0a74a', '#b98cf0', '#59b6ee'];
/** A dot as the client sees it: identity from the init/born messages, motion state filled in by each frame. */
interface DotView { id: number; name: string; job: number; home: number; traits: string[]; col: string; x: number; y: number; tx: number; ty: number; fx: number; fy: number; t0: number; fl: number; seen: boolean; wasSeen?: boolean; [k: string]: any }
let W: number, H: number, tiles: string, wk: string, el: Uint8Array, setts: SettView[] = [], blds: BldView[] = [], dots: DotView[] = [], lex: any[] = [], names: string[] = [], fams: string[] = [], bnames: string[] = [], JOBS: string[] = [], BTN: string[] = [];
let tod = 0.3, day = 1, occ = [], sel = -1, follow = false, translate = true, bubbles = [], statsM = null;
let stat: StatsMsg | null = null, detail: DetailMsg | null = null, ready = false, lastClock = '';
const TRI = Object.fromEntries(CATALOG.map(t => [t.id, t.emoji]));
const parts = [];
let castList = [], watched = new Set<number>(JSON.parse(localStorage.getItem('dv-watch') || '[]')), auto = true, userAt = -1e9, dirUntil = 0, dirIds = null, lastShot = -1e9, deadTimer = null, tab = 'feed';
const colFor = n => { let x = 7; for (let i = 0; i < n.length; i++) x = (x * 31 + n.charCodeAt(i)) % 3600; return `hsl(${x / 10},68%,62%)`; };
const cam = { x: 0, y: 0, z: 1 }; let camTarget = null;
const cv = $('#c'), ctx = cv.getContext('2d');
let cssW = 300, cssH = 200, fit = 5, dpr = 1;
/** Pixels of the canvas covered by floating UI (HUD on top, drawer on the right, sheet at the bottom). The camera centres on what is left. */
const inset = { t: 0, r: 0, b: 0 }, insetCur = { t: 0, r: 0, b: 0 };
const viewCX = () => (cssW - insetCur.r) / 2, viewCY = () => insetCur.t + (cssH - insetCur.t - insetCur.b) / 2;
const viewW = () => cssW - insetCur.r, viewH = () => cssH - insetCur.t - insetCur.b;

/* ---------- transport ---------- */
let ws = null, localWorld = null, localSpeed = 1, localIv = null;
function send(m: ClientMsg) { if (LOCAL) localSend(m); else if (ws && ws.readyState === 1) ws.send(JSON.stringify(m)); }
function connect() {
  ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host);
  ws.binaryType = 'arraybuffer';
  /* Binary frames start with a type byte: 1 = world frame, 2 = gzip-compressed JSON message (the big init). */
  let chain = null;   // keeps messages in order while the compressed init is still being unzipped
  const process = d => { if (typeof d === 'string') handle(JSON.parse(d)); else frame(d); };
  ws.onmessage = e => {
    const d = e.data;
    if (typeof d !== 'string' && new Uint8Array(d, 0, 1)[0] === 2) { chain = gunzip(d.slice(1)).then(t => { handle(JSON.parse(t)); chain = null; }); return; }
    if (chain) chain = chain.then(() => process(d)); else process(d);
  };
  ws.onclose = () => { $('#live').textContent = 'reconnecting…'; setTimeout(connect, 1500); };
  ws.onopen = () => { if (sel >= 0) send({ t: 'sel', id: sel }); for (const id of watched) send({ t: 'watch', id, on: true }); };
}
function startLocal() {
  localWorld = new Sim.World({});
  handle(localWorld.initMsg());
  $('#bSpd').style.display = ''; $('#live').textContent = 'DEMO';
  localIv = setInterval(localTick, 200);
}
function localTick() {
  {
    for (let i = 0; i < localSpeed; i++) { localWorld.step(); if (localWorld.tick % 5 === 0 && i < localSpeed - 1) { const q = localWorld.drain(); if (q.length) handle({ t: 'batch', m: q }); } }
    frame(localWorld.frameFor(curView, localWorld.relatedIds(sel)));
    let ms = localWorld.drain(); if (ms.length > 400) ms = ms.slice(-400);
    if (ms.length) handle({ t: 'batch', m: ms });
    if (localWorld.tick % 5 === 0) { const s = localWorld.statsMsg(); s.viewers = 1; handle(s); if (sel >= 0) handle(localWorld.detail(sel)); }
  }
}
function localSend(m) { if (m.t === 'act') localWorld.act(m.n, m.id); else if (m.t === 'view') curView = m; else if (m.t === 'cast') handle({ t: 'cast', list: localWorld.cast(14) }); }

/* ---------- messages ---------- */
function handle(m: ServerMsg) {
  switch (m.t) {
    case 'init': init(m); break;
    case 'batch': for (const x of m.m) handle(x); break;
    case 'ev': ticker(m); if (LOCAL && m.w >= 2 && m.ids) { const id = m.ids.find(i => watched.has(i)); if (id !== undefined) toast(id, m.x); } break;
    case 'say': say(m); break;
    case 'born': dots[m.id] = Object.assign(dots[m.id] || { id: m.id, x: 0, y: 0, tx: 0, ty: 0, fx: 0, fy: 0, t0: 0, fl: 64 }, { name: m.name, job: m.j, home: m.h, traits: m.tr || [], seen: false, col: colFor(m.name) }); names[m.id] = m.name; fams[m.id] = m.f || ''; break;
    case 'bld': bldUpd(m); break;
    case 'tiles': { const a = tiles.split(''); for (const [i, v] of m.c) a[i] = String(v); tiles = a.join(''); terrDirty = true; break; }
    case 'stats': stat = m; arcs = m.arcs || arcs; hud(); break;
    case 'chron': addChron(m.e, true); break;
    case 'rename': if (dots[m.id]) { dots[m.id].name = m.name; names[m.id] = m.name; } break;
    case 'cast': castList = m.list; castTab(); break;
    case 'note': for (const n of m.notes) toast(n.id, n.text); break;
    case 'issue': issue = m.issue; if (tab === 'gazette') gazetteTab(); break;
    case 'detail': detail = m; card(); break;
  }
}
function init(m: InitMsg) {
  W = m.W; H = m.H; tiles = m.tiles; wk = m.wk; setts = m.setts; blds = m.blds; lex = m.lex; JOBS = m.jobs; BTN = m.bt;
  const bin = atob(m.el); el = new Uint8Array(W * H); for (let i = 0; i < el.length; i++) el[i] = bin.charCodeAt(i);
  dots = m.dots.map((d, i) => ({ id: i, name: d.n, job: d.j, home: d.h, traits: d.tr || [], col: colFor(d.n), x: 0, y: 0, tx: 0, ty: 0, fx: 0, fy: 0, t0: 0, fl: 0, seen: false }));
  names = dots.map(d => d.name); fams = m.dots.map(d => d.f || '');
  bnames = blds.map(bname);
  buildStatic(); resize(); cam.x = W / 2; cam.y = H / 2; cam.z = 1; occ = []; ready = true;
  $('#ticker').innerHTML = ''; (m.hist || []).forEach(e => ticker(e, false));
  chron = []; (m.chron || []).forEach(e => addChron(e, false)); arcs = m.arcs || []; issue = m.issue || null;
}
const bname = (b: BldView) => b.n ? b.n + ' ' + BTN[b.ty] : 'House';
function bldUpd(m) {
  const b = m.b; if (m.op === 'del') b.st = 3;
  blds[b.i] = b; bnames[b.i] = bname(b);
}
let dens = null, denseW = 0, denseH = 0;   // zoomed-out overview: dots per 8x8-tile cell (the server sends no individual dots then)
function frame(buf) {
  if (!ready) return;
  const v = new DataView(buf);
  tod = v.getFloat32(5, true); day = v.getUint16(9, true);
  let o = 11; const gw = v.getUint16(o, true), gh = v.getUint16(o + 2, true); o += 4;
  if (gw) { dens = new Uint8Array(buf, o, gw * gh); denseW = gw; denseH = gh; o += gw * gh; } else dens = null;
  // anything the server did not list is out of view: hide it and snap it into place when it returns
  for (const d of dots) if (d) { d.fl |= 1; d.seen = false; }
  const n = v.getUint16(o, true); o += 2; const now = performance.now();
  for (let k = 0; k < n; k++, o += 7) {
    const i = v.getUint16(o, true);
    const d = dots[i] || (dots[i] = { id: i, name: 'newcomer', job: 0, home: 0, traits: [], col: '#ccc', x: 0, y: 0, tx: 0, ty: 0, fx: 0, fy: 0, t0: 0, fl: 0, seen: false }); if (!names[i]) names[i] = d.name;
    const x = v.getUint16(o + 2, true) / 16, y = v.getUint16(o + 4, true) / 16, wasSeen = d.wasSeen;
    d.fx = wasSeen ? d.x : x; d.fy = wasSeen ? d.y : y; d.tx = x; d.ty = y; d.t0 = now; d.fl = v.getUint8(o + 6); d.seen = true;
  }
  for (const d of dots) if (d) d.wasSeen = d.seen;
  const nb = v.getUint16(o, true); o += 2; occ = [];
  for (let k = 0; k < nb; k++, o += 4) occ[v.getUint16(o, true)] = v.getUint16(o + 2, true);
}
/** Tell the server which tiles are on screen (plus a margin) so it only sends what we can see. */
let sentView = '', lastViewAt = 0, curView = null;
function reportView(now) {
  if (now - lastViewAt < 250) return; lastViewAt = now;
  const s = sc(), mx = cssW / s * 0.15, my = cssH / s * 0.15;   // everything on screen (even under glass panels) plus a margin
  const wx = px => (px - viewCX()) / s + cam.x, wy = py => (py - viewCY()) / s + cam.y;
  const m: ClientMsg & { t: 'view' } = { t: 'view', x0: Math.floor(wx(0) - mx), y0: Math.floor(wy(0) - my), x1: Math.ceil(wx(cssW) + mx), y1: Math.ceil(wy(cssH) + my) };
  const key = m.x0 + ',' + m.y0 + ',' + m.x1 + ',' + m.y1; if (key === sentView) return; sentView = key; curView = m; send(m);
}
async function gunzip(buf) { const r = new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'))); return r.text(); }
const clk = (t = tod) => { const h = t * 24, hh = Math.floor(h), mm = Math.floor((h - hh) * 60); return (hh < 10 ? '0' : '') + hh + ':' + (mm < 10 ? '0' : '') + mm + (h < 6 || h >= 20 ? ' 🌙' : h < 8 ? ' 🌅' : h >= 18 ? ' 🌇' : ' ☀️'); };
function hud() {
  $('#pop').textContent = stat.pop; $('#mood').textContent = stat.mood; $('#fr').textContent = stat.couples; if (tab === 'town') town(); if (tab === 'story') storyTab(); $('#viewers').textContent = stat.viewers;
  const fa = stat.food; $('#food').textContent = fa.length ? Math.round(fa.reduce((a, b) => a + b, 0) / fa.length) + ' avg · ' + Math.min(...fa) + ' min' : '–';
  const f = $('#bFest'), b = $('#bBlight');
  f.disabled = stat.cd.festival > 0; b.disabled = stat.cd.blight > 0;
  f.textContent = stat.fest ? '🎉 On!' : stat.cd.festival > 0 ? `🎉 ${stat.cd.festival}s` : '🎉 Festival';
  b.textContent = stat.blight ? '🥀 On!' : stat.cd.blight > 0 ? `🥀 ${stat.cd.blight}s` : '🥀 Blight';
  dramaAndChips();
}
/* Feed rollup: events that differ only by names/amounts ("X gave Y $521") merge into one row
   with a count. Matches within the newest ROLL_WINDOW rows; important events (weight >= 4) never merge. */
const ROLL_WINDOW = 14;
/** A feed row: the element plus the rollup key and how many events it stands for. */
interface FeedRow extends HTMLDivElement { _key?: string; _n?: number }
function ticker(m: EvMsg, live?: boolean) {
  if (live !== false) director(m);
  const w = m.w || 1, t = $('#ticker'), key = w >= 4 ? null : rollKey(m.x);
  const body = m.x.replace(/</g, '&lt;'), stamp = m.tk !== undefined ? `${clk((m.tk % DAY_TICKS) / DAY_TICKS)} · day ${Math.floor(m.tk / DAY_TICKS) + 1}` : `${clk()} · day ${day}`;
  if (key) {
    const kids = t.children;
    for (let i = 0; i < kids.length && i < ROLL_WINDOW; i++) {
      const el = kids[i] as FeedRow; if (el._key !== key) continue;
      el._n = (el._n || 1) + (m.n || 1);
      el.innerHTML = body + (el._n > 1 ? ` <b class="x">×${el._n}</b>` : '') + `<small>${stamp}</small>`;
      el.onclick = m.ids && m.ids.length ? () => select(m.ids[0]) : null;
      if ((w >= 3) && !el.classList.contains('hot')) el.classList.add('hot');
      if (i) { t.prepend(el); el.style.animation = 'none'; }
      return;
    }
  }
  const el = document.createElement('div') as FeedRow; el.className = w >= 4 ? 'big' : w >= 3 ? 'hot' : '';
  el._key = key; el._n = m.n || 1;
  el.innerHTML = body + (el._n > 1 ? ` <b class="x">×${el._n}</b>` : '') + `<small>${stamp}</small>`;
  if (m.ids && m.ids.length) el.onclick = () => select(m.ids[0]);
  t.prepend(el); while (t.children.length > 60) t.lastChild.remove();
}
/* Dot labels with collision avoidance: nearest-to-centre first, skip any that would overlap one already placed. */
function drawLabels(q, s) {
  if (!q.length) return;
  q.sort((a, b) => a.pri - b.pri);
  const boxes = [], hit = (x0, y0, x1, y1) => { for (const b of boxes) if (x0 < b[2] && x1 > b[0] && y0 < b[3] && y1 > b[1]) return true; return false; };
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
function tokWord(k) { return k >= 3000 ? (setts[k - 3000] ? setts[k - 3000].n : '?') : k >= 2000 ? ((blds[k - 2000] || {}).n || 'home') : k >= 1000 ? names[k - 1000] : lex[k][0]; }
function tokGloss(k) { return k >= 3000 ? (setts[k - 3000] ? setts[k - 3000].n : '?') : k >= 2000 ? (bnames[k - 2000] || 'home') : k >= 1000 ? names[k - 1000] : lex[k][1]; }
function say(m) {
  const k = m.k, inv = k.map(tokWord).join(' '), en0 = k.map(tokGloss).join(' ');
  const en = en0[0].toUpperCase() + en0.slice(1) + (lex[36] && k[0] === 36 ? '!' : '.');
  if (m.d !== undefined) { bubbles = bubbles.filter(b => b.d !== m.d); }
  bubbles.push({ d: m.d, b: m.b, inv, en, t0: performance.now() });
  if (bubbles.length > 60) bubbles.shift();
}
function card() {
  const c = $('#card'); if (sel < 0 || !detail || detail.id !== sel) return;
  const dt = detail, bar = (n, v, col) => `<div class="bar"><span>${n}</span><div><i style="width:${v}%;background:${col}"></i></div></div>`;
  const cd = a => (stat && stat.cd[a] > 0) ? ` ${stat.cd[a]}s` : '';
  const dis = a => (stat && stat.cd[a] > 0) || dt.dead ? 'disabled' : '';
  c.innerHTML = `<h3><canvas class="face" id="cface" width="36" height="36"></canvas> ${dt.name} ${dt.fam || ''} <button class="wbtn ${watched.has(dt.id) ? 'on' : ''}" id="wbtn">${watched.has(dt.id) ? '🔔 following' : '🔔 follow'}</button> <small>${dt.job} · age ${dt.age} · ${money(dt.coin)} · mood ${dt.mood}</small></h3>
    <div class="trs">${dt.mayor ? '<span class="tr" style="background:#6b5a1f">🏛️ mayor</span>' : ''}${dt.traits.map(t => `<span class="tr" title="${TRAIT[t] ? TRAIT[t].blurb : ''}">${TRI[t] || ''} ${t}</span>`).join('')}</div>
    <div class="do">${dt.doing}${dt.partner ? ` · ${dt.married ? '💍' : '💘'} <a data-i="${dt.pid}" style="text-decoration:underline;cursor:pointer">${dt.partner}</a>` : ''}</div>
    ${bar('hunger', dt.hunger, '#e0775a')}${bar('energy', dt.energy, '#e6c65a')}${bar('social', dt.social, '#7fb0f0')}
    <div class="th">“${dt.thought}”</div>
    ${dt.mem && dt.mem.length ? `<div class="do">🧠 remembers ${dt.mem.map(esc).join(' · ')}</div>` : ''}${dt.thoughts && dt.thoughts.length ? `<div class="do">💭 ${dt.thoughts.map(t => esc(t[0]) + ' (' + (t[1] > 0 ? '+' : '') + t[1] + ')').join(' · ')}</div>` : ''}${dt.skills ? `<details class="more"><summary>skills &amp; stats</summary><div class="do">🛠️ ${dt.skills.map(s => s[0] + ' ' + s[1]).join(' · ')}${dt.ill && dt.ill.length ? ' · 🤒 ' + dt.ill.join(', ') : ''} · STR ${dt.attrs[0]} DEX ${dt.attrs[1]} INT ${dt.attrs[2]} END ${dt.attrs[3]} CHA ${dt.attrs[4]} WIL ${dt.attrs[5]}</div></details>` : ''}
    <div class="do">✨ Dream: ${dt.dream}${dt.thieves.length ? ` · 🥷 distrusts ${dt.thieves.map(i => names[i]).join(', ')}` : ''}</div>
    <div class="fr">${dt.friends.length ? dt.friends.map(f => `<a data-i="${f[0]}">${names[f[0]]}</a>`).join('') : '<span class="hint" style="color:#7d8ba1">no close friends yet</span>'}</div>
    <div class="act"><button data-a="gift" ${dis('gift')}>🎁 +$2.5k${cd('gift')}</button><button data-a="cupid" ${dis('cupid')}>💘 Cupid${cd('cupid')}</button><button data-a="zap" ${dis('zap')}>⚡ Zap${cd('zap')}</button></div>`;
  { const fc = $('#cface'); if (fc && dt.face) drawFace(fc, dt.face, 36); const wb = $('#wbtn'); if (wb) wb.onclick = () => toggleWatch(dt.id); }
  c.querySelectorAll('a[data-i]').forEach(a => a.onclick = () => select(+a.dataset.i));
  c.querySelectorAll('button[data-a]').forEach(b => b.onclick = () => send({ t: 'act', n: b.dataset.a, id: sel }));
  ltUpdate();
  if (dt.dead && !deadTimer) deadTimer = setTimeout(() => { deadTimer = null; if (sel === dt.id) select(-1); }, 4000);
}
/* ---------- characters: faces, cast, follow ---------- */
function esc(t) { return String(t).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }
const SKIN = ['#f1c9a5', '#e0ac85', '#c68863', '#9c6a46', '#7a4e32', '#5a3822'], HAIR = ['#2b1d12', '#5a3a1e', '#a0642a', '#d9b45a', '#c0c0c0', '#8a2f1c', '#222', '#6b4a8c'], EYE = ['#3a2a1a', '#2f5d8c', '#3d7a4a', '#6b6b6b', '#8c5a2f'];
function drawFace(cv, f, size) {
  const c = cv.getContext('2d'), s = size; cv.width = cv.height = s; c.clearRect(0, 0, s, s);
  c.fillStyle = HAIR[f[1]]; c.beginPath(); c.arc(s / 2, s * 0.44, s * 0.36, Math.PI, 0); c.fill();                         /* hair */
  c.fillStyle = SKIN[f[0]]; c.beginPath(); c.ellipse(s / 2, s * 0.55, s * 0.28, s * 0.33, 0, 0, 7); c.fill();               /* head */
  c.fillStyle = HAIR[f[1]]; c.fillRect(s * 0.2, s * 0.3, s * 0.6, s * 0.1);                                                  /* fringe */
  c.fillStyle = EYE[f[2]]; c.beginPath(); c.arc(s * 0.4, s * 0.55, s * 0.045, 0, 7); c.arc(s * 0.6, s * 0.55, s * 0.045, 0, 7); c.fill();
  c.strokeStyle = '#3a2418'; c.lineWidth = Math.max(1, s * 0.03); c.beginPath();
  c.moveTo(s * 0.35, s * (0.5 - f[4] * 0.012)); c.lineTo(s * 0.45, s * 0.49); c.moveTo(s * 0.55, s * 0.49); c.lineTo(s * 0.65, s * (0.5 - f[4] * 0.012)); c.stroke();   /* brows */
  c.beginPath(); const m = f[3]; if (m === 0) { c.moveTo(s * 0.42, s * 0.7); c.lineTo(s * 0.58, s * 0.7); } else if (m === 1) c.arc(s / 2, s * 0.66, s * 0.1, 0.2, Math.PI - 0.2); else if (m === 2) c.arc(s / 2, s * 0.76, s * 0.08, Math.PI + 0.3, -0.3); else if (m === 3) { c.moveTo(s * 0.42, s * 0.71); c.quadraticCurveTo(s * 0.5, s * 0.77, s * 0.58, s * 0.69); } else { c.arc(s / 2, s * 0.7, s * 0.05, 0, 7); } c.stroke();
  const a = f[5]; if (a === 1) { c.strokeStyle = '#222'; c.strokeRect(s * 0.32, s * 0.48, s * 0.15, s * 0.14); c.strokeRect(s * 0.53, s * 0.48, s * 0.15, s * 0.14); c.beginPath(); c.moveTo(s * 0.47, s * 0.54); c.lineTo(s * 0.53, s * 0.54); c.stroke(); } else if (a === 2) { c.fillStyle = HAIR[(f[1] + 2) % 8]; c.beginPath(); c.moveTo(s * 0.34, s * 0.72); c.quadraticCurveTo(s * 0.5, s * 0.86, s * 0.66, s * 0.72); c.fill(); } else if (a === 3) { c.fillStyle = '#c0392b'; c.fillRect(s * 0.2, s * 0.22, s * 0.6, s * 0.08); }
}
function castTab() {
  const el = $('#cast'); if (!castList.length) { el.innerHTML = '<div class="hint">Loading the cast…</div>'; return; }
  el.innerHTML = '<h4 style="margin:2px 0 6px">Characters worth following</h4>' + castList.map((p, i) => `<div class="cc" data-i="${p.id}"><canvas data-f="${i}" width="44" height="44"></canvas><div><b>${esc(p.name)}</b>${watched.has(p.id) ? ' 🔔' : ''}<small>${esc(p.job)} · ${esc(p.town)} · age ${p.age} · fame ${p.fame} · mood ${p.mood}</small>${p.line ? `<small>remembers ${esc(p.line)}</small>` : ''}</div></div>`).join('');
  el.querySelectorAll('canvas[data-f]').forEach(cv => drawFace(cv, castList[+cv.dataset.f].face, 44));
  el.querySelectorAll('.cc').forEach(r => r.onclick = () => select(+r.dataset.i));
}
function toast(id, text) { const n = $('#note'); if (!n) return; const d = document.createElement('div'); d.textContent = `🔔 ${text}`; d.onclick = () => select(id); n.appendChild(d); setTimeout(() => d.remove(), 9000); while (n.children.length > 4) n.firstChild.remove(); }
function toggleWatch(id) { if (watched.has(id)) { watched.delete(id); send({ t: 'watch', id, on: false }); } else if (watched.size < 8) { watched.add(id); send({ t: 'watch', id, on: true }); } try { localStorage.setItem('dv-watch', JSON.stringify([...watched])); } catch (e) { } card(); }
function town() {
  if (!stat || !stat.lead) return; const L = stat.lead;
  const row = (t, arr, f) => `<h4>${t}</h4>` + arr.map(([id, v], i) => `<div class="row" data-i="${id}"><span>${i + 1}. ${names[id]}</span><i>${f(v)}</i></div>`).join('');
  const ICON = ['👑', '🏘️', '🏡', '🛖'], fmt = n => n >= 10000 ? (n / 1000).toFixed(0) + 'k' : n >= 1000 ? (n / 1000).toFixed(1) + 'k' : '' + n;
  const B = stat.biz || {};
  const rows = (stat.towns || []).map((t, i) => ({ n: t[0], tier: t[1], pop: t[2], mayor: t[3], tre: t[4], tax: t[5], next: t[6], i })).sort((a, b) => a.tier - b.tier || b.pop - a.pop);
  const tw = rows.map(t => `<div class="row" ${t.mayor >= 0 ? `data-i="${t.mayor}"` : ''}><span>${ICON[t.tier]} ${t.n} <small style="opacity:.6">· ${t.pop} · ${t.mayor >= 0 ? '🏛️ ' + names[t.mayor] : 'no mayor'}</small></span><i>💰 ${money(t.tre)} · tax ${t.tax}%</i></div>`).join('');
  const mayor = `<div class="tstats" style="margin:4px 0 6px">🏦 National treasury ${money(stat.nation || 0)} · local treasuries ${money(stat.treasury || 0)} · each town elects its own mayor</div>`;
  const M = stat.money, fl = M ? M.flow : {}, sg = v => (v >= 0 ? '+' : '−') + money(Math.abs(v || 0));
  const mny = M ? `<div class="tstats" style="margin:4px 0 6px">💵 Money supply ${money(M.supply)} · printed by the government ${money(M.minted)}<br>🌍 Trade with abroad: exports ${sg(fl.exports)} · imports ${sg(fl.imports)} · utilities ${sg(fl.upkeep)} · migrants ${sg(fl.migrants)}${fl.repairs ? ' · repairs ' + sg(fl.repairs) : ''}</div>` : '';
  const eco = `<div class="tstats" style="margin:6px 0">🏪 ${B.open} businesses open · 🏗️ ${B.sites} building sites · 🚪 ${B.vacant} vacant<br>📈 ${B.built} built · 📉 ${B.closed} failed · 🤝 ${B.sold} sold · 🔥 ${B.fires} fires · 🧳 ${B.arrived} arrived<br>💸 ${B.unpaid} missed payrolls · 🚪 ${B.quit} quit · 🧑‍💼 ${B.jobless} jobless · 🏦 ${B.benefits} benefit payments</div>`;
  $('#town').innerHTML = mayor + mny + `<h4>Settlements</h4>` + tw + eco + `<div class="tstats">💑 ${stat.couples} couples · 👶 ${stat.births} born · 🕯️ ${stat.deaths} died<br>🚨 ${stat.thefts} robberies · 🥊 ${stat.fights} brawls · 🍞 ${stat.food.join(' / ')}</div>`
    + row('💰 Richest', L.rich, v => money(v)) + row('❤️ Most loved', L.loved, v => v) + row('😡 Most hated', L.hated, v => v) + row('🧓 Oldest', L.old, v => v + ' yrs');
  $('#town').querySelectorAll('.row').forEach(r => r.onclick = () => select(+r.dataset.i));
}
/* ---------- stories: active arcs + the chronicle ---------- */
let chron = [], arcs = [], issue = null;
{ const st = document.createElement('style'); st.textContent = GAZETTE_CSS + '#gazette .gz .mast h1{font-size:26px}#gazette .gz h2.hl{font-size:22px}#gazette .gz .cols{column-count:1}'; document.head.appendChild(st); }
function gazetteTab() {
  const g = $('#gazette');
  if (!issue) { g.innerHTML = '<div class="gz"><div class="mast"><h1>The Dotville Gazette</h1></div><p>The first issue goes to press at dawn of day 2.</p></div>'; return; }
  let h = renderIssue(issue, '');
  if (LOCAL) h = h.replace(/ <a href="[^"]*"[^>]*>full story →<\/a>/g, '');
  const links = LOCAL ? '' : `<div class="gz"><div class="share"><a href="/issue/${issue.n}" target="_blank">Open permalink ↗</a><button data-share="/issue/${issue.n}">Share</button><a href="/archive" target="_blank">Archive</a></div></div>`;
  g.innerHTML = h + links;
  g.querySelectorAll('[data-share]').forEach(b => b.onclick = () => { const u = location.origin + b.dataset.share; (navigator.share ? navigator.share({ title: document.title, url: u }) : navigator.clipboard.writeText(u).then(() => { b.textContent = 'Link copied!'; })); });
}
const ARC_ICON = { rivalry: '⚔️', triangle: '💞', feud: '🏚️', protege: '🌱', drought: '☀️', investor: '💼', comeback: '🌅', panic: '🏦', gangster: '🐺', disgrace: '🔥' };
function addChron(e, live) { chron.push(e); if (chron.length > 300) chron.shift(); if (live && tab === 'story') storyTab(); }
function storyTab() {
  const esc = t => String(t).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const active = arcs.map(a => `<div class="row arc" data-i="${a.ids[0] ?? -1}"><span>${ARC_ICON[a.k] || '📖'} <b>${esc(a.t)}</b><small style="display:block;opacity:.7;white-space:normal">${esc(a.b)}</small></span><i>day ${a.d}${LOCAL ? '' : ` · <a href="/story/${a.i}" target="_blank" onclick="event.stopPropagation()" title="Permalink">↗</a>`}</i></div>`).join('') || '<div class="tstats">No story is unfolding right now — the storyteller is waiting for tension to drop.</div>';
  const log = chron.slice().reverse().slice(0, 80).map(e => `<div class="chron ${e.big ? 'big' : ''}" ${e.ids && e.ids.length ? `data-i="${e.ids[0]}"` : ''}><small>Year ${e.year} · day ${e.day}</small><b>${esc(e.title)}</b><div>${esc(e.text)}</div></div>`).join('');
  $('#story').innerHTML = `<div class="tstats" style="margin-bottom:6px">🎭 tension ${stat ? stat.tension : '–'} · ${arcs.length} active stories</div><h4>Unfolding now</h4>${active}<h4>Chronicle</h4>${log || '<div class="tstats">Nothing recorded yet.</div>'}`;
  $('#story').querySelectorAll('[data-i]').forEach(r => r.onclick = () => { const i = +r.dataset.i; if (i >= 0) select(i); });
}
function director(m) {
  if (!auto || !ready || !m.ids || !m.ids.length || (m.w || 1) < 3) return;
  const now = performance.now();
  if (now - userAt < 18000) return;
  if (now - lastShot < 7000 && m.w < 4) return;
  lastShot = now; dirUntil = now + 9000; dirIds = m.ids.slice(0, 2);
  ltWhy = m.x;   // the lower third says why the camera is here
  pick_(m.ids[0], false);
}
/** Zoom for a close-up, as pixels per tile: roomy on a big screen, wider on a phone so you still see the street around them. */
function followZoom(pair: boolean) { const px = Math.min(26, Math.max(13, viewW() / 28)) * (pair ? 0.78 : 1); return px / fit; }
function pick_(id, user) {
  if (user) { userAt = performance.now(); dirIds = null; }
  if (user || id < 0) ltWhy = '';
  sel = id; follow = id >= 0; detail = null;
  if (id >= 0) { send({ t: 'sel', id }); camTarget = followZoom(dirIds && dirIds.length > 1); $('#card').innerHTML = `<h3>${dots[id].name}</h3><div class="do">…</div>`; if (LOCAL) handle(localWorld.detail(id)); }
  else { send({ t: 'sel', id: -1 }); camTarget = 1; $('#card').innerHTML = '<div class="hint">Tap a dot to follow it.<br>🎥 auto-camera cuts to the drama.</div>'; }
  ltUpdate();
}
function select(id) { pick_(id, true); }

/* ---------- broadcast layer: lower third, story chips, drama meter, panels ---------- */
let ltWhy = '', ltShownFor = -2, chipKey = '';
const isMobile = () => window.innerWidth <= 820;
/** The caption that says who the camera is on and why. */
function ltUpdate() {
  const lt = $('#lt'); if (!lt) return;
  if (sel < 0 || !dots[sel]) { lt.classList.remove('show'); ltShownFor = -2; return; }
  const dt = detail && detail.id === sel ? detail : null, town = dt && blds[dt.home] && setts[blds[dt.home].s] ? setts[blds[dt.home].s].n : '';
  $('#ltk').textContent = ltWhy ? '🎥 ON CAMERA' : '● FOLLOWING';
  $('#ltn').textContent = dt ? (dt.name + (dt.fam ? ' ' + dt.fam : '')) : dots[sel].name;
  $('#lts').textContent = dt ? [dt.nick ? '“' + dt.nick + '”' : '', dt.mayor ? 'mayor' : dt.job, town, 'age ' + dt.age].filter(Boolean).join(' · ') : '';
  $('#ltw').textContent = ltWhy || (dt ? dt.doing : '');
  if (dt && dt.face) drawFace($('#ltface'), dt.face, 56);
  if (ltShownFor !== sel) { lt.classList.remove('show'); void lt.offsetWidth; ltShownFor = sel; }   // restart the slide-in for a new subject
  lt.classList.add('show');
}
$('#lt').onclick = () => { if (isMobile()) setSheet('full'); else if ($('#app').classList.contains('closed')) toggleDrawer(); };
/** Storyteller tension -> a word and a bar; active story arcs -> tappable chips on the map. */
function dramaAndChips() {
  const t = stat.tension || 0, word = t < 1 ? 'calm' : t < 2.5 ? 'stirring' : t < 4 ? 'tense' : 'crisis';
  const d = $('#drama'); d.querySelector('b').textContent = word; (d.querySelector('.m i') as HTMLElement).style.width = Math.min(100, t / 5 * 100) + '%';
  const list = (stat.arcs || []).slice(0, isMobile() ? 1 : 3), key = list.map(a => a.i + ':' + a.s + ':' + a.b).join('|');
  if (key === chipKey) return; chipKey = key;
  $('#chips').innerHTML = list.map(a => `<div class="chip" data-id="${a.ids[0]}"><em>UNFOLDING · DAY ${a.d + 1}</em><b>${esc(a.t)}</b>${a.b ? `<small>${esc(a.b)}</small>` : ''}</div>`).join('');
  $('#chips').querySelectorAll('.chip').forEach(c => (c as HTMLElement).onclick = () => { const id = +(c as HTMLElement).dataset.id; if (id >= 0 && dots[id]) select(id); });
}
/** Work out how much of the canvas the floating UI covers, so the camera centres on what is visible. */
let laidOut = false;
function layout() {
  const app = $('#app'), hud = $('#hud'); if (!app || !hud) return;
  app.style.setProperty('--hud-h', hud.getBoundingClientRect().height + 'px');
  const side = $('#side'), top = hud.getBoundingClientRect().bottom + 6;
  inset.t = top;
  if (isMobile()) { inset.r = 0; inset.b = side.getBoundingClientRect().height; }
  else { inset.r = app.classList.contains('closed') ? 0 : side.offsetWidth + 20; inset.b = 0; }
  if (!laidOut) { laidOut = true; Object.assign(insetCur, inset); }
  if (W) fit = Math.min((cssW - inset.r) / W, (cssH - inset.t - inset.b) / H);
}
const SHEETS = ['peek', 'half', 'full'];
function setSheet(name) { $('#app').dataset.sheet = name; layout(); }
function toggleDrawer(force?: boolean) {
  const app = $('#app'), closed = force === undefined ? !app.classList.contains('closed') : force;
  app.classList.toggle('closed', closed); $('#drawerBtn').textContent = closed ? '‹' : '›'; layout();
  try { localStorage.setItem('dv-drawer', closed ? '0' : '1'); } catch (e) { }
}
$('#drawerBtn').onclick = () => toggleDrawer();
try { if (localStorage.getItem('dv-drawer') === '0') toggleDrawer(true); } catch (e) { }
{ /* bottom-sheet drag: tap cycles, drag up/down snaps to the next position */
  const g = $('#grab'); let y0 = null;
  g.addEventListener('pointerdown', e => { y0 = e.clientY; g.setPointerCapture(e.pointerId); });
  g.addEventListener('pointerup', e => {
    if (y0 === null) return; const dy = e.clientY - y0; y0 = null; const i = SHEETS.indexOf($('#app').dataset.sheet);
    setSheet(SHEETS[Math.abs(dy) < 8 ? (i + 1) % 3 : dy < 0 ? Math.min(2, i + 1) : Math.max(0, i - 1)]);
  });
}
$('#tabs').addEventListener('click', () => { if (isMobile() && $('#app').dataset.sheet === 'peek') setSheet('half'); });
{ /* meddle menu */
  const menu = $('#menu'), btn = $('#bMenu'); const close = () => { menu.classList.remove('open'); btn.setAttribute('aria-expanded', 'false'); };
  btn.onclick = e => { e.stopPropagation(); const o = menu.classList.toggle('open'); btn.setAttribute('aria-expanded', String(o)); };
  document.addEventListener('click', e => { if (!menu.contains(e.target as Node)) close(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
}


/* ---------- terrain layer (re-rendered when tiles change) + dynamic buildings ---------- */
let stat0 = null, terrDirty = false, terrAt = 0; const T0 = 12;
function hash(x, y) { let h = (x * 374761393 + y * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
let shoreD = null;
function calcShore() { // distance of water cells from land (for depth shading)
  shoreD = new Uint8Array(W * H).fill(255); const q = [];
  for (let i = 0; i < W * H; i++) if (wk[i] === '0') { shoreD[i] = 0; q.push(i); }
  for (let h = 0; h < q.length; h++) { const i = q[h], x = i % W, y = (i / W) | 0, d = shoreD[i] + 1; if (d > 12) continue;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue; const j = ny * W + nx; if (shoreD[j] > d) { shoreD[j] = d; q.push(j); } } }
}
const E = (x, y) => el[Math.max(0, Math.min(H - 1, y)) * W + Math.max(0, Math.min(W - 1, x))] / 255;
const isW = (x, y) => x < 0 || y < 0 || x >= W || y >= H ? true : wk[y * W + x] !== '0';
function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
const css = c => `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;
function buildStatic() {
  if (!shoreD) calcShore();
  if (!stat0) { stat0 = document.createElement('canvas'); stat0.width = W * T0; stat0.height = H * T0; }
  const g = stat0.getContext('2d'), T = tiles;
  const tt = (x, y) => (x < 0 || y < 0 || x >= W || y >= H) ? -1 : +T[y * W + x];
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
  const link = (x, y) => { const t = tt(x, y); return t === 1 || t === 6 || t === 7 || t === 4; };
  const strip = (x, y, wd, col) => {
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
const PAL = ['#d98f7a', '#d9b56e', '#8ec0d9', '#b49ad9', '#d97a9b', '#9ed99e'];
const EMO = ['🏠', '🌾', '🧺', '🍺', '🔨', '🌳', '🏛️', '⚓', '🏢', '🏭', '🛍️'];
function drawBld(b, s, now) {
  const [px, py] = toS(b.x, b.y), w = b.w * s, h = b.h * s;
  if (px > cssW + 4 || py > cssH + 4 || px + w < -4 || py + h < -4) return;
  const r = hash(b.x, b.y), st = b.st, ty = b.ty, ex = Math.max(1, s * 0.07);
  if (ty === 1) { // farm: tilled field
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
    const body = ty === 0 ? PAL[(r * PAL.length) | 0] : ty === 2 ? '#d98a3a' : ty === 3 ? '#b04a42' : ty === 6 ? '#c9c2b0' : ty === 8 ? '#7e97b8' : ty === 9 ? '#8d8d92' : ty === 10 ? '#e0c25a' : ty === 11 ? '#d9792f' : '#6f86a6';
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
  if (s > 10 && ty !== 0 && ty !== 1 && st === 0 && !(ty === 7)) { ctx.font = `${Math.min(24, s * 1.15)}px system-ui,"Apple Color Emoji","Noto Color Emoji"`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(EMO[ty], px + w / 2, py + h / 2 + s * .08); }
  else if (s > 10 && ty === 7) { ctx.font = `${Math.min(18, s)}px system-ui,"Apple Color Emoji"`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('⚓', px + w / 2, py + h / 2); }
  else if (s > 12 && st === 1) { ctx.font = `${Math.min(20, s)}px system-ui,"Apple Color Emoji"`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('🚧', px + w / 2, py + h / 2); }
  if (st === 0 && ty !== 1 && ty !== 5 && ty !== 7 && occ[b.i] > 0 && dark() > 0.1) { ctx.fillStyle = `rgba(255,214,120,${0.6 * dark() / 0.52})`; ctx.fillRect(px + w * .18, py + h * .45, s * .5, s * .45); if (w > s * 2) ctx.fillRect(px + w * .62, py + h * .45, s * .5, s * .45); }
}

/* ---------- camera + render ---------- */
function resize() {
  dpr = window.devicePixelRatio || 1; cssW = $('#stage').clientWidth; cssH = $('#stage').clientHeight || 200;
  layout();
  fit = W ? Math.min((cssW - inset.r) / W, (cssH - inset.t - inset.b) / H) : 5;
  cv.style.width = cssW + 'px'; cv.style.height = cssH + 'px'; cv.width = cssW * dpr; cv.height = cssH * dpr;
}
addEventListener('resize', resize);
const sc = () => fit * cam.z, zMax = () => 40 / fit;
const toS = (x, y) => [(x - cam.x) * sc() + viewCX(), (y - cam.y) * sc() + viewCY()];
function clampCam() { const s = sc(), vw = viewW() / s, vh = viewH() / s; cam.x = vw >= W ? W / 2 : Math.max(vw / 2, Math.min(W - vw / 2, cam.x)); cam.y = vh >= H ? H / 2 : Math.max(vh / 2, Math.min(H - vh / 2, cam.y)); }
function dark() { const h = tod * 24; if (h < 5 || h >= 21) return 0.52; if (h < 7.5) return 0.52 * (7.5 - h) / 2.5; if (h >= 18.5) return 0.52 * (h - 18.5) / 2.5; return 0; }
function rr(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
/** dollars, compact: $1.2M, $48k, $812 */
const money = n => { n = Math.round(n || 0); const a = Math.abs(n), sg = n < 0 ? '−' : ''; return sg + '$' + (a >= 1e9 ? (a / 1e9).toFixed(1) + 'B' : a >= 1e6 ? (a / 1e6).toFixed(1) + 'M' : a >= 1e4 ? Math.round(a / 1e3) + 'k' : a >= 1e3 ? (a / 1e3).toFixed(1) + 'k' : a); };
const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;

let frozen = false;
function draw(now) {
  requestAnimationFrame(draw);
  if (!frozen) render(now);
}
function render(now) {
  if (!ready) return;
  reportView(now);
  // camera easing (and glide the map centre when a panel opens or closes)
  for (const k of ['t', 'r', 'b'] as const) { insetCur[k] += (inset[k] - insetCur[k]) * 0.18; if (Math.abs(inset[k] - insetCur[k]) < 0.5) insetCur[k] = inset[k]; }
  if (camTarget !== null) { cam.z += (camTarget - cam.z) * 0.12; if (Math.abs(camTarget - cam.z) < 0.01) { cam.z = camTarget; camTarget = null; } }
  for (const d of dots) { const a = clamp01((now - d.t0) / 200); d.x = d.fx + (d.tx - d.fx) * a; d.y = d.fy + (d.ty - d.fy) * a; }
  if (dirIds && now > dirUntil) { dirIds = null; if (performance.now() - userAt > 18000) pick_(-1, false); }
  if (follow && sel >= 0 && dots[sel] && dots[sel].seen === true) {   // wait until the server has actually sent this dot's position (otherwise the camera flies to the map corner)
    let tx = dots[sel].x, ty = dots[sel].y;
    if (dirIds && dirIds.length > 1) { const o = dots[dirIds[1]]; if (!(o.fl & 65)) { tx = (tx + o.x) / 2; ty = (ty + o.y) / 2; } }
    cam.x += (tx - cam.x) * 0.15; cam.y += (ty - cam.y) * 0.15;
  }
  clampCam();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#0a1c2c'; ctx.fillRect(0, 0, cssW, cssH);   // deep sea beyond the coast (the map floats under the UI)
  const s = sc(), [ox, oy] = toS(0, 0);
  if (terrDirty && now - terrAt > 400) { terrAt = now; buildStatic(); }
  ctx.imageSmoothingEnabled = true; ctx.drawImage(stat0, ox, oy, W * s, H * s);
  for (const b of blds) if (b.st !== 3) drawBld(b, s, now);
  const TINT = [null, 'rgba(255,215,120,.07)', 'rgba(225,120,40,.16)', 'rgba(225,238,255,.24)'], se = stat ? stat.season : 0, wx = stat ? stat.weather : 0;
  if (TINT[se]) { ctx.fillStyle = TINT[se]; ctx.fillRect(ox, oy, W * s, H * s); }
  const dk = Math.min(0.7, dark() + (wx ? 0.1 : 0));
  if (dk > 0) { ctx.fillStyle = `rgba(8,12,42,${dk})`; ctx.fillRect(ox, oy, W * s, H * s); }
  // settlement labels
  if (s < 26) { ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; const al = s < 18 ? 1 : (26 - s) / 8;
    for (const t of setts) { const [lx, ly] = toS(t.x + .5, t.y + .5), fs = [15, 12.5, 11, 10][t.t] * (s < 7 ? 1 : 1);
      ctx.globalAlpha = al; ctx.font = `700 ${fs}px system-ui`; const lbl = (t.t === 0 ? '★ ' : '') + t.n + (stat && stat.towns && stat.towns[t.i] && stat.towns[t.i][2] ? ' · ' + stat.towns[t.i][2] : '');
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(10,14,22,.8)'; ctx.strokeText(lbl, lx, ly - 2.2 * s - 6); ctx.fillStyle = t.t === 0 ? '#ffe58a' : '#f2f5fb'; ctx.fillText(lbl, lx, ly - 2.2 * s - 6); ctx.globalAlpha = 1; } }
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
    ctx.fillStyle = d.col; ctx.beginPath(); ctx.arc(x, y, R, 0, 7); ctx.fill();
    ctx.strokeStyle = (d.fl & 128) ? 'rgba(255,255,255,.7)' : JOBCOL[d.job]; ctx.lineWidth = Math.max(1, R * 0.38); ctx.stroke();
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
  bubbles = bubbles.filter(b => now - b.t0 < (b.d === sel && sel >= 0 ? 5200 : 3400));
  const list = bubbles.length > 16 ? bubbles.slice(-16) : bubbles;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const b of list) {
    let wx, wy;
    if (b.d !== undefined) { const d = dots[b.d]; if (d.fl & 65) continue; wx = d.x; wy = d.y; } else { const B = blds[b.b]; wx = B.x + 1.5; wy = B.y + 0.5; }
    const [x, y0] = toS(wx, wy), age = now - b.t0, a = age < 250 ? age / 250 : age > 3000 && !(b.d === sel) ? Math.max(0, 1 - (age - 3000) / 400) : 1;
    const fs = Math.max(10, Math.min(13, s * 0.8)), y = y0 - R - 6 - Math.min(10, age / 60);
    ctx.globalAlpha = a; ctx.font = `700 ${fs}px system-ui`; const w1 = ctx.measureText(b.inv).width;
    let w2 = 0; if (translate) { ctx.font = `${fs - 2}px system-ui`; w2 = ctx.measureText(b.en).width; }
    const w = Math.max(w1, w2) + 12, h = translate ? fs * 2 + 6 : fs + 8;
    ctx.fillStyle = 'rgba(250,250,252,.95)'; rr(x - w / 2, y - h, w, h, 6); ctx.fill();
    ctx.beginPath(); ctx.moveTo(x - 4, y); ctx.lineTo(x + 4, y); ctx.lineTo(x, y + 5); ctx.fill();
    ctx.fillStyle = '#1b2230'; ctx.font = `700 ${fs}px system-ui`; ctx.fillText(b.inv, x, y - h + (translate ? fs * 0.95 + 1 : h / 2));
    if (translate) { ctx.fillStyle = '#5b6a82'; ctx.font = `${fs - 2}px system-ui`; ctx.fillText(b.en, x, y - 6 - (fs - 2) * 0.1); }
    ctx.globalAlpha = 1;
  }
  const ct = `${stat ? ['🌱', '☀️', '🍂', '❄️'][stat.season] + ' Y' + stat.year + ' · ' : ''}Day <i>${day}</i> · <i>${clk()}</i>${stat && stat.weather ? (stat.weather === 2 ? ' ❄' : ' 🌧') : ''}`; if (ct !== lastClock) { lastClock = ct; $('#clock').innerHTML = ct; }
}

/* ---------- input ---------- */
let drag = null;
cv.addEventListener('pointerdown', e => { cv.setPointerCapture(e.pointerId); drag = { x: e.clientX, y: e.clientY, cx: cam.x, cy: cam.y, moved: false }; });
cv.addEventListener('pointermove', e => {
  if (!drag) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  if (Math.hypot(dx, dy) > 6) { drag.moved = true; follow = false; cam.x = drag.cx - dx / sc(); cam.y = drag.cy - dy / sc(); }
});
cv.addEventListener('pointerup', e => {
  if (!drag) return; const moved = drag.moved; drag = null; if (moved) return;
  const r = cv.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top;
  let best = -1, bd = 22;
  for (const d of dots) { if (d.fl & 65) continue; const [x, y] = toS(d.x, d.y), dd = Math.hypot(x - px, y - py); if (dd < bd) { bd = dd; best = d.id; } }
  if (best >= 0) select(best); else if (sel >= 0) select(-1);
});
cv.addEventListener('wheel', e => { e.preventDefault(); cam.z = Math.max(1, Math.min(zMax(), cam.z * (e.deltaY < 0 ? 1.15 : 0.87))); camTarget = null; }, { passive: false });
$('#zi').onclick = () => { camTarget = Math.min(zMax(), cam.z * 1.6); };
$('#zo').onclick = () => { camTarget = Math.max(1, cam.z / 1.6); };
$('#bFest').onclick = () => send({ t: 'act', n: 'festival' });
$('#bBlight').onclick = () => send({ t: 'act', n: 'blight' });
$('#bCam').onclick = e => { auto = !auto; e.currentTarget.classList.toggle('on', auto); if (!auto && dirIds) { dirIds = null; pick_(-1, false); } };
document.querySelectorAll<HTMLElement>('#tabs button').forEach(b => b.onclick = () => { tab = b.dataset.t; document.querySelectorAll('#tabs button').forEach(x => x.classList.toggle('on', x === b)); $('#ticker').style.display = tab === 'feed' ? '' : 'none'; $('#town').style.display = tab === 'town' ? 'block' : 'none'; $('#story').style.display = tab === 'story' ? 'block' : 'none'; $('#gazette').style.display = tab === 'gazette' ? 'block' : 'none'; $('#cast').style.display = tab === 'cast' ? 'block' : 'none'; if (tab === 'cast') { castTab(); send({ t: 'cast' }); } if (tab === 'town') town(); if (tab === 'story') storyTab(); if (tab === 'gazette') gazetteTab(); });
cv.addEventListener('pointerdown', () => { userAt = performance.now(); });
$('#bTr').onclick = e => { translate = !translate; e.currentTarget.classList.toggle('on', translate); };
$('#bSpd').onclick = e => { localSpeed = localSpeed === 1 ? 4 : localSpeed === 4 ? 12 : 1; e.currentTarget.textContent = '⏩ ×' + localSpeed; };

requestAnimationFrame(draw);
if (LOCAL) startLocal(); else connect();
window.__dv = { handle, select, get cam() { return cam; } };
/* Deterministic rendering hook for visual regression tests (only exists if the page sets __DV_TEST__ before loading).
   freeze() stops the sim interval and the draw loop; step(n) advances the sim; shot() renders exactly one frame from an explicit camera. */
if ((window as any).__DV_TEST__) (window as any).__dvTest = {
  freeze() { frozen = true; if (localIv) clearInterval(localIv); localIv = null; },
  step(n: number) { for (let i = 0; i < n; i++) localTick(); },
  info() { return { W, H, setts: setts.map(t => [t.x, t.y, t.t]), ndots: dots.length, cssW, cssH, fit }; },
  shot(o: { x: number; y: number; px: number; selNear?: boolean; weather?: number; season?: number; tod?: number; now?: number }) {
    const now = o.now ?? 100600;   // performance.now() is stubbed to 100000 by the test page, so speech bubbles are 600 ms old (fully faded in)
    follow = false; dirIds = null; camTarget = null; Object.assign(insetCur, inset);
    cam.x = o.x; cam.y = o.y; cam.z = o.px / fit;
    lastViewAt = -1e9; sentView = ''; reportView(now); localTick();   // ask for exactly this viewport, then let the sim send the dots in it
    if (o.selNear) { let best = -1, bd = 1e9; for (const d of dots) if (!(d.fl & 65) && d.seen) { const q = Math.hypot(d.x - cam.x, d.y - cam.y); if (q < bd) { bd = q; best = d.id; } } if (best >= 0) pick_(best, true); }
    tod = o.tod ?? tod; if (stat) { stat.weather = o.weather ?? 0; if (o.season !== undefined) stat.season = o.season; }
    for (const d of dots) d.t0 = -1e9;                   // finished interpolation: dots are exactly where the last frame put them
    render(now);
  },
};
})();
