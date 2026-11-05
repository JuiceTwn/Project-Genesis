/* Proves the graphics seams really work (theme, sprite atlas, sprite fallback, terrain painter) using the in-page hook.
   node tests/visual/seams.cjs   (needs a fresh `npm run build`) */
const { chromium } = require('playwright'); const path = require('path'); const assert = require('assert');
const DEMO = 'file://' + path.resolve(__dirname, '../../demo.html');
const init = `window.__DV_TEST__ = true; (() => { let s = 12345; Math.random = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; })(); performance.now = () => 100000;`;
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1280, height: 800 } }); const errs = [];
  p.on('pageerror', e => errs.push(String(e))); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.addInitScript(init); await p.goto(DEMO); await p.waitForFunction(() => window.__dvTest, null, { timeout: 20000 });
  await p.evaluate(() => { window.__dvTest.freeze(); window.__dvTest.step(400); });
  const info = await p.evaluate(() => window.__dvTest.info()); const cap = info.setts.find(t => t[2] === 0);
  const street = { x: cap[0], y: cap[1], px: 26 }, overview = { x: info.W / 2, y: info.H / 2, px: info.fit };
  const still = v => ({ ...v, still: true });   // re-render the same sim instant, so frames from different looks are comparable
  const grab = async (view) => { await p.evaluate(v => window.__dvTest.shot(v), view); return p.evaluate(() => { const c = document.getElementById('c'); return Array.from(c.getContext('2d').getImageData(0, 0, c.width, c.height).data); }); };
  const diff = (a, c) => { let n = 0; for (let i = 0; i < a.length; i += 4) if (Math.abs(a[i] - c[i]) > 12 || Math.abs(a[i + 1] - c[i + 1]) > 12 || Math.abs(a[i + 2] - c[i + 2]) > 12) n++; return 100 * n / (a.length / 4); };
  const has = (a, r, g, bl) => { for (let i = 0; i < a.length; i += 4) if (a[i] === r && a[i + 1] === g && a[i + 2] === bl) return true; return false; };
  const results = [];
  const check = (name, ok, extra = '') => { results.push(ok); console.log((ok ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + extra : '')); };

  const base = await grab(street);   // (this one steps the sim to send the dots in view; every later grab re-renders that same instant)
  check('default look has no magenta sprite pixels', !has(base, 255, 0, 255));

  // 1. atlas + theme names a sprite for building type 3 (taverns): it must be drawn
  const atlas = { w: 64, h: 64, frames: { tavern: { x: 0, y: 0, w: 64, h: 64, color: '#ff00ff' } } };
  await p.evaluate(a => window.__dvTest.restyle({ atlas: a, spriteBuildings: { 3: 'tavern' } }), atlas);
  const sprited = await grab(still(street));
  check('sprite from the atlas replaces the procedural building', has(sprited, 255, 0, 255) && diff(base, sprited) > 0.2, `(${diff(base, sprited).toFixed(2)}% pixels changed)`);
  check('...and only touches those buildings', diff(base, sprited) < 15);

  // 2. theme names a sprite the atlas does not have: must fall back to the procedural drawing, pixel for pixel
  await p.evaluate(a => window.__dvTest.restyle({ atlas: a, spriteBuildings: { 3: 'no_such_sprite' } }), atlas);
  const missing = await grab(still(street));
  check('a missing sprite falls back to the procedural drawing (identical to default)', diff(base, missing) === 0, `(${diff(base, missing).toFixed(3)}%)`);

  // 3. theme token: sea colour; terrain painter replaces the ground
  await p.evaluate(() => window.__dvTest.restyle({ sea: '#ff0000' }));
  const sea = await grab(still(overview));
  const px = (a, w, x, y) => [a[(y * w + x) * 4], a[(y * w + x) * 4 + 1], a[(y * w + x) * 4 + 2]];
  const W = 1280; const corner = px(sea, W, W - 4, 4);
  check('theme.sea recolours the ocean around the map', corner[0] === 255 && corner[1] === 0 && corner[2] === 0, `(corner pixel ${corner})`);
  await p.evaluate(() => window.__dvTest.restyle({ solidTerrain: '#123456' }));
  const solid = await grab(still(street));
  check('a custom terrain painter replaces the ground', has(solid, 0x12, 0x34, 0x56));

  check('no page errors', errs.length === 0, errs.join(' | '));
  await b.close(); process.exit(results.every(Boolean) ? 0 : 1);
})();
