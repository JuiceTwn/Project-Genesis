import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World, DAY_TICKS } from '../src/sim';
import { valid } from '../src/sim/personality';
import { targetTension } from '../src/sim/storyteller';

const run = (w: World, days: number) => { for (let i = 0; i < days * DAY_TICKS; i++) { w.step(); w.drain(); } };

test('the storyteller launches arcs, resolves them, writes a chronicle, and the world stays coherent', () => {
  const w = new World({ seed: 31, deterministic: true, pop: 500 }), s0 = w.moneySupply();
  run(w, 13);
  const launched = w.story.nextId - 1, closed = w.story.closed;
  assert.ok(launched >= 3, `arcs launched: ${launched}`);
  assert.ok(closed >= 1, `arcs closed: ${closed}`);
  assert.ok(w.story.chron.length >= launched, 'every arc leaves chronicle entries');
  const kinds = new Set(w.story.arcs.map(a => a.kind)); assert.ok(kinds.size >= 2, `varied kinds: ${[...kinds]}`);
  for (const a of w.story.arcs) if (a.done) assert.ok(a.outcome, `${a.kind} has an outcome`);
  for (const d of w.dots) if (!d.dead) assert.ok(valid(d.traits), `${d.name}: ${d.traits}`);   // character shifts never break the rules
  assert.ok(Math.abs(w.moneySupply() - (s0 + w.ledger.minted + w.ledger.inflow - w.ledger.outflow)) < 1e-2, 'arcs move money but never create it');
  const active = w.story.arcs.filter(a => !a.done).length; assert.ok(active <= Math.max(2, Math.round(500 / 150)) + 1, `pacing cap respected (${active})`);
});

test('pacing follows a wave', () => { const t = Array.from({ length: 30 }, (_, d) => targetTension(d)); assert.ok(Math.max(...t) - Math.min(...t) > 2.5); });
