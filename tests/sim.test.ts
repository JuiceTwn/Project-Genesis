import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World, DAY_TICKS } from '../src/sim';

const run = (w: World, ticks: number) => { for (let i = 0; i < ticks; i++) { w.step(); w.drain(); } };
const fingerprint = (w: World) => w.dots.map(d => `${d.x},${d.y},${Math.round(d.coin)}`).join('|');

test('same seed => identical world (determinism)', () => {
  const a = new World({ seed: 7, deterministic: true }), b = new World({ seed: 7, deterministic: true });
  run(a, 600); run(b, 600);
  assert.equal(fingerprint(a), fingerprint(b));
});

test('different seeds => different worlds', () => {
  const a = new World({ seed: 7, deterministic: true }), b = new World({ seed: 8, deterministic: true });
  assert.notEqual(a.S.map((s: any) => s.name).join(), b.S.map((s: any) => s.name).join());
});

test('a few days run without NaN, with people alive and food flowing', () => {
  const w = new World({ seed: 3, deterministic: true });
  run(w, 3 * DAY_TICKS);
  const alive = w.dots.filter(d => !d.dead);
  assert.ok(alive.length > 100, 'population survives');
  for (const d of alive) for (const v of [d.hunger, d.energy, d.social, d.coin, d.x, d.y]) assert.ok(Number.isFinite(v), `finite ${d.name}`);
  assert.ok(w.stats.meals > 100, 'people eat');
});

test('serialize/load round trip preserves the population and clock', () => {
  const a = new World({ seed: 5, deterministic: true });
  run(a, DAY_TICKS);
  const snap = JSON.parse(JSON.stringify(a.serialize()));
  const b = new World({ seed: 5, state: snap, deterministic: true });
  assert.equal(b.tick, a.tick);
  assert.equal(b.dots.length, a.dots.length);
  assert.equal(b.buildings.length, a.buildings.length);
});
