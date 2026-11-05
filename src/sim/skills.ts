/* Attributes, skills and trades.
   ATTRIBUTES (rolled once, shaped by traits, drifting with age and hard work): strength, dexterity, intellect, endurance, charm, willpower (3-18, 10 = average).
   SKILLS (18 trades, level 0-20): learning gets exponentially harder near the top, and performance rises exponentially toward mastery, so an expert is worth
   several novices. How fast someone learns depends on their intellect, their traits and (for the young) whether a school is open in town.
   TRADES: every workshop, factory, office, store and tavern has a specialisation (smithy, tailor, bakery, law firm, software studio, clinic, newspaper,
   clothier, hardware store...). A specialisation names the skill its staff use, how much it earns, and what it does for the town. */
import { World } from './world';
import * as K from '../shared/constants';
const { BT } = K;

export const SKILLS = ['farm', 'build', 'craft', 'trade', 'fight', 'social', 'smith', 'tailor', 'cook', 'mech', 'tech', 'finance', 'law', 'medicine', 'teach', 'logistics', 'art', 'stealth'] as const;
export type Skill = typeof SKILLS[number];
export const NAME: Record<Skill, string> = { farm: 'farmer', build: 'builder', craft: 'carpenter', trade: 'salesperson', fight: 'fighter', social: 'charmer', smith: 'smith', tailor: 'tailor', cook: 'cook', mech: 'engineer', tech: 'technologist', finance: 'accountant', law: 'lawyer', medicine: 'doctor', teach: 'teacher', logistics: 'logistician', art: 'artist', stealth: 'cat burglar' };

export const ATTRS = ['str', 'dex', 'int', 'end', 'cha', 'wil'] as const;
export type Attr = typeof ATTRS[number];
const AI: Record<Attr, number> = { str: 0, dex: 1, int: 2, end: 3, cha: 4, wil: 5 };
/** The attribute that governs each skill. */
const GOV: Record<Skill, Attr> = { farm: 'end', build: 'str', craft: 'dex', trade: 'cha', fight: 'str', social: 'cha', smith: 'str', tailor: 'dex', cook: 'dex', mech: 'int', tech: 'int', finance: 'int', law: 'int', medicine: 'int', teach: 'cha', logistics: 'end', art: 'cha', stealth: 'dex' };

/** Trait effects on attributes (added to the roll) and on learning speed (overall, and for particular skills). */
const T_ATTR: Record<string, Partial<Record<Attr, number>>> = {
  lazy: { end: -2, wil: -1 }, workaholic: { end: 2 }, curious: { int: 2 }, creative: { dex: 1, int: 1 }, charming: { cha: 3 }, shy: { cha: -2 }, loner: { cha: -1 }, flirt: { cha: 1 }, kind: { cha: 1 },
  brave: { str: 1, wil: 1 }, coward: { wil: -2 }, calm: { wil: 1 }, pious: { wil: 2 }, optimistic: { wil: 1 }, pessimist: { wil: -1 }, reckless: { str: 1, wil: -1 }, cautious: { wil: 1 }, hothead: { wil: -1, str: 1 },
};
const T_LEARN: Record<string, number> = { ambitious: 0.12, workaholic: 0.15, lazy: -0.25, curious: 0.22, creative: 0.08, pessimist: -0.05, optimistic: 0.04 };
const T_SKILL: Record<string, Partial<Record<Skill, number>>> = {
  creative: { art: 0.35, craft: 0.25, tailor: 0.25 }, curious: { tech: 0.3, medicine: 0.3, finance: 0.2, teach: 0.2, mech: 0.25 }, charming: { trade: 0.3, social: 0.3, law: 0.15 },
  thief: { stealth: 0.6 }, hothead: { fight: 0.2 }, brave: { fight: 0.2 }, greedy: { finance: 0.2, trade: 0.2 }, kind: { medicine: 0.15, teach: 0.15 }, honest: { law: 0.1, finance: 0.1 },
};

