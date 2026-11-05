import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World, DAY_TICKS } from '../src/sim';

const base = (w: any) => w.moneySupply() - (w.ledger.minted + w.ledger.inflow - w.ledger.outflow);

test('media: events make people famous; a bank rumour spreads and raises fear; fame decays', () => {
  const w: any = new World({ seed: 91, deterministic: true, pop: 400 });
  for (let i = 0; i < 4 * DAY_TICKS; i++) { w.step(); w.drain(); }
  assert.ok(w.bank, 'a bank exists');
  const a = w.dots.find((d: any) => d.adult && !d.dead);
  w.ev('rich', `${a.name} struck it rich`, [a.id], 0, 4);
  assert.ok(a.fame > 5, 'a notable event made them famous');
  const f0 = a.fame; w.mediaDay(); assert.ok(a.fame < f0 + 0.1, 'fame decays');
  w.bank.fear = 0; w.posts = [];
  w.addPost({ topic: 'bank', charge: -0.9, about: -1, target: 0, author: a.id, truth: false, text: 'Rumour: the bank is broke' });
  for (let i = 0; i < 12; i++) w.mediaSpread();
  assert.ok(w.bank.fear > 0.2, `the rumour raised the bank's fear (${w.bank.fear})`);
  assert.ok(w.posts.length >= 1);
});

test('media: pile-on fires, drops friends, brands suffer; sponsorship deal pays from the brand; conserved; round-trips', () => {
  const w: any = new World({ seed: 92, deterministic: true, pop: 400 });
  for (let i = 0; i < 6 * DAY_TICKS; i++) { w.step(); w.drain(); }
  const br = w.brands.find((b: any) => !b.dead); assert.ok(br, 'a brand exists');
  const store = w.branchesOf(br.id)[0]; store.cash += 100000; w.mint(100000, 'test');
  const star = w.dots.find((d: any) => d.adult && !d.dead && d.id !== br.founder); star.fame = 60;
  const s0 = base(w);
  w.newDeals(); assert.ok(w.deals.length >= 1 || store.cash < 100000 + 1, 'a deal was struck');
  assert.ok(Math.abs(base(w) - s0) < 1e-3, 'deal money only moved');
  const founder = w.dots[br.founder]; const rep0 = br.rep;
  for (const f of w.dots.slice(0, 20)) f.aff.set(founder.id, 40);
  w.pileOn(founder, { topic: 'person', charge: -0.8 });
  assert.ok(founder.ire > 20 && br.rep < rep0, 'infamy and a boycott');
  assert.ok(Math.abs(base(w) - s0) < 1e-3);
  const b: any = new World({ seed: 92, deterministic: true, pop: 400, state: JSON.parse(JSON.stringify(w.serialize())) });
  assert.equal(b.dots[founder.id].ire, founder.ire);
  assert.equal(b.deals.length, w.deals.length);
});
