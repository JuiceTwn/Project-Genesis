/* Content linter: catches the mistakes that creep in as the bank grows (a tag nobody provides, a {slot} nobody fills, a line that will not fit a bubble).
   Run by the speech test and by `npm run speech`. Returns a list of problems; empty means clean. */
import { BANK, SLOTS, TAGS, PLAIN } from './engine';
import { flourishConditions, flourishIds } from './voice';
import { replyTargets, upgradeConditions, topicIds } from './topics';

export function lint(): string[] {
  const bad: string[] = [], tagBad = (expr: string, where: string) => { for (const term of expr.split(' ')) { if (!term) continue; for (const t of term.replace(/^!/, '').split('|')) if (!TAGS.has(t)) bad.push(`${where}: unknown tag "${t}"`); } };
  for (const [key, vs] of Object.entries(BANK)) {
    if (!vs.length) bad.push(`${key}: no phrasings`);
    const seen = new Set<string>();
    vs.forEach((v, i) => {
      const text = typeof v === 'string' ? v : v[0], where = `${key}[${i}]`;
      if (!text || !text.trim()) { bad.push(`${where}: empty`); return; }
      if (seen.has(text)) bad.push(`${where}: duplicate phrasing "${text}"`); seen.add(text);
      if (text.length > 100) bad.push(`${where}: ${text.length} chars is too long for a bubble`);
      for (const m of text.matchAll(/\{(\w+)\}/g)) if (!SLOTS.has(m[1])) bad.push(`${where}: unknown slot {${m[1]}}`);
      if (/[{}]/.test(text.replace(/\{\w+\}/g, ''))) bad.push(`${where}: stray brace`);
      if (!/[.!?…*'"”)]$|\{\w+\}$/.test(text)) bad.push(`${where}: should end with punctuation: "${text}"`);
      if (typeof v !== 'string') tagBad(v[1], where);
    });
  }
  for (const f of flourishConditions()) tagBad(f.when, `flourish ${f.id}`);
  for (const w of upgradeConditions()) tagBad(w, 'reply upgrade');
  for (const k of replyTargets()) if (!BANK['R_' + k]) bad.push(`reply kind ${k}: no R_${k} act`);
  if (new Set(flourishIds()).size !== flourishIds().length) bad.push('duplicate flourish ids');
  if (new Set(topicIds()).size !== topicIds().length) bad.push('duplicate topic ids');
  void PLAIN; return bad;
}
