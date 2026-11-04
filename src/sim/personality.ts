/* Personality. A dot has 2-4 traits drawn from a catalog. Traits come with rules:
     - hard conflicts: opposing traits can never coexist (brave/coward, honest/thief, ...)
     - soft conflicts: unlikely to coexist (odds halved)
     - synergies: traits that make each other likelier (thief + greedy, kind + generous, ...)
   Each trait contributes behavioural effects; a dot's effects (`fx`) are the combination of its traits.
   Children inherit traits with mutation through the same rules, and hardship can change a character later (shift()). */

export interface Fx {
  soc: number;       // + sociability (how often they seek company)
  dil: number;       // + diligence (how willingly they work)
  spend: number;     // x willingness to spend on drinks/leisure
  crime: number;     // x chance of stealing when they get the chance (thieves only steal at all)
  temper: number;    // x chance of picking a fight
  courage: number;   // -1 (flees) .. +1 (stands ground)
  jealousy: number;  // x reaction to partner chatting with others
  romance: number;   // x interest in love / confessions
  gossip: number;    // x tendency to spread talk
  generosity: number;// x tendency to help the broke
  ambition: number;  // x chance of founding a business
  forgive: number;   // x speed at which bad blood fades (<1 = holds grudges)
  loyalty: number;   // x faithfulness to partner / friends
  risk: number;      // x appetite for risky bets
  tax: number;       // + preferred tax rate as mayor
}
const FX0 = (): Fx => ({ soc: 0, dil: 0, spend: 1, crime: 1, temper: 1, courage: 0, jealousy: 1, romance: 1, gossip: 1, generosity: 1, ambition: 1, forgive: 1, loyalty: 1, risk: 1, tax: 0 });
const ADD = new Set(['soc', 'dil', 'courage', 'tax']);

export interface TraitDef { id: string; emoji: string; group: string; weight: number; blurb: string; fx: Partial<Fx> }
const T = (id: string, emoji: string, group: string, weight: number, blurb: string, fx: Partial<Fx>): TraitDef => ({ id, emoji, group, weight, blurb, fx });

