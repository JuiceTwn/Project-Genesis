/* Reality + watchability scorecard:  npm run reality -- [days=6] [pop=1800]
   Compares the sim to real-world benchmarks (unit-free ratios, so it works whatever the currency) and measures how much there is to watch.
   Benchmarks are approximate figures from memory (US/OECD-ish): treat them as targets to be checked, not gospel. */
import { World, DAY_TICKS, YEAR_DAYS, ADULT, BUILD_COST, NATION_TAX, DAY_WAGE } from '../sim';

const days = +(process.argv[2] || 6), pop = +(process.argv[3] || 1800);
const w = new World({ seed: 1337, deterministic: true, pop });
let wages = 0, shifts = 0; const orig = (w as any).payWage;
(w as any).payWage = function (b: any, d: any, x: number) { const p = orig.call(this, b, d, x); if (p > 0) { wages += p; shifts++; } return p; };
const m0 = w.stats.meals, born0 = w.stats.births, died0 = w.stats.deaths, th0 = w.stats.thefts, closed0 = w.biz.closed, firms0 = w.buildings.filter(b => b.state === 'ok' && w.isBiz(b)).length;
let priceSum = 0, priceN = 0, hot = 0; const dcause: Record<string, number> = {}; const cast = new Set<number>(); let arcsSum = 0;
for (let i = 0; i < days * DAY_TICKS; i++) {
  w.step();
  for (const m of w.drain()) {
    if (m.t === 'ev' && m.k === 'death') { const c = /starved/.test(m.x) ? 'starved' : /accident|fall|cart/.test(m.x) ? 'accident' : /pneumonia|illness|fever/.test(m.x) ? 'illness' : 'old age'; dcause[c] = (dcause[c] || 0) + 1; }
    if (m.t === 'ev' && m.w >= 3) { hot++; for (const id of m.ids || []) cast.add(id); }
  }
  if (i % 300 === 0) { for (const m of w.markets) { priceSum += w.mprice(m); priceN++; } arcsSum += w.story.arcs.filter(a => !a.done).length; }
}
const alive = w.dots.filter(d => !d.dead), adults = alive.filter(d => d.adult), yrs = days / YEAR_DAYS;
const avgLocal = w.S.reduce((a: number, s: any) => a + w.gov(s).tax, 0) / w.S.length, taxRate = (avgLocal + 100 * NATION_TAX) / 100;
const employed = adults.filter(d => d.work >= 0 || d.job !== 3), wage = wages / (1 - taxRate) / days / Math.max(1, employed.length), meal = priceSum / priceN;   // gross pay
const wealth = alive.map(d => d.coin + w.buildings.filter(b => b.owner === d.id && b.state === 'ok').reduce((a, b) => a + (b.cash || 0), 0)).sort((a, b) => a - b), tot = wealth.reduce((a, b) => a + b, 0);
const gini = (() => { let c = 0; wealth.forEach((v, i) => { c += (2 * (i + 1) - wealth.length - 1) * v; }); return c / (wealth.length * tot); })();
const top = (f: number) => wealth.slice(Math.floor(wealth.length * (1 - f))).reduce((a, b) => a + b, 0) / tot;
const meanLife = alive.reduce((a, d) => a + d.life, 0) / alive.length, firms = w.buildings.filter(b => b.state === 'ok' && w.isBiz(b)).length;
const rows: [string, number, [number, number], string][] = [
  ['life expectancy (years)', meanLife, [74, 82], ''],
  ['adulthood age / lifespan', ADULT / meanLife, [0.2, 0.25], ''],
  ['children share of population %', 100 * alive.filter(d => !d.adult).length / alive.length, [16, 25], ''],
  ['65+ equivalent share %', 100 * alive.filter(d => d.age > d.life * 0.8).length / alive.length, [10, 20], ''],
  ['births per 1,000 per year', (w.stats.births - born0) / yrs / alive.length * 1000, [9, 18], ''],
  ['deaths per 1,000 per year', (w.stats.deaths - died0) / yrs / alive.length * 1000, [7, 12], ''],
  ['thefts per 100 per year', (w.stats.thefts - th0) / yrs / alive.length * 100, [1, 3], ''],
  ['work hours per day', shifts / days / Math.max(1, employed.length), [6, 9], '(per employed adult; farmers unpaid so counted low)'],
  ['median-wage day vs $833 target', wage / DAY_WAGE, [0.8, 1.25], '(gross pay per employed adult-day)'],
  ['meals a day\'s wage buys', wage / meal, [15, 35], ''],
  ['house price / yearly pay', BUILD_COST[0] / (wage * YEAR_DAYS), [4, 8], ''],
  ['tax share of pay %', 100 * taxRate, [22, 35], ''],
  ['unemployment %', 100 * adults.filter(d => d.job === 3 && d.work < 0).length / adults.length, [3, 7], ''],
  ['firm failures per 100 per year', (w.biz.closed - closed0) / yrs / Math.max(1, firms0) * 100, [7, 12], ''],
  ['firms per 100 people', 100 * firms / alive.length, [6, 12], ''],
  ['wealth Gini', gini, [0.75, 0.88], ''],
  ['top 1% share of wealth %', 100 * top(0.01), [28, 38], ''],
  ['top 10% share of wealth %', 100 * top(0.1), [60, 72], ''],
];
console.log(`\nREALITY (pop ${alive.length}, ${days} sim days = ${yrs.toFixed(1)} sim years at ${YEAR_DAYS} days/year)\n`);
let ok = 0;
for (const [n, v, [lo, hi], note] of rows) { const pass = v >= lo && v <= hi; ok += +pass; console.log(`${pass ? ' ok ' : 'FAIL'}  ${n.padEnd(34)} ${v.toFixed(2).padStart(9)}   target ${lo}–${hi} ${note}`); }
console.log(`\n${ok}/${rows.length} metrics within the real-world range`);
console.log('deaths by cause:', JSON.stringify(dcause));
const perHour = hot / (days * 24);
console.log(`\nWATCHABILITY (dramatic events = weight >= 3)\n  events per sim hour: ${perHour.toFixed(1)}   distinct people in the news over ${days} days: ${cast.size} (${(100 * cast.size / alive.length).toFixed(0)}% of the country)\n  active story arcs (avg): ${(arcsSum / (days * DAY_TICKS / 300)).toFixed(1)}   issues of the Gazette: ${w.issues.length}`);
