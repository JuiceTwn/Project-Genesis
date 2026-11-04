/* Headless run for tuning: `npm run bench -- 40 [eventKinds] [--seed N] [--json out.jsonl]`.
   --json writes one JSON object per half-day for the Python analysis tools (ml/). */
import { writeFileSync, appendFileSync } from 'node:fs';
import { World, DAY_TICKS } from '../sim';

const args = process.argv.slice(2);
const flag = (n: string) => { const i = args.indexOf(n); if (i < 0) return null; const v = args[i + 1]; args.splice(i, 2); return v; };
const seed = +(flag('--seed') || 1337), jsonOut = flag('--json');
const days = +args[0] || 6, show = (args[1] || '').split(',');
if (jsonOut) writeFileSync(jsonOut, '');

const t00 = Date.now(); const w = new World({ seed, deterministic: true });
console.log('boot ms', Date.now() - t00, 'dots', w.dots.length, 'bld', w.buildings.length);
const t0 = process.hrtime.bigint(), kinds: Record<string, number> = {};
for (let i = 0; i < days * DAY_TICKS; i++) {
  w.step();
  for (const m of w.drain()) if (m.t === 'ev') { kinds[m.k] = (kinds[m.k] || 0) + 1; if (show.includes(m.k)) console.log('  ', m.x); }
  w.frame();
  if ((i + 1) % (DAY_TICKS / 2) === 0) {
    const d = w.dots.filter(x => !x.dead), avg = (f: (x: any) => number) => (d.reduce((a, x) => a + f(x), 0) / d.length);
    const starving = d.filter(x => x.hunger > 90).length, st = w.markets.map(m => m.stock);
    const row = { day: w.day(), t: +w.tod().toFixed(2), pop: d.length, hunger: +avg(x => x.hunger).toFixed(1), coin: +avg(x => x.coin).toFixed(1), mood: +avg(x => w.mood(x)).toFixed(1),
      starving, markets: st.length, stockMin: Math.min(...st), stockAvg: Math.round(st.reduce((a, b) => a + b, 0) / st.length), treasury: Math.round(w.townTreasury()), nation: Math.round(w.nation.treasury), supply: Math.round(w.moneySupply()), minted: Math.round(w.ledger.minted), flow: Object.fromEntries(Object.entries(w.ledger.flow).map(([k, v]) => [k, Math.round(v)])),
      biz: { ...w.biz }, bld: w.buildings.filter(b => b.state === 'ok').length, born: w.stats.births, died: w.stats.deaths, jobless: w.dots.filter(x => !x.dead && x.adult && x.job === 3 && x.work < 0).length, thefts: w.stats.thefts, fights: w.stats.fights };
    console.log(`day ${row.day} t=${row.t} pop=${row.pop} hun=${row.hunger} coin=${row.coin} mood=${row.mood} starv=${starving} mkts=${row.markets} stock(min/avg)=${row.stockMin}/${row.stockAvg} treas=${row.treasury} biz=${JSON.stringify(row.biz)} bld=${row.bld} born=${row.born} died=${row.died}`);
    if (jsonOut) appendFileSync(jsonOut, JSON.stringify(row) + '\n');
  }
}
const ms = Number(process.hrtime.bigint() - t0) / 1e6;
console.log('events by kind:', JSON.stringify(kinds));
console.log(`total ${ms.toFixed(0)}ms, ${(ms / (days * DAY_TICKS)).toFixed(3)} ms/tick`);
