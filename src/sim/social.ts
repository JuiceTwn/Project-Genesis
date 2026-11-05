import type { Dot, Building } from '../shared/types';
import { World } from './world';
import { eff } from './gear';
import { makeField, b64, tkLess, mk } from '../shared/util';
import * as K from '../shared/constants';
import * as Gen from '../worldgen';
const { TS, YEAR_TICKS, HOUR_TICKS, KB, MEAL_UNIT, TICK_HZ, DAY_TICKS, INF, TILE, COST, BT, BT_NAME, BUILD_SHIFTS, UPKEEP, STAFF, MAXM, JOBS, FOOD_PRICE, DRINK_PRICE, STOCK_CAP, ADULT, YEAR_DAYS, SEASON_DAYS, SEASONS, YIELD, RAIN_P, CON, C, TRAITS, TRAIT_W, DREAMS, DREAM_TXT } = K;
import { W, H } from "../shared/dims";

function addAff(this: World, a: Dot, b: Dot, v) {
  v /= TS; const prev = a.aff.get(b.id) || 0, nv = Math.max(-100, Math.min(100, prev + v));
  a.aff.set(b.id, nv);
  if (a.aff.size > 14) { let mk = -1, mv = 1e9; for (const [k, x] of a.aff) if (Math.abs(x) < mv && k !== b.id) { mv = Math.abs(x); mk = k; } a.aff.delete(mk); }
  if (prev < 25 && nv >= 25) {
    const o = this.dots[b.id].aff.get(a.id) || 0;
    if (o >= 25) { const key = Math.min(a.id, b.id) * K.TOK_PERSON + Math.max(a.id, b.id); if (!this.pairs.has(key)) { this.pairs.add(key); this.stats.friends++; this.ev('friend', `🤝 ${a.name} and ${b.name} became friends.`, [a.id, b.id], 8); } }
  }
}

function friends(this: World, d: Dot) { const r = []; for (const [k, v] of d.aff) if (v >= 25 && !this.dots[k].dead) r.push([k, v]); return r.sort((a, b) => b[1] - a[1]); }

function mood(this: World, d: Dot) { return Math.max(0, Math.min(100, Math.round(100 - Math.max(0, d.hunger - 40) * 0.8 - Math.max(0, 60 - d.energy) * 0.5 - Math.max(0, 60 - d.social) * 0.5 + Math.min(10, this.friends(d).length * 2) - (this.tick < d.grief ? 25 : 0)))); }

function couple(this: World, a: Dot, b: Dot) {
  if (a.dead || b.dead || a.partner >= 0 || b.partner >= 0) return;
  a.partner = b.id; b.partner = a.id; a.since = b.since = this.tick; a.social = b.social = 100;
  const park = this.nearest(this.parks, a, 10), inv = { k: 'social', b: park.id, until: this.tick + 300 }; a.invite = inv; b.invite = Object.assign({}, inv);
  this.ev('love', `💘 ${a.name} and ${b.name} are now a couple!`, [a.id, b.id], 0, 3);
}

function reject(this: World, s, l) {
  s.rejectCd = Math.round(1500 * TS); s.social = Math.max(0, s.social - 30); s.aff.set(l.id, (s.aff.get(l.id) || 0) - 8);
  this.ev('reject', `💔 ${s.name} confessed to ${l.name} and got turned down.`, [s.id, l.id], 0, 3);
}

function breakup(this: World, a: Dot, b: Dot) {
  a.partner = b.partner = -1; a.married = b.married = false; a.social = Math.max(0, a.social - 30); b.social = Math.max(0, b.social - 30);
  this.ev('breakup', `💔 ${a.name} and ${b.name} broke up.`, [a.id, b.id], 0, 3);
}

function wedding(this: World, a: Dot, b: Dot) {
  a.married = b.married = true; for (const x of [a, b]) if (this.rnd() < 0.3) this.shiftTrait(x, 'loyal', 'after the wedding');
  const park = this.nearest(this.parks, a, 10), inv = { k: 'social', b: park.id, until: this.tick + 400 };
  const guests = this.friends(a).slice(0, 6).concat(this.friends(b).slice(0, 6)).map(f => this.dots[f[0]]);
  for (const g of guests.concat([a, b])) g.invite = Object.assign({}, inv);
  this.say(a, [C.ME, C.MARRY, C.YOU]); this.later(5, { t: 'say', d: b.id, k: [C.YES] });
  this.ev('wedding', `💍 ${a.name} and ${b.name} got married! ${guests.length} guests head to the park.`, [a.id, b.id], 0, 4);
}

