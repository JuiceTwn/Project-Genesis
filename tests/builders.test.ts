import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World, DAY_TICKS } from '../src/sim';
import * as K from '../src/shared/constants';

test('builders: a contractor firm takes the job, employs the crew, gets paid from escrow, and money is conserved', () => {
  const w: any = new World({ seed: 61, deterministic: true, pop: 300 });
  const firm = w.buildings.find((b: any) => b.type === K.BT.WORKSHOP && b.state === 'ok' && b.owner >= 0) || w.buildings.find((b: any) => b.type === K.BT.WORKSHOP && b.state === 'ok');
  assert.ok(firm);
  firm.type = K.BT.BUILDER; if (firm.owner < 0) firm.owner = w.dots.find((d: any) => d.adult).id; w.rebuild();
  const s0 = w.moneySupply();
  const owner = w.dots.filter((d: any) => d.adult && !d.dead).sort((a: any, b: any) => b.coin - a.coin)[0], s = w.S[firm.sid];
  const plot = w.plotFor(s, 'house'); assert.ok(plot);
  const cost = K.BUILD_COST[K.BT.HOUSE]; owner.coin += cost; const s1 = s0 + cost;   // fund the client (test tampering)
  owner.coin -= cost; const site = w.startBuild(plot, K.BT.HOUSE, owner.id, cost);
  assert.equal(site.contractor, firm.id, 'the builders were chosen as contractor');
  for (let i = 0; i < 30 * DAY_TICKS && site.state === 'build'; i++) { w.step(); w.drain(); }
  assert.ok(site.prog > 0, 'work was done');
  assert.ok(firm.hist.length > 0 || firm.rev > 0 || firm.cash > 0, 'the firm was paid');
  assert.ok(Math.abs(w.moneySupply() - (s1 + w.ledger.minted + w.ledger.inflow - w.ledger.outflow)) < 1e-3, 'conserved');
});
