import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World, DAY_TICKS, C, TOK_PERSON, TOK_PLACE } from '../src/sim';
import { ticOf } from '../src/sim/speech';

const run = (w: any, ticks: number) => { const say: any[] = []; for (let i = 0; i < ticks; i++) { w.step(); for (const m of w.drain()) if (m.t === 'say') say.push(m); w.frame(); } return say; };

test('speech: lines are English on the wire, varied, and never leak placeholders', () => {
  const w: any = new World({ seed: 301, deterministic: true, pop: 300 });
  const say = run(w, Math.round(1.5 * DAY_TICKS));
  assert.ok(say.length > 500, 'people talk');
  assert.ok(say.every(m => typeof m.s === 'string' && m.s.length > 1 && m.k === undefined), 'every line is rendered text, tokens never reach clients');
  assert.ok(say.every(m => !/undefined|NaN|\[object|[{}]|null/.test(m.s)), 'no template leaks');
  assert.ok(say.every(m => /^\W*[A-Z0-9“"']/.test(m.s)), 'lines start with a capital');
  const distinct = new Set(say.map(m => m.s)).size;
  assert.ok(distinct > 120, `varied speech: ${distinct} distinct lines from ${say.length}`);
});

test('speech: it never touches the simulation RNG, so it cannot change what the world does', () => {
  const a: any = new World({ seed: 302, deterministic: true, pop: 200 }), b: any = new World({ seed: 302, deterministic: true, pop: 200 });
  const d = a.dots.find((x: any) => x.adult);
  for (let i = 0; i < 200; i++) a.speak([C.HELLO, TOK_PERSON + d.id], d);
  assert.equal(a.rnd(), b.rnd(), 'same next random number after 200 spoken lines');
});

test('speech: deterministic for a seed', () => {
  const go = () => run(new World({ seed: 303, deterministic: true, pop: 200 }), DAY_TICKS / 2).map(m => m.s).join('|');
  assert.equal(go(), go());
});

test('speech: people are addressed by name even when their id is above 1000 (it used to read as a building)', () => {
  const w: any = new World({ seed: 304, deterministic: true });
  const hi = w.dots.find((x: any) => x.id >= 1000 && !x.dead), lo = w.dots.find((x: any) => x.adult && x.id !== hi.id);
  assert.ok(hi, 'there are 1000+ people at default size');
  const seen = new Set<string>(); for (let t = 0; t < 40; t++) { w.tick += 7; seen.add(w.speak([C.HELLO, TOK_PERSON + hi.id], lo)); }
  const first = (hi.base || hi.name).replace(/ “[^”]*”$/, '');
  assert.ok([...seen].some(s => s.includes(first)), `a greeting names ${first}: ${[...seen].slice(0, 3).join(' / ')}`);
  const b = w.buildings.find((x: any) => x.type === 2);
  assert.ok(/market/i.test(w.speak([TOK_PLACE + b.id, C.NO, C.FOOD], lo)), 'a building token names the place');
});

test('speech: a person does not repeat the same line back to back, and has a stable verbal tic', () => {
  const w: any = new World({ seed: 305, deterministic: true, pop: 200 });
  const d = w.dots.find((x: any) => x.adult), out: string[] = [];
  for (let i = 0; i < 12; i++) { w.tick += 3; out.push(w.speak([C.ME, C.HUNGRY], d).replace(/^.*?, /, '')); }
  for (let i = 2; i < out.length; i++) assert.ok(!(out[i] === out[i - 1] && out[i] === out[i - 2]), 'no triple repeats');
  assert.ok(new Set(out).size >= 4, `variety for one speaker: ${new Set(out).size}`);
  assert.equal(ticOf(d), ticOf(d)); assert.ok(new Set(w.dots.slice(0, 80).map(ticOf)).size > 8, 'people differ in their tics');
});

test('speech: real conversations draw on what is true about the speaker', () => {
  const w: any = new World({ seed: 306, deterministic: true, pop: 300 });
  const [s, l] = w.dots.filter((x: any) => x.adult && !x.dead);
  s.th = [{ k: 'breakup', v: -14, until: w.tick + 5000, from: w.tick, txt: 'Heartbroken.' }];
  s.aff.set(l.id, 40); l.aff.set(s.id, 40);
  const said = new Set<string>(); for (let i = 0; i < 200; i++) { const c = w.conversation(s, l); if (c) for (const [who, t] of c.lines) if (who === s) said.add(t); }
  assert.ok([...said].some(t => /over between us|finished/.test(t)), `a heartbroken person says so: ${[...said].slice(0, 4).join(' / ')}`);
  s.mem = [{ t: w.tick - 1000, x: 'my wedding day', w: 8, with: l.id }];
  const mem = new Set<string>(); for (let i = 0; i < 400; i++) { const c = w.conversation(s, l); if (c) for (const [, t] of c.lines) mem.add(t); }
  assert.ok([...mem].some(t => /wedding day/.test(t) && /there/.test(t)), 'a shared memory is brought up with the person who was there');
});
