/* Voice: how a particular person sounds. Three layers, applied in this order to every non-plain line:
     1. DIALECT   the settlement's way of talking (word swaps), the same for everyone who lives there.
     2. PERSONA   what is permanently theirs: an opening tic, an oath, a sign-off and sometimes a quirk. Fixed by a hash of their id, so viewers learn them.
     3. FLOURISHES  conditional touches (a hothead shouting, a cough when ill, a yawn for a new parent, "As mayor, ...").
   Flourishes are registered with defineFlourish() from any file: give it a tag expression, a chance and a function. Each line gets at most one flourish
   per slot and at most two in all, so lines stay readable. `swap` rewrites the text, `open` goes in front, `close` goes behind. */
import type { Dot } from '../../shared/types';
import { World } from '../world';
import { mix, hstr, pickBy, matches, first, lcfirst, setFinisher, type Finish } from './engine';

/* ---------- persona ---------- */
const TICS = ['Mark my words', 'Honestly', 'Truth be told', 'Right then', 'Bless my boots', 'Swear on my life', 'As I always say', 'Mind you', 'Funny thing', 'Well, I never', 'Heaven help us', 'If you ask me', 'You know what they say', 'I tell you what', 'Believe you me', 'God\'s honest truth', 'Between you and me', 'Now then', 'Let me tell you', 'Look', 'Listen', 'By my reckoning', 'In all my days', 'Cross my heart', 'Fair is fair', 'To be fair', 'Not to be rude, but', 'As luck would have it', 'Would you believe', 'Strictly speaking', 'On reflection', 'For what it\'s worth', 'Bless my soul', 'At the end of the day', 'I\'ll say this', 'Between us', 'Quite frankly', 'Plain as day', 'Hand on heart', 'So I says'];
const OATHS = ['Blimey!', 'Crikey!', 'Strewth!', 'Good grief!', 'Gosh!', 'Heavens!', 'Flipping heck!', 'Cor!', 'Lawks!', 'Great galloping goats!', 'Stone the crows!', 'Well, butter my biscuit!', 'Golly!', 'Ye gods!'];
const SIGNOFFS = ['Anyway.', 'Just saying.', 'That\'s that.', 'Funny old world.', 'Make of that what you will.', 'There you have it.', 'But what do I know?', 'So it goes.', 'Simple as that.', 'Believe it or not.', 'I\'ve said my piece.', 'And there it is.'];
const PETS = ['love', 'mate', 'old friend', 'pal', 'dear', 'chief', 'my friend', 'sunshine', 'friend', 'darling'];
const PROVERBS = ['A stitch in time saves nine.', 'Too many cooks spoil the broth.', 'Early to bed, early to rise.', 'Every cloud has a silver lining.', 'Don\'t count your chickens.', 'Many hands make light work.', 'Better late than never.', 'Waste not, want not.', 'You reap what you sow.', 'No use crying over spilt milk.', 'A penny saved is a penny earned.', 'Still waters run deep.'];
const EHS = ['Eh?', 'Right?', 'Don\'t you think?', 'Know what I mean?', 'Yeah?', 'Innit?', 'See?'];
const QUIRKS = ['none', 'none', 'none', 'none', 'none', 'none', 'none', 'third', 'proverb', 'eh', 'eh', 'none'];
export interface Persona { tic: string; oath: string; signoff: string; pet: string; proverb: string; eh: string; quirk: string }
export function persona(d: Dot): Persona {
  const h = mix(d.id, 7919);
  return { tic: pickBy(TICS, h), oath: pickBy(OATHS, mix(d.id, 31)), signoff: pickBy(SIGNOFFS, mix(d.id, 17)), pet: pickBy(PETS, mix(d.id, 53)), proverb: pickBy(PROVERBS, mix(d.id, 71)), eh: pickBy(EHS, mix(d.id, 97)), quirk: pickBy(QUIRKS, mix(d.id, 13)) };
}
/** The one phrase a person leans on. Fixed for life. */
export const ticOf = (d: Dot): string => persona(d).tic;

