import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World, DAY_TICKS } from '../src/sim';

test('legend: names are pronounceable and unique; faces are stable', () => {
  const w: any = new World({ seed: 141, deterministic: true, pop: 400 });
  const names = w.dots.map((d: any) => d.name), set = new Set(names);
  assert.equal(set.size, names.length, 'every name is unique');
  assert.ok(names.every((n: string) => /^[A-Z][a-z]+$/.test(n) && n.length <= 12), 'names are plain words');
  assert.ok(names.filter((n: string) => /x$/.test(n)).length < names.length * 0.05, 'no fallback names');
  const f1 = w.faceOf(w.dots[3]), f2 = w.faceOf(w.dots[3]); assert.deepEqual(f1, f2); assert.equal(f1.length, 6);
  assert.notDeepEqual(w.faceOf(w.dots[3]), w.faceOf(w.dots[4]));
});

test('legend: big events earn nicknames (a bigger one outranks a smaller one), tell clients, and leave memories that come back', () => {
  const w: any = new World({ seed: 142, deterministic: true, pop: 300 });
  const d = w.dots.find((x: any) => x.adult && !x.dead), base = d.name; w.drain();
  w.ev('fire', `Fire! ${d.name} lost everything`, [d.id], 0, 4);
  assert.equal(d.nick, 'Ashes'); assert.equal(d.name, `${base} “Ashes”`);
  assert.ok(w.drain().some((m: any) => m.t === 'rename' && m.id === d.id && m.name === d.name), 'clients are told');
  w.ev('quit', `${d.name} quit`, [d.id], 0, 3); assert.equal(d.nick, 'Ashes', 'a smaller nickname does not replace a bigger one');
  w.ev('corrupt1', `${d.name} caught skimming`, [d.id], 0, 5); assert.equal(d.nick, 'Sticky Fingers'); assert.equal(d.base, base);
  assert.ok(d.mem.some((m: any) => /burned/.test(m.x)) && d.mem.some((m: any) => /scandal/.test(m.x)), 'memories were kept');
  let cb: string | null = null; for (let i = 0; i < 60 && !cb; i++) cb = w.callback(d); assert.ok(cb && /burned|scandal/.test(cb), `a callback: ${cb}`);
  const c = w.cast(5); assert.ok(c.length > 0 && c[0].face.length === 6);
  assert.ok(w.cast(30).some((p: any) => p.id === d.id), 'the nicknamed character is in the cast');
  const b: any = new World({ seed: 142, deterministic: true, pop: 300, state: JSON.parse(JSON.stringify(w.serialize())) });
  assert.equal(b.dots[d.id].nick, 'Sticky Fingers'); assert.equal(b.dots[d.id].name, d.name); assert.equal(b.dots[d.id].mem.length, d.mem.length);
});
