/* Dotville server: one shared world, binary frames at 5 Hz, tiny JSON events. */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { WebSocketServer, WebSocket } from 'ws';
import { World, TICK_HZ } from '../sim';
import type { View } from '../sim/output';
import { Archive } from './archive';
import { route } from './pages';

const PORT = +(process.env.PORT || 3000);
const MAX_CLIENTS = +(process.env.MAX_CLIENTS || 400);
const ROOT = process.env.DOTVILLE_ROOT || process.cwd();
const PUBLIC = path.join(ROOT, 'public');
const STATE = path.join(ROOT, 'data', 'state.json');

let state: any = null;
try { state = JSON.parse(fs.readFileSync(STATE, 'utf8')); } catch { /* fresh world */ }
const archive = new Archive(path.join(ROOT, 'data', 'archive'));
const world = new World({ seed: 1337, state });
console.log(`world ready: day ${world.day()}, ${world.dots.length} dots, ${world.buildings.length} buildings`);

const MIME: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
const server = http.createServer(async (req, res) => {
  let u = (req.url || '/').split('?')[0];
  if (u === '/health') { res.end('ok'); return; }
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

type Client = WebSocket & { sel: number; budget: number; view: View | null; watch: Set<number> };
const wss = new WebSocketServer({ server, perMessageDeflate: false, maxPayload: 512 });
const initJson = JSON.stringify(world.initMsg());
wss.on('connection', (raw: WebSocket) => {
  const ws = raw as Client;
  if (wss.clients.size > MAX_CLIENTS) { ws.close(1013); return; }
  ws.sel = -1; ws.budget = 20; ws.view = null; ws.watch = new Set();   // null = zoomed-out overview until the client reports its viewport
  ws.send(initJson);
  ws.on('message', data => {
    if (ws.budget-- <= 0) return;             // flood guard
    let m: any; try { m = JSON.parse(data.toString()); } catch { return; }
    if (m.t === 'sel') ws.sel = Number.isInteger(m.id) && m.id >= 0 && m.id < world.dots.length ? m.id : -1;
    else if (m.t === 'view') { const n = [m.x0, m.y0, m.x1, m.y1]; ws.view = n.every(Number.isFinite) ? { x0: n[0], y0: n[1], x1: n[2], y1: n[3] } : null; }
    else if (m.t === 'cast') ws.send(JSON.stringify({ t: 'cast', list: world.cast(14) }));
    else if (m.t === 'watch' && Number.isInteger(m.id) && m.id >= 0 && m.id < world.dots.length) { if (m.on === false) ws.watch.delete(m.id); else if (ws.watch.size < 8) ws.watch.add(m.id); }
    else if (m.t === 'act' && typeof m.n === 'string') world.act(m.n, Number.isInteger(m.id) ? m.id : -1);
  });
  ws.on('error', () => {});
});
setInterval(() => { for (const ws of wss.clients) (ws as Client).budget = 20; }, 1000);

function broadcast(data: Buffer | string, binary: boolean) { for (const ws of wss.clients) if (ws.readyState === 1) ws.send(data, { binary }); }

let next = Date.now();
function loop() {
  world.step();
  if (world.archive.length) for (const a of world.archive.splice(0)) archive.put(a.kind as 'issue' | 'story', a.id, a.data);
  if (wss.clients.size) {
    for (const c of wss.clients) if (c.readyState === 1) { const ws = c as Client; c.send(Buffer.from(world.frameFor(ws.view, world.relatedIds(ws.sel))), { binary: true }); }
    const msgs = world.drain();
    if (msgs.length) {
      broadcast(JSON.stringify({ t: 'batch', m: msgs }), false);
      for (const c of wss.clients) { const ws = c as Client; if (!ws.watch.size || ws.readyState !== 1) continue; const notes = msgs.filter(m => m.t === 'ev' && (m.w || 0) >= 2 && m.ids && m.ids.some((i: number) => ws.watch.has(i))).map(m => ({ id: m.ids.find((i: number) => ws.watch.has(i)), text: m.x })); if (notes.length) ws.send(JSON.stringify({ t: 'note', notes: notes.slice(0, 6) })); }   // followed characters: push their news
    }
    if (world.tick % TICK_HZ === 0) {
      const s = world.statsMsg(); s.viewers = wss.clients.size;
      broadcast(JSON.stringify(s), false);
      for (const ws of wss.clients) if ((ws as Client).sel >= 0 && ws.readyState === 1) ws.send(JSON.stringify(world.detail((ws as Client).sel)));
    }
  } else world.drain();                        // nobody watching: keep sim running, discard output
  next += 1000 / TICK_HZ;
  setTimeout(loop, Math.max(0, next - Date.now()));
}
loop();

function save() { archive.flush(); try { fs.mkdirSync(path.dirname(STATE), { recursive: true }); fs.writeFileSync(STATE + '.tmp', JSON.stringify(world.serialize())); fs.renameSync(STATE + '.tmp', STATE); } catch (e: any) { console.error('save failed', e.message); } }
setInterval(save, 60000);
for (const sig of ['SIGINT', 'SIGTERM'] as const) process.on(sig, () => { save(); process.exit(0); });

server.listen(PORT, () => console.log(`Dotville on http://localhost:${PORT}`));
