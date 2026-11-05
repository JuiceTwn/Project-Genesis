import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World, DAY_TICKS } from '../src/sim';
import { eff, itemPrice } from '../src/sim/gear';

test('gear: effect is quality times remaining life, zero when nothing is carried', () => {
  assert.equal(eff({}, 'coat'), 0);
  assert.equal(eff({ gear: { coat: { q: 0.8, w: 0.5, brand: -1 } } }, 'coat'), 0.4);
  assert.ok(itemPrice('coat', 1) > itemPrice('coat', 0.2));
});

test('gear: people buy it, it wears, money stays conserved and survives save/load', () => {
  const w = new World({ seed: 33, deterministic: true, pop: 300 }), s0 = w.moneySupply();
  for (let i = 0; i < 8 * DAY_TICKS; i++) { w.step(); w.drain(); }
  assert.ok((w.stats.gear || 0) > 0, 'some gear was bought');
  assert.ok(w.dots.some(d => d.gear && Object.keys(d.gear).length > 0));
  assert.ok(Math.abs(w.moneySupply() - (s0 + w.ledger.minted + w.ledger.inflow - w.ledger.outflow)) < 1e-3, 'conserved');
  const b = new World({ seed: 33, deterministic: true, pop: 300, state: JSON.parse(JSON.stringify(w.serialize())) });
  const n = (x: World) => x.dots.reduce((a, d) => a + (d.gear ? Object.keys(d.gear).length : 0), 0);
  assert.equal(n(b), n(w));
});
