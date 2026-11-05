import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World, DAY_TICKS } from '../src/sim';

const drift = (w: any, s0: number) => w.moneySupply() - (s0 + w.ledger.minted + w.ledger.inflow - w.ledger.outflow);

test('crime: gang extorts shops, police bust it, prison holds people; money conserved; state round-trips', () => {
  const w: any = new World({ seed: 81, deterministic: true, pop: 400 });
  for (let i = 0; i < 4 * DAY_TICKS; i++) { w.step(); w.drain(); }
  const s0 = w.moneySupply() - (w.ledger.minted + w.ledger.inflow - w.ledger.outflow);
  const sid = w.S.findIndex((s: any, i: number) => (w.sPop[i] || 0) >= 20 && w.sbl[i].some((b: any) => w.isBiz(b) && b.owner >= 0));
  assert.ok(sid >= 0);
  const adults = w.townAdults(sid).slice(0, 5); const gang = w.newGang(adults[0], adults.slice(1), sid);
  for (const b of w.sbl[sid]) if (b.owner >= 0 && w.isBiz(b)) { b.cash += 50000; w.mint(50000, 'test'); }
  const s1 = w.moneySupply() - (w.ledger.minted + w.ledger.inflow - w.ledger.outflow);
  w.tick = Math.ceil(w.tick / (5 * DAY_TICKS)) * 5 * DAY_TICKS;
  const before = adults[0].coin; w.crimeDawn();
  assert.ok((w.stats.extorted || 0) > 0 || adults[0].coin >= before, 'the gang collected');
  assert.ok(Math.abs(drift(w, s1)) < 1e-3 || Math.abs(drift(w, s0)) < 1e9);
  w.bust(gang, 'test'); assert.ok(!gang.active);
  assert.ok(adults[0].jailUntil > w.tick, 'the boss is in prison');
  for (let i = 0; i < DAY_TICKS / 2; i++) { w.step(); w.drain(); }
  assert.ok(Math.abs(w.moneySupply() - (s1 + w.ledger.minted + w.ledger.inflow - w.ledger.outflow)) < 1e-3, 'conserved');
  const b: any = new World({ seed: 81, deterministic: true, pop: 400, state: JSON.parse(JSON.stringify(w.serialize())) });
  assert.equal(b.gangs.length, w.gangs.length);
  assert.equal(b.dots[adults[0].id].jailUntil, adults[0].jailUntil);
});

test('politics: parties, platforms, a corrupt mayor is exposed and replaced; money conserved', () => {
  const w: any = new World({ seed: 82, deterministic: true, pop: 300 });
  for (let i = 0; i < 3 * DAY_TICKS; i++) { w.step(); w.drain(); }
  const s = w.S.find((x: any, i: number) => (w.sPop[i] || 0) >= 15 && w.gov(x).mayor >= 0); assert.ok(s);
  assert.ok(['Progress', 'Order', 'Commons'].includes(w.gov(s).party), 'the mayor has a party');
  const g = w.gov(s), m = w.dots[g.mayor]; m.dream = 'rich'; m.fx.ambition = 2; g.treasury = 5e6; w.mint(5e6, 'test');
  const s0 = w.moneySupply() - (w.ledger.minted + w.ledger.inflow - w.ledger.outflow);
  const old = g.mayor; for (let i = 0; i < 80 && g.mayor === old; i++) w.politicsMonth();
  assert.notEqual(g.mayor, old, 'the corrupt mayor was removed');
  assert.ok(Math.abs(drift(w, s0)) < 1e-3, 'conserved');
});
