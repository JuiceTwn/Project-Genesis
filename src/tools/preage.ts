/* Age a brand-new country before it opens, so the first viewer sees a lived-in place instead of day 1.
     npm run preage -- [years=2] [root=.]       (writes <root>/data/state.json and the gazette/story archive; the server loads it on boot)
   Run it once on the machine that will host, BEFORE the first `npm start`. A few sim years gives the country marriages and children, grudges and
   forgiveness, nicknames, a chronicle, closed and founded businesses, dead and famous people. The launch card at the end says what a visitor will find. */
import path from 'node:path';
import { World, DAY_TICKS } from '../sim';
import { Archive } from '../server/archive';
import { saveState } from '../server/store';

const years = +(process.argv[2] || 2), root = path.resolve(process.argv[3] || '.');
const w = new World({ seed: 1337 }), archive = new Archive(path.join(root, 'data', 'archive'));
const total = years * 60 * DAY_TICKS, t0 = Date.now();
for (let i = 1; i <= total; i++) {
  w.step(); w.drain();
  if (w.archive.length) for (const a of w.archive.splice(0)) archive.put(a.kind as 'issue' | 'story', a.id, a.data);
  if (i % (10 * DAY_TICKS) === 0) { const el = (Date.now() - t0) / 1000, done = i / total; console.log(`day ${w.day()} (${(done * 100).toFixed(0)}%) · ${Math.round(el)}s elapsed · about ${Math.round(el / done - el)}s left · ${w.dots.filter(d => !d.dead).length} alive`); }
}
w.hist = []; archive.flush();
const bytes = saveState(path.join(root, 'data', 'state.json'), w.serialize(), false);
const alive = w.dots.filter(d => !d.dead), adults = alive.filter(d => d.adult);
const card = {
  'sim years': +(w.day() / 60).toFixed(2), alive: alive.length, 'born / died': `${w.stats.births} / ${w.stats.deaths}`,
  couples: alive.filter(d => d.partner >= 0).length / 2, married: alive.filter(d => d.married).length / 2,
  nicknamed: alive.filter(d => d.nick).length, 'people with grudges': alive.filter(d => d.foes && d.foes.size).length, 'people with a ledger': alive.filter(d => d.bonds && d.bonds.length).length,
  famous: alive.filter(d => (d.fame || 0) > 20).length, 'in prison': alive.filter(d => (d.jailUntil || 0) > w.tick).length, 'stories told': w.story.nextId - 1, 'live stories': w.story.arcs.filter(a => !a.done).length,
  'chronicle entries': w.story.chron.length, 'gazette issues': archive.latestIssue(), 'open businesses': w.buildings.filter(b => b.state === 'ok' && w.isBiz(b)).length, 'closed for good': w.biz.closed,
  'unemployed %': +(100 * adults.filter(d => d.job === 3 && d.work < 0 && d.age < d.life * 0.8).length / Math.max(1, adults.length)).toFixed(1), 'save MB': +(bytes / 1048576).toFixed(1), 'took s': Math.round((Date.now() - t0) / 1000),
};
console.log('\nLAUNCH CARD'); for (const [k, v] of Object.entries(card)) console.log(' ', k.padEnd(22), v);
