/* Dotville server: one shared world, binary frames at 5 Hz, tiny JSON events. */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { WebSocketServer, WebSocket } from 'ws';
import { World, TICK_HZ } from '../sim';

const PORT = +(process.env.PORT || 3000);
const MAX_CLIENTS = +(process.env.MAX_CLIENTS || 400);
const ROOT = process.env.DOTVILLE_ROOT || process.cwd();
const PUBLIC = path.join(ROOT, 'public');
const STATE = path.join(ROOT, 'data', 'state.json');

let state: any = null;
try { state = JSON.parse(fs.readFileSync(STATE, 'utf8')); } catch { /* fresh world */ }
const world = new World({ seed: 1337, state });
console.log(`world ready: day ${world.day()}, ${world.dots.length} dots, ${world.buildings.length} buildings`);

const MIME: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
const server = http.createServer((req, res) => {
  let u = (req.url || '/').split('?')[0];
  if (u === '/health') { res.end('ok'); return; }
  if (u === '/') u = '/index.html';
  const f = path.join(PUBLIC, path.normalize(u).replace(/^(\.\.[/\\])+/, ''));
  if (!f.startsWith(PUBLIC)) { res.writeHead(403).end(); return; }
  fs.readFile(f, (err, buf) => {
    if (err) { res.writeHead(404).end('not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(buf);
  });
});

type Client = WebSocket & { sel: number; budget: number };
const wss = new WebSocketServer({ server, perMessageDeflate: false, maxPayload: 512 });
const initJson = JSON.stringify(world.initMsg());
wss.on('connection', (raw: WebSocket) => {
  const ws = raw as Client;
  if (wss.clients.size > MAX_CLIENTS) { ws.close(1013); return; }
  ws.sel = -1; ws.budget = 20;
  ws.send(initJson);
  ws.on('message', data => {
    if (ws.budget-- <= 0) return;             // flood guard
    let m: any; try { m = JSON.parse(data.toString()); } catch { return; }
    if (m.t === 'sel') ws.sel = Number.isInteger(m.id) && m.id >= 0 && m.id < world.dots.length ? m.id : -1;
    else if (m.t === 'act' && typeof m.n === 'string') world.act(m.n, Number.isInteger(m.id) ? m.id : -1);
  });
  ws.on('error', () => {});
});
setInterval(() => { for (const ws of wss.clients) (ws as Client).budget = 20; }, 1000);

function broadcast(data: Buffer | string, binary: boolean) { for (const ws of wss.clients) if (ws.readyState === 1) ws.send(data, { binary }); }

let next = Date.now();
function loop() {
  world.step();
  if (wss.clients.size) {
    broadcast(Buffer.from(world.frame()), true);
    const msgs = world.drain();
    if (msgs.length) broadcast(JSON.stringify({ t: 'batch', m: msgs }), false);
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

function save() { try { fs.mkdirSync(path.dirname(STATE), { recursive: true }); fs.writeFileSync(STATE + '.tmp', JSON.stringify(world.serialize())); fs.renameSync(STATE + '.tmp', STATE); } catch (e: any) { console.error('save failed', e.message); } }
setInterval(save, 60000);
for (const sig of ['SIGINT', 'SIGTERM'] as const) process.on(sig, () => { save(); process.exit(0); });

server.listen(PORT, () => console.log(`Dotville on http://localhost:${PORT}`));
