import type { Dot } from '../shared/types';
/* Bonds: relationships with history. `aff` is how a dot feels about someone right now (one number). A bond is WHY: a dated, caused entry in a dot's ledger
   ("robbed me", "never paid me back", "saw them hit Mara", "was kind to me when I was broke"). Bonds fade at a speed set by character (a vengeful dot
   holds a grudge about five times longer than a calm one), and they add up to a grievance. Everything below runs on them:
   - witnesses: bystanders at a theft or a brawl take a side, remember who did it, and feel it (a thought naming the person);
   - loans between friends: a generous friend lends to a broke one; the borrower repays, or stiffs them, depending on who they are;
   - grudges: a dot who meets someone they hold a grudge against cold-shoulders them, or boils over into a fight; the hotheaded go looking for them;
   - gossip: people tell what they saw and what they were told; each retelling loses certainty and sometimes grows (`conf`, `via`), so a rumour is a
     chain of individual heads and a reputation (`standing`) is what the town has collectively heard;
   - inheritance: a family inherits the dead's grudges, and a death that follows a fight becomes a vendetta;
   - peace: calm, kind and loyal people forgive, and apologies happen.
   Money only moves between pockets (loans, repayment). A dot's ledger is capped, so cost stays small. Saved as `bd` on each dot. */
import { World } from './world';
import * as K from '../shared/constants';
import * as R from '../shared/reality';
const DAY = K.DAY_TICKS;

/** One entry in a dot's ledger about another dot. `v` is felt weight (negative = grievance), `conf` how sure they are (1 = saw or lived it), `via` who told
 *  them (-1 = first-hand), `to` the other party of the story (the victim, when it is not the owner), `n` an amount for debts. */
export interface Bond { o: number; k: string; tk: number; v: number; conf: number; via: number; to: number; n: number }

interface KindDef { v: number; acc?: number; tell?: boolean; txt: string }
/** What can go on a ledger. `acc` = slow burn: each entry adds, up to that cap. `txt` completes "<name>: ...". */
export const KIND: Record<string, KindDef> = {
  robbed: { v: -30, tell: true, txt: 'robbed me' }, burgled: { v: -34, tell: true, txt: 'broke into my home' }, beaten: { v: -24, tell: true, txt: 'beat me up' },
  brawl: { v: -8, tell: true, txt: 'fought me' }, jilted: { v: -28, tell: true, txt: 'broke my heart' }, spurned: { v: -8, tell: true, txt: 'turned me down' },
  rival: { v: -9, tell: true, txt: 'has an eye on my partner' }, witnessed: { v: -15, tell: true, txt: 'I saw what they did' }, stiffed: { v: -32, tell: true, txt: 'never paid me back' },
  killed: { v: -70, tell: true, txt: 'killed someone I loved' }, feud: { v: -30, tell: true, txt: 'wronged my family' }, envy: { v: -2, acc: -34, txt: 'has what I want' },
  avenged: { v: 26, txt: 'we are even' }, forgave: { v: 18, txt: 'I let it go' }, apology: { v: 16, txt: 'said sorry' },
  kind: { v: 14, tell: true, txt: 'was good to me' }, repaid: { v: 16, tell: true, txt: 'paid me back' },
  lent: { v: 4, txt: 'I lent them money' }, owes: { v: 6, txt: 'I owe them' },
};
const SLOW = 40, KEEP = 90, MAXB = 18;

const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));
const rel = (d: Dot, o: number) => d.aff.get(o) || 0;

/** How much a ledger entry still weighs: grievances fade by temperament, kindnesses fade slowly. */
function weigh(this: World, d: Dot, b: Bond): number {
  const days = (this.tick - b.tk) / DAY, half = b.v < 0 ? SLOW / Math.max(0.15, d.fx.forgive) : KEEP;
  return b.v * (b.k === 'owes' || b.k === 'lent' ? 1 : Math.pow(0.5, days / half)) * (b.v < 0 ? b.conf : 1);
}

/** Net feeling from the ledger about one person (negative = grievance). */
function bondScore(this: World, d: Dot, o: number): number {
  const bs: Bond[] | undefined = d.bonds; if (!bs) return 0; let s = 0;
  for (const b of bs) if (b.o === o) s += this.weigh(d, b);
  return s;
}