function jealous(this: World, a: Dot, b: Dot) {
  if (a.partner < 0 || b.id === a.partner) return;
  const P = this.dots[a.partner]; if (P.dead || P.inside) return;
  const dx = P.x - a.x, dy = P.y - a.y, jt = P.fx.jealousy;
  if (dx * dx + dy * dy > 64 || this.rnd() > Math.min(0.85, 0.06 * jt * jt)) return;
  P.aff.set(b.id, Math.min(P.aff.get(b.id) || 0, 0) - 25); this.say(P, [C.ME, C.JEALOUS]); this.bondAdd(P, b.id, 'rival'); this.addThought(P, 'jealous:' + b.id, -5, 6, `Jealous of ${b.name.replace(/ “[^”]*”$/, '').split(' ')[0]}.`, b.id);
  this.ev('jealous', `😠 ${P.name} saw ${a.name} chatting with ${b.name}.`, [P.id, a.id], 15, 3);
  if (this.rnd() < Math.min(0.6, 0.1 * jt)) this.breakup(P, a);
}

function kindness(this: World, a: Dot, b: Dot) {
  if (b.coin < 15 * KB && a.coin > 50 * KB && this.rnd() < 0.25 * a.fx.generosity) { const g = 15 * KB * 0.4; a.coin -= g; b.coin += g; this.addAff(b, a, 8); this.say(b, [C.THANKS]); this.ev('kind', `💖 ${a.name} gave ${b.name} ${K.usd(g)}.`, [a.id, b.id], 40, 1); }
}

function couples(this: World) {
  const tk = this.tick;
  for (const d of this.dots) {
    if (d.dead || d.partner < 0 || d.id > d.partner) continue;
    const p = this.dots[d.partner];
    if (this.rnd() < 0.05) { const tav = this.rnd() < 0.45 && d.coin > K.DRINK_PRICE * 2 && p.coin > K.DRINK_PRICE * 2 && d.adult, place = tav ? this.nearest(this.taverns, d, 0) : this.nearest(this.parks, d, 10); const inv = { k: tav ? 'drink' : 'social', b: place.id, until: tk + 300 }; d.invite = inv; p.invite = Object.assign({}, inv); }
    const step = 50 * TS;   // this runs every `step` ticks
    if (!d.married && tk - d.since > 0.25 * YEAR_TICKS && this.rnd() < step / (0.25 * YEAR_TICKS) && (d.aff.get(p.id) || 0) >= 50) this.wedding(d, p);   // engaged after at least a quarter-year together
    if ((d.married || tk - d.since > 0.5 * YEAR_TICKS) && d.kids < 4 && d.age >= K.FERTILE_MIN && d.age <= K.FERTILE_MAX && p.age >= K.FERTILE_MIN && p.age <= K.FERTILE_MAX && this.rnd() < K.BIRTHS_PER_COUPLE_YEAR * (d.married ? 1 : 0.5) * step / YEAR_TICKS) this.spawn(d, p);
  }
}

