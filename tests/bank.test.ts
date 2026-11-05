import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World, DAY_TICKS } from '../src/sim';

const drift = (w: World, s0: number) => w.moneySupply() - (s0 + w.ledger.minted + w.ledger.inflow - w.ledger.outflow);

test('bank: opens, takes deposits, lends, and money stays conserved', () => {
  const w = new World({ seed: 51, deterministic: true, pop: 400 }), s0 = w.moneySupply();
  for (let i = 0; i < 12 * DAY_TICKS; i++) { w.step(); w.drain(); }
  assert.ok(w.bank, 'a bank exists');
  assert.ok(w.deposits() > 0, 'people saved');
  assert.ok(Math.abs(drift(w, s0)) < 1e-3, `drift ${drift(w, s0)}`);
});

test('bank: lends only above its reserve, and an insolvent bank fails, paying depositors what is left without creating money', () => {
  const w = new World({ seed: 52, deterministic: true, pop: 300 });
  for (let i = 0; i < 6 * DAY_TICKS; i++) { w.step(); w.drain(); }
  assert.ok(w.bank);
  const rich = w.dots.filter(d => !d.dead && d.adult).slice(0, 5); for (const d of rich) { d.dep = 50000; }
  w.bank.cash = 1000;                     // depositors are owed far more than the bank holds
  const s0 = w.moneySupply() - (w.ledger.minted + w.ledger.inflow - w.ledger.outflow);   // re-baseline after the test tampered with the vault
  w.bankDawn();
  assert.equal(w.bank, null, 'the bank failed');
  assert.ok(Math.abs(drift(w, s0)) < 1e-3, `drift ${drift(w, s0)}`);
  assert.ok(w.dots.every(d => !d.dep), 'claims were wiped');
  const b = new World({ seed: 52, deterministic: true, pop: 300, state: JSON.parse(JSON.stringify(w.serialize())) });
  assert.equal(b.bank, null);
});