/** How strong a grudge d holds against o (0 = none). Cheap: reads a cache kept by bondAdd and bondDay. */
function grudge(this: World, d: Dot, o: number): number { return (d.foes && d.foes.get(o)) || 0; }

function refreshFoe(w: World, d: Dot, o: number) {
  const s = -w.bondScore(d, o), foes: Map<number, number> = d.foes || (d.foes = new Map());
  if (s >= 20) foes.set(o, s); else foes.delete(o);
}

function findBond(d: Dot, o: number, k: string, to = -2): Bond | undefined { return d.bonds ? d.bonds.find((b: Bond) => b.o === o && b.k === k && (to === -2 || b.to === to)) : undefined; }

function bondDel(this: World, d: Dot, o: number, k: string) { if (!d.bonds) return; const i = d.bonds.findIndex((b: Bond) => b.o === o && b.k === k); if (i >= 0) d.bonds.splice(i, 1); }

/** Write an entry in a's ledger about o. Returns it. */
function bondAdd(this: World, a: Dot, o: number, k: string, p: { v?: number; conf?: number; via?: number; to?: number; n?: number } = {}): Bond | null {
  const def = KIND[k]; if (!a || a.dead || !def || o === a.id || o < 0 || !this.dots[o]) return null;
  const bs: Bond[] = a.bonds || (a.bonds = []), v = p.v ?? def.v, conf = p.conf ?? 1, to = p.to ?? -1;
  let b = bs.find(x => x.o === o && x.k === k && x.to === to);
  if (b) {
    if (def.acc) b.v = clamp(b.v + v, def.acc, 0);
    else if (Math.abs(v * conf) >= Math.abs(b.v * b.conf)) { b.v = v; b.conf = conf; b.via = p.via ?? -1; }
    b.tk = this.tick; if (p.n !== undefined) b.n = p.n;
  } else {
    b = { o, k, tk: this.tick, v: def.acc ? clamp(v, def.acc, 0) : v, conf, via: p.via ?? -1, to, n: p.n ?? 0 }; bs.push(b);
    if (bs.length > MAXB) { let wi = -1, wv = 1e9; bs.forEach((x, i) => { if (x === b) return; const m = (x.k === 'owes' || x.k === 'lent' ? 99 : Math.abs(this.weigh(a, x))); if (m < wv) { wv = m; wi = i; } }); if (wi >= 0) bs.splice(wi, 1); }
  }
  refreshFoe(this, a, o); return b;
}

const nm = (w: World, id: number) => (w.dots[id] ? w.dots[id].name : 'someone');
const first = (w: World, id: number) => nm(w, id).replace(/ “[^”]*”$/, '').split(' ')[0];

/** Bystanders to something one dot did to another. They remember who did it, take a side by who they like, and feel it. Returns who saw. */
function witnesses(this: World, kind: 'robbed' | 'beaten', actor: Dot, victim: Dot, rad = 6, max = 5): Dot[] {
  const near: [number, Dot][] = [];
  for (const o of this.dots) {
    if (o.dead || o.inside || o === actor || o === victim || !o.adult || o.phase === 'chat' && o.fight) continue;
    const dx = o.x - actor.x, dy = o.y - actor.y, q = dx * dx + dy * dy; if (q <= rad * rad) near.push([q, o]);
  }
  near.sort((p, q) => p[0] - q[0]);
  const seen = near.slice(0, max).map(p => p[1]);
  for (const o of seen) this.witnessReact(o, actor, victim, kind === 'robbed' ? 'rob' : 'hit');
  return seen;
}

/** One bystander sees it: takes a side by who they like, remembers the culprit, and feels it. */
function witnessReact(this: World, o: Dot, actor: Dot, victim: Dot, verb: string) {
  const la = rel(o, actor.id), lv = rel(o, victim.id);
  if (la >= 25 && la > lv + 10) { this.bondAdd(o, victim.id, 'brawl', { v: -4, to: actor.id }); return; }   // sides with their friend
  this.bondAdd(o, actor.id, 'witnessed', { v: -(10 + Math.max(0, lv) / 6) * (o.traits.includes('kind') ? 1.3 : 1), to: victim.id });
  this.addAff(o, actor, -(4 + Math.max(0, lv) / 10));
  if (o.fx.courage < -0.3) this.addThought(o, 'saw', -5, 5, `Shaken: saw ${first(this, actor.id)} ${verb} ${first(this, victim.id)}.`, actor.id);
  else this.addThought(o, 'saw', -(3 + Math.max(0, lv) / 25), 5, `Saw ${first(this, actor.id)} ${verb} ${first(this, victim.id)}.`, actor.id);
}