function dialogue(this: World, a: Dot, b: Dot) {
  const tk = this.tick, nm = (x: Dot) => K.TOK_PERSON + x.id;
  const L: [Dot, string][] = [];
  const say = (who: Dot, act: any, to: Dot) => L.push([who, this.speak(act, who, to)]);
  say(a, [C.HELLO].concat(this.rnd() < 0.4 ? [nm(b)] : []), b);
  say(b, [C.HELLO].concat(this.rnd() < 0.4 ? [nm(a)] : []), a);
  const fx: (() => void)[] = [];
  const moodTok = (s: Dot) => s.hunger > 70 ? C.HUNGRY : s.energy < 30 ? C.TIRED : s.social < 30 ? C.LONELY : this.mood(s) > 65 ? C.HAPPY : C.SAD;
  const topic = (s: Dot, l: Dot) => {
    if (s.hunger > 65) {
      say(s, [C.ME, C.HUNGRY], l);
      const m = this.pickMarket(l);
      if (m >= 0 && l.belief[this.buildings[m].mi] < 0) { say(l, [C.YOU, C.GO, K.TOK_PLACE + m], s); fx.push(() => { s.belief[this.buildings[m].mi] = -1; }); }
      else say(l, [C.ME, C.SAD], s);
      return true;
    }
    for (const m of this.markets) { const bs = s.belief[m.mi]; if (bs >= 0 && tk - bs < 250 && !(l.belief[m.mi] >= 0 && tk - l.belief[m.mi] < 250)) { say(s, [K.TOK_PLACE + m.id, C.NO, C.FOOD], l); say(l, [C.THANKS], s); fx.push(() => { l.belief[m.mi] = bs; }); return true; } }
    if (s.coin < 12 * KB) { say(s, [C.ME, C.BROKE], l); say(l, [C.YOU, C.GO, C.WORK], s); return true; }
    if (s.adult && l.adult && s.partner < 0 && l.partner < 0 && s.home !== l.home && s.fam !== l.fam && s.rejectCd <= 0 && (s.aff.get(l.id) || 0) >= 22 && this.rnd() < Math.min(0.8, 0.2 * s.fx.romance)) {
      say(s, [C.ME, C.LOVE, C.YOU], l);
      if (this.rnd() < 0.3 + (l.aff.get(s.id) || 0) / 100 + Math.min(0.2, 0.075 * (l.fx.romance - 1))) { say(l, [C.ME, C.LOVE, C.YOU], s); fx.push(() => this.couple(s, l)); }
      else { say(l, [C.NO, C.SORRY], s); fx.push(() => this.reject(s, l)); }
      return true;
    }
    if (s.thieves.size) {
      const tid = [...s.thieves].find(x => x !== l.id && !this.dots[x].dead && !l.thieves.has(x));
      if (tid !== undefined && this.rnd() < Math.min(0.95, 0.5 + 0.2 * (s.fx.gossip - 1))) { say(s, [K.TOK_PERSON + tid, C.THIEF], l); say(l, [C.ANGRY], s); fx.push(() => { l.thieves.add(tid); this.addAff(l, this.dots[tid], -12); }); return true; }
    }
    if (s.social < 70 && this.rnd() < 0.55 && l.coin >= K.DRINK_PRICE * 2 && s.coin >= K.DRINK_PRICE * 2) {
      const tav = this.rnd() < 0.4, place = tav ? this.nearest(this.taverns, s, 0) : this.nearest(this.parks, s, 10);
      say(s, [C.YOU, C.AND, C.ME, C.GO, K.TOK_PLACE + place.id], l);
      const yes = (l.aff.get(s.id) || 0) + this.rnd() * 40 > 15;
      if (yes) { say(l, [C.YES], s); fx.push(() => { const inv = { k: tav ? 'drink' : 'social', b: place.id, until: tk + 400 }; s.invite = inv; l.invite = Object.assign({}, inv); }); }
      else say(l, [C.NO], s);
      return true;
    }
    /* otherwise they actually talk: a thought, a memory, work, family, someone they both know, the town, the weather */
    const talk = this.conversation(s, l);
    if (talk) { for (const x of talk.lines) L.push(x); for (const f of talk.fx) fx.push(f); return true; }
    say(s, [C.ME, moodTok(s)], l); say(l, [C.ME, moodTok(l)], s); return true;
  };
  const sp = (a.hunger > 65 || (b.hunger <= 65 && this.rnd() < 0.5)) ? a : b;
  topic(sp, sp === a ? b : a);
  const last = this.rnd() < 0.5 ? a : b; say(last, [C.BYE], last === a ? b : a);
  return { L, fx };
}

function startChat(this: World, a: Dot, b: Dot) {
  const { L, fx } = this.dialogue(a, b);
  L.forEach(([s, text], i) => this.later(1 + i * 4, { t: 'say', d: s.id, s: text }));
  const dur = 4 + L.length * 4 + 2;
  for (const d of [a, b]) { d.prev = d.phase; d.phase = 'chat'; d.chatT = dur; d.chatCd = 120 + ((this.rnd() * 80) | 0); }
  this.later(dur, { fn: () => {
    if (a.dead || b.dead) return;
    for (const f of fx) f();
    const bonus = 12 / TS;
    a.social = Math.min(100, a.social + bonus); b.social = Math.min(100, b.social + bonus);
    this.addAff(a, b, (7 + this.rnd() * 4 + 3 * eff(b, 'clothes')) * (1 + this.skillLevel(a, 'social') / 60)); this.addAff(b, a, (7 + this.rnd() * 4 + 3 * eff(a, 'clothes')) * (1 + this.skillLevel(b, 'social') / 60)); this.trainSkill(a, 'social', 0.01); this.trainSkill(b, 'social', 0.01); this.catchFrom(a, b); this.stats.chats++; this.wordOfMouth(a, b);
    this.jealous(a, b); this.jealous(b, a); this.kindness(a, b); this.kindness(b, a);
  } });
}

Object.assign(World.prototype, { addAff, friends, mood, couple, reject, breakup, wedding, jealous, kindness, couples, dialogue, startChat });
declare module './world' { interface World {
  addAff: (...args: any[]) => any;
  friends: (...args: any[]) => any;
  mood: (...args: any[]) => any;
  couple: (...args: any[]) => any;
  reject: (...args: any[]) => any;
  breakup: (...args: any[]) => any;
  wedding: (...args: any[]) => any;
  jealous: (...args: any[]) => any;
  kindness: (...args: any[]) => any;
  couples: (...args: any[]) => any;
  dialogue: (...args: any[]) => any;
  startChat: (...args: any[]) => any;
} }
