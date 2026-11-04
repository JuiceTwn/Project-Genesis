'use strict';
// Dotville server: one shared world, binary frames at 5 Hz, tiny JSON events.
const http = require('http'), fs = require('fs'), path = require('path');
const { WebSocketServer } = require('ws');
const { World, TICK_HZ } = require('./public/sim.js');

const PORT = +process.env.PORT || 3000;
const MAX_CLIENTS = +process.env.MAX_CLIENTS || 400;
const STATE = path.join(__dirname, 'data', 'state.json');

let state = null;
try { state = JSON.parse(fs.readFileSync(STATE, 'utf8')); } catch (e) { /* fresh world */ }
const world = new World({ seed: 1337, state });
console.log(`world ready: day ${world.day()}, ${world.dots.length} dots, ${world.buildings.length} buildings`);

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };
const server = http.createServer((req, res) => {
  let u = req.url.split('?')[0];
  if (u === '/health') { res.end('ok'); return; }
  if (u === '/') u = '/index.html';
  const f = path.join(__dirname, 'public', path.normalize(u).replace(/^(\.\.[\/\\])+/, ''));
  if (!f.startsWith(path.join(__dirname, 'public'))) { res.writeHead(403).end(); return; }
  fs.readFile(f, (err, buf) => {
    if (err) { res.writeHead(404).end('not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(buf);
  });
});

const wss = new WebSocketServer({ server, perMessageDeflate: false, maxPayload: 512 });
const initJson = JSON.stringify(world.initMsg());
wss.on('connection', ws => {
  if (wss.clients.size > MAX_CLIENTS) { ws.close(1013); return; }
  ws.sel = -1; ws.budget = 20; ws.last = 0;
  ws.send(initJson);
  ws.on('message', raw => {
    if (ws.budget-- <= 0) return;             // flood guard
    let m; try { m = JSON.parse(raw); } catch (e) { return; }
    if (m.t === 'sel') ws.sel = Number.isInteger(m.id) && m.id >= 0 && m.id < world.dots.length ? m.id : -1;
    else if (m.t === 'act' && typeof m.n === 'string') world.act(m.n, Number.isInteger(m.id) ? m.id : -1);
  });
  ws.on('error', () => {});
});
setInterval(() => { for (const ws of wss.clients) ws.budget = 20; }, 1000);

function broadcast(data, binary) { for (const ws of wss.clients) if (ws.readyState === 1) ws.send(data, { binary }); }

let next = Date.now();
function loop() {
  world.step();
  if (wss.clients.size) {
    broadcast(Buffer.from(world.frame()), true);
    const msgs = world.drain();
    if (msgs.length) broadcast(JSON.stringify({ t: 'batch', m: msgs }), false);
    if (world.tick % TICK_HZ === 0) {
      const viewers = wss.clients.size, s = world.statsMsg(); s.viewers = viewers;
      broadcast(JSON.stringify(s), false);
      for (const ws of wss.clients) if (ws.sel >= 0 && ws.readyState === 1) ws.send(JSON.stringify(world.detail(ws.sel)));
    }
  } else world.drain();                        // nobody watching: keep sim running, discard output
  next += 1000 / TICK_HZ;
  setTimeout(loop, Math.max(0, next - Date.now()));
}
loop();

function save() { try { fs.mkdirSync(path.dirname(STATE), { recursive: true }); fs.writeFileSync(STATE + '.tmp', JSON.stringify(world.serialize())); fs.renameSync(STATE + '.tmp', STATE); } catch (e) { console.error('save failed', e.message); } }
setInterval(save, 60000);
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { save(); process.exit(0); });

server.listen(PORT, () => console.log(`Dotville on http://localhost:${PORT}`));