/** A wrong done to someone: write the victim's ledger, and the bystanders'. */
function wronged(this: World, culprit: Dot, victim: Dot, kind: string, wit: Dot[] = [], noticed = true) {
  if (noticed) this.bondAdd(victim, culprit.id, kind);
  for (const o of wit) if (o !== victim && o !== culprit) this.witnessReact(o, culprit, victim, kind === 'robbed' ? 'rob' : kind === 'burgled' ? 'rob' : 'hit');
}

/** What dots are willing to say about each other. Picks a bond a speaker could tell, or null. A victim hears what others saw first. */
function tellable(this: World, s: Dot, l: Dot, jitter = true): Bond | null {
  const bs: Bond[] | undefined = s.bonds; if (!bs) return null;
  let best: Bond | null = null, bv = 0;
  for (const b of bs) {
    const def = KIND[b.k]; if (!def || !def.tell || b.o === l.id || b.conf < 0.3 || !this.dots[b.o] || this.dots[b.o].dead) continue;
    if (b.k === 'killed' || b.k === 'feud' ? false : this.tick - b.tk > 120 * DAY) continue;
    const m = Math.abs(this.weigh(s, b)) * (b.to === l.id ? 2.2 : 1) * (b.via < 0 ? 1.2 : 1) + (jitter ? this.rnd() * 6 : 3); if (m > bv && m >= 4) { bv = m; best = b; }
  }
  return best;
}

/** The listener takes it in: a hearsay entry, softer and less sure than the teller's, sometimes embellished in the retelling. */
function hear(this: World, s: Dot, l: Dot, b: Bond, rnd: number) {
  const def = KIND[b.k]; if (!def || l.dead) return;
  const trust = clamp(0.5 + rel(l, s.id) / 100, 0.15, 1.3) * (l.traits.includes('calm') ? 0.8 : 1) * (l.fx.gossip > 1.5 ? 1.15 : 1);
  const victimIsMe = b.to === l.id;
  let kind = b.k, v = b.v;
  if (victimIsMe && b.k === 'witnessed') { kind = 'robbed'; v = KIND.robbed.v * 0.9; }   // someone saw it happen to me: now I know who
  if (!victimIsMe && rnd < 0.12 * s.fx.gossip && (b.k === 'brawl' || b.k === 'witnessed')) { kind = 'beaten'; v = KIND.beaten.v * 0.9; }   // the story grew in the telling
  const conf = victimIsMe ? Math.min(1, b.conf * 1.1) : clamp(b.conf * 0.72 * trust, 0.1, 0.9);
  if (def.v > 0) { this.addAff(l, this.dots[b.o], 3 * trust); this.bondAdd(l, b.o, b.k, { v: v * 0.5, conf, via: s.id, to: b.to >= 0 ? b.to : s.id }); return; }
  this.bondAdd(l, b.o, kind, { v: v * (victimIsMe ? 1 : 0.5), conf, via: s.id, to: victimIsMe ? s.id : (b.to >= 0 ? b.to : s.id) });
  this.addAff(l, this.dots[b.o], (victimIsMe ? -12 : -5) * trust);
  if (victimIsMe) this.addThought(l, 'told:' + b.o, -6, 6, `Learned ${first(this, b.o)} wronged me.`, b.o);
}

/** What the town (the people who know them) thinks of a dot, in grievance points; negative = distrusted. Cached daily. */
function standing(this: World, id: number): number { return (this.stand && this.stand[id]) || 0; }

