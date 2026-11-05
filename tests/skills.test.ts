import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World, DAY_TICKS } from '../src/sim';

test('skills: seeded from age and work, improve with practice, rust, masters make the news, round-trip', () => {
  const w: any = new World({ seed: 111, deterministic: true, pop: 300 });
  for (let i = 0; i < 3 * DAY_TICKS; i++) { w.step(); w.drain(); }
  const farmer = w.dots.find((d: any) => d.adult && !d.dead && d.job === 0), kid = w.dots.find((d: any) => !d.adult && !d.dead);
  assert.ok(farmer);
  assert.ok(w.skillLevel(farmer, 'farm') > w.skillLevel(farmer, 'build'), 'a farmer is best at farming');
  if (kid) assert.ok(w.skillLevel(kid, 'farm') <= 1, 'children start untrained');
  const s0 = w.skillLevel(farmer, 'craft'); for (let i = 0; i < 200; i++) w.trainSkill(farmer, 'craft', 0.05);
  assert.ok(w.skillLevel(farmer, 'craft') > s0 + 3, 'practice improves a skill');
  const lv = w.skillLevel(farmer, 'craft'); assert.ok(lv < 20, 'with diminishing returns');
  farmer.sk.craft = 14.99; farmer.masters = []; const seen: string[] = []; w.trainSkill(farmer, 'craft', 0.5);
  assert.ok(farmer.masters.includes('craft'), 'became a master');
  const b: any = new World({ seed: 111, deterministic: true, pop: 300, state: JSON.parse(JSON.stringify(w.serialize())) });
  assert.ok(Math.abs(b.skillLevel(b.dots[farmer.id], 'craft') - w.skillLevel(farmer, 'craft')) < 5e-3);   // saved to 3 decimals
  assert.deepEqual(b.dots[farmer.id].masters, farmer.masters);
});

test('skills: employers hire the better candidate more often than chance', () => {
  const w: any = new World({ seed: 112, deterministic: true, pop: 300 });
  const pool = w.dots.filter((d: any) => d.adult && !d.dead).slice(0, 10);
  pool.forEach((d: any, i: number) => { d.sk = { farm: 0, build: 0, craft: i * 2, trade: 0, fight: 0, social: 0 }; });
  let sum = 0; for (let i = 0; i < 200; i++) sum += w.skillLevel(pool[w.bestOf(pool, 'craft')], 'craft');
  assert.ok(sum / 200 > 11, `mean hired skill ${sum / 200} beats the pool mean 9`);
});
