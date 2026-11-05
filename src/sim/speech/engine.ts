/* The speech engine: registries plus the rendering pipeline. Content lives elsewhere (see ./content and ./README.md); this file knows no phrases.

   An ACT is what a system means ("I am hungry", "that market is empty"): a string key into the bank, or a list of legacy concept tokens.
   Rendering an act:  tags (what is true of speaker, listener and the moment)  ->  eligible variants  ->  one weighted pick that avoids the
   speaker's recent lines  ->  slots filled  ->  dialect  ->  flourishes (voice.ts).
   Everything is chosen from a hash of (tick, speaker, act), never from the world's RNG, so speech can never change what the simulation does. */
import type { Dot, Building } from '../../shared/types';
import { World } from '../world';
import * as K from '../../shared/constants';

export type Act = number[] | string;
/** A phrasing: plain text, or [text, tag expression]. A tag expression is space-separated terms that must ALL hold: "rain", "!night", "close|glad". */
export type V = string | [string, string];

/* ---------- registries ---------- */
export const BANK: Record<string, V[]> = {};
export const PLAIN = new Set<string>();                   // acts that never get flourishes: greetings, one-word answers, replies
export const SLOTS = new Set<string>(['n', 'p', 'pk', 'x', 'y', 'town', 'job', 'thing', 'kind', 'dream', 'skill', 'what', 'when', 'num']);
export const TAGS = new Set<string>();                    // every tag some provider can produce (the linter checks variants against this)

export interface TagEnv { w: World; s?: Dot; l?: Dot; b?: Building }
type TagProvider = { id: string; provides: string[]; fn: (e: TagEnv, add: (t: string) => void) => void };
const PROVIDERS: TagProvider[] = [];

/** Add phrasings to the bank. Calling it again for the same key appends. `plain: true` keeps flourishes off these acts. */
export function defineActs(acts: Record<string, V[]>, opts: { plain?: boolean } = {}): void {
  for (const k of Object.keys(acts)) { (BANK[k] || (BANK[k] = [])).push(...acts[k]); if (opts.plain) PLAIN.add(k); }
}
/** Declare slot names usable as {name} inside phrasings. */
export function declareSlots(...names: string[]): void { for (const n of names) SLOTS.add(n); }
/** Register something that knows tags: `provides` lists every tag it can add, `fn` adds them for this speaker/listener/moment. */
export function defineTags(id: string, provides: string[], fn: TagProvider['fn']): void {
  PROVIDERS.push({ id, provides, fn }); for (const p of provides) TAGS.add(p);
}

/* ---------- tags ---------- */
export function tagsFor(w: World, s?: Dot, l?: Dot, b?: Building): Set<string> {
  const t = new Set<string>(), add = (x: string) => { t.add(x); }, env: TagEnv = { w, s, l, b };
  for (const p of PROVIDERS) p.fn(env, add);
  return t;
}
/** Does a tag expression hold? Returns 0 if not, else a weight (more matching terms = more specific = more likely). */
export function weigh(expr: string, tags: Set<string>): number {
  let weight = 3;
  for (const term of expr.split(' ')) {
    if (!term) continue;
    if (term[0] === '!') { if (tags.has(term.slice(1))) return 0; continue; }
    if (term.includes('|')) { if (!term.split('|').some(x => tags.has(x))) return 0; } else if (!tags.has(term)) return 0;
    weight += 1;
  }
  return weight;
}
export const matches = (expr: string, tags: Set<string>) => weigh(expr, tags) > 0;

/* ---------- hashing ---------- */
export function mix(a: number, b = 0, c = 0): number {
  let h = (a | 0) ^ Math.imul(b | 0, 0x9e3779b1) ^ Math.imul(c | 0, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b); h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35); return (h ^ (h >>> 16)) >>> 0;
}
export const hstr = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };
export const pickBy = <T,>(a: T[], h: number): T => a[h % a.length];

/* ---------- names ---------- */
export const strip = (n: string) => n.replace(/ “[^”]*”$/, '');
export const first = (d: Dot) => strip(d.base || d.name);
export function placeLong(w: World, b: Building): string { return b.type === K.BT.HOUSE ? `the ${b.fam || 'old'} house` : b.sqPark ? `${w.S[b.sid].name} park` : `${b.name} ${w.kindName(b).toLowerCase()}`; }
export function placeShort(w: World, b: Building): string { return b.type === K.BT.HOUSE ? 'home' : b.sqPark ? 'the park' : `the ${w.kindName(b).toLowerCase()}`; }
export const cap = (s: string) => s.replace(/^(\W*)([a-z])/, (_m, a, b) => a + b.toUpperCase());
export const lcfirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/* ---------- a speaker does not repeat recent lines ---------- */
const RECENT = new WeakMap<World, Map<number, number[]>>();
function recent(w: World, who: number): number[] { let m = RECENT.get(w); if (!m) RECENT.set(w, m = new Map()); let r = m.get(who); if (!r) m.set(who, r = []); return r; }

