import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World, DAY_TICKS } from '../src/sim';

test('mortgage: purchase, repayment, price crash, foreclosure; money conserved; round-trips', () => {
  const w: any = new World({ seed: 71, deterministic: true, pop: 300 });
  for (let i = 0; i < 5 * DAY_TICKS; i++) { w.step(); w.drain(); }
  assert.ok(w.bank, 'bank exists');
  w.bank.cash += 5e6; w.mint(5e6, 'test');          // give the bank lending room (minted, so the ledger stays balanced)
  const s0 = w.moneySupply() - (w.ledger.minted + w.ledger.inflow - w.ledger.outflow);
  const d = w.dots.find((x: any) => x.adult && !x.dead && w.buildings[x.home].owner !== x.id);
  d.coin += 200000; const s1 = s0 + 200000;
  const h = w.buildings[d.home], p = 275000 * w.hpi;
  w.buyHouse(d, h, p, p * 0.85);
  assert.equal(h.owner, d.id);
  const ml = w.bank.loans.find((l: any) => l.kind === 'm'); assert.ok(ml);
  const left0 = ml.left; w.mortgageMonth();
  assert.ok(ml.left < left0 || ml.late > 0, 'a payment was processed');
  w.hpi = 0.5; d.coin = 0;                             // crash and job loss
  for (let i = 0; i < 4; i++) w.mortgageMonth();
  assert.ok(!w.bank.loans.includes(ml), 'the mortgage was foreclosed');
  assert.ok((w.stats.foreclosures || 0) >= 1);
  assert.ok(Math.abs(w.moneySupply() - (s1 + w.ledger.minted + w.ledger.inflow - w.ledger.outflow)) < 1e-3, 'conserved');
  const b = new World({ seed: 71, deterministic: true, pop: 300, state: JSON.parse(JSON.stringify(w.serialize())) });
  assert.equal(b.hpi, w.hpi);
});
