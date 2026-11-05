/* Speech workbench: `npm run speech -- [days=4] [seed=7] [conversations=12]`
   Lints the speech content, prints what is registered, then warms a world up and prints real conversations plus a voice card for one character. */
import { World, DAY_TICKS, C } from '../sim';
import { lint, BANK, topicIds, flourishIds, persona, dialectOf } from '../sim/speech';

const [days = '4', seed = '7', count = '12'] = process.argv.slice(2);
const problems = lint();
let phrasings = 0; for (const k of Object.keys(BANK)) phrasings += BANK[k].length;
console.log(`content: ${Object.keys(BANK).length} acts, ${phrasings} phrasings, ${topicIds().length} topics, ${flourishIds().length} flourishes`);
console.log(problems.length ? `LINT: ${problems.length} problems\n  ` + problems.join('\n  ') : 'lint: clean');
if (problems.length) process.exitCode = 1;

const w: any = new World({ seed: +seed, deterministic: true });
for (let i = 0; i < +days * DAY_TICKS; i++) { w.step(); w.drain(); w.frame(); }
const adults = w.dots.filter((d: any) => !d.dead && d.adult), topics: Record<string, number> = {};
let shown = 0;
for (let tries = 0; shown < +count && tries < 5000; tries++) {
  const a = adults[(w.rnd() * adults.length) | 0], fr = w.friends(a), b = fr.length && w.rnd() < 0.6 ? w.dots[fr[0][0]] : adults[(w.rnd() * adults.length) | 0];
  if (a.id === b.id || b.dead) continue;
  const c = w.conversation(a, b); if (!c) continue;
  for (const t of c.topics) topics[t] = (topics[t] || 0) + 1;
  if (c.lines.length < 4 && tries % 2) continue;
  console.log(`\n${a.name} + ${b.name}   [${c.topics.join(' > ')}]`);
  for (const [s, t] of c.lines) console.log(`   ${s.name.split(' ')[0].padEnd(12)} ${t}`);
  shown++;
}
const v = adults[0], p = persona(v), dia = dialectOf(w, w.buildings[v.home].sid);
console.log(`\nvoice card: ${v.name} (${v.traits.join(', ')})\n  tic "${p.tic}" · oath "${p.oath}" · sign-off "${p.signoff}" · pet name "${p.pet}" · quirk ${p.quirk} · dialect ${dia ? dia.id : 'plain'}`);
console.log('  says:'); for (let i = 0; i < 6; i++) { w.tick += 11; console.log('   ' + w.speak([C.ME, C.HUNGRY], v)); }
console.log('\ntopic mix over the sampled conversations:', Object.entries(topics).sort((x, y) => y[1] - x[1]).map(([k, n]) => `${k} ${n}`).join(' · '));