/** A line for the character card: the standing, and the heaviest entries in this dot's own ledger. */
function bondLines(this: World, d: Dot): string[] {
  const out: string[] = [], st = this.standing(d.id);
  if (st <= -45) out.push('Distrusted across town'); else if (st <= -20) out.push('Not trusted by some'); else if (st >= 40) out.push('Well liked and trusted');
  const bs: Bond[] = (d.bonds || []).slice().sort((a: Bond, b: Bond) => Math.abs(this.weigh(d, b)) - Math.abs(this.weigh(d, a)));
  for (const b of bs) {
    if (out.length >= 4) break; const w = this.weigh(d, b); if (Math.abs(w) < 6 || !this.dots[b.o] || this.dots[b.o].dead) continue;
    const who = first(this, b.o), where = b.via >= 0 ? ` (heard from ${first(this, b.via)})` : '';
    out.push(w < 0 ? `${w < -35 ? 'Hates' : 'Holds a grudge against'} ${who}: ${KIND[b.k].txt}${where}` : `Grateful to ${who}: ${KIND[b.k].txt}`);
  }
  return out;
}

/* ---------------- meeting a foe ---------------- */
/** Two dots within chat range, at least one holding a grudge. 0 = nothing special, 1 = cold shoulder (no chat), 2 = it boiled over into a fight. */
function foeMeet(this: World, a: Dot, b: Dot): number {
  const ga = this.grudge(a, b.id), gb = this.grudge(b, a.id); if (ga < 20 && gb < 20) return 0;
  const [h, t, g] = ga >= gb ? [a, b, ga] : [b, a, gb];
  if (h.fx.courage > -0.3 && (h.revCd || 0) < this.tick && this.rnd() < 0.004 * h.fx.temper * (g / 40)) {
    h.revCd = this.tick + 3 * DAY; this.fight(h, t, { rev: true }); return 2;
  }
  if (this.rnd() < 0.004) this.say(h, [K.TOK_PERSON + t.id, K.C.BAD]);
  return 1;
}

/** A hothead with a big grudge goes looking: the building to wait outside is the target's workplace in working hours, otherwise their home. */
function revengeGoal(this: World, d: Dot): { b: number; t: number } | null {
  if (!d.foes || !d.foes.size || (d.revCd || 0) > this.tick) return null;
  let best = -1, bv = 45;
  for (const [o, g] of d.foes) { const t = this.dots[o]; if (!t || t.dead || (t.jailUntil || 0) > this.tick) continue; if (g > bv && this.buildings[t.home].sid === this.buildings[d.home].sid) { bv = g; best = o; } }
  if (best < 0) return null;
  const t = this.dots[best], tod = this.tod(), wb = t.work >= 0 ? this.buildings[t.work] : null, b = wb && wb.state === 'ok' && tod > 0.3 && tod < 0.6 ? wb : this.buildings[t.home];
  return { b: b.id, t: best };
}

/* ---------------- daily ---------------- */
function bondDay(this: World) {
  const now = this.tick, alive = this.dots.filter(d => !d.dead);
  const homes = new Map<number, number>(); for (const d of alive) homes.set(d.home, (homes.get(d.home) || 0) + 1);
  if (!this.stand || this.stand.length < this.dots.length) this.stand = new Float32Array(this.dots.length + 8); else this.stand.fill(0);
  for (const d of alive) {
    const bs: Bond[] | undefined = d.bonds;
    if (bs && bs.length) {
      // forget what has faded; settle debts of the dead
      for (let i = bs.length - 1; i >= 0; i--) {
        const b = bs[i], o = this.dots[b.o];
        if (!o || o.dead) { if (b.k === 'owes' || b.k === 'lent' || Math.abs(this.weigh(d, b)) < 1) bs.splice(i, 1); continue; }
        if ((b.k !== 'owes' && b.k !== 'lent') && Math.abs(this.weigh(d, b)) < 0.8) { bs.splice(i, 1); continue; }
        if (b.k !== 'envy' || true) this.stand[b.o] += this.weigh(d, b) * (b.via >= 0 ? 0.5 : 1) * (b.k === 'owes' || b.k === 'lent' ? 0 : 1);
      }
      d.foes = undefined; for (const b of bs) if (b.v < 0) refreshFoe(this, d, b.o);
    } else d.foes = undefined;
    if (!d.adult) continue;
    // crowded under one roof
    if ((homes.get(d.home) || 0) >= 6) this.addThought(d, 'crowd', -4, 3, 'Too many people under one roof.');
    // envy: someone close does much better
    if ((d.fx.ambition > 1.8 || d.fx.jealousy > 1.4 || d.traits.includes('greedy')) && this.rnd() < 0.5) {
      const fr = this.friends(d).slice(0, 6).map((f: number[]) => this.dots[f[0]]).find((x: Dot) => x && !x.dead && x.coin > Math.max(8 * R.DAY_WAGE, 6 * d.coin));
      if (fr) { this.bondAdd(d, fr.id, 'envy'); this.addThought(d, 'envy:' + fr.id, -3, 4, `Envious of ${first(this, fr.id)}'s money.`, fr.id); }
    }
  }
  this.loans(alive); this.peace(alive);
}

