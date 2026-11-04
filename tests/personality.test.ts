import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CATALOG, TRAIT, CONFLICTS, valid, rollTraits, inheritTraits, shiftTraits, fxOf, conflicts, SYNERGY } from '../src/sim/personality';
import { mk } from '../src/shared/util';

test('the catalog is rich and its rules are symmetric and reference real traits', () => {
  assert.ok(CATALOG.length >= 30);
  for (const [a, set] of CONFLICTS) { assert.ok(TRAIT[a], a); for (const b of set) { assert.ok(TRAIT[b], b); assert.ok(CONFLICTS.get(b)!.has(a), `${a}/${b} symmetric`); } }
  for (const [a, set] of SYNERGY) for (const b of set) assert.ok(!conflicts(a, b), `synergy ${a}+${b} must not also conflict`);
});

test('rolled personalities never contain opposing traits (5000 samples)', () => {
  const rf = mk(1); const counts: Record<number, number> = {};
  for (let i = 0; i < 5000; i++) { const t = rollTraits(rf); assert.ok(valid(t), t.join()); assert.ok(t.length >= 2 && t.length <= 4); counts[t.length] = (counts[t.length] || 0) + 1; }
  assert.ok(counts[2] > 1000 && counts[3] > 1500 && counts[4] > 500, JSON.stringify(counts));
});

test('personalities are varied: many distinct combinations, every trait appears', () => {
  const rf = mk(2), seen = new Set<string>(), uses: Record<string, number> = {};
  for (let i = 0; i < 4000; i++) { const t = rollTraits(rf); seen.add(t.slice().sort().join()); for (const x of t) uses[x] = (uses[x] || 0) + 1; }
  assert.ok(seen.size > 1500, `${seen.size} combos`);
  for (const t of CATALOG) assert.ok(uses[t.id] > 20, `${t.id} appears (${uses[t.id] || 0})`);
});

test('synergies make traits cluster (thieves are more often greedy than chance)', () => {
  const rf = mk(3); let thieves = 0, greedyThieves = 0, all = 0, greedy = 0;
  for (let i = 0; i < 30000; i++) { const t = rollTraits(rf); all++; if (t.includes('greedy')) greedy++; if (t.includes('thief')) { thieves++; if (t.includes('greedy')) greedyThieves++; } }
  assert.ok(thieves > 100);
  assert.ok(greedyThieves / thieves > 1.5 * (greedy / all), `${greedyThieves / thieves} vs base ${greedy / all}`);
});

test('children inherit through the same rules and always have 2+ traits', () => {
  const rf = mk(4);
  for (let i = 0; i < 3000; i++) { const a = rollTraits(rf), b = rollTraits(rf), c = inheritTraits(a, b, rf); assert.ok(valid(c), c.join()); assert.ok(c.length >= 2 && c.length <= 4); }
});

test('shifting character drops conflicting traits and respects the cap', () => {
  const r = shiftTraits(['kind', 'brave', 'honest'], 'cruel')!;
  assert.ok(valid(r.traits) && r.traits.includes('cruel') && !r.traits.includes('kind') && r.dropped.includes('kind'));
  const big = shiftTraits(['calm', 'kind', 'brave', 'honest', 'creative'], 'curious')!; assert.ok(big.traits.length <= 5 && valid(big.traits));
  assert.equal(shiftTraits(['kind'], 'kind'), null);
});

test('effects combine: a hothead is quicker to fight than a calm one; thieves steal, honest folk never do', () => {
  assert.ok(fxOf(['hothead']).temper > fxOf(['calm']).temper * 4);
  assert.ok(fxOf(['thief']).crime > 0 && fxOf(['honest']).crime === 0);
  assert.ok(fxOf(['coward']).courage < 0 && fxOf(['brave']).courage > 0);
  assert.ok(fxOf(['generous']).generosity > fxOf(['greedy']).generosity);
});
