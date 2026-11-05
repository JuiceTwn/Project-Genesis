// Client for Dotville. Messages are typed by ../shared/protocol.ts.
import { CATALOG, TRAIT } from '../sim/personality';
import { renderIssue, GAZETTE_CSS } from '../shared/gazette';
import { rollKey } from '../shared/feed';
import { DAY_TICKS } from '../shared/reality';
import type { World } from '../sim';
import { Camera } from './render/camera';
import { createCanvas2DRenderer } from './render/canvas2d';
import { THEME } from './render/theme';
import { SpriteAtlas } from './render/sprites';
import { drawFace } from './render/face';
import type { RenderView, Renderer, Bubble, DotView } from './render/types';
import type { ServerMsg, ClientMsg, EvMsg, InitMsg, BldView, SettView, StatsMsg, DetailMsg, ArcView } from '../shared/protocol';
declare const Sim: any;   // provided by demo.ts when running without a server
(() => {
'use strict';
const $ = (s: string): any => document.querySelector(s);   // any: the page's elements are known by id, not by type
const LOCAL = !!window.__LOCAL__ || /[?&]local/.test(location.search);
const JOBCOL = ['#7bd36b', '#f0a74a', '#b98cf0', '#59b6ee'];
/** A dot as the client sees it: identity from the init/born messages, motion state filled in by each frame. */
interface DotView { id: number; name: string; job: number; home: number; traits: string[]; col: string; x: number; y: number; tx: number; ty: number; fx: number; fy: number; t0: number; fl: number; seen: boolean; wasSeen?: boolean; [k: string]: any }
let W: number, H: number, tiles: string, wk: string, el: Uint8Array, setts: SettView[] = [], blds: BldView[] = [], dots: DotView[] = [], names: string[] = [], fams: string[] = [], bnames: string[] = [], JOBS: string[] = [], BTN: string[] = [];
let tod = 0.3, day = 1, occ = [], sel = -1, follow = false, bubbles = [], statsM = null;
let stat: StatsMsg | null = null, detail: DetailMsg | null = null, ready = false, lastClock = '';
const TRI = Object.fromEntries(CATALOG.map(t => [t.id, t.emoji]));
const parts = [];
let castList = [], watched = new Set<number>(JSON.parse(localStorage.getItem('dv-watch') || '[]')), auto = true, userAt = -1e9, dirUntil = 0, dirIds = null, lastShot = -1e9, deadTimer = null, tab = 'feed';
const colFor = n => { let x = 7; for (let i = 0; i < n.length; i++) x = (x * 31 + n.charCodeAt(i)) % 3600; return `hsl(${x / 10},68%,62%)`; };
const camera = new Camera(), cam = camera; let camTarget = null;
const cv = $('#c');
/** Pixels of the canvas covered by floating UI (HUD on top, drawer on the right, sheet at the bottom): the camera centres on what is left. */
const inset = camera.inset, insetCur = camera.insetCur;
const viewCX = () => camera.viewCX(), viewCY = () => camera.viewCY(), viewW = () => camera.viewW(), viewH = () => camera.viewH();

/* ---------- transport ---------- */
let ws: WebSocket | null = null, localWorld: World | null = null, localSpeed = 1, localIv: ReturnType<typeof setInterval> | null = null;
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
  localIv = (window as any).__DV_TEST__ ? null : setInterval(localTick, 200);   // test pages drive the sim by hand (step), never by timer
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
    case 'tiles': { const a = tiles.split(''); for (const [i, v] of m.c) a[i] = String(v); tiles = a.join(''); renderer.terrainChanged(); break; }
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
  W = m.W; H = m.H; tiles = m.tiles; wk = m.wk; setts = m.setts; blds = m.blds; JOBS = m.jobs; BTN = m.bt;
  const bin = atob(m.el); el = new Uint8Array(W * H); for (let i = 0; i < el.length; i++) el[i] = bin.charCodeAt(i);
  dots = m.dots.map((d, i) => ({ id: i, name: d.n, job: d.j, home: d.h, traits: d.tr || [], col: colFor(d.n), x: 0, y: 0, tx: 0, ty: 0, fx: 0, fy: 0, t0: 0, fl: 0, seen: false }));
  names = dots.map(d => d.name); fams = m.dots.map(d => d.f || '');
  bnames = blds.map(bname);
  renderer.terrainChanged(); resize(); cam.x = W / 2; cam.y = H / 2; cam.z = 1; occ = []; ready = true;
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
  const s = sc(), mx = camera.cssW / s * 0.15, my = camera.cssH / s * 0.15;   // everything on screen (even under glass panels) plus a margin
  const wx = px => (px - viewCX()) / s + cam.x, wy = py => (py - viewCY()) / s + cam.y;
  const m: ClientMsg & { t: 'view' } = { t: 'view', x0: Math.floor(wx(0) - mx), y0: Math.floor(wy(0) - my), x1: Math.ceil(wx(camera.cssW) + mx), y1: Math.ceil(wy(camera.cssH) + my) };
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
/** How long a bubble stays up: longer lines stay longer; the selected dot's lines linger. */
function bubbleLife(b: { d?: number; text: string }) { return (b.d === sel && sel >= 0 ? 5200 : 3200) + b.text.length * 40; }
function say(m) {
  const text = String(m.s || '');
  if (!text) return;
  if (m.d !== undefined) { bubbles = bubbles.filter(b => b.d !== m.d); }
  bubbles.push({ d: m.d, b: m.b, text, t0: performance.now() });
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
function followZoom(pair: boolean) { const px = Math.min(26, Math.max(13, viewW() / 28)) * (pair ? 0.78 : 1); return px / camera.fit; }
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
  if (W) camera.fit = Math.min((camera.cssW - inset.r) / W, (camera.cssH - inset.t - inset.b) / H);
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
/* ---------- camera + render ---------- */
/* The map is painted by a Renderer (render/canvas2d.ts). Swap the look with a Theme / SpriteAtlas / terrain painter here, or a whole new Renderer.
   e.g.  createCanvas2DRenderer(cv, { theme: MY_THEME, sprites: await SpriteAtlas.load('/art/atlas.json') }) */
let renderer: Renderer = createCanvas2DRenderer(cv);
function resize() {
  camera.dpr = window.devicePixelRatio || 1; camera.cssW = $('#stage').clientWidth; camera.cssH = $('#stage').clientHeight || 200;
  layout();
  camera.fit = W ? Math.min((camera.cssW - inset.r) / W, (camera.cssH - inset.t - inset.b) / H) : 5;
  renderer.resize(camera.cssW, camera.cssH, camera.dpr);
}
addEventListener('resize', resize);
const sc = () => camera.sc(), zMax = () => camera.zMax(), toS = (x: number, y: number) => camera.toS(x, y);
function clampCam() { camera.clamp(W, H); }
/** dollars, compact: $1.2M, $48k, $812 */
const money = n => { n = Math.round(n || 0); const a = Math.abs(n), sg = n < 0 ? '−' : ''; return sg + '$' + (a >= 1e9 ? (a / 1e9).toFixed(1) + 'B' : a >= 1e6 ? (a / 1e6).toFixed(1) + 'M' : a >= 1e4 ? Math.round(a / 1e3) + 'k' : a >= 1e3 ? (a / 1e3).toFixed(1) + 'k' : a); };

/** Everything a renderer may read, by reference (getters, because the state below is reassigned as messages arrive). */
const view: RenderView = {
  camera,
  get W() { return W; }, get H() { return H; }, get tiles() { return tiles; }, get wk() { return wk; }, get el() { return el; },
  get setts() { return setts; }, get blds() { return blds; }, get dots() { return dots; },
  get stat() { return stat; }, get detail() { return detail; }, get sel() { return sel; },
  get dens() { return dens; }, get denseW() { return denseW; }, get denseH() { return denseH; },
  get tod() { return tod; }, get bubbles() { return bubbles; }, get occ() { return occ; },
};

let frozen = !!(window as any).__DV_TEST__;   // test pages render only on demand (shot)
function draw(now) {
  requestAnimationFrame(draw);
  if (!frozen) render(now);
}
function render(now) {
  if (!ready) return;
  reportView(now);
  // camera easing (and glide the map centre when a panel opens or closes)
  camera.easeInset();
  if (camTarget !== null) { cam.z += (camTarget - cam.z) * 0.12; if (Math.abs(camTarget - cam.z) < 0.01) { cam.z = camTarget; camTarget = null; } }
  for (const d of dots) { const a = Math.max(0, Math.min(1, (now - d.t0) / 200)); d.x = d.fx + (d.tx - d.fx) * a; d.y = d.fy + (d.ty - d.fy) * a; }
  if (dirIds && now > dirUntil) { dirIds = null; if (performance.now() - userAt > 18000) pick_(-1, false); }
  if (follow && sel >= 0 && dots[sel] && dots[sel].seen === true) {   // wait until the server has actually sent this dot's position (otherwise the camera flies to the map corner)
    let tx = dots[sel].x, ty = dots[sel].y;
    if (dirIds && dirIds.length > 1) { const o = dots[dirIds[1]]; if (!(o.fl & 65)) { tx = (tx + o.x) / 2; ty = (ty + o.y) / 2; } }
    cam.x += (tx - cam.x) * 0.15; cam.y += (ty - cam.y) * 0.15;
  }
  clampCam();
  bubbles = bubbles.filter(b => now - b.t0 < bubbleLife(b));
  renderer.frame(view, now);
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
$('#bSpd').onclick = e => { localSpeed = localSpeed === 1 ? 4 : localSpeed === 4 ? 12 : 1; e.currentTarget.textContent = '⏩ ×' + localSpeed; };

requestAnimationFrame(draw);
if (LOCAL) startLocal(); else connect();
window.__dv = { handle, select, get cam() { return cam; } };
/* Deterministic rendering hook for visual regression tests (only exists if the page sets __DV_TEST__ before loading).
   freeze() stops the sim interval and the draw loop; step(n) advances the sim; shot() renders exactly one frame from an explicit camera. */
if ((window as any).__DV_TEST__) (window as any).__dvTest = {
  freeze() { frozen = true; if (localIv) clearInterval(localIv); localIv = null; },
  step(n: number) { for (let i = 0; i < n; i++) localTick(); },
  /** Swap the renderer for one with a different look, to test the theme / sprite / terrain seams. */
  restyle(o: { sea?: string; spriteBuildings?: Record<number, string>; atlas?: { w: number; h: number; frames: Record<string, { x: number; y: number; w: number; h: number; color: string }> }; solidTerrain?: string }) {
    let atlas = SpriteAtlas.empty;
    if (o.atlas) {
      const c = document.createElement('canvas'); c.width = o.atlas.w; c.height = o.atlas.h; const g = c.getContext('2d'); const frames: Record<string, any> = {};
      for (const [n, f] of Object.entries(o.atlas.frames)) { g.fillStyle = f.color; g.fillRect(f.x, f.y, f.w, f.h); frames[n] = { x: f.x, y: f.y, w: f.w, h: f.h }; }
      atlas = new SpriteAtlas(c, frames);
    }
    const theme = { ...THEME, sea: o.sea ?? THEME.sea, sprites: { building: (b: any) => o.spriteBuildings?.[b.ty] ?? null, dot: () => null } };
    const terrain = o.solidTerrain ? ((g: CanvasRenderingContext2D, v: RenderView, T: number) => { g.fillStyle = o.solidTerrain; g.fillRect(0, 0, v.W * T, v.H * T); }) : undefined;
    renderer = createCanvas2DRenderer(cv, { theme, sprites: atlas, terrain }); renderer.resize(camera.cssW, camera.cssH, camera.dpr); renderer.terrainChanged();
  },
  info() { return { W, H, setts: setts.map(t => [t.x, t.y, t.t]), ndots: dots.length, cssW: camera.cssW, cssH: camera.cssH, fit: camera.fit }; },
  shot(o: { x: number; y: number; px: number; still?: boolean; selNear?: boolean; weather?: number; season?: number; tod?: number; now?: number }) {
    const now = o.now ?? 100600;   // performance.now() is stubbed to 100000 by the test page, so speech bubbles are 600 ms old (fully faded in)
    follow = false; dirIds = null; camTarget = null; Object.assign(insetCur, inset);
    cam.x = o.x; cam.y = o.y; cam.z = o.px / camera.fit;
    if (!o.still) { lastViewAt = -1e9; sentView = ''; reportView(now); localTick(); }   // ask for exactly this viewport, then let the sim send the dots in it (`still` re-renders the same instant)
    if (o.selNear) { let best = -1, bd = 1e9; for (const d of dots) if (!(d.fl & 65) && d.seen) { const q = Math.hypot(d.x - cam.x, d.y - cam.y); if (q < bd) { bd = q; best = d.id; } } if (best >= 0) pick_(best, true); }
    tod = o.tod ?? tod; if (stat) { stat.weather = o.weather ?? 0; if (o.season !== undefined) stat.season = o.season; }
    for (const d of dots) d.t0 = -1e9;                   // finished interpolation: dots are exactly where the last frame put them
    render(now);
  },
};
})();
