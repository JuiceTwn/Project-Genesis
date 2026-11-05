import type { Dot } from '../shared/types';
/* Thoughts and mental breaks (the RimWorld engine). Mood is no longer only hunger, tiredness and loneliness: every person carries a short list of dated
   thoughts, each caused by something that happened to them ("heartbroken", "lost my home", "robbed", "new baby"), each fading over days. Mood is the base
   plus the sum of fading thoughts. When mood collapses, a person has a break, and what they do depends on who they are: a hothead picks a fight, a
   thief turns to stealing, a drifter quits their job, a romantic ends it, everyone else drowns their sorrows at the tavern. Breaks are events other
   systems feel (jobs, crime, relationships, money moving to the tavern), so one bad month can cascade into the next story. */
import { World } from './world';
import * as K from '../shared/constants';
import * as R from '../shared/reality';
import { shareAbroad } from './thoughts-util';

export interface Thought { k: string; v: number; until: number; from: number; txt: string }
const MAX = 14;
const DAY = K.DAY_TICKS;

/** kind -> [who (index of ids; 'all' = every id; 'rest' = ids after the first; 'last' = final id), value, days, text] */
const MAP: Record<string, [string, number, number, string]> = {
  love: ['all', 12, 8, 'Fell in love.'], breakup: ['all', -14, 12, 'Heartbroken.'], wedding: ['all', 16, 15, 'Married!'],
  birth: ['rest', 12, 20, 'A new baby in the house.'], death: ['rest', -14, 20, 'Mourning someone I loved.'],
  theft: ['last', -10, 6, 'Got robbed.'], burg: ['last', -12, 8, 'Someone broke into my home.'], fight: ['all', -6, 4, 'Got into a brawl.'],
  bankrupt: ['first', -18, 25, 'My business failed.'], foreclose: ['first', -22, 40, 'Lost my home to the bank.'], fire: ['first', -10, 10, 'Lost everything in a fire.'],
  rich: ['first', 8, 20, 'Money is good.'], found: ['first', 8, 15, 'Starting my own business.'], sale: ['all', 4, 8, 'Closed a good deal.'],
  quit: ['first', -8, 10, 'Quit my job.'], unpaid: ['first', -3, 3, 'Not paid again.'], pile: ['first', -20, 20, 'The whole country hates me.'],
  deal: ['first', 8, 15, 'Landed a sponsorship.'], jail: ['first', -12, 20, 'Locked up.'], starve: ['first', -10, 3, 'Starving.'],
  elect: ['first', 12, 20, 'The town chose me.'], recall: ['first', -15, 20, 'Thrown out of office.'], corrupt: ['first', -25, 30, 'Disgraced.'],
  mortgage: ['first', 10, 25, 'Bought a home of my own.'], payoff: ['first', 14, 30, 'Mortgage paid off!'], default: ['first', -12, 15, 'Cannot pay what I owe.'],
  embezzle: ['first', -8, 10, 'Under suspicion.'], arrest: ['first', -8, 10, 'Arrested.'],
};
const BASEKIND = (k: string) => k.replace(/\d+$/, '');

function addThought(this: World, d: Dot, k: string, v: number, days: number, txt: string) {
  if (!d || d.dead) return; const th: Thought[] = d.th || (d.th = []), now = this.tick;
  const i = th.findIndex(t => t.k === k);
  if (i >= 0) { th[i].v = Math.abs(v) > Math.abs(th[i].v) ? v : th[i].v; th[i].until = Math.max(th[i].until, now + days * DAY); th[i].from = now; th[i].txt = txt; return; }
  th.push({ k, v, until: now + days * DAY, from: now, txt });
  if (th.length > MAX) { let w = 0, wv = 1e9; th.forEach((t, j) => { const a = Math.abs(t.v); if (a < wv) { wv = a; w = j; } }); th.splice(w, 1); }
}

/** The mood a person's thoughts add right now: each fades linearly to zero by its end. */
function thoughtMood(this: World, d: Dot): number {
  const th: Thought[] | undefined = d.th; if (!th || !th.length) return 0; let s = 0;
  for (const t of th) { const left = t.until - this.tick; if (left <= 0) continue; s += t.v * Math.min(1, left / Math.max(1, t.until - t.from)); }
  return Math.max(-45, Math.min(30, s));
}

/** Called from World.ev: turn what happened into thoughts for the people in it (and worry in their friends). */
function thoughtHook(this: World, kind: string, text: string, ids: number[], w: number) {
  const m = MAP[BASEKIND(kind)]; if (!m || !ids || !ids.length) return;
  const who = m[0] === 'all' ? ids : m[0] === 'rest' ? ids.slice(1) : m[0] === 'last' ? [ids[ids.length - 1]] : [ids[0]];
  const base = BASEKIND(kind); const dead = base === 'death' ? this.dots[ids[0]] : null;
  for (const id of who) this.addThought(this.dots[id], base, m[1], m[2], dead ? `Mourning ${dead.name}.` : m[3]);
  // friends worry about a friend's big misfortune
  if (m[1] < 0 && w >= 4 && ids[0] !== undefined && base !== 'death') {
    const a = this.dots[ids[0]]; if (!a) return;
    for (const f of this.dots) if (!f.dead && f.id !== a.id && (f.aff.get(a.id) || 0) >= 25) this.addThought(f, 'worry' + a.id, -4, 6, `Worried about ${a.name}.`);
  }
}

