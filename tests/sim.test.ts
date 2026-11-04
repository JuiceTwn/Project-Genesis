import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World, DAY_TICKS } from '../src/sim';

const run = (w: World, ticks: number) => { for (let i = 0; i < ticks; i++) { w.step(); w.drain(); } };
const fingerprint = (w: World) => w.dots.map(d => `${d.x},${d.y},${Math.round(d.coin)}`).join('|');

test('same seed => identical world (determinism)', () => {
  const a = new World({ seed: 7, deterministic: true, pop: 300 }), b = new World({ seed: 7, deterministic: true, pop: 300 });
  run(a, 600); run(b, 600);
  assert.equal(fingerprint(a), fingerprint(b));
});

test('different seeds => different worlds', () => {
  const a = new World({ seed: 7, deterministic: true, pop: 300 }), b = new World({ seed: 8, deterministic: true, pop: 300 });
  assert.notEqual(a.S.map((s: any) => s.name).join(), b.S.map((s: any) => s.name).join());
});

test('a few days run without NaN, with people alive and food flowing', () => {
  const w = new World({ seed: 3, deterministic: true, pop: 300 });
  run(w, 2 * DAY_TICKS);
  const alive = w.dots.filter(d => !d.dead);
  assert.ok(alive.length > 60, 'population survives');
  for (const d of alive) for (const v of [d.hunger, d.energy, d.social, d.coin, d.x, d.y]) assert.ok(Number.isFinite(v), `finite ${d.name}`);
  assert.ok(w.stats.meals > 60, 'people eat');
});

test('serialize/load round trip preserves the population and clock', () => {
  const a = new World({ seed: 5, deterministic: true, pop: 300 });
  run(a, DAY_TICKS);
  const snap = JSON.parse(JSON.stringify(a.serialize()));
  const b = new World({ seed: 5, state: snap, deterministic: true, pop: 300 });
  assert.equal(b.tick, a.tick);
  assert.equal(b.dots.length, a.dots.length);
  assert.equal(b.buildings.length, a.buildings.length);
});

test('every populated settlement has its own mayor, and taxes fill local treasuries and the nation', () => {
  const w = new World({ seed: 11, deterministic: true, pop: 300 });
  const populated = w.S.filter((s: any) => (w.sPop[s.id] || 0) > 2);
  assert.ok(populated.length >= 5, 'several populated settlements');
  for (const s of populated) assert.ok(w.gov(s).mayor >= 0, `${s.name} has a mayor`);
  assert.equal(new Set(populated.map((s: any) => w.gov(s).mayor)).size, populated.length, 'mayors are distinct people');
  run(w, 2 * DAY_TICKS);
  assert.ok(w.townTreasury() > 0, 'local treasuries collect tax');
  assert.ok(w.nation.treasury > 0, 'the nation takes its cut');
});

test('interest-based frames: overview and zoomed views are far smaller than the full population frame', () => {
  const w = new World({ seed: 9, deterministic: true, pop: 300 });
  run(w, 200);
  const full = w.frameFor(null, [], 'full').byteLength, overview = w.frameFor(null).byteLength;
  const cap = w.dots.find((d: any) => !d.dead && !d.inside)!, v = { x0: cap.x - 10, y0: cap.y - 10, x1: cap.x + 10, y1: cap.y + 10 };
  const zoomed = new DataView(w.frameFor(v));
  const gw = zoomed.getUint16(11, true);
  assert.equal(gw, 0, 'no density grid when zoomed in');
  const n = zoomed.getUint16(15, true);
  assert.ok(n >= 1 && n < w.dots.length, `zoomed frame lists only nearby dots (${n})`);
  assert.ok(overview < full, 'overview is smaller than the full frame');
  assert.ok(w.frameFor(v).byteLength < overview, 'a zoomed frame is smaller than the overview');
});
