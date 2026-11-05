/* Long stability run:  npm run longrun -- [years=3] [pop=1000] [out=ml/out/long.jsonl]
   Samples the whole economy every 5 sim days (1/12 year) so drift (population, money supply, unemployment, inequality, firm churn)
   shows up. Analyse with:  python3 ml/long_report.py ml/out/long.jsonl */
import { writeFileSync, appendFileSync } from 'node:fs';
import { World, DAY_TICKS, YEAR_DAYS } from '../sim';

const years = +(process.argv[2] || 3), pop = +(process.argv[3] || 1000), out = process.argv[4] || 'ml/out/long.jsonl';
writeFileSync(out, '');
const w = new World({ seed: 1337, deterministic: true, pop });
const every = 5 * DAY_TICKS, total = years * YEAR_DAYS * DAY_TICKS;
const last = { births: w.stats.births, deaths: w.stats.deaths, thefts: w.stats.thefts, closed: w.biz.closed, built: w.biz.built, arcs: 0 };
let starved = 0, other = 0, wagesNet = 0, lastWages = 0;
const t0 = Date.now();
let tl = Date.now();
const orig = (w as any).payWage;
(w as any).payWage = function (b: any, d: any, x: number) { const p = orig.call(this, b, d, x); wagesNet += p; return p; };

for (let i = 1; i <= total; i++) {
  w.step();
  for (const m of w.drain()) if (m.t === 'ev' && m.k === 'death') { if (/starved/.test(m.x)) starved++; else other++; }
  if (i % every !== 0) continue;
  const alive = w.dots.filter(d => !d.dead), adults = alive.filter(d => d.adult), jobless = adults.filter(d => d.job === 3 && d.work < 0).length;
  const coins = alive.map(d => d.coin).sort((a, b) => a - b), tot = coins.reduce((a, b) => a + b, 0);
  const top = (f: number) => coins.slice(Math.floor(coins.length * (1 - f))).reduce((a, b) => a + b, 0) / tot;
  let g = 0; coins.forEach((v, k) => { g += (2 * (k + 1) - coins.length - 1) * v; });
  const mk = w.markets.filter(m => m.state === 'ok'), firms = w.buildings.filter(b => b.state === 'ok' && w.isBiz(b)).length;
  const row = {
    day: w.day(), year: +(w.day() / YEAR_DAYS).toFixed(2), pop: alive.length, kids: alive.filter(d => !d.adult).length, elders: alive.filter(d => d.age > d.life * 0.8).length,
    births: w.stats.births - last.births, deaths: w.stats.deaths - last.deaths, starved, otherDeaths: other, thefts: w.stats.thefts - last.thefts,
    jobless: +(100 * jobless / Math.max(1, adults.length)).toFixed(1), meanCoin: Math.round(tot / alive.length), medianCoin: Math.round(coins[coins.length >> 1]),
    gini: +(g / (coins.length * tot)).toFixed(3), top1: +(100 * top(0.01)).toFixed(1), top10: +(100 * top(0.1)).toFixed(1),
    supply: Math.round(w.moneySupply()), minted: Math.round(w.ledger.minted),
    flow: Object.fromEntries(Object.entries(w.ledger.flow).map(([k, v]) => [k, Math.round(v as number)])),
    nation: Math.round(w.nation.treasury), towns: Math.round(w.townTreasury()), firms, failed: w.biz.closed - last.closed, founded: w.biz.built - last.built,
    meal: Math.round(mk.reduce((a, m) => a + w.mprice(m), 0) / Math.max(1, mk.length)), stockMin: Math.round(Math.min(...mk.map(m => m.stock))),
    stockAvg: Math.round(mk.reduce((a, m) => a + m.stock, 0) / Math.max(1, mk.length)),
    payPerAdultDay: Math.round((wagesNet - lastWages) / 5 / Math.max(1, adults.length)), arcs: w.story.nextId - 1 - last.arcs, msPerTick: +((Date.now() - tl) / every).toFixed(2),
  };
  appendFileSync(out, JSON.stringify(row) + '\n');
  Object.assign(last, { births: w.stats.births, deaths: w.stats.deaths, thefts: w.stats.thefts, closed: w.biz.closed, built: w.biz.built, arcs: w.story.nextId - 1 });
  starved = 0; other = 0; lastWages = wagesNet; tl = Date.now();
  console.log(`yr ${row.year} pop ${row.pop} jobless ${row.jobless}% supply $${(row.supply / 1e6).toFixed(1)}M firms ${row.firms} (+${row.founded}/-${row.failed}) deaths ${row.deaths} births ${row.births} ${row.msPerTick}ms/tick`);
}
console.log(`done: ${years} sim years in ${((Date.now() - t0) / 60000).toFixed(1)} minutes`);