/** Loans between friends, repayment, and what happens when someone does not pay. */
function loans(this: World, alive: Dot[]) {
  const now = this.tick, DW = R.DAY_WAGE;
  for (const d of alive) {
    if (!d.adult) continue;
    const owe = (d.bonds || []).find((b: Bond) => b.k === 'owes');
    if (owe) {
      const L = this.dots[owe.o], days = (now - owe.tk) / DAY;
      if (!L || L.dead) { this.bondDel(d, owe.o, 'owes'); continue; }
      const able = d.coin > owe.n + 3 * DW, honest = Math.min(0.6, 0.3 * d.fx.loyalty * (d.traits.includes('greedy') ? 0.4 : 1) * (d.traits.includes('lazy') ? 0.7 : 1));
      if (able && this.rnd() < honest) {
        d.coin -= owe.n; L.coin += owe.n; this.bondDel(d, L.id, 'owes'); this.bondDel(L, d.id, 'lent');
        this.bondAdd(L, d.id, 'repaid'); this.addAff(L, d, 8); this.addAff(d, L, 4); this.addThought(d, 'debtfree', 5, 6, `Paid ${first(this, L.id)} back.`);
        this.ev('repaid', `🤝 ${d.name} paid back ${R.usd(owe.n)} to ${L.name}.`, [d.id, L.id], 30, 1);
      } else if (able && days > 40) {
        this.bondDel(d, L.id, 'owes'); this.bondDel(L, d.id, 'lent'); this.bondAdd(L, d.id, 'stiffed'); this.addAff(L, d, -22);
        this.addThought(L, 'stiffed:' + d.id, -8, 14, `${first(this, d.id)} never paid me back.`, d.id);
        this.ev('stiffed', `💸 ${d.name} has money again but never repaid ${L.name}'s ${R.usd(owe.n)}.`, [L.id, d.id], 0, 3);
      } else if (days > 120) { this.bondDel(d, L.id, 'owes'); this.bondDel(L, d.id, 'lent'); if (!L.traits.includes('generous') && !L.traits.includes('kind')) this.bondAdd(L, d.id, 'stiffed', { v: -14 }); }
      continue;
    }
    if (d.coin >= 1.5 * DW || this.rnd() > 0.25) continue;
    const sid = this.buildings[d.home].sid, amt = Math.round(1.5 * DW);
    const L = this.friends(d).map((f: number[]) => this.dots[f[0]]).find((x: Dot) => x && !x.dead && x.adult && x.coin > 8 * DW && this.buildings[x.home].sid === sid && (x.bonds || []).filter((b: Bond) => b.k === 'lent').length < 2 && this.rnd() < 0.5 * x.fx.generosity * Math.min(1.2, rel(x, d.id) / 60) && this.grudge(x, d.id) < 10);
    if (!L) continue;
    L.coin -= amt; d.coin += amt;
    this.bondAdd(d, L.id, 'owes', { n: amt }); this.bondAdd(L, d.id, 'lent', { n: amt }); this.addAff(d, L, 6); this.addThought(d, 'lent:' + L.id, 4, 5, `${first(this, L.id)} helped me out.`, L.id);
    this.ev('loan', `🤲 ${L.name} lent ${d.name} ${R.usd(amt)}.`, [L.id, d.id], 25, 1);
  }
}

