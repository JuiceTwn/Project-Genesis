import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World, DAY_TICKS } from '../src/sim';

const base = (w: any) => w.moneySupply() - (w.ledger.minted + w.ledger.inflow - w.ledger.outflow);
const mkWorld = (seed: number) => { const w: any = new World({ seed, deterministic: true, pop: 300 }); for (let i = 0; i < 2 * DAY_TICKS; i++) { w.step(); w.drain(); } return w; };
const adults = (w: any, n: number) => { const o: any[] = []; for (const d of w.dots) if (d.adult && !d.dead && !d.inside) { o.push(d); if (o.length >= n) break; } return o; };
const calm = (d: any) => { d.th = []; d.bonds = []; d.foes = undefined; d.aff.clear(); };

test('bonds: witnesses take a side, remember the culprit and feel it; the victim has a grudge', () => {
  const w = mkWorld(201), [t, v, a, b, c] = adults(w, 5);
  for (const d of [t, v, a, b, c]) { calm(d); d.x = t.x; d.y = t.y; d.inside = false; }
  a.aff.set(v.id, 40); b.aff.set(t.id, 40);   // a likes the victim; b is the thief's friend
  w.wronged(t, v, 'robbed', [a, b, c], true);
  assert.ok(w.grudge(v, t.id) >= 20, 'the victim holds a grudge');
  assert.ok(a.bonds.some((x: any) => x.k === 'witnessed' && x.o === t.id && x.to === v.id), 'a friend of the victim remembers who did it');
  assert.ok(a.th.some((x: any) => x.src === t.id && /rob/.test(x.txt)), 'and has a thought that names them');
  assert.ok(!(b.bonds || []).some((x: any) => x.k === 'witnessed' && x.o === t.id), 'the thief\'s friend does not turn on them');
  assert.ok(w.standing(t.id) !== undefined);
});

test('bonds: grievances fade by temperament, kindness slowly; a thought names the other person', () => {
  const w = mkWorld(202), [a, b, o] = adults(w, 3);
  for (const d of [a, b, o]) calm(d);
  a.fx.forgive = 0.2; b.fx.forgive = 1.5;   // vengeful vs easy-going
  w.bondAdd(a, o.id, 'robbed'); w.bondAdd(b, o.id, 'robbed');
  const s0 = [w.grudge(a, o.id), w.grudge(b, o.id)];
  w.tick += 60 * DAY_TICKS; w.bondDay();
  assert.ok(w.bondScore(a, o.id) < w.bondScore(b, o.id) - 3, 'the vengeful one still feels it far more');
  assert.ok(s0[0] > 20 && s0[1] > 20);
  const x = adults(w, 4)[3]; calm(x); x.th = [];
  w.ev('theft', 'a robbed b', [o.id, x.id], 0, 3);
  assert.ok(x.th.some((t: any) => t.src === o.id && /Robbed by/.test(t.txt)), 'robbery thought names the thief');
});

test('bonds: friends lend to the broke, borrowers repay or stiff them, and money is conserved', () => {
  const w = mkWorld(203);
  const sid = (d: any) => w.buildings[d.home].sid;
  const L = w.dots.find((d: any) => d.adult && !d.dead), B = w.dots.find((d: any) => d.adult && !d.dead && d !== L && sid(d) === sid(L));
  for (const d of [L, B]) calm(d);
  L.aff.set(B.id, 60); B.aff.set(L.id, 60); B.job = 3; L.fx.generosity = 3;
  L.coin = 100000; B.coin = 0; const s0 = base(w);
  for (let i = 0; i < 40 && !(B.bonds || []).some((b: any) => b.k === 'owes'); i++) w.bondDay();
  assert.ok((B.bonds || []).some((b: any) => b.k === 'owes') && (L.bonds || []).some((b: any) => b.k === 'lent'), 'a loan was made');
  assert.ok(Math.abs(base(w) - s0) < 1e-3, 'conserved');
  B.coin += 1e6; B.fx.loyalty = 3; const sb = base(w);
  for (let i = 0; i < 60 && (B.bonds || []).some((b: any) => b.k === 'owes'); i++) { w.tick += DAY_TICKS; w.bondDay(); }
  assert.ok(!(B.bonds || []).some((b: any) => b.k === 'owes'), 'it was settled one way or the other');
  assert.ok((L.bonds || []).some((b: any) => b.k === 'repaid' || b.k === 'stiffed'));
  assert.ok(Math.abs(base(w) - sb) < 1e-3, 'conserved after repayment');
});

