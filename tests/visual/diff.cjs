/* Compare two capture dirs: node tests/visual/diff.cjs <golden> <new> [maxPct=0]. Prints % of pixels differing by >12/255 per scene; exit 1 if any exceeds maxPct. */
const { chromium } = require('playwright'); const fs = require('fs');
const [A, B, MAX = '0'] = process.argv.slice(2); let bad = 0;
(async () => {
  const b = await chromium.launch(); const p = await b.newPage();
  for (const f of fs.readdirSync(A).filter(f => f.endsWith('.txt'))) {
    const a = fs.readFileSync(`${A}/${f}`, 'utf8'), c = fs.readFileSync(`${B}/${f}`, 'utf8');
    const r = await p.evaluate(async ([a, c]) => {
      const load = u => new Promise(res => { const i = new Image(); i.onload = () => res(i); i.src = u; });
      const [ia, ic] = await Promise.all([load(a), load(c)]);
      if (ia.width !== ic.width || ia.height !== ic.height) return { size: [ia.width, ia.height, ic.width, ic.height] };
      const g = i => { const k = document.createElement('canvas'); k.width = i.width; k.height = i.height; const x = k.getContext('2d'); x.drawImage(i, 0, 0); return x.getImageData(0, 0, i.width, i.height).data; };
      const da = g(ia), dc = g(ic); let n = 0, x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
      for (let i = 0; i < da.length; i += 4) if (Math.abs(da[i] - dc[i]) > 12 || Math.abs(da[i + 1] - dc[i + 1]) > 12 || Math.abs(da[i + 2] - dc[i + 2]) > 12) { n++; const q = i / 4, x = q % ia.width, y = (q / ia.width) | 0; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      return { pct: +(100 * n / (da.length / 4)).toFixed(3), bbox: n ? [x0, y0, x1, y1] : null, w: ia.width, h: ia.height };
    }, [a, c]);
    const over = r.size || r.pct > +MAX; if (over) bad++;
    console.log((over ? 'DIFF ' : 'same ') + f.replace('.txt', ''), JSON.stringify(r));
  }
  await b.close(); console.log(bad ? `${bad} scene(s) differ` : 'all scenes match'); process.exit(bad ? 1 : 0);
})();
