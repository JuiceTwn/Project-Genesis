/* Dotville server: one shared world, binary frames at 5 Hz, tiny JSON events. */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { WebSocketServer, WebSocket } from 'ws';
import { World, TICK_HZ, DAY_TICKS } from '../sim';
import type { View } from '../sim/output';
import { Archive } from './archive';
import { route } from './pages';
import { coalesce } from '../shared/feed';
import { parseClientMsg, type CastMsg } from '../shared/protocol';
import { loadState, saveState } from './store';
import zlib from 'node:zlib';

const PORT = +(process.env.PORT || 3000);
const MAX_CLIENTS = +(process.env.MAX_CLIENTS || 400);
const ROOT = process.env.DOTVILLE_ROOT || process.cwd();
const PUBLIC = path.join(ROOT, 'public');
const STATE = path.join(ROOT, 'data', 'state.json');

let state: any = null;
const loaded = loadState(STATE, s => s && s.v === 4 && typeof s.tiles === 'string');
if (loaded) { state = loaded.state; console.log(`loaded save: ${path.basename(loaded.from)}`); }
const archive = new Archive(path.join(ROOT, 'data', 'archive'));
const world = new World({ seed: 1337, state });
/* A brand-new world is warmed up headless so no viewer ever watches the day-1 start-up flood (elections, gifts, trait shifts). */
const WARMUP_DAYS = +(process.env.WARMUP_DAYS ?? 3);
if (!state && WARMUP_DAYS > 0) {
  const t0 = Date.now();
  for (let i = 0, n = WARMUP_DAYS * DAY_TICKS; i < n; i++) { world.step(); world.drain(); if (world.archive.length) for (const a of world.archive.splice(0)) archive.put(a.kind as 'issue' | 'story', a.id, a.data); }
  world.hist = [];
  console.log(`warmed up ${WARMUP_DAYS} days in ${Date.now() - t0} ms`);
}
console.log(`world ready: day ${world.day()}, ${world.dots.length} dots, ${world.buildings.length} buildings`);

