/* Typing ratchet: counts implicit-any errors (tsc --noImplicitAny) per file and fails if any file has MORE than
   the baseline in typing-baseline.json. Files can only get cleaner. `node scripts/typing-ratchet.mjs --update`
   rewrites the baseline after you have removed some (it refuses to record an increase). */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

const BASE = new URL('../typing-baseline.json', import.meta.url);
const r = spawnSync('npx', ['tsc', '-p', '.', '--noImplicitAny', '--pretty', 'false'], { encoding: 'utf8' });
const counts = {};
for (const m of (r.stdout || '').matchAll(/^(src\/[^(]+)\(\d+,\d+\): error TS(\d+)/gm)) counts[m[1]] = (counts[m[1]] || 0) + 1;
const base = fs.existsSync(BASE) ? JSON.parse(fs.readFileSync(BASE, 'utf8')) : {};
const total = o => Object.values(o).reduce((a, b) => a + b, 0);

const update = process.argv.includes('--update'), first = !fs.existsSync(BASE);
const worse = first && update ? [] : Object.entries(counts).filter(([f, n]) => n > (base[f] ?? 0));
if (worse.length) {
  console.error('typing ratchet: these files got WORSE (more implicit any / type errors than the baseline):');
  for (const [f, n] of worse) console.error(`  ${f}: ${n} (baseline ${base[f] ?? 0})`);
  process.exit(1);
}
if (update) {
  const sorted = Object.fromEntries(Object.entries(counts).sort());
  fs.writeFileSync(BASE, JSON.stringify(sorted, null, 2) + '\n');
  console.log(`baseline written: ${total(sorted)} implicit-any spots in ${Object.keys(sorted).length} files`);
} else {
  const better = total(base) - total(counts);
  console.log(`typing ratchet ok: ${total(counts)} implicit-any spots (baseline ${total(base)}${better > 0 ? `, ${better} fewer: run with --update to lock it in` : ''})`);
}
