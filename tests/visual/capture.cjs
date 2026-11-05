/* Visual regression capture: deterministic frames of the demo client.
   node tests/visual/capture.cjs <outdir>
   Uses the page's __dvTest hook (see client/main.ts): sim stepped a fixed number of times, camera set explicitly, ONE frame rendered.
   The first browser launch after a build renders slightly differently (cold font cache), so a throwaway warm-up pass runs first. */
const { chromium, devices } = require('playwright'); const fs = require('fs'); const path = require('path');
const out = process.argv[2]; if (!out) { console.error('usage: capture.cjs <outdir>'); process.exit(2); }
const DEMO = 'file://' + path.resolve(__dirname, '../../demo.html');
const init = `window.__DV_TEST__ = true; (() => { let s = 12345; Math.random = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; })(); performance.now = () => 100000;`;
const devs = [['desk', { viewport: { width: 1280, height: 800 } }], ['phone', { ...devices['iPhone 13'] }]];

async function pass(browser, dir) {
  fs.mkdirSync(dir, { recursive: true }); let errs = 0;
  for (const [dn, dc] of devs) {
    const c = await browser.newContext(dc); const p = await c.newPage();
    p.on('pageerror', e => { errs++; console.error(e); }); p.on('console', m => { if (m.type() === 'error') { errs++; console.error(m.text()); } });
    await p.addInitScript(init); await p.goto(DEMO);
    await p.waitForFunction(() => window.__dvTest, null, { timeout: 20000 });
    await p.evaluate(() => { window.__dvTest.freeze(); window.__dvTest.step(400); });
    const info = await p.evaluate(() => window.__dvTest.info());
    const cap = info.setts.find(t => t[2] === 0), town = info.setts.find(t => t[2] === 1);
    const scenes = [
      ['overview', { x: info.W / 2, y: info.H / 2, px: info.fit }],
      ['region', { x: cap[0], y: cap[1], px: 7 }],
      ['town_labels', { x: cap[0], y: cap[1], px: 14 }],
      ['street', { x: cap[0], y: cap[1], px: 26 }],
      ['street_sel', { x: cap[0], y: cap[1], px: 26, selNear: true }],
      ['town2_night', { x: town[0], y: town[1], px: 20, tod: 0.95 }],
      ['rain', { x: cap[0], y: cap[1], px: 18, weather: 1, season: 1 }],
      ['snow_dusk', { x: cap[0], y: cap[1], px: 12, weather: 2, season: 3, tod: 0.8 }],
    ];
    for (const [name, o] of scenes) {
      await p.evaluate(o => window.__dvTest.shot(o), o);
      fs.writeFileSync(path.join(dir, `${dn}_${name}.txt`), await p.evaluate(() => document.getElementById('c').toDataURL('image/png')));
    }
    await c.close();
  }
  return errs;
}
(async () => {
  const b = await chromium.launch();
  await pass(b, path.join(require('os').tmpdir(), 'dv-warmup'));
  const errs = await pass(b, out);
  await b.close();
  console.log(`captured to ${out}${errs ? ` (${errs} page errors!)` : ''}`); process.exit(errs ? 1 : 0);
})();
