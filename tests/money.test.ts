import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World, DAY_TICKS } from '../src/sim';

/** supply(now) must equal supply(start) + minted + inflow - outflow: money only moves, or crosses the border / is printed, visibly. */
const drift = (w: World, s0: number) => w.moneySupply() - (s0 + w.ledger.minted + w.ledger.inflow - w.ledger.outflow);

test('money is conserved: it only moves, or is explicitly printed / traded with abroad', () => {
  const w = new World({ seed: 21, deterministic: true, pop: 300 }), s0 = w.moneySupply();
  assert.ok(s0 > 1000, 'there is money to start with');
  let worst = 0, at = -1;
  for (let i = 0; i < 4 * DAY_TICKS; i++) {
    w.step(); w.drain();
    const d = Math.abs(drift(w, s0)); if (d > worst) { worst = d; at = w.tick; }
  }
  assert.ok(worst < 1e-3, `max drift ${worst.toFixed(4)} coins (first at tick ${at}); flows ${JSON.stringify(w.ledger.flow)}`);
  assert.ok(w.ledger.inflow > 0 && w.ledger.outflow > 0, 'trade with abroad happened and was recorded');
});

test('printing money is the only way the supply grows without a matching inflow', () => {
  const w = new World({ seed: 5, deterministic: true, pop: 200 }), s0 = w.moneySupply();
  w.mint(1000, 'test');
  assert.equal(w.ledger.minted, 1000);
  assert.ok(Math.abs(drift(w, s0)) < 1e-9);
});

test('the supply survives a save/load round trip (cash and debt are not rounded away)', () => {
  const a = new World({ seed: 8, deterministic: true, pop: 200 });
  for (let i = 0; i < DAY_TICKS; i++) { a.step(); a.drain(); }
  const b = new World({ seed: 8, deterministic: true, pop: 200, state: JSON.parse(JSON.stringify(a.serialize())) });
  assert.ok(Math.abs(b.moneySupply() - a.moneySupply()) < 1e-3, `${b.moneySupply()} vs ${a.moneySupply()}`);
});