export interface Spec { id: string; name: string; skill: Skill; rev?: number; sells?: string[]; tier?: number; minPop?: number; w?: number }
/** Specialisations of each generic business type. `rev` scales export earnings; `sells` are the kinds of gear a store stocks. */
export const SPECS: Record<number, Spec[]> = {
  [BT.WORKSHOP]: [{ id: 'smithy', name: 'Smithy', skill: 'smith', w: 3 }, { id: 'tailor', name: 'Tailor', skill: 'tailor', w: 3 }, { id: 'bakery', name: 'Bakery', skill: 'cook', w: 3 }, { id: 'carpentry', name: 'Carpentry', skill: 'craft', w: 3 }, { id: 'print', name: 'Print Shop', skill: 'tech', w: 1, minPop: 40 }],
  [BT.FACTORY]: [{ id: 'textile', name: 'Textile Mill', skill: 'tailor', w: 2 }, { id: 'machine', name: 'Machine Works', skill: 'mech', rev: 1.15, w: 2 }, { id: 'electronics', name: 'Electronics Plant', skill: 'tech', rev: 1.4, w: 1, minPop: 60 }, { id: 'foodplant', name: 'Food Plant', skill: 'cook', w: 2 }],
  [BT.OFFICE]: [{ id: 'law', name: 'Law Firm', skill: 'law', rev: 1.3, w: 1.5 }, { id: 'accounts', name: 'Accountants', skill: 'finance', rev: 1.2, w: 2 }, { id: 'software', name: 'Software Studio', skill: 'tech', rev: 1.6, w: 1, minPop: 60 },
    { id: 'clinic', name: 'Clinic', skill: 'medicine', rev: 0, w: 2.5 }, { id: 'school', name: 'School', skill: 'teach', rev: 0.6, w: 1.5 }, { id: 'news', name: 'Newspaper', skill: 'art', rev: 0.8, w: 1.2 }],
  [BT.STORE]: [{ id: 'grocer', name: 'Grocer', skill: 'trade', w: 3 }, { id: 'clothier', name: 'Clothier', skill: 'trade', sells: ['clothes', 'coat'], w: 2.5 }, { id: 'hardware', name: 'Hardware', skill: 'trade', sells: ['tool'], w: 2 }, { id: 'general', name: 'General Store', skill: 'trade', sells: ['bag', 'clothes', 'coat', 'tool'], w: 2 }, { id: 'electro', name: 'Electronics Store', skill: 'tech', w: 0.7, minPop: 50 }],
  [BT.TAVERN]: [{ id: 'pub', name: 'Pub', skill: 'cook', w: 3 }, { id: 'cafe', name: 'Café', skill: 'cook', w: 2 }, { id: 'venue', name: 'Music Venue', skill: 'art', w: 1 }],
  [BT.DOCK]: [{ id: 'dock', name: 'Dock', skill: 'logistics', w: 1 }], [BT.BUILDER]: [{ id: 'builders', name: 'Builders', skill: 'build', w: 1 }], [BT.MARKET]: [{ id: 'market', name: 'Market', skill: 'trade', w: 1 }], [BT.FARM]: [{ id: 'farm', name: 'Farm', skill: 'farm', w: 1 }],
};
const SPEC_BY_ID: Record<string, Spec> = {}; for (const l of Object.values(SPECS)) for (const s of l) SPEC_BY_ID[s.id] = s;

/** Performance multiplier for a skill level: ~0.7 for a novice, ~1.15 at level 10, ~2.5 at level 20 (exponential toward mastery). */
export const perfOf = (L: number) => 0.7 + 1.8 * (Math.exp(0.12 * L) - 1) / (Math.exp(2.4) - 1);

/** The specialisation of a building (chosen lazily the first time anyone asks, from what the town has and wants). */
function specOf(this: World, b): Spec | null {
  if (b.spec && SPEC_BY_ID[b.spec]) return SPEC_BY_ID[b.spec];
  const list = SPECS[b.type]; if (!list) return null;
  b.spec = this.pickSpec(b.type, b.sid, b.owner >= 0 ? this.dots[b.owner] : null).id; return SPEC_BY_ID[b.spec];
}

