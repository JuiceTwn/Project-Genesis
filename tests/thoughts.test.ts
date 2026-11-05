import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World, DAY_TICKS } from '../src/sim';

const base = (w: any) => w.moneySupply() - (w.ledger.minted + w.ledger.inflow - w.ledger.outflow);

test('thoughts: events become fading thoughts that move mood; friends worry', () => {
  const w: any = new World({ seed: 101, deterministic: true, pop: 300 });
  for (let i = 0; i < 2 * DAY_TICKS; i++) { w.step(); w.drain(); }
  const [a, b] = w.dots.filter((d: any) => d.adult && !d.dead); b.aff.set(a.id, 50);
  const m0 = w.mood(a), mb0 = w.mood(b);
  w.ev('bankrupt', `${a.name} went bust`, [a.id], 0, 4);
  assert.ok(w.mood(a) < m0 - 5, 'the bankrupt feels it');
  assert.ok(a.th.some((t: any) => /failed/i.test(t.txt)));
  assert.ok(w.mood(b) <= mb0, 'a friend worries');
  const lo = w.mood(a); w.tick += 12 * DAY_TICKS; assert.ok(w.mood(a) > lo, 'it fades');
});

test('thoughts: a collapsed mood causes a break with real consequences; money conserved; round-trips', () => {
  const w: any = new World({ seed: 102, deterministic: true, pop: 300 });
  for (let i = 0; i < 3 * DAY_TICKS; i++) { w.step(); w.drain(); }
  const s0 = base(w);
  const d = w.dots.find((x: any) => x.adult && !x.dead && x.coin > 5000 && w.taverns.length);
  d.fx.temper = 1; d.traits = d.traits.filter((t: string) => !['hothead', 'thief', 'lazy', 'romantic'].includes(t)); d.isThief = false; d.partner = -1;
  d.th = [{ k: 'x', v: -60, until: w.tick + 10 * DAY_TICKS, from: w.tick, txt: 'Everything is falling apart.' }];
  const c0 = d.coin; w.mentalBreak(d, 10);
  assert.ok(d.coin < c0, 'they drank their sorrows away');
  assert.ok((d.breakCd || 0) > w.tick);
  assert.ok(Math.abs(base(w) - s0) < 1e-3, 'conserved');
  const b: any = new World({ seed: 102, deterministic: true, pop: 300, state: JSON.parse(JSON.stringify(w.serialize())) });
  assert.equal(b.dots[d.id].th.length, d.th.length);
  assert.equal(b.dots[d.id].breakCd, d.breakCd);
});