/* ---------- the finishing hook (voice.ts installs it, so the engine does not depend on it) ---------- */
/** `names` = capitalised words that came from slots or are the speakers' names, so flourishes never lowercase a name. */
export interface Finish { w: World; s?: Dot; l?: Dot; b?: Building; tags: Set<string>; h: number; plain: boolean; names: Set<string> }
let finisher: (text: string, f: Finish) => string = t => t;
export const setFinisher = (fn: typeof finisher) => { finisher = fn; };

function fill(text: string, args: Record<string, any>): string {
  return text.replace(/\{(\w+)\}/g, (_m, k) => { const v = args[k]; return v === undefined || v === null ? '' : String(v); });
}

/** Shape key of a legacy token list ('HELLO P', 'YOU AND ME GO PLACE') plus the person and place arguments inside it. */
function parse(w: World, k: number[]): { key: string; n?: Dot; place?: Building } {
  let n: Dot | undefined, place: Building | undefined; const parts: string[] = [];
  for (const t of k) {
    if (t >= K.TOK_SETT) parts.push('S');
    else if (t >= K.TOK_PLACE) { const b = w.buildings[t - K.TOK_PLACE]; if (b) place = b; parts.push('PLACE'); }
    else if (t >= K.TOK_PERSON) { n = w.dots[t - K.TOK_PERSON]; parts.push('P'); } else parts.push(K.CON[t][0]);
  }
  return { key: parts.join(' '), n, place };
}

/** The sentence for an act. `s` speaks, `l` is spoken to (optional), `b` is a speaking building. `args.tags` adds tags for this line only. */
export function render(w: World, act: Act, s?: Dot, l?: Dot, b?: Building, args: Record<string, any> = {}): string {
  const tags = tagsFor(w, s, l, b); if (args.tags) for (const t of args.tags) tags.add(t);
  if (typeof act === 'string') return BANK[act] ? pick(w, act, args, s, l, b, tags) : finish(w, act, s, l, b, tags, hstr(act) ^ w.tick, false, args);   // a bank key, or a ready sentence
  const { key, n, place } = parse(w, act), a = { ...args };
  if (n) a.n = first(n); if (place) { a.p = placeLong(w, place); a.pk = placeShort(w, place); }
  if (BANK[key]) return pick(w, key, a, s, l, b, tags);
  const words = act.map(t => t >= K.TOK_SETT ? (w.S[t - K.TOK_SETT]?.name || '') : t >= K.TOK_PLACE ? (a.p || 'home') : t >= K.TOK_PERSON ? (a.n || '?') : K.CON[t][1]);
  return cap(words.join(' ')) + '.';                       // an act with no phrasings yet: its words, plainly, rather than nothing
}

function pick(w: World, key: string, args: Record<string, any>, s: Dot | undefined, l: Dot | undefined, b: Building | undefined, tags: Set<string>): string {
  const bank = BANK[key], who = s ? s.id : b ? 100000 + b.id : -1, rec = recent(w, who), kh = hstr(key), h = mix(w.tick, who + 1, kh);
  let cand: [number, number][] = []; bank.forEach((v, i) => { const wt = typeof v === 'string' ? 1 : weigh(v[1], tags); if (wt) cand.push([i, wt]); });
  if (!cand.length) cand = bank.map((_v, i) => [i, 1] as [number, number]).slice(0, 1);
  const fresh = cand.filter(([i]) => rec.indexOf(kh + i) < 0); if (fresh.length) cand = fresh;
  let total = 0; for (const c of cand) total += c[1];
  let roll = h % Math.max(1, total), idx = cand[0][0]; for (const [i, wt] of cand) { if (roll < wt) { idx = i; break; } roll -= wt; }
  rec.push(kh + idx); if (rec.length > 8) rec.shift();
  const v = bank[idx];
  return finish(w, fill(typeof v === 'string' ? v : v[0], args), s, l, b, tags, h, PLAIN.has(key) || key.startsWith('R_'), args);
}
function namesIn(s: Dot | undefined, l: Dot | undefined, args: Record<string, any>): Set<string> {
  const out = new Set<string>(); const add = (v: any) => { if (typeof v === 'string') for (const w of v.split(/[\s,.!?]+/)) if (/^[A-Z]/.test(w)) out.add(w.replace(/'s$/, '')); };
  if (s) add(first(s)); if (l) add(first(l)); for (const k of Object.keys(args)) if (k !== 'tags') add(args[k]); return out;
}
function finish(w: World, text: string, s: Dot | undefined, l: Dot | undefined, b: Building | undefined, tags: Set<string>, h: number, plain: boolean, args: Record<string, any> = {}): string {
  return cap(finisher(text, { w, s, l, b, tags, h, plain, names: namesIn(s, l, args) }));
}

/** Pick a phrase for a bank key without any voice applied (used by flourishes and tools that need a raw line). */
export function raw(w: World, key: string, s?: Dot, l?: Dot, args: Record<string, any> = {}): string {
  const bank = BANK[key]; if (!bank) return key; const tags = tagsFor(w, s, l), h = mix(w.tick, s ? s.id : 0, hstr(key));
  const c = bank.map(v => ({ t: typeof v === 'string' ? v : v[0], wt: typeof v === 'string' ? 1 : weigh(v[1], tags) })).filter(x => x.wt);
  return fill((c.length ? c[h % c.length] : { t: key }).t, args);
}