/** The most vivid thought right now (for speech bubbles and character cards). */
function topThought(this: World, d: Dot): string | null {
  const th: Thought[] | undefined = d.th; if (!th) return null; let best = null, bv = 2.5;
  for (const t of th) { const left = t.until - this.tick; if (left <= 0) continue; const v = Math.abs(t.v) * Math.min(1, left / Math.max(1, t.until - t.from)); if (v > bv) { bv = v; best = t.txt; } }
  return best;
}

const BREAK_MOOD = 28;
/** Daily: forget what has faded, and let the people whose mood has collapsed break. */
function thoughtDay(this: World) {
  for (const d of this.dots) {
    if (d.dead || !d.adult) continue;
    if (d.th && d.th.length) d.th = d.th.filter((t: Thought) => t.until > this.tick);
    if ((d.breakCd || 0) > this.tick) continue;
    const m = this.mood(d);
    if (m >= BREAK_MOOD - (this.attr(d, 'wil') - 10) * 0.8) continue;   // strong-willed people hold out longer
    if (this.rnd() < 0.18 + 0.01 * (BREAK_MOOD - m) + (d.fx.temper > 1.4 ? 0.1 : 0)) this.mentalBreak(d, m);
  }
}

function mentalBreak(this: World, d: Dot, m: number) {
  d.breakCd = this.tick + 8 * DAY; this.stats.breaks = (this.stats.breaks || 0) + 1;
  const town = this.buildings[d.home].sid, cause = this.topThought(d) || (d.hunger > 80 ? 'hunger' : 'a long run of bad days'), who = d.name;
  const near = this.dots.filter(o => !o.dead && o !== d && o.adult && !o.inside && this.buildings[o.home].sid === town);
  let how = 'drink';
  if (d.fx.temper > 1.4 || d.traits.includes('hothead')) how = 'rage';
  else if (d.isThief || d.traits.includes('thief')) how = 'steal';
  else if (d.partner >= 0 && d.traits.includes('romantic') && this.rnd() < 0.6) how = 'leave';
  else if ((d.work >= 0 && d.job <= 2) && (d.traits.includes('lazy') || this.rnd() < 0.4)) how = 'quit';
  switch (how) {
    case 'rage': {
      const foe = near.find(o => (d.aff.get(o.id) || 0) < 0 || d.thieves.has(o.id)) || (near.length ? near[(this.rnd() * near.length) | 0] : null);
      if (foe) { this.fight(d, foe, null); this.ev('break' + d.id, `😡 ${who} snapped (${cause.replace(/\.$/, '').toLowerCase()}) and attacked ${foe.name}.`, [d.id, foe.id], 0, 4); break; }
    } // fall through
    case 'drink': {
      const tv = this.nearest(this.taverns.filter(b => b.state === 'ok'), d, 0);
      if (tv) { const amt = Math.min(d.coin * 0.6, 3 * R.NIGHT_OUT); if (amt > 1) { d.coin -= amt; this.credit(tv, amt); tv.rev += amt; shareAbroad(this, tv, amt); } d.social = Math.min(100, d.social + 30);
        this.addThought(d, 'hangover', -6, 3, 'Splitting headache.'); this.ev('break' + d.id, `🍺 ${who} drowned their sorrows at ${tv.name} Tavern (${cause.replace(/\.$/, '').toLowerCase()}), spending ${R.usd(amt)}.`, [d.id], 0, 3); }
      else this.ev('break' + d.id, `😞 ${who} broke down in tears (${cause.replace(/\.$/, '').toLowerCase()}).`, [d.id], 0, 3);
      break;
    }
    case 'steal': { d.theftCd = 0; d.isThief = true; if (this.shiftTrait) this.shiftTrait(d, 'thief', 'a breakdown'); this.ev('break' + d.id, `🥷 ${who} hit rock bottom (${cause.replace(/\.$/, '').toLowerCase()}) and turned to stealing.`, [d.id], 0, 4); break; }
    case 'leave': { const p = this.dots[d.partner]; if (p) { this.breakup(d, p); this.ev('break' + d.id, `💔 ${who} walked out on ${p.name} (${cause.replace(/\.$/, '').toLowerCase()}).`, [d.id, p.id], 0, 4); } break; }
    case 'quit': { const b = this.buildings[d.work]; this.unstaffDot(d); this.ev('break' + d.id, `🚪 ${who} walked off the job${b ? ' at ' + b.name : ''} (${cause.replace(/\.$/, '').toLowerCase()}).`, [d.id], 0, 4); break; }
  }
  this.addThought(d, 'relief', 10, 6, 'Got it out of my system.');
}

Object.assign(World.prototype, { addThought, thoughtMood, thoughtHook, topThought, thoughtDay, mentalBreak });
declare module './world' { interface World { addThought: typeof addThought; thoughtMood: typeof thoughtMood; thoughtHook: typeof thoughtHook; topThought: typeof topThought; thoughtDay: typeof thoughtDay; mentalBreak: typeof mentalBreak } }
// mood now includes thoughts
const baseMood = World.prototype.mood;
World.prototype.mood = function (this: World, d: Dot) { return Math.max(0, Math.min(100, Math.round(baseMood.call(this, d) + this.thoughtMood(d)))); } as any;