const MIME: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
const server = http.createServer(async (req, res) => {
  let u = (req.url || '/').split('?')[0];
  if (u === '/health') { const lag = Date.now() - lastLoopAt; if (lag > 10000) { res.writeHead(503).end(`stalled ${lag} ms`); return; } res.end(`ok tick ${world.tick} viewers ${wss.clients.size}`); return; }
  if (u === '/robots.txt') { res.end('User-agent: *\nAllow: /\nSitemap: ' + origin(req) + '/sitemap.xml\n'); return; }
  try {
    const r = await route(u, { archive, origin: origin(req), root: ROOT });
    if (r) { res.writeHead(r.status, { 'Content-Type': r.type, ...(r.headers || {}) }); res.end(r.body); return; }
  } catch (e: any) { console.error('route error', e.message); res.writeHead(500).end('error'); return; }
  if (u === '/') u = '/index.html';
  const f = path.join(PUBLIC, path.normalize(u).replace(/^(\.\.[/\\])+/, ''));
  if (!f.startsWith(PUBLIC)) { res.writeHead(403).end(); return; }
  fs.readFile(f, (err, buf) => {
    if (err) { res.writeHead(404).end('not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(buf);
  });
});

/** Public origin for absolute links in share tags: PUBLIC_URL if set, else from the request (honouring a reverse proxy). */
function origin(req: http.IncomingMessage): string { if (process.env.PUBLIC_URL) return process.env.PUBLIC_URL.replace(/\/$/, ''); const proto = (req.headers['x-forwarded-proto'] as string) || 'http'; return `${proto}://${req.headers.host || 'localhost'}`; }

type Client = WebSocket & { ip: string; sel: number; budget: number; view: View | null; watch: Set<number> };
const wss = new WebSocketServer({ server, perMessageDeflate: false, maxPayload: 512 });
/* Built fresh for each joiner (cached a few seconds): the feed, chronicle, buildings and dots all change as the world lives.
   Sent gzip-compressed as a binary frame with type byte 2 (it is ~475 KB of JSON). */
let initBuf: Buffer | null = null, initAt = 0;
function getInit() { if (!initBuf || Date.now() - initAt > 5000) { initBuf = Buffer.concat([Buffer.from([2]), zlib.gzipSync(JSON.stringify(world.initMsg()), { level: 6 })]); initAt = Date.now(); } return initBuf; }
const MAX_PER_IP = +(process.env.MAX_PER_IP || 12), ACT_GAP_MS = +(process.env.ACT_GAP_MS || 4000), TRUST_PROXY = !!process.env.TRUST_PROXY;
const perIp = new Map<string, number>(), lastAct = new Map<string, number>();
const ipOf = (req: http.IncomingMessage) => (TRUST_PROXY && (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim()) || req.socket.remoteAddress || '?';
setInterval(() => { const cut = Date.now() - 60000; for (const [k, t] of lastAct) if (t < cut) lastAct.delete(k); }, 60000);
wss.on('connection', (raw: WebSocket, req: http.IncomingMessage) => {
  const ws = raw as Client;
  ws.ip = ipOf(req);
  if (wss.clients.size > MAX_CLIENTS || (perIp.get(ws.ip) || 0) >= MAX_PER_IP) { ws.close(1013); return; }
  perIp.set(ws.ip, (perIp.get(ws.ip) || 0) + 1);
  ws.on('close', () => { const n = (perIp.get(ws.ip) || 1) - 1; if (n > 0) perIp.set(ws.ip, n); else perIp.delete(ws.ip); });
  ws.sel = -1; ws.budget = 20; ws.view = null; ws.watch = new Set();   // null = zoomed-out overview until the client reports its viewport
  ws.send(getInit());
  ws.on('message', data => {
    if (ws.budget-- <= 0) return;             // flood guard
    const m = parseClientMsg(data.toString(), world.dots.length); if (!m) return;
    switch (m.t) {
      case 'sel': ws.sel = m.id; break;
      case 'view': ws.view = Number.isFinite(m.x0) ? { x0: m.x0, y0: m.y0, x1: m.x1, y1: m.y1 } : null; break;   // null = zoomed-out overview
      case 'cast': ws.send(JSON.stringify({ t: 'cast', list: world.cast(14) } satisfies CastMsg)); break;
      case 'watch': if (m.on === false) ws.watch.delete(m.id); else if (ws.watch.size < 8) ws.watch.add(m.id); break;
      case 'act': { const now = Date.now(); if (now - (lastAct.get(ws.ip) || 0) < ACT_GAP_MS) return; lastAct.set(ws.ip, now); world.act(m.n, m.id ?? -1); break; }
    }
  });
  ws.on('error', () => {});
});
setInterval(() => { for (const ws of wss.clients) (ws as Client).budget = 20; }, 1000);

function broadcast(data: Buffer | string, binary: boolean) { for (const ws of wss.clients) if (ws.readyState === 1) ws.send(data, { binary }); }

let next = Date.now(), lastLoopAt = Date.now(), errStreak = 0;
function loop() {
  try { tickOnce(); errStreak = 0; }
  catch (e: any) {
    /* A throw inside the sim must not silently freeze the world. Log it; if it keeps happening, exit WITHOUT saving
       (state may be half-updated) so the supervisor restarts from the last good save. */
    console.error('tick error', e && e.stack || e);
    if (++errStreak >= 5) { console.error('too many tick errors, exiting'); process.exit(1); }
  }
  lastLoopAt = Date.now();
  next += 1000 / TICK_HZ;
  if (next < Date.now() - 2000) next = Date.now();   // fell far behind (VM pause, GC): resume at real time instead of racing to catch up
  setTimeout(loop, Math.max(0, next - Date.now()));
}
function tickOnce() {
  world.step();
  if (world.archive.length) for (const a of world.archive.splice(0)) archive.put(a.kind as 'issue' | 'story', a.id, a.data);
  if (wss.clients.size) {
    for (const c of wss.clients) if (c.readyState === 1) { const ws = c as Client; c.send(Buffer.from(world.frameFor(ws.view, world.relatedIds(ws.sel))), { binary: true }); }
    const msgs = world.drain();
    if (msgs.length) {
      broadcast(JSON.stringify({ t: 'batch', m: coalesce(msgs) }), false);
      for (const c of wss.clients) { const ws = c as Client; if (!ws.watch.size || ws.readyState !== 1) continue; const notes = msgs.filter(m => m.t === 'ev' && (m.w || 0) >= 2 && m.ids && m.ids.some((i: number) => ws.watch.has(i))).map(m => ({ id: m.ids.find((i: number) => ws.watch.has(i)), text: m.x })); if (notes.length) ws.send(JSON.stringify({ t: 'note', notes: notes.slice(0, 6) })); }   // followed characters: push their news
    }
    if (world.tick % TICK_HZ === 0) {
      const s = world.statsMsg(); s.viewers = wss.clients.size;
      broadcast(JSON.stringify(s), false);
      for (const ws of wss.clients) if ((ws as Client).sel >= 0 && ws.readyState === 1) ws.send(JSON.stringify(world.detail((ws as Client).sel)));
    }
  } else world.drain();                        // nobody watching: keep sim running, discard output
}
loop();

let saves = 0;
function save() {
  archive.flush();
  try { const n = saveState(STATE, world.serialize(), saves++ % 10 === 0); if (saves % 10 === 1) console.log(`saved ${(n / 1048576).toFixed(1)} MB, day ${world.day()}`); }
  catch (e: any) { console.error('save failed', e.message); }
}
setInterval(save, 60000);
for (const sig of ['SIGINT', 'SIGTERM'] as const) process.on(sig, () => { save(); process.exit(0); });
process.on('uncaughtException', e => { console.error('uncaught', e); process.exit(1); });
process.on('unhandledRejection', e => { console.error('unhandled rejection', e); });

server.listen(PORT, () => console.log(`Dotville on http://localhost:${PORT}`));
