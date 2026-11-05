import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World, DAY_TICKS } from '../src/sim';
import { KINDS } from '../src/sim/storyteller';

const kind = (k: string) => KINDS.find(x => x.kind === k)!;
const run = (w: any, a: any, days: number) => { for (let d = 1; d <= days && !a.done; d++) { w.tick += DAY_TICKS; kind(a.kind).step(w, a, d); } };

test('arcs: a comeback is launched for someone who hit bottom, and resolves', () => {
  const w: any = new World({ seed: 151, deterministic: true, pop: 300 });
  const d = w.dots.find((x: any) => x.adult && !x.dead && x.age < 40); w.giveNick(d, 'Bust', 20); d.coin = 0;
  assert.ok(kind('comeback').weight(w) > 0);
  const a = kind('comeback').launch(w); assert.ok(a && a.ids[0] === d.id && a.beats.length === 1);
  d.job = 1; d.coin = 400000; run(w, a, 40);
  assert.equal(a.outcome, 'success'); assert.equal(d.nick, 'Comeback Kid');
});

test('arcs: a run on the bank is tracked until it calms or the bank falls', () => {
  const w: any = new World({ seed: 152, deterministic: true, pop: 300 });
  for (let i = 0; i < 4 * DAY_TICKS; i++) { w.step(); w.drain(); }
  assert.ok(w.bank); w.bank.fear = 1.5;
  const a = kind('panic').launch(w); assert.ok(a);
  w.bank.fear = 0.1; run(w, a, 5); assert.equal(a.outcome, 'calmed');
  w.bank.fear = 1.5; const b = kind('panic').launch(w); assert.ok(b); w.bank = null; run(w, b, 2); assert.equal(b.outcome, 'collapsed');
});

test('arcs: a gang gets a story that ends in a bust; a pile-on victim gets a fall-and-forget arc', () => {
  const w: any = new World({ seed: 153, deterministic: true, pop: 400 });
  for (let i = 0; i < 3 * DAY_TICKS; i++) { w.step(); w.drain(); }
  const sid = w.S.findIndex((s: any, i: number) => (w.sPop[i] || 0) >= 20), inArc = (id: number) => w.story.arcs.some((a: any) => !a.done && a.ids.includes(id)), adults = w.townAdults(sid).filter((d: any) => !inArc(d.id)).slice(0, 5);   /* people the storyteller has not already put in a story */
  const g = w.newGang(adults[0], adults.slice(1), sid); assert.ok(kind('gangster').weight(w) > 0);
  const a = kind('gangster').launch(w); assert.ok(a); g.loot = 20000; run(w, a, 3); assert.ok(a.stage >= 1);
  w.bust(g, 'test'); run(w, a, 2); assert.equal(a.outcome, 'busted');
  const v = w.dots.find((x: any) => x.adult && !x.dead && !x.gang && !inArc(x.id)); v.ire = 40; assert.ok(kind('disgrace').weight(w) > 0);
  const c = kind('disgrace').launch(w); assert.ok(c); v.ire = 2; run(w, c, 12); assert.equal(c.outcome, 'forgotten');
});
