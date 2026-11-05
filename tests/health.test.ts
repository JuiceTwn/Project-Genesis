import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World, DAY_TICKS } from '../src/sim';

const base = (w: any) => w.moneySupply() - (w.ledger.minted + w.ledger.inflow - w.ledger.outflow);

test('health: injuries heal with rest, treatment costs money paid to the town, the poor and untreated may die; conserved; round-trips', () => {
  const w: any = new World({ seed: 121, deterministic: true, pop: 300 });
  for (let i = 0; i < 2 * DAY_TICKS; i++) { w.step(); w.drain(); }
  const adults = w.dots.filter((d: any) => d.adult && !d.dead);
  const rich = adults[0], poor = adults[1]; rich.coin = 50000; poor.coin = 0; poor.hunger = 20; rich.hunger = 20;
  const s0 = base(w);
  w.hurt(rich, 'injury', 0.6, 'test'); w.hurt(poor, 'injury', 0.6, 'test');
  assert.ok(w.sickLevel(rich) >= 0.6 && rich.th.some((t: any) => /hurts/i.test(t.txt)));
  const g = w.gov(w.S[w.buildings[rich.home].sid]), t0 = g.treasury;
  for (let i = 0; i < 30 && !rich.hp.every((x: any) => x.treated) && rich.hp.length; i++) w.healthDay();
  assert.ok(g.treasury > t0 || !rich.hp.length, 'the clinic fee went to the town');
  assert.ok(Math.abs(base(w) - s0) < 1e-3, 'conserved');
  poor.hp[0] && (poor.hp[0].sev = 0.95);
  const before = poor.dead; for (let i = 0; i < 400 && !poor.dead && poor.hp?.length; i++) w.healthDay();
  assert.ok(poor.dead || !poor.hp?.length, 'the untreated either recovered or died');
  const b: any = new World({ seed: 121, deterministic: true, pop: 300, state: JSON.parse(JSON.stringify(w.serialize())) });
  assert.equal((b.dots[rich.id].hp || []).length, (rich.hp || []).length);
});

test('health: the flu spreads in conversation and a winter coat helps', () => {
  const w: any = new World({ seed: 122, deterministic: true, pop: 300 });
  const [a, b] = w.dots.filter((d: any) => d.adult && !d.dead); w.hurt(a, 'flu', 0.5, 'test');
  w.season = () => 3; let caught = 0, caughtCoat = 0;
  for (let i = 0; i < 300; i++) { b.hp = []; b.gear = {}; w.catchFrom(a, b); if (b.hp.length) caught++; }
  for (let i = 0; i < 300; i++) { b.hp = []; b.gear = { coat: { q: 1, w: 0, brand: -1 } }; w.catchFrom(a, b); if (b.hp.length) caughtCoat++; }
  assert.ok(caught > 30, `some caught it (${caught})`);
  assert.ok(caughtCoat < caught, `coat helps (${caughtCoat} vs ${caught})`);
});
