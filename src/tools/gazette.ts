/* Preview the Gazette:  npm run gazette -- [days=8] [outDir=ml/out/gazette]   (writes issue-N.html and prints each front page) */
import { mkdirSync, writeFileSync } from 'node:fs';
import { World, DAY_TICKS } from '../sim';
import { renderIssue, pageHtml, plain } from '../shared/gazette';

const days = +(process.argv[2] || 8), out = process.argv[3] || 'ml/out/gazette';
mkdirSync(out, { recursive: true });
const w = new World({ seed: 1337, deterministic: true, pop: +(process.env.POP || 700) });
for (let i = 0; i < days * DAY_TICKS; i++) { w.step(); w.drain(); }
for (const is of w.issues) {
  writeFileSync(`${out}/issue-${is.n}.html`, pageHtml({ title: `${plain(is.front.headline)} — The Dotville Gazette No. ${is.n}`, desc: plain(is.front.deck), image: '', url: '', body: renderIssue(is) }));
  console.log(`\n=== No. ${is.n} · ${is.dateline} ===\n${is.front.headline}\n  ${is.front.deck}`);
  for (const s of is.stories) console.log(`  - ${s.headline} :: ${s.deck.slice(0, 90)}`);
}
console.log('\narcs', w.story.arcs.map(a => `${a.kind}:${a.outcome || 'open'}`).join(', '));