export const CATALOG: TraitDef[] = [
  // drive
  T('ambitious', '⭐', 'drive', 0.15, 'always reaching for more', { dil: 0.35, ambition: 3, risk: 1.3 }),
  T('lazy', '💤', 'drive', 0.10, 'does the minimum', { dil: -0.35, ambition: 0.3 }),
  T('workaholic', '🛠️', 'drive', 0.07, 'lives for the job', { dil: 0.5, soc: -0.15 }),
  T('frugal', '🪙', 'drive', 0.09, 'counts every coin', { spend: 0.4, risk: 0.7 }),
  T('spendthrift', '🛍️', 'drive', 0.08, 'money burns a hole in their pocket', { spend: 1.8, risk: 1.2 }),
  T('greedy', '🤑', 'drive', 0.07, 'wants more than their share', { crime: 1.5, generosity: 0.4, tax: 2, ambition: 1.4 }),
  T('generous', '🎁', 'drive', 0.09, 'gives freely', { generosity: 2.5, tax: -2, spend: 1.2 }),
  // social
  T('gossip', '💬', 'social', 0.15, 'cannot keep a secret', { gossip: 2.5, soc: 0.3 }),
  T('shy', '🫣', 'social', 0.08, 'keeps to themself', { soc: -0.3, romance: 0.7, gossip: 0.4 }),
  T('charming', '😎', 'social', 0.08, 'people warm to them', { soc: 0.25, romance: 1.3 }),
  T('loner', '🐺', 'social', 0.06, 'prefers their own company', { soc: -0.4, loyalty: 0.8 }),
  T('flirt', '😘', 'social', 0.07, 'eyes always wandering', { romance: 1.8, loyalty: 0.4, soc: 0.15 }),
  T('loyal', '🤝', 'social', 0.10, 'stands by their people', { loyalty: 2, jealousy: 0.9 }),
  // temper
  T('hothead', '🔥', 'temper', 0.12, 'quick to anger', { temper: 2.5, forgive: 0.7, courage: 0.2 }),
  T('calm', '🧘', 'temper', 0.10, 'unflappable', { temper: 0.3, forgive: 1.3, jealousy: 0.6 }),
  T('vengeful', '🗡️', 'temper', 0.07, 'never forgets a wrong', { forgive: 0.2, temper: 1.5 }),
  T('forgiving', '🕊️', 'temper', 0.09, 'lets things go', { forgive: 2.5, temper: 0.6 }),
  T('jealous', '💚', 'temper', 0.10, 'watches their partner like a hawk', { jealousy: 3, loyalty: 1.2 }),
  T('kind', '💖', 'temper', 0.15, 'cannot pass someone in need', { generosity: 2, tax: -1, temper: 0.6, crime: 0.3 }),
  T('cruel', '😈', 'temper', 0.04, 'enjoys others\' misfortune', { generosity: 0.1, temper: 1.6, forgive: 0.5 }),
  // courage
  T('brave', '🦁', 'courage', 0.09, 'faces trouble head on', { courage: 0.6, risk: 1.3 }),
  T('coward', '🐥', 'courage', 0.12, 'runs from trouble', { courage: -0.6, temper: 0.5, risk: 0.6 }),
  T('reckless', '🎲', 'courage', 0.07, 'acts before thinking', { risk: 2.2, courage: 0.3, crime: 1.3 }),
  T('cautious', '🦉', 'courage', 0.09, 'thinks twice about everything', { risk: 0.4, spend: 0.8 }),
  // moral
  T('honest', '⚖️', 'moral', 0.12, 'would never take what is not theirs', { crime: 0, loyalty: 1.2 }),
  T('thief', '🥷', 'moral', 0.03, 'light fingers', { crime: 3, courage: -0.1 }),
  T('pious', '🙏', 'moral', 0.06, 'devout', { crime: 0.3, forgive: 1.4, spend: 0.8 }),
  // spirit
  T('romantic', '🌹', 'spirit', 0.20, 'in love with love', { romance: 2, jealousy: 1.2 }),
  T('creative', '🎨', 'spirit', 0.08, 'full of ideas', { ambition: 1.4, dil: 0.1 }),
  T('curious', '🔭', 'spirit', 0.08, 'always exploring', { soc: 0.1, risk: 1.2 }),
  T('optimistic', '🌞', 'spirit', 0.10, 'sees the bright side', { soc: 0.1, risk: 1.2 }),
  T('pessimist', '🌧️', 'spirit', 0.08, 'expects the worst', { soc: -0.1, risk: 0.6, forgive: 0.8 }),
  T('superstitious', '🔮', 'spirit', 0.05, 'reads omens in everything', { risk: 0.7 }),
];
export const TRAIT: Record<string, TraitDef> = Object.fromEntries(CATALOG.map(t => [t.id, t]));
export const TRAIT_IDS = CATALOG.map(t => t.id);

const pairs = (list: [string, string][]) => { const m = new Map<string, Set<string>>(); for (const [a, b] of list) { (m.get(a) || m.set(a, new Set()).get(a)!).add(b); (m.get(b) || m.set(b, new Set()).get(b)!).add(a); } return m; };
/** Hard conflicts: these pairs never coexist. */
export const CONFLICTS = pairs([
  ['ambitious', 'lazy'], ['workaholic', 'lazy'], ['frugal', 'spendthrift'], ['greedy', 'generous'], ['kind', 'cruel'], ['calm', 'hothead'],
  ['brave', 'coward'], ['honest', 'thief'], ['shy', 'charming'], ['shy', 'flirt'], ['shy', 'gossip'], ['loner', 'charming'], ['loner', 'gossip'],
  ['forgiving', 'vengeful'], ['optimistic', 'pessimist'], ['reckless', 'cautious'], ['reckless', 'coward'], ['loyal', 'flirt'], ['honest', 'greedy'],
  ['kind', 'thief'], ['generous', 'thief'], ['cruel', 'generous'], ['cruel', 'forgiving'], ['calm', 'vengeful'], ['pious', 'cruel'], ['pious', 'thief'], ['workaholic', 'spendthrift'],
]);
/** Soft conflicts: allowed but unlikely (weight x0.4). */
export const SOFT = pairs([['jealous', 'calm'], ['brave', 'cautious'], ['romantic', 'loner'], ['gossip', 'honest'], ['lazy', 'creative'], ['frugal', 'generous'], ['kind', 'hothead'], ['cautious', 'curious'], ['loyal', 'thief']]);
/** Synergies: weight x3 when the other trait is already present. */
export const SYNERGY = pairs([
  ['thief', 'greedy'], ['thief', 'reckless'], ['hothead', 'vengeful'], ['hothead', 'reckless'], ['kind', 'generous'], ['kind', 'forgiving'], ['ambitious', 'workaholic'],
  ['ambitious', 'greedy'], ['gossip', 'charming'], ['jealous', 'vengeful'], ['shy', 'cautious'], ['loner', 'pessimist'], ['calm', 'forgiving'], ['romantic', 'charming'],
  ['romantic', 'flirt'], ['brave', 'loyal'], ['honest', 'pious'], ['creative', 'curious'], ['optimistic', 'charming'], ['frugal', 'cautious'], ['spendthrift', 'flirt'],
]);