/** Forgiveness, apology and the long tail of old feuds. */
function peace(this: World, alive: Dot[]) {
  for (const d of alive) {
    if (!d.adult || !d.foes || !d.foes.size || this.rnd() > 0.05) continue;
    const gentle = d.fx.forgive >= 1.3 || d.traits.includes('kind') || d.traits.includes('calm') || d.traits.includes('loyal');
    if (!gentle) continue;
    let o = -1, g = 0; for (const [id, v] of d.foes) if (v > g && this.dots[id] && !this.dots[id].dead) { o = id; g = v; }
    if (o < 0 || g > 60) continue;
    const t = this.dots[o], sameTown = this.buildings[t.home].sid === this.buildings[d.home].sid; if (!sameTown) continue;
    this.bondAdd(d, o, 'forgave', { v: Math.min(40, g * 0.8) }); this.addAff(d, t, 18); this.addThought(d, 'forgave:' + o, 6, 8, `Let go of what ${first(this, o)} did.`, o);
    if (this.grudge(t, d.id) > 0 && this.rnd() < 0.5) this.bondAdd(t, d.id, 'apology', { v: Math.min(40, this.grudge(t, d.id) * 0.8) });
    this.ev('peace', `🕊️ ${d.name} forgave ${t.name}.`, [d.id, o], 40, 2);
  }
}

/* ---------------- from events ---------------- */
/** Called from World.ev: the bookkeeping for events whose systems do not know about bonds. */
function bondHook(this: World, kind: string, text: string, ids: number[], w: number) {
  const base = kind.replace(/\d+$/, ''); if (!ids || !ids.length) return;
  if (base === 'burg' && ids.length === 2) { const v = this.dots[ids[1]], b = this.dots[ids[0]]; if (v && b) this.wronged(b, v, 'burgled'); return; }
  if (base === 'breakup' && ids.length >= 2) { const a = this.dots[ids[0]], b = this.dots[ids[1]]; if (a && b) this.bondAdd(b, a.id, 'jilted'); return; }
  if (base === 'reject' && ids.length >= 2) { const s = this.dots[ids[0]], l = this.dots[ids[1]]; if (s && l) this.bondAdd(s, l.id, 'spurned'); return; }
  if (base === 'kind' && ids.length >= 2) { const g = this.dots[ids[0]], r = this.dots[ids[1]]; if (g && r) this.bondAdd(r, g.id, 'kind'); return; }
  if (base === 'death') this.bondDeath(ids);
}

/** A death: a family inherits the dead's old grudges, and a death after a fight is a vendetta. */
function bondDeath(this: World, ids: number[]) {
  const dead = this.dots[ids[0]]; if (!dead) return;
  const kin = this.dots.filter(o => !o.dead && o.adult && ((o.par && o.par.includes(dead.id)) || (dead.par && dead.par.includes(o.id))));
  const mourn = ids.slice(1).map(i => this.dots[i]).filter(x => x && !x.dead);
  if (dead.hurtBy && this.tick - dead.hurtBy.tk < 15 * DAY && this.dots[dead.hurtBy.id]) {
    const k = this.dots[dead.hurtBy.id];
    for (const o of [...kin, ...mourn]) this.bondAdd(o, k.id, 'killed', { v: kin.includes(o) ? -70 : -38, to: dead.id });
    if (kin.length || mourn.length) this.ev('vendetta', `⚔️ ${(kin[0] || mourn[0]).name} swore revenge on ${k.name}, who fought ${dead.name} before the end.`, [(kin[0] || mourn[0]).id, k.id], 0, 4);
  }
  if (dead.foes) for (const [fid, g] of dead.foes) {
    if (g < 40 || !this.dots[fid] || this.dots[fid].dead) continue;
    for (const o of kin) this.bondAdd(o, fid, 'feud', { v: -g * 0.55, to: dead.id });
  }
}

Object.assign(World.prototype, { witnessReact, weigh, bondScore, grudge, bondAdd, bondDel, witnesses, wronged, tellable, hear, standing, bondLines, foeMeet, revengeGoal, bondDay, loans, peace, bondHook, bondDeath });
declare module './world' { interface World {
  stand?: Float32Array;
  witnessReact: typeof witnessReact; weigh: typeof weigh; bondScore: typeof bondScore; grudge: typeof grudge; bondAdd: typeof bondAdd; bondDel: typeof bondDel; witnesses: typeof witnesses; wronged: typeof wronged;
  tellable: typeof tellable; hear: typeof hear; standing: typeof standing; bondLines: typeof bondLines; foeMeet: typeof foeMeet; revengeGoal: typeof revengeGoal;
  bondDay: typeof bondDay; loans: typeof loans; peace: typeof peace; bondHook: typeof bondHook; bondDeath: typeof bondDeath;
} }
export { findBond };
