import { World } from './world';
import { makeField, b64, tkLess, rollTraits, mk } from '../shared/util';
import * as K from '../shared/constants';
import * as Gen from '../worldgen';
const { TICK_HZ, DAY_TICKS, INF, TILE, COST, BT, BT_NAME, BUILD_SHIFTS, UPKEEP, STAFF, MAXM, JOBS, FOOD_PRICE, DRINK_PRICE, STOCK_CAP, ADULT, YEAR_DAYS, SEASON_DAYS, SEASONS, YIELD, RAIN_P, CON, C, TRAITS, TRAIT_W, DREAMS, DREAM_TXT } = K;
import { W, H } from "../shared/dims";

function addAff(this: World, a, b, v) {
  const prev = a.aff.get(b.id) || 0, nv = Math.max(-100, Math.min(100, prev + v));
  a.aff.set(b.id, nv);
  if (a.aff.size > 14) { let mk = -1, mv = 1e9; for (const [k, x] of a.aff) if (Math.abs(x) < mv && k !== b.id) { mv = Math.abs(x); mk = k; } a.aff.delete(mk); }
  if (prev < 25 && nv >= 25) {
    const o = this.dots[b.id].aff.get(a.id) || 0;
    if (o >= 25) { const key = Math.min(a.id, b.id) * 1000 + Math.max(a.id, b.id); if (!this.pairs.has(key)) { this.pairs.add(key); this.stats.friends++; this.ev('friend', `🤝 ${a.name} and ${b.name} became friends.`, [a.id, b.id], 8); } }
  }
}

function friends(this: World, d) { const r = []; for (const [k, v] of d.aff) if (v >= 25 && !this.dots[k].dead) r.push([k, v]); return r.sort((a, b) => b[1] - a[1]); }

function mood(this: World, d) { return Math.max(0, Math.min(100, Math.round(100 - Math.max(0, d.hunger - 40) * 0.8 - Math.max(0, 60 - d.energy) * 0.5 - Math.max(0, 60 - d.social) * 0.5 + Math.min(10, this.friends(d).length * 2) - (this.tick < d.grief ? 25 : 0)))); }

function couple(this: World, a, b) {
  if (a.dead || b.dead || a.partner >= 0 || b.partner >= 0) return;
  a.partner = b.id; b.partner = a.id; a.since = b.since = this.tick; a.social = b.social = 100;
  const park = this.nearest(this.parks, a, 10), inv = { k: 'social', b: park.id, until: this.tick + 300 }; a.invite = inv; b.invite = Object.assign({}, inv);
  this.ev('love', `💘 ${a.name} and ${b.name} are now a couple!`, [a.id, b.id], 0, 3);
}

function reject(this: World, s, l) {
  s.rejectCd = 1500; s.social = Math.max(0, s.social - 30); s.aff.set(l.id, (s.aff.get(l.id) || 0) - 8);
  this.ev('reject', `💔 ${s.name} confessed to ${l.name} and got turned down.`, [s.id, l.id], 0, 3);
}

function breakup(this: World, a, b) {
  a.partner = b.partner = -1; a.married = b.married = false; a.social = Math.max(0, a.social - 30); b.social = Math.max(0, b.social - 30);
  this.ev('breakup', `💔 ${a.name} and ${b.name} broke up.`, [a.id, b.id], 0, 3);
}

function wedding(this: World, a, b) {
  a.married = b.married = true;
  const park = this.nearest(this.parks, a, 10), inv = { k: 'social', b: park.id, until: this.tick + 400 };
  const guests = this.friends(a).slice(0, 6).concat(this.friends(b).slice(0, 6)).map(f => this.dots[f[0]]);
  for (const g of guests.concat([a, b])) g.invite = Object.assign({}, inv);
  this.say(a, [C.ME, C.MARRY, C.YOU]); this.later(5, { t: 'say', d: b.id, k: [C.YES] });
  this.ev('wedding', `💍 ${a.name} and ${b.name} got married! ${guests.length} guests head to the park.`, [a.id, b.id], 0, 4);
}

function jealous(this: World, a, b) {
  if (a.partner < 0 || b.id === a.partner) return;
  const P = this.dots[a.partner]; if (P.dead || P.inside) return;
  const dx = P.x - a.x, dy = P.y - a.y, jt = P.traits.includes('jealous');
  if (dx * dx + dy * dy > 64 || this.rnd() > (jt ? 0.7 : 0.06)) return;
  P.aff.set(b.id, Math.min(P.aff.get(b.id) || 0, 0) - 25); this.say(P, [C.ME, C.JEALOUS]);
  this.ev('jealous', `😠 ${P.name} saw ${a.name} chatting with ${b.name}.`, [P.id, a.id], 15, 3);
  if (this.rnd() < (jt ? 0.4 : 0.1)) this.breakup(P, a);
}

function kindness(this: World, a, b) {
  if (a.traits.includes('kind') && b.coin < 15 && a.coin > 50 && this.rnd() < 0.5) { a.coin -= 15; b.coin += 15; this.addAff(b, a, 8); this.say(b, [C.THANKS]); this.ev('kind', `💖 ${a.name} gave ${b.name} 15 coins.`, [a.id, b.id], 40, 1); }
}

function couples(this: World) {
  const tk = this.tick;
  for (const d of this.dots) {
    if (d.dead || d.partner < 0 || d.id > d.partner) continue;
    const p = this.dots[d.partner];
    if (this.rnd() < 0.05) { const tav = this.rnd() < 0.45 && d.coin > 6 && p.coin > 6 && d.adult, place = tav ? this.nearest(this.taverns, d, 0) : this.nearest(this.parks, d, 10); const inv = { k: tav ? 'drink' : 'social', b: place.id, until: tk + 300 }; d.invite = inv; p.invite = Object.assign({}, inv); }
    if (!d.married && tk - d.since > 2 * DAY_TICKS && this.rnd() < 0.03 && (d.aff.get(p.id) || 0) >= 50) this.wedding(d, p);
    if (d.married && d.kids < 4 && this.rnd() < 0.02) this.spawn(d, p);
  }
}

