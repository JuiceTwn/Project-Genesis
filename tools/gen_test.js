const Gen = require('../public/worldgen.js');
const seed = +process.argv[2] || 1337;
const t0 = Date.now();
const m = Gen.generate(seed, { pop: 480 });
console.log('gen ms', Date.now() - t0, 'settlements', m.settlements.map(s => `${Gen.TIERS[s.tier][0]}@${s.x},${s.y} plots=${(s.plots||[]).length} need=${s.needPlots}`).join(' | '));
const W = m.W, H = m.H, S = 8, w = W * S, h = H * S, px = Buffer.alloc(w * h * 3);
const col = { 0:[120,160,80],1:[110,80,50],2:[150,90,70],3:[60,110,170],4:[170,190,100],5:[50,100,50],6:[140,100,60],7:[110,150,190],8:[225,210,160],9:[120,115,110] };
const set = (x, y, c) => { for (let b = 0; b < S; b++) for (let a = 0; a < S; a++) { const o = ((y * S + b) * w + x * S + a) * 3; px[o] = c[0]; px[o+1] = c[1]; px[o+2] = c[2]; } };
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x; let c = col[m.t[i]].slice(); const e = m.h[i]; if (m.t[i] === 3) { c = m.wk[i] === 1 ? [30, 70, 130] : [70, 130, 190]; } else { const k = 0.8 + e * 0.5; c = c.map(v => Math.min(255, v * k)); } set(x, y, c); }
for (const p of m.plots) for (let b = 0; b < 3; b++) for (let a = 0; a < 3; a++) set(p.x + a, p.y + b, p.rural ? [200,200,90] : [190,110,90]);
for (const s of m.settlements) set(s.x, s.y, [255, 0, 0]);
require('fs').writeFileSync('/tmp/map.ppm', Buffer.concat([Buffer.from(`P6 ${w} ${h} 255\n`), px]));
const cnt = {}; for (const v of m.t) cnt[v] = (cnt[v] || 0) + 1; console.log(cnt, 'plots', m.plots.length);