test('bonds: meeting a foe means a cold shoulder, and sometimes a fight; a hothead goes looking', () => {
  const w = mkWorld(204), [a, b] = adults(w, 2);
  for (const d of [a, b]) { calm(d); d.inside = false; d.phase = 'walk'; d.fight = false; }
  a.fx.temper = 2.5; a.fx.courage = 0.5; w.bondAdd(a, b.id, 'robbed'); w.bondAdd(a, b.id, 'beaten');
  assert.ok(w.grudge(a, b.id) >= 45);
  const r = w.rnd; w.rnd = () => 0.5; assert.equal(w.foeMeet(a, b), 1, 'usually just a cold shoulder'); w.rnd = () => 0.00001;
  assert.equal(w.foeMeet(a, b), 2, 'but it can boil over'); assert.equal(a.phase, 'chat'); w.rnd = r;
  const c = adults(w, 6)[5]; calm(c);
  a.traits = ['hothead']; a.revCd = 0; a.work = -1; w.buildings[a.home].sid === w.buildings[b.home].sid || (b.home = a.home);
  assert.ok(w.revengeGoal(a), 'the aggrieved hothead has somewhere to be');
});

test('bonds: gossip spreads a story one head at a time, losing certainty; a witness tells the victim', () => {
  const w = mkWorld(205), [v, s, l, t] = adults(w, 4);
  for (const d of [v, s, l, t]) calm(d);
  s.aff.set(l.id, 50); l.aff.set(s.id, 50);
  w.bondAdd(s, t.id, 'robbed'); const b = s.bonds[0];
  assert.equal(w.tellable(s, l, false)?.k, 'robbed');
  w.hear(s, l, b, 0.9);
  const hb = l.bonds.find((x: any) => x.o === t.id);
  assert.ok(hb && hb.via === s.id && hb.conf < 1 && hb.to === s.id, 'the listener now carries it, second-hand');
  assert.ok((l.aff.get(t.id) || 0) < 0);
  // a witness who saw the theft of v's pocket tells v
  w.bondAdd(s, t.id, 'witnessed', { to: v.id }); v.aff.set(s.id, 40);
  const tell = s.bonds.find((x: any) => x.k === 'witnessed')!;
  w.hear(s, v, tell, 0.9);
  assert.ok(w.grudge(v, t.id) >= 8, 'the victim learned who did it');
  assert.ok(v.th.some((x: any) => x.src === t.id && /Learned/.test(x.txt)));
});

test('bonds: a death after a fight is a vendetta, and a family inherits the dead\'s grudges', () => {
  const w = mkWorld(206), [dead, killer, kin, foe] = adults(w, 4);
  for (const d of [dead, killer, kin, foe]) calm(d);
  kin.par = [dead.id]; dead.hurtBy = { id: killer.id, tk: w.tick - DAY_TICKS };
  w.bondAdd(dead, foe.id, 'robbed'); w.bondAdd(dead, foe.id, 'beaten');
  w.bondDeath([dead.id, kin.id]);
  assert.ok(w.grudge(kin, killer.id) >= 50, 'they swear revenge on whoever fought the dead');
  assert.ok(kin.bonds.some((x: any) => x.k === 'feud' && x.o === foe.id), 'and take on an old family grudge');
});

test('bonds: ledgers survive a save and load; speech can tell a story from one', () => {
  const w = mkWorld(207), [a, o, l] = adults(w, 3);
  for (const d of [a, o, l]) calm(d);
  w.bondAdd(a, o.id, 'stiffed', { n: 5 }); a.hurtBy = { id: o.id, tk: w.tick }; a.th = [{ k: 'x', v: -3, until: w.tick + DAY_TICKS, from: w.tick, txt: 'Stiffed.', src: o.id }];
  const b: any = new World({ seed: 207, deterministic: true, pop: 300, state: JSON.parse(JSON.stringify(w.serialize())) });
  assert.deepEqual(b.dots[a.id].bonds.find((x: any) => x.k === 'stiffed').o, o.id);
  assert.equal(b.dots[a.id].th[0].src, o.id); assert.equal(b.dots[a.id].hurtBy.id, o.id);
  assert.ok(b.grudge(b.dots[a.id], o.id) >= 20, 'grudge cache is rebuilt on load');
  a.aff.set(l.id, 40); l.aff.set(a.id, 40); a.fx.gossip = 3;
  let said = false; for (let i = 0; i < 80 && !said; i++) { const c = w.conversation(a, l); if (c && c.lines.some(([, t]: any) => new RegExp(o.name.split(' ')[0]).test(t) && /pay|owes|borrow/i.test(t))) said = true; }
  assert.ok(said, 'a dot tells the story of being stiffed');
});