/** Choose a specialisation for a new business: the founder's strengths, what the town lacks, and modern trades only where there are enough people. */
function pickSpec(this: World, type: number, sid: number, founder): Spec {
  const list = SPECS[type] || []; if (list.length <= 1) return list[0] || SPEC_BY_ID.market;
  const P = this.sPop[sid] || 0, town = this.sbl[sid] || [];
  let tot = 0; const ws = list.map(s => {
    if (s.minPop && P < s.minPop) return 0;
    const have = town.filter(b => b.type === type && b.spec === s.id).length;
    let w = (s.w || 1) * Math.max(0.15, 1.5 - 0.7 * have) * (1 + (founder && founder.sk ? (founder.sk[s.skill] || 0) / 6 : 0))   /* read-only: computing skills here could recurse back into this building's spec */;
    if (s.id === 'clinic' && !town.some(b => b.spec === 'clinic')) w *= 2.5;   // a town without a doctor wants one
    tot += w; return w;
  });
  let r = this.rnd() * tot; for (let i = 0; i < list.length; i++) { r -= ws[i]; if (r <= 0) return list[i]; }
  return list[0];
}

/** What to call a business: its specialisation, else its type. */
function kindName(this: World, b): string { const s = this.specOf(b); return s ? s.name : K.BT_NAME[b.type]; }
/** The skill a worker in this building uses. */
export function skillFor(type: number): Skill { const l = SPECS[type]; return l && l.length ? l[0].skill : 'craft'; }
function skillAt(this: World, b): Skill { const s = this.specOf(b); return s ? s.skill : skillFor(b.type); }

/** A person's attributes, rolled lazily: a bell around 10, plus trait effects. Children of the same stock vary but stay in range. */
function attrs(this: World, d): number[] {
  if (d.at) return d.at;
  const roll = () => 10 + (this.rnd() + this.rnd() + this.rnd() - 1.5) * 4, a = [roll(), roll(), roll(), roll(), roll(), roll()];
  for (const t of d.traits) { const m = T_ATTR[t]; if (m) for (const k in m) a[AI[k as Attr]] += m[k as Attr]!; }
  return (d.at = a.map(v => Math.max(3, Math.min(18, v))));
}
/** Current attribute, accounting for age: the body peaks around 25-40 and declines after 55; a child is weaker. */
function attr(this: World, d, k: Attr): number {
  const v = this.attrs(d)[AI[k]];
  if (k === 'str' || k === 'dex' || k === 'end') { const a = d.age; return v * (a < K.ADULT ? 0.55 + 0.45 * (a / K.ADULT) : a > 55 ? Math.max(0.5, 1 - 0.015 * (a - 55)) : 1); }
  return v;
}

/** A person's skill levels; created lazily from age, attributes and current work so old saves and newborns need no migration. */
function skills(this: World, d): Record<string, number> {
  if (d.sk) { for (const k of SKILLS) if (d.sk[k] === undefined) d.sk[k] = 0; return d.sk; }
  const yrs = Math.max(0, d.age - K.ADULT), base = Math.min(10, yrs * 0.25), r = () => 0.4 + this.rnd() * 0.9;
  const sk: Record<string, number> = {}; for (const k of SKILLS) sk[k] = 0;
  const own = d.job === 0 ? 'farm' : d.work >= 0 && this.buildings[d.work] ? this.skillAt(this.buildings[d.work]) : null;
  d.sk = sk; const a = this.attrs(d);
  for (const k of SKILLS) sk[k] = Math.min(6, base * 0.3 * r() * (0.7 + 0.03 * a[AI[GOV[k]]]));
  if (own) sk[own] = Math.min(14, base * 1.4 * r());
  sk.social = Math.min(14, (d.soc || 0.5) * 6 + base * 0.2 + (a[AI.cha] - 10) * 0.3); sk.fight = Math.min(12, sk.fight + (d.fx.courage > 0 ? 2 : 0) + (d.isThief ? 2 : 0) + (a[AI.str] - 10) * 0.3);
  if (d.isThief) sk.stealth = Math.min(12, sk.stealth + 4);
  return sk;
}

const level = (w: World, d, k: Skill): number => w.skills(d)[k] || 0;
/** How well someone does a task of this kind right now: the exponential level curve times the governing attribute. */
function perf(this: World, d, k: Skill): number { return perfOf(level(this, d, k)) * (0.7 + 0.03 * this.attr(d, GOV[k])); }

