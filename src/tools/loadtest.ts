/* Websocket load test: `npm run loadtest -- 100 20 [ws://localhost:3000]` = 100 viewers for 20 s.
   Viewers report random viewports and select dots like real clients; prints bytes/s per viewer and server tick drift. */
import { WebSocket } from 'ws';

const n = +process.argv[2] || 50, secs = +process.argv[3] || 15, url = process.argv[4] || 'ws://localhost:3000';
let bytes = 0, frames = 0, opened = 0, closed = 0, initBytes = 0, lastTick = 0, firstTick = -1, firstAt = 0, lastAt = 0;
for (let i = 0; i < n; i++) {
  const ws = new WebSocket(url);
  ws.on('open', () => {
    opened++;
    const x = Math.random() * 250, y = Math.random() * 180, w = 20 + Math.random() * 60;
    ws.send(JSON.stringify({ t: 'view', x0: x, y0: y, x1: x + w, y1: y + w * 0.6 }));
    if (i % 3 === 0) ws.send(JSON.stringify({ t: 'sel', id: Math.floor(Math.random() * 1000) }));
  });
  ws.on('message', (d: Buffer, bin: boolean) => {
    bytes += d.length;
    if (!bin && initBytes === 0) initBytes = d.length;
    if (bin && d[0] === 1 && i === 0) { frames++; lastTick = d.readUInt32LE(1); lastAt = Date.now(); if (firstTick < 0) { firstTick = lastTick; firstAt = lastAt; } }
  });
  ws.on('close', () => closed++);
  ws.on('error', () => {});
}
setTimeout(() => {
  const dt = (lastAt - firstAt) / 1000, ticks = lastTick - firstTick;
  console.log(`viewers ${n}: opened ${opened}, closed early ${closed}`);
  console.log(`init message ${(initBytes / 1024).toFixed(0)} KB each`);
  console.log(`avg ${(bytes / n / secs / 1024).toFixed(1)} KB/s per viewer, ${(bytes / secs / 1024 / 1024).toFixed(2)} MB/s total out`);
  console.log(`server ran ${ticks} ticks in ${dt.toFixed(1)} s = ${(ticks / dt).toFixed(2)} Hz (target 5.00)`);
  process.exit(0);
}, secs * 1000);