/* ---------- dialects ---------- */
export interface Dialect { id: string; weight: number; swaps: [RegExp, string][] }
const DIALECTS: Dialect[] = [];
/** A dialect is a list of word swaps. Capitalisation is kept (hello -> ey up, Hello -> Ey up). Settlements pick one by hash, by weight. */
export function defineDialect(d: Dialect): void { DIALECTS.push(d); }
const same = (from: string, to: string) => from[0] === from[0].toUpperCase() && from[0] !== from[0].toLowerCase() ? to[0].toUpperCase() + to.slice(1) : to;
const dialectCache = new WeakMap<World, Map<number, Dialect | null>>();
export function dialectOf(w: World, sid: number): Dialect | null {
  let m = dialectCache.get(w); if (!m) dialectCache.set(w, m = new Map());
  if (m.has(sid)) return m.get(sid)!;
  let total = 0; for (const d of DIALECTS) total += d.weight; let roll = mix(sid, 4242) % Math.max(1, total), pick: Dialect | null = null;
  for (const d of DIALECTS) { if (roll < d.weight) { pick = d.id === 'plain' ? null : d; break; } roll -= d.weight; }
  m.set(sid, pick); return pick;
}
export function applyDialect(text: string, dia: Dialect | null): string {
  if (!dia) return text; let t = text;
  for (const [re, to] of dia.swaps) t = t.replace(re, m => same(m, to));
  return t;
}

/* ---------- flourishes ---------- */
export interface FCtx extends Finish { d: Dot; me: string; p: Persona }
export interface Flourish {
  id: string; slot: 'swap' | 'open' | 'close';
  when: string;                              // tag expression (see engine.weigh)
  chance: number;                            // 0..1 before the speaker's expressiveness
  apply: (text: string, c: FCtx) => string;
  weight?: number;                           // wins ties between flourishes in the same slot
  fits?: (text: string, c: FCtx) => boolean; // e.g. only short lines
  who?: (d: Dot, c: FCtx) => boolean;        // a per-person gate (persona quirks)
}
const FLOURISHES: Flourish[] = [];
export function defineFlourish(f: Flourish): void { if (FLOURISHES.some(x => x.id === f.id)) throw new Error('duplicate flourish ' + f.id); FLOURISHES.push(f); }
export const flourishIds = () => FLOURISHES.map(f => f.id);
export const flourishConditions = () => FLOURISHES.map(f => ({ id: f.id, when: f.when }));
/** Some people simply talk more colourfully. */
const EXPR: [string, number][] = [['hothead', 1.4], ['gossip', 1.3], ['romantic', 1.3], ['charming', 1.2], ['flirt', 1.2], ['curious', 1.1], ['shy', 0.5], ['calm', 0.7], ['loner', 0.6]];
function expressiveness(tags: Set<string>): number { let e = 1; for (const [t, m] of EXPR) if (tags.has(t)) e *= m; return Math.min(2, e); }

const SLOT_ORDER: Flourish['slot'][] = ['swap', 'open', 'close'];
function flourish(text: string, f: Finish): string {
  const d = f.s; if (!d || !d.adult && !f.tags.has('kid')) return text;
  const dia = dialectOf(f.w, f.w.buildings[d.home].sid); if (dia) text = applyDialect(text, dia);
  const c: FCtx = { ...f, d, me: first(d), p: persona(d) }, ex = expressiveness(f.tags); let used = 0;
  for (const slot of SLOT_ORDER) {
    if (used >= 2) break;
    if ((slot === 'open' || slot === 'close') && text.length > 85) continue;
    let best: Flourish | null = null, bw = -1;
    for (const fl of FLOURISHES) {
      if (fl.slot !== slot || !matches(fl.when, f.tags) || (fl.who && !fl.who(d, c)) || (fl.fits && !fl.fits(text, c))) continue;
      const roll = (mix(f.h, hstr(fl.id)) % 1000) / 1000; if (roll >= Math.min(0.95, fl.chance * ex)) continue;
      const wt = (fl.weight || 0) + (mix(f.h, hstr(fl.id), 3) % 100) / 1000; if (wt > bw) { bw = wt; best = fl; }
    }
    if (best) { text = best.apply(text, c); used++; }
  }
  return text;
}
/** Greetings and replies stay plain; everything else can be coloured. */
setFinisher((text, f) => f.plain ? (f.s ? applyDialect(text, f.s.adult || f.tags.has('kid') ? dialectOf(f.w, f.w.buildings[f.s.home].sid) : null) : text) : flourish(text, f));

export { lcfirst };