/** How quickly this person picks up this skill. */
function learnRate(this: World, d, k: Skill): number {
  let r = 0.7 + 0.06 * this.attr(d, 'int'); for (const t of d.traits) { r += T_LEARN[t] || 0; const s = T_SKILL[t]; if (s && s[k]) r += s[k]!; }
  if (d.age < 30 && this.schoolOpen && this.schoolOpen[this.buildings[d.home].sid]) r += 0.15;   // a school in town
  return Math.max(0.25, r);
}

/** Practice: progress is slower the higher you already are (exponentially), faster with intellect and the right traits. The body hardens with hard work. */
function trainSkill(this: World, d, k: Skill, amt: number) {
  if (!d || d.dead || !d.adult) return; const sk = this.skills(d), was = sk[k];
  sk[k] = Math.min(20, was + amt * this.learnRate(d, k) * Math.exp(-0.09 * was));
  const g = GOV[k], at = this.attrs(d), i = AI[g]; if (at[i] < 17 && (g === 'str' || g === 'end' || g === 'dex')) at[i] = Math.min(17, at[i] + amt * 0.04 * Math.exp(-0.15 * (at[i] - 10)));
  if (was < 15 && sk[k] >= 15 && !(d.masters || []).includes(k)) {
    (d.masters = d.masters || []).push(k); d.fame = (d.fame || 0) + 6; this.addThought(d, 'master' + k, 10, 30, `A master ${NAME[k]} at last.`);
    this.ev('master' + d.id + k, `🏅 ${d.name} has become a master ${NAME[k]} after years of practice.`, [d.id], 0, 3);
  }
}

/** Daily: unused skills rust slightly; each business learns how good its staff is; schools and media firms are noted. */
function skillDay(this: World) {
  for (const d of this.dots) { if (d.dead || !d.sk) continue; for (const k of SKILLS) if (d.sk[k] > 2) d.sk[k] -= 0.0008 * d.sk[k]; }
  const sum = new Map<number, [number, number]>(), school: Record<number, boolean> = {}, media: Record<number, boolean> = {};
  for (const d of this.dots) if (!d.dead && d.adult && d.work >= 0 && d.job <= 2) { const b = this.buildings[d.work]; if (!b || b.state !== 'ok') continue; const e = sum.get(b.id) || [0, 0]; e[0] += this.perf(d, this.skillAt(b)); e[1]++; sum.set(b.id, e); }
  for (const b of this.buildings) {
    if (b.state !== 'ok') continue; const e = sum.get(b.id); b.perf = e ? e[0] / e[1] : 0.9;
    if (e && b.spec === 'school') school[b.sid] = true; if (e && b.spec === 'news') media[b.sid] = true;
  }
  this.schoolOpen = school; this.mediaOpen = media;
}

/** Output multiplier for a business: how skilled its staff are (normalised so a typical crew is 1.0) times what its specialisation earns. */
function firmPerf(this: World, b): number { const s = this.specOf(b); return Math.max(0.5, Math.min(2.5, (b.perf || 0.85) / 0.85)) * (s && s.rev !== undefined ? s.rev : 1); }

/** The best of a few random candidates for a job, by the relevant skill. */
function bestOf(this: World, pool: any[], k: Skill) {
  let bi = (this.rnd() * pool.length) | 0;
  for (let t = 0; t < 3 && pool.length > 1; t++) { const i = (this.rnd() * pool.length) | 0; if (this.perf(pool[i], k) > this.perf(pool[bi], k)) bi = i; }
  return bi;
}

Object.assign(World.prototype, { specOf, pickSpec, kindName, skillAt, attrs, attr, skills, perf, learnRate, trainSkill, skillDay, firmPerf, bestOf, skillLevel: function (this: World, d, k: Skill) { return level(this, d, k); } });
declare module './world' { interface World {
  specOf: typeof specOf; pickSpec: typeof pickSpec; kindName: typeof kindName; skillAt: typeof skillAt; attrs: typeof attrs; attr: typeof attr; skills: typeof skills; perf: typeof perf; learnRate: typeof learnRate;
  trainSkill: typeof trainSkill; skillDay: typeof skillDay; firmPerf: typeof firmPerf; bestOf: typeof bestOf; skillLevel: (d: any, k: Skill) => number;
} }