function dialogue(this: World, a, b) {
  const tk = this.tick, nm = x => 1000 + x.id;
  const L = [];
  L.push([a, [C.HELLO].concat(this.rnd() < 0.4 ? [nm(b)] : [])]);
  L.push([b, [C.HELLO].concat(this.rnd() < 0.4 ? [nm(a)] : [])]);
  const fx = [];
  const moodTok = s => s.hunger > 70 ? C.HUNGRY : s.energy < 30 ? C.TIRED : s.social < 30 ? C.LONELY : this.mood(s) > 65 ? C.HAPPY : C.SAD;
  const topic = (s, l) => {
    if (s.hunger > 65) {
      L.push([s, [C.ME, C.HUNGRY]]);
      const m = this.pickMarket(l);
      if (m >= 0 && l.belief[this.buildings[m].mi] < 0) { L.push([l, [C.YOU, C.GO, 2000 + m]]); fx.push(() => { s.belief[this.buildings[m].mi] = -1; }); }
      else L.push([l, [C.ME, C.SAD]]);
      return true;
    }
    for (const m of this.markets) { const bs = s.belief[m.mi]; if (bs >= 0 && tk - bs < 250 && !(l.belief[m.mi] >= 0 && tk - l.belief[m.mi] < 250)) { L.push([s, [2000 + m.id, C.NO, C.FOOD]]); L.push([l, [C.THANKS]]); fx.push(() => { l.belief[m.mi] = bs; }); return true; } }
    if (s.coin < 12) { L.push([s, [C.ME, C.BROKE]]); L.push([l, [C.YOU, C.GO, C.WORK]]); return true; }
    if (s.adult && l.adult && s.partner < 0 && l.partner < 0 && s.home !== l.home && s.fam !== l.fam && s.rejectCd <= 0 && (s.aff.get(l.id) || 0) >= 22 && this.rnd() < (s.traits.includes('romantic') ? 0.5 : 0.2)) {
      L.push([s, [C.ME, C.LOVE, C.YOU]]);
      if (this.rnd() < 0.3 + (l.aff.get(s.id) || 0) / 100 + (l.traits.includes('romantic') ? 0.15 : 0)) { L.push([l, [C.ME, C.LOVE, C.YOU]]); fx.push(() => this.couple(s, l)); }
      else { L.push([l, [C.NO, C.SORRY]]); fx.push(() => this.reject(s, l)); }
      return true;
    }
    if (s.thieves.size) {
      const tid = [...s.thieves].find(x => x !== l.id && !this.dots[x].dead && !l.thieves.has(x));
      if (tid !== undefined && this.rnd() < (s.traits.includes('gossip') ? 0.9 : 0.5)) { L.push([s, [1000 + tid, C.THIEF]]); L.push([l, [C.ANGRY]]); fx.push(() => { l.thieves.add(tid); this.addAff(l, this.dots[tid], -12); }); return true; }
    }
    if (s.social < 70 && this.rnd() < 0.55 && l.coin >= 4 && s.coin >= 4) {
      const tav = this.rnd() < 0.4, place = tav ? this.nearest(this.taverns, s, 0) : this.nearest(this.parks, s, 10);
      L.push([s, [C.YOU, C.AND, C.ME, C.GO, 2000 + place.id]]);
      const yes = (l.aff.get(s.id) || 0) + this.rnd() * 40 > 15;
      if (yes) { L.push([l, [C.YES]]); fx.push(() => { const inv = { k: tav ? 'drink' : 'social', b: place.id, until: tk + 400 }; s.invite = inv; l.invite = Object.assign({}, inv); }); }
      else L.push([l, [C.NO]]);
      return true;
    }
    const fr = [...s.aff.keys()].filter(k => k !== l.id && !this.dots[k].dead);
    if (fr.length && this.rnd() < (s.traits.includes('gossip') ? 0.8 : 0.4)) {
      const c = this.dots[this.pick(fr)], good = (s.aff.get(c.id) || 0) >= 10;
      L.push([s, [nm(c), good ? C.GOOD : C.BAD]]); L.push([l, [C.YES]]);
      fx.push(() => this.addAff(l, c, good ? 3 : -3)); return true;
    }
    L.push([s, [C.ME, moodTok(s)]]); L.push([l, [C.ME, moodTok(l)]]); return true;
  };
  const sp = (a.hunger > 65 || (b.hunger <= 65 && this.rnd() < 0.5)) ? a : b;
  topic(sp, sp === a ? b : a);
  L.push([this.rnd() < 0.5 ? a : b, [C.BYE]]);
  return { L, fx };
}

function startChat(this: World, a, b) {
  const { L, fx } = this.dialogue(a, b);
  L.forEach(([s, k], i) => this.later(1 + i * 4, { t: 'say', d: s.id, k }));
  const dur = 4 + L.length * 4 + 2;
  for (const d of [a, b]) { d.prev = d.phase; d.phase = 'chat'; d.chatT = dur; d.chatCd = 120 + ((this.rnd() * 80) | 0); }
  this.later(dur, { fn: () => {
    if (a.dead || b.dead) return;
    for (const f of fx) f();
    const bonus = 12;
    a.social = Math.min(100, a.social + bonus); b.social = Math.min(100, b.social + bonus);
    this.addAff(a, b, 7 + this.rnd() * 4); this.addAff(b, a, 7 + this.rnd() * 4); this.stats.chats++;
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
