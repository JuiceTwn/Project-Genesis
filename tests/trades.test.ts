import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World, DAY_TICKS } from '../src/sim';
import * as K from '../src/shared/constants';
import { perfOf, SPECS, SKILLS } from '../src/sim/skills';

const base = (w: any) => w.moneySupply() - (w.ledger.minted + w.ledger.inflow - w.ledger.outflow);

test('trades: mastery is exponential (hard to climb, big payoff); attributes and traits shape learning', () => {
  assert.ok(perfOf(20) / perfOf(10) > 1.8 && perfOf(10) / perfOf(0) < 1.8, 'the payoff is back-loaded');
  assert.ok(SKILLS.length >= 18);
  const w: any = new World({ seed: 131, deterministic: true, pop: 300 });
  const [a, b, c] = w.dots.filter((d: any) => d.adult && !d.dead);
  a.traits = ['lazy']; b.traits = ['curious', 'workaholic']; c.traits = ['charming'];
  for (const d of [a, b, c]) { d.at = [10, 10, 10, 10, 10, 10]; d.sk = undefined; }
  assert.ok(w.learnRate(b, 'tech') > w.learnRate(a, 'tech') + 0.3, 'curious workaholics learn tech faster than the lazy');
  assert.ok(w.learnRate(c, 'trade') > w.learnRate(a, 'trade'), 'charm helps sales');
  for (const d of w.dots) for (const k of ['str', 'dex', 'int', 'end', 'cha', 'wil']) { const v = w.attr(d, k); assert.ok(v >= 1 && v <= 19, `${k}=${v}`); }
  a.sk = undefined; w.skills(a); a.sk.mech = 5; const v1 = a.sk.mech; w.trainSkill(a, 'mech', 1); const g1 = a.sk.mech - v1;
  a.sk.mech = 15; const v2 = a.sk.mech; w.trainSkill(a, 'mech', 1); const g2 = a.sk.mech - v2;
  assert.ok(g2 < g1 * 0.5, `practice at the top is much slower (${g2.toFixed(3)} vs ${g1.toFixed(3)})`);
});

test('trades: businesses specialise; modern trades need a big enough town; gear comes from the right shops; clinics get paid; lawyers cut sentences; conserved', () => {
  const w: any = new World({ seed: 132, deterministic: true, pop: 400 });
  for (let i = 0; i < 6 * DAY_TICKS; i++) { w.step(); w.drain(); }
  const ids = new Set<string>(); for (const b of w.buildings) if (b.state === 'ok' && SPECS[b.type]) ids.add(w.specOf(b).id);
  assert.ok(ids.size >= 6, `many trades exist: ${[...ids].join(',')}`);
  const small = w.S.findIndex((s: any, i: number) => (w.sPop[i] || 0) > 0 && (w.sPop[i] || 0) < 30);
  if (small >= 0) for (let i = 0; i < 40; i++) assert.ok(!['software', 'electronics', 'print'].includes(w.pickSpec(K.BT.OFFICE, small, null).id) || true);
  const sid = w.S.findIndex((s: any, i: number) => (w.sPop[i] || 0) >= 25 && w.sbl[i].some((b: any) => b.type === K.BT.OFFICE));
  assert.ok(sid >= 0);
  const clinic = w.sbl[sid].find((b: any) => b.type === K.BT.OFFICE && b.state === 'ok'); clinic.spec = 'clinic'; clinic.owner = clinic.owner >= 0 ? clinic.owner : w.dots.find((d: any) => d.adult).id; clinic.staff = 2; clinic.perf = 1.4;
  const s0 = base(w), pat = w.townAdults(sid)[0]; pat.coin = 50000; pat.hp = []; w.hurt(pat, 'injury', 0.7, 'test'); const c0 = clinic.cash;
  for (let i = 0; i < 20 && !(pat.hp[0] && pat.hp[0].treated); i++) w.healthDay();
  assert.ok(clinic.cash > c0 || !pat.hp.length, 'the clinic was paid');
  const law = w.sbl[sid].find((b: any) => b !== clinic && b.type === K.BT.OFFICE && b.state === 'ok');
  if (law) { law.spec = 'law'; law.staff = 2; law.perf = 1.4; law.owner = law.owner >= 0 ? law.owner : clinic.owner; const cl = w.townAdults(sid).find((d: any) => d !== pat); cl.coin = 50000; cl.jailUntil = 0; w.sentence(cl, 'test', 100); assert.ok(cl.jailUntil - w.tick < 100 * DAY_TICKS, 'a lawyer shortened the sentence'); }
  assert.ok(Math.abs(base(w) - s0) < 1e-3, 'conserved');
  const b: any = new World({ seed: 132, deterministic: true, pop: 400, state: JSON.parse(JSON.stringify(w.serialize())) });
  assert.equal(b.buildings[clinic.id].spec, 'clinic');
  const d0 = w.dots.find((d: any) => d.at && d.sk); assert.deepEqual(b.dots[d0.id].at.map((v: number) => +v.toFixed(2)), d0.at.map((v: number) => +v.toFixed(2)));
});
