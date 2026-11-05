import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World, DAY_TICKS, C, TOK_PERSON, TOK_PLACE } from '../src/sim';
import { ticOf, persona, dialectOf, lint, BANK, topicIds, flourishIds, defineActs, defineTags, defineFlourish, defineTopic } from '../src/sim/speech';

const run = (w: any, ticks: number) => { const say: any[] = []; for (let i = 0; i < ticks; i++) { w.step(); for (const m of w.drain()) if (m.t === 'say') say.push(m); w.frame(); } return say; };
const lines = (w: any, act: any, d: any, n = 80, l?: any) => { const o: string[] = []; for (let i = 0; i < n; i++) { w.tick += 7; o.push(w.speak(act, d, l)); } return o; };
const adults = (w: any) => w.dots.filter((x: any) => x.adult && !x.dead);

test('speech: lines are English on the wire, varied, and never leak placeholders', () => {
  const w: any = new World({ seed: 301, deterministic: true, pop: 300 });
  const say = run(w, Math.round(1.5 * DAY_TICKS));
  assert.ok(say.length > 500, 'people talk');
  assert.ok(say.every(m => typeof m.s === 'string' && m.s.length > 1 && m.k === undefined), 'every line is rendered text, tokens never reach clients');
  assert.ok(say.every(m => !/undefined|NaN|\[object|[{}]|null/.test(m.s)), 'no template leaks');
  assert.ok(say.every(m => /^\W*[A-Z0-9“"']/.test(m.s)), 'lines start with a capital');
  const distinct = new Set(say.map(m => m.s)).size;
  assert.ok(distinct > 250, `varied speech: ${distinct} distinct lines from ${say.length}`);
});

test('speech: the content lints clean and is substantial', () => {
  assert.deepEqual(lint(), []);
  const phr = Object.values(BANK).reduce((a, v) => a + v.length, 0);
  assert.ok(Object.keys(BANK).length >= 140 && phr >= 650, `${Object.keys(BANK).length} acts, ${phr} phrasings`);
  assert.ok(topicIds().length >= 15 && flourishIds().length >= 40, `${topicIds().length} topics, ${flourishIds().length} flourishes`);
});

test('speech: rendering never touches the simulation RNG, and is deterministic for a seed', () => {
  const a: any = new World({ seed: 302, deterministic: true, pop: 200 }), b: any = new World({ seed: 302, deterministic: true, pop: 200 });
  const d = adults(a)[0];
  for (let i = 0; i < 200; i++) a.speak([C.HELLO, TOK_PERSON + d.id], d);
  assert.equal(a.rnd(), b.rnd(), 'same next random number after 200 spoken lines');
  const go = () => run(new World({ seed: 303, deterministic: true, pop: 200 }), DAY_TICKS / 2).map(m => m.s).join('|');
  assert.equal(go(), go());
});

test('speech: people are addressed by name even when their id is above 1000 (it used to read as a building)', () => {
  const w: any = new World({ seed: 304, deterministic: true });
  const hi = w.dots.find((x: any) => x.id >= 1000 && !x.dead), lo = adults(w).find((x: any) => x.id !== hi.id);
  const seen = new Set(lines(w, [C.HELLO, TOK_PERSON + hi.id], lo, 40)), first = (hi.base || hi.name).replace(/ “[^”]*”$/, '');
  assert.ok([...seen].some(s => s.includes(first)), `a greeting names ${first}: ${[...seen].slice(0, 3).join(' / ')}`);
  const b = w.buildings.find((x: any) => x.type === 2);
  assert.ok(/market/i.test(w.speak([TOK_PLACE + b.id, C.NO, C.FOOD], lo)), 'a building token names the place');
});

test('speech: no triple repeats, a stable tic and persona per person', () => {
  const w: any = new World({ seed: 305, deterministic: true, pop: 200 });
  const d = adults(w)[0], out = lines(w, [C.ME, C.HUNGRY], d, 14);
  for (let i = 2; i < out.length; i++) assert.ok(!(out[i] === out[i - 1] && out[i] === out[i - 2]), 'no triple repeats');
  assert.ok(new Set(out).size >= 5, `variety for one speaker: ${new Set(out).size}`);
  assert.equal(ticOf(d), ticOf(d)); assert.deepEqual(persona(d), persona(d));
  assert.ok(new Set(w.dots.slice(0, 80).map(ticOf)).size > 15, 'people differ in their tics');
  assert.ok(new Set(w.dots.slice(0, 120).map((x: any) => persona(x).quirk)).size >= 3, 'some people have quirks');
});

test('speech: flourishes follow the speaker (cough when ill, shouting, third person), and never lowercase a name', () => {
  const w: any = new World({ seed: 306, deterministic: true, pop: 300 });
  const [a, b] = adults(w);
  a.hp = [{ k: 'flu', sev: 0.5, since: w.tick, treated: false }];
  assert.ok(lines(w, [C.ME, C.TIRED], a, 160).some(s => /\*cough\*/i.test(s)), 'an ill person coughs');
  b.fx.temper = 2; assert.ok(lines(w, [C.ME, C.HUNGRY], b, 200).some(s => /[A-Z]{3,}!/.test(s)), 'a hothead shouts');
  const third = adults(w).find((x: any) => persona(x).quirk === 'third')!; assert.ok(third, 'someone speaks in the third person');
  const t3 = lines(w, [C.ME, C.LONELY], third, 120), me = (third.base || third.name).replace(/ “[^”]*”$/, '');
  assert.ok(t3.some(s => s.includes(me)) && t3.every(s => !/\bI'm\b/.test(s) || !s.includes(me)), `a third-person speaker uses their own name: ${t3.find(s => s.includes(me))}`);
  const named = new Set<string>(); for (let i = 0; i < 300; i++) { w.tick += 3; named.add(w.speak('GOSSIP_GOOD', adults(w)[2], undefined, undefined, { n: 'Pimbert' })); }
  assert.ok([...named].every(s => s.includes('Pimbert')), 'a name keeps its capital even after a prefix flourish');
});

test('speech: settlements have dialects that colour what their people say', () => {
  const w: any = new World({ seed: 307, deterministic: true });
  const ids = new Set<string>(); const bySid = new Map<number, any>();
  for (let sid = 0; sid < w.S.length; sid++) { const d = dialectOf(w, sid); ids.add(d ? d.id : 'plain'); bySid.set(sid, d); }
  assert.ok(ids.size >= 3, `a country has several dialects: ${[...ids]}`);
  const marks: Record<string, RegExp> = { northern: /ey up|aye|grand|champion|summat|nowt|\bmate\b/i, coastal: /ahoy|fair winds|aye|matey/i, farmland: /howdy|aye|\bpet\b|\bright\b|\bfine\b|top-notch/i, townie: /how do you do|good day|splendid|obliged|old boy|quite well/i };
  for (const [sid, dia] of bySid) {
    if (!dia) continue; const d = adults(w).find((x: any) => w.buildings[x.home].sid === sid); if (!d) continue;
    const said = [...lines(w, [C.HELLO], d, 120), ...lines(w, [C.BYE], d, 120)];
    assert.ok(said.some(s => marks[dia.id].test(s)), `${dia.id} speakers sound like it: ${[...new Set(said)].slice(0, 5).join(' / ')}`);
  }
});

test('speech: real conversations draw on what is true, reply to it, take turns, and do not rehash', () => {
  const w: any = new World({ seed: 308, deterministic: true, pop: 300 });
  const [s, l] = adults(w); s.aff.set(l.id, 40); l.aff.set(s.id, 40);
  s.th = [{ k: 'breakup', v: -14, until: w.tick + 9000, from: w.tick, txt: 'Heartbroken.' }];
  const said = new Set<string>(); for (let i = 0; i < 200; i++) { w.tick += 900; const c = w.conversation(s, l); if (c) for (const [who, t] of c.lines) if (who === s) said.add(t); }
  assert.ok([...said].some(t => /over between us|finished/.test(t)), `a heartbroken person says so: ${[...said].slice(0, 4).join(' / ')}`);
  s.mem = [{ t: w.tick - 1000, x: 'my wedding day', w: 8, with: l.id }];
  const mem = new Set<string>(); for (let i = 0; i < 300; i++) { w.tick += 900; const c = w.conversation(s, l); if (c) for (const [, t] of c.lines) mem.add(t); }
  assert.ok([...mem].some(t => /wedding day/.test(t) && /there/.test(t)), 'a shared memory is brought up with the person who was there');
  let turns2 = 0, total = 0; const first: string[] = [];
  for (let i = 0; i < 300; i++) { w.tick += 900; const c = w.conversation(s, l); if (!c) continue; total++; if (c.topics.length >= 2) turns2++; assert.ok(c.topics.length <= 3 && c.lines.length <= 14); first.push(c.topics[0]); }
  assert.ok(turns2 > total * 0.1, `friends take turns: ${turns2}/${total} chats had a second topic`);
  const w2: any = new World({ seed: 309, deterministic: true, pop: 300 }), [p, q] = adults(w2); const seq: string[] = [];
  for (let i = 0; i < 6; i++) { w2.tick += 60; const c = w2.conversation(p, q); if (c) seq.push(c.topics[0]); }
  assert.ok(new Set(seq).size >= 3, `one pair, one afternoon, no broken record: ${seq}`);
});

test('speech: news is about real recent events involving other people', () => {
  const w: any = new World({ seed: 310, deterministic: true, pop: 300 });
  const [s, l, x] = adults(w); w.ev('bankrupt9', `📉 ${x.name} lost the bakery to the bank.`, [x.id], 0, 4);
  const got = new Set<string>(); for (let i = 0; i < 300; i++) { w.tick += 5; const c = w.conversation(s, l); if (c && c.topics.includes('news')) for (const [, t] of c.lines) got.add(t); }
  assert.ok([...got].some(t => t.includes('lost the bakery')), `they repeat what happened: ${[...got].slice(0, 3).join(' / ')}`);
});

/* keep last: it registers new content, which stays registered for the rest of this process */
test('speech: new content plugs in with one call each (acts, tags, flourishes, topics) and still lints clean', () => {
  const w: any = new World({ seed: 311, deterministic: true, pop: 200 }), [a, b] = adults(w);
  defineActs({ ZZ_FISH: ['I caught {num} fish.', ['A bumper catch: {num}.', 'zzlucky']] });
  defineTags('zz', ['zzlucky'], ({ s }, add) => { if (s && s.id === a.id) add('zzlucky'); });
  defineFlourish({ id: 'zz-splash', slot: 'open', when: 'zzlucky', chance: 0.95, weight: 9, apply: t => `*splash* ${t}` });
  defineTopic({ id: 'zz-fish', weight: () => 1e6, run: c => { c.say('ZZ_FISH', { num: 4 }); c.reply('CONGRATS'); return true; } });
  const fish: string[] = []; for (let i = 0; i < 60; i++) { w.tick += 7; fish.push(w.speak('ZZ_FISH', a, undefined, undefined, { num: 4 })); }
  assert.ok(fish.some(s => /\*splash\*/i.test(s) && /4/.test(s)), `a new act, tag and flourish work together: ${fish.slice(0, 3)}`);
  const c = w.conversation(a, b); assert.equal(c.topics[0], 'zz-fish'); assert.ok(/4/.test(c.lines[0][1]));
  assert.deepEqual(lint(), []);
});
