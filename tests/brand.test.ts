import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World, DAY_TICKS } from '../src/sim';

test('brands: stores get brands, customers pick by appeal, money stays conserved, state round-trips', () => {
  const w = new World({ seed: 44, deterministic: true, pop: 400 }), s0 = w.moneySupply();
  for (let i = 0; i < 10 * DAY_TICKS; i++) { w.step(); w.drain(); }
  assert.ok(w.brands.length > 0, 'brands exist');
  assert.ok(w.stores.some(b => b.brand >= 0), 'a store carries a brand');
  assert.ok(Math.abs(w.moneySupply() - (s0 + w.ledger.minted + w.ledger.inflow - w.ledger.outflow)) < 1e-3, 'conserved');
  const b = new World({ seed: 44, deterministic: true, pop: 400, state: JSON.parse(JSON.stringify(w.serialize())) });
  assert.equal(b.brands.length, w.brands.length);
  assert.equal(b.stores.filter(x => x.brand >= 0).length, w.stores.filter(x => x.brand >= 0).length);
});

test('brands: a better, cheaper, better-known store beats a worse one at equal distance', () => {
  const w = new World({ seed: 45, deterministic: true, pop: 300 });
  const live = w.stores.filter(s => s.state === 'ok'); if (live.length < 2) return;
  const [a, b] = live; const x = w.newBrand(w.dots[0], 0), y = w.newBrand(w.dots[1], 0);
  Object.assign(x, { quality: 0.9, price: 0.9, awareness: 0.8 }); Object.assign(y, { quality: 0.1, price: 1.3, awareness: 0.02 });
  a.brand = x.id; b.brand = y.id;
  const d = w.dots[2]; w.stores.length = 0; w.stores.push(a, b);
  const F = w.F.bind(w); (w as any).F = (s: any) => new Uint16Array(F(s).length).fill(100);
  let wins = 0; for (let i = 0; i < 40; i++) if (w.pickStore(d) === a) wins++;
  assert.ok(wins > 35, `better brand won ${wins}/40`);
});