export const conflicts = (a: string, b: string): boolean => !!CONFLICTS.get(a)?.has(b);
/** Can `t` join `have` without breaking a hard rule? */
export const compatible = (have: string[], t: string): boolean => !have.includes(t) && !have.some(h => conflicts(h, t));
/** Is a whole trait set valid? */
export const valid = (traits: string[]): boolean => new Set(traits).size === traits.length && traits.every((t, i) => !!TRAIT[t] && traits.slice(i + 1).every(u => !conflicts(t, u)));

function weightFor(have: string[], t: TraitDef): number {
  let w = t.weight;
  for (const h of have) { if (SOFT.get(t.id)?.has(h)) w *= 0.4; if (SYNERGY.get(t.id)?.has(h)) w *= 3; }
  return w;
}
/** Draw one trait compatible with `have` (null if the catalog is exhausted). */
export function drawTrait(have: string[], rf: () => number, pool: TraitDef[] = CATALOG): string | null {
  const opts = pool.filter(t => compatible(have, t.id)); if (!opts.length) return null;
  const ws = opts.map(t => weightFor(have, t)), tot = ws.reduce((a, b) => a + b, 0);
  let r = rf() * tot; for (let i = 0; i < opts.length; i++) { r -= ws[i]; if (r <= 0) return opts[i].id; }
  return opts[opts.length - 1].id;
}
/** A fresh personality: 2 traits (35%), 3 (45%) or 4 (20%), built one at a time so every pick respects the rules. */
export function rollTraits(rf: () => number): string[] {
  const n = rf() < 0.35 ? 2 : rf() < 0.7 ? 3 : 4, out: string[] = [];
  while (out.length < n) { const t = drawTrait(out, rf); if (!t) break; out.push(t); }
  return out;
}
/** A child's traits: each parent trait passes on with probability 0.3, then a 20% chance of a mutation; topped up to at least 2. */
export function inheritTraits(a: string[], b: string[], rf: () => number): string[] {
  const out: string[] = [];
  const parents = a.concat(b).sort(() => rf() - 0.5);
  for (const t of parents) if (rf() < 0.3 && compatible(out, t) && out.length < 3) out.push(t);
  if (rf() < 0.2) { const m = drawTrait(out, rf); if (m && out.length < 4) out.push(m); }
  while (out.length < 2) { const t = drawTrait(out, rf); if (!t) break; out.push(t); }
  return out;
}

/** Combine the effects of a trait set. Additive effects add, multiplicative effects multiply. */
export function fxOf(traits: string[]): Fx {
  const f = FX0() as any;
  for (const id of traits) for (const [k, v] of Object.entries(TRAIT[id]?.fx || {})) { if (ADD.has(k)) f[k] += v as number; else f[k] *= v as number; }
  f.courage = Math.max(-1, Math.min(1, f.courage));
  return f as Fx;
}
/** A short epithet for stories, from the most defining trait ("the Gossip"). */
export function epithet(traits: string[]): string {
  const strong = ['thief', 'hothead', 'vengeful', 'greedy', 'generous', 'kind', 'ambitious', 'lazy', 'gossip', 'romantic', 'flirt', 'brave', 'coward', 'honest', 'jealous', 'cruel', 'charming', 'shy', 'loner'];
  const t = strong.find(s => traits.includes(s)) || traits[0] || 'ordinary';
  return 'the ' + t[0].toUpperCase() + t.slice(1);
}
/** Change a character: add `add`, dropping anything it conflicts with; at most 5 traits (the oldest go first). Returns the traits that were dropped. */
export function shiftTraits(traits: string[], add: string): { traits: string[]; dropped: string[] } | null {
  if (!TRAIT[add] || traits.includes(add)) return null;
  const dropped = traits.filter(t => conflicts(t, add)), out = traits.filter(t => !conflicts(t, add));
  out.push(add); while (out.length > 5) dropped.push(out.shift()!);
  return { traits: out, dropped };
}
