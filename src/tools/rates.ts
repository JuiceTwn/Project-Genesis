/* How often things happen, per 1,000 people per sim year, so the world can be tuned to believable rates. `npm run rates -- 14 800`
   The clock is 6x faster than real life (60-day year), so a rate that looks small per day is large per year. */
import { World, DAY_TICKS } from '../sim';
const days = +(process.argv[2] || 14), pop = +(process.argv[3] || 800);
const w: any = new World({ seed: 77, deterministic: true, pop });
const c: Record<string, number> = {}; const ev0 = w.ev.bind(w);
w.ev = (k: string, t: string, ids: number[], gap = 0, wt = 1) => { const n = w.lastEv[k]; ev0(k, t, ids, gap, wt); if (w.lastEv[k] !== n) { const b = k.replace(/\d+$/, ''); c[b] = (c[b] || 0) + 1; } };
for (let i = 0; i < days * DAY_TICKS; i++) { w.step(); w.drain(); }
const alive = w.dots.filter((d: any) => !d.dead).length, perK = (n: number) => (n / alive) * 1000 * (60 / days);
const rows: [string, string][] = [['breakup', 'break-ups'], ['jealous', 'jealous flare-ups'], ['love', 'new couples'], ['reject', 'turned down'], ['wedding', 'weddings'], ['birth', 'births'], ['death', 'deaths'], ['kind', 'gifts to the broke'], ['loan', 'loans'], ['fight', 'fights'], ['theft', 'robberies'], ['burg', 'burglaries'], ['break', 'mental breaks'], ['peace', 'forgiveness'], ['vendetta', 'vendettas']];
console.log(`pop ${alive}, ${days} days (${(days / 60).toFixed(2)} sim years); per 1,000 people per year:`);
for (const [k, label] of rows) console.log(label.padEnd(20), Math.round(perK(c[k] || 0)).toString().padStart(6), `  (${c[k] || 0} events)`);
