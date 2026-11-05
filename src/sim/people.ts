import { World } from './world';
import { eff } from './gear';
import { rollTraits, inheritTraits, fxOf } from './personality';
import { makeField, b64, tkLess, mk } from '../shared/util';
import * as K from '../shared/constants';
import * as Gen from '../worldgen';
const { TS, YEAR_TICKS, HOUR_TICKS, KB, MEAL_UNIT, TICK_HZ, DAY_TICKS, INF, TILE, COST, BT, BT_NAME, BUILD_SHIFTS, UPKEEP, STAFF, MAXM, JOBS, FOOD_PRICE, DRINK_PRICE, STOCK_CAP, ADULT, YEAR_DAYS, SEASON_DAYS, SEASONS, YIELD, RAIN_P, CON, C, TRAITS, TRAIT_W, DREAMS, DREAM_TXT } = K;
import { W, H } from "../shared/dims";

function makeDot(this: World, id, o, rf) {
  const home = this.buildings[o.home], traits = o.traits, has = t => traits.includes(t), fx = fxOf(traits);
  const d = {
    id, name: o.name, fam: o.fam || '', job: o.job, home: o.home, work: o.work, future: o.future !== undefined ? o.future : o.job,
    soc: Math.max(0.1, 0.35 + rf() * 0.9 + fx.soc), dil: Math.max(0.15, 0.3 + rf() * 0.9 + fx.dil), off: (rf() - 0.5) * 0.1,
    x: home.door[0], y: home.door[1], nx: -1, ny: -1, prog: 0, speed: 0.30 + rf() * 0.08,
    phase: 'walk', prev: 'walk', goal: null, timer: 0, chatT: 0, chatCd: (rf() * 100) | 0, inside: false, fight: false,
    hunger: o.hunger !== undefined ? o.hunger : 10 + rf() * 50, energy: o.energy !== undefined ? o.energy : 50 + rf() * 45,
    social: o.social !== undefined ? o.social : 30 + rf() * 60, coin: o.coin !== undefined ? o.coin : 10 + rf() * 50,
    aff: new Map(), belief: new Int32Array(MAXM).fill(-1), carry: 0, invite: null, starvedDay: -1, rich: false, meals: 0,
    traits, fx, scars: {}, done: new Set(), isThief: has('thief'), age: o.age, life: o.life, partner: -1, married: false, since: 0, thieves: new Set(), dead: false,
    grief: 0, starveT: 0, theftCd: Math.round(YEAR_TICKS * rf() * 1.5), dream: null, dreams: 0, adult: o.age >= ADULT, kids: 0, rejectCd: 0
  };
  d.dream = this.pickDream(d, rf);
  return d;
}

function pickDream(this: World, d, rf, not) {
  const w = [d.traits.includes('ambitious') ? 3 : 1, d.traits.includes('gossip') ? 3 : 1, d.traits.includes('romantic') ? 3 : 1, 1];
  const ks: [string, number][] = DREAMS.map((k, i) => [k, k === not || d.done.has(k) ? 0 : w[i]]); const tot = ks.reduce((a, b) => a + b[1], 0);
  if (!tot) return 'content';
  let r = rf() * tot;
  for (const [k, x] of ks) { r -= x; if (r <= 0 && x > 0) return k; }
  return 'rich';
}

function workFor(this: World, job, sid) {
  const s = this.S[sid], list = job === 0 ? this.farms : job === 1 ? this.workshops : job === 2 ? this.taverns : null; if (!list || !list.length) return null;
  let best = null, bv = 1e9; for (const b of list) { const v = Math.hypot(b.x - s.x, b.y - s.y) + (b.staff || 0) * 0.9 + this.rnd() * 4; if (v < bv) { bv = v; best = b; } }
  if (best) best.staff = (best.staff || 0) + 1; return best;
}

function makeDots(this: World) {
  const R = this.R, dots = this.dots = [];
  const link = (a, b, v) => { a.aff.set(b.id, v); b.aff.set(a.id, v); this.pairs.add(Math.min(a.id, b.id) * 1000 + Math.max(a.id, b.id)); this.stats.friends++; };
  for (const s of this.S) {
    const houses = this.sbl[s.id].filter(b => b.type === BT.HOUSE); if (!houses.length) continue;
    const per = Math.ceil(s.pop0 / houses.length), nTav = this.sbl[s.id].filter(b => b.type === BT.TAVERN).length;
    const near = l => l.some(b => b.sid === s.id || Math.hypot(b.x - s.x, b.y - s.y) <= 34), hasFarm = near(this.farms), hasShop = near(this.workshops);
    let left = s.pop0, keepers = nTav * 3;
    for (const home of houses) for (let k = 0; k < per && left > 0; k++, left--) {
      const id = dots.length, r = R(), life = K.lifespan(R);
      // age pyramid: ~16% children, adults skewed young, some elderly close to the end of their lives; each house starts with an adult head
      const age = k > 0 && R() < 0.2 ? R() * ADULT * 0.99 : ADULT + Math.pow(R(), 1.25) * (life - ADULT) * 0.97, child = age < ADULT;
      let job = child ? 3 : keepers > 0 && this.taverns.length ? 2 : r < K.FARMERS_SHARE ? (hasFarm ? 0 : 3) : r < 0.80 ? (hasShop ? 1 : hasFarm ? 0 : 3) : 3;
      if (job === 2) keepers--;
      const w = job === 3 ? null : this.workFor(job, s.id), future = child ? (r < 0.4 ? 0 : r < 0.7 ? 1 : 3) : undefined;
      if (id >= this.names.length) this.names.push(this.nameGen());
      dots.push(this.makeDot(id, { name: this.names[id], fam: home.fam, job, home: home.id, work: w ? w.id : -1, future, traits: rollTraits(R), age, life, coin: K.drawWealth(R, age) }, R));
    }
  }
  const n = dots.length;
  // starting relationships: housemates (kin), coworkers, and a batch of couples
  const byHome: Record<number, any[]> = {}; for (const d of dots) (byHome[d.home] = byHome[d.home] || []).push(d);
  for (const g of Object.values(byHome)) for (let i = 0; i < g.length; i++) for (let j = i + 1; j < g.length; j++) link(g[i], g[j], 35 + R() * 15);
  for (const d of dots) for (let k = 0; k < 2; k++) {
    const o = dots[(R() * n) | 0];
    if (o !== d && !d.aff.has(o.id) && (this.buildings[o.home].sid === this.buildings[d.home].sid) && (o.job === d.job || R() < 0.3)) link(d, o, 28 + R() * 10);
  }
  let made = 0, tries = 0; const wantC = Math.round(dots.filter(d => d.adult).length * 0.28);
  while (made < wantC && tries++ < 30000) {
    const a = dots[(R() * n) | 0], b = dots[(R() * n) | 0];
    if (a === b || !a.adult || !b.adult || Math.abs(a.age - b.age) > 9 || a.partner >= 0 || b.partner >= 0 || a.home === b.home || a.fam === b.fam || this.buildings[a.home].sid !== this.buildings[b.home].sid) continue;
    link(a, b, 45 + R() * 20); a.partner = b.id; b.partner = a.id; a.since = b.since = -Math.floor(R() * 1.2 * DAY_TICKS);
    a.married = b.married = made < wantC * 0.75; made++;
    for (const d of [a, b]) { d.done.add('love'); if (d.dream === 'love') d.dream = this.pickDream(d, R, 'love'); }
  }
  // ownership: house heads own their homes; about half of the businesses start in private hands
  for (const d of dots) { const h = this.buildings[d.home]; if (h.owner < 0 && d.adult) h.owner = d.id; }
  for (const b of this.buildings) if (b.state === 'ok' && (b.type === BT.MARKET || b.type === BT.TAVERN || b.type === BT.WORKSHOP || b.type === BT.FARM || b.type === BT.DOCK || b.type === BT.OFFICE || b.type === BT.FACTORY || b.type === BT.STORE) && R() < 0.55) {
    const pool = dots.filter(d => d.adult && this.buildings[d.home].sid === b.sid && !this.ownedBy(d.id).length).sort((a, c) => (c.traits.includes('ambitious') ? 1 : 0) + R() * 0.8 - ((a.traits.includes('ambitious') ? 1 : 0) + R() * 0.8));
    if (pool.length) { b.owner = pool[0].id; b.cash = 20 * KB; }
  }
}

function ownedBy(this: World, id, types) { return this.buildings.filter(b => b.owner === id && b.state === 'ok' && b.type !== BT.HOUSE); }

const CAUSES: Record<string, string[]> = { hunger: ['starved'], age: ['died of old age', 'passed away peacefully in their sleep', 'died of old age'], illness: ['died of pneumonia', 'died after a long illness', 'succumbed to a winter fever', 'died of a sudden fever'], violence: ['was killed in a gang shooting', 'was stabbed in a street fight', 'was found dead after a gang feud'], accident: ['was killed in a farming accident', 'died after a fall at work', 'died in a workplace accident', 'was lost in a cart accident'] };
function causeText(w: World, cause: string) { return w.pick(CAUSES[cause] || CAUSES.age); }

function die(this: World, d, cause) {
  if (d.dead) return;
  if (d.inside && d.goal) this.leave(d);
  d.inside = false; d.dead = true; d.goal = null; d.phase = 'walk'; d.nx = -1; d.prog = 0; d.fight = false;
  const home = this.buildings[d.home]; d.x = home.door[0]; d.y = home.door[1];
  const fr = this.friends(d).map(f => this.dots[f[0]]);
  const heir = d.partner >= 0 && !this.dots[d.partner].dead ? this.dots[d.partner] : fr[0];
  const est = d.coin;
  if (est > 0) { if (heir) heir.coin += est; else this.gov(this.S[this.buildings[d.home].sid]).treasury += est; }   // no heir: the estate goes to the town
  if (d.partner >= 0) { const p = this.dots[d.partner]; p.partner = -1; p.married = false; p.grief = this.tick + Math.round(900 * TS); if (this.rnd() < 0.4) this.shiftTrait(p, this.rnd() < 0.5 ? 'loner' : 'pessimist', `after losing ${d.name}`); p.social = Math.max(0, p.social - 30); }
  d.partner = -1; d.coin = 0;
  this.inherit(d);
  const mourners = fr.slice(0, 6), park = this.nearest(this.parks, mourners[0] || d, 0);
  for (const m of mourners) { m.grief = this.tick + Math.round(400 * TS); m.social = Math.max(0, m.social - 15); m.invite = { k: 'social', b: park.id, until: this.tick + 300 }; this.later(2 + ((this.rnd() * 10) | 0), { t: 'say', d: m.id, k: [1000 + d.id, C.DIE] }); }
  this.stats.deaths++;
  this.ev('death', `🕯️ ${d.name} ${causeText(this, cause)} at ${Math.round(d.age)}.${mourners.length ? ` ${mourners.length} friend${mourners.length > 1 ? 's' : ''} mourn.` : ''}${heir && est > 0 ? ` ${heir.name} inherits ${K.usd(est)}.` : ''}`, [d.id].concat(mourners.slice(0, 1).map(m => m.id)), 0, 4);
}

function spawn(this: World, a, b) {
  const slot = this.dots.find(x => x.dead) || (this.dots.length < this.maxPop && this.residents(a.home) < 7 ? { id: this.dots.length } : null); if (!slot) return false;
  if (this.rep.length <= slot.id) this.rep = new Float32Array(this.dots.length + 8);
  const traits = inheritTraits(a.traits, b.traits, this.rnd);
  const pj = (this.rnd() < 0.5 ? a : b).future, future = pj === 2 ? 3 : pj;
  const d = this.makeDot(slot.id, { name: this.newName(), fam: (this.rnd() < 0.5 ? a : b).fam, job: 3, home: a.home, work: -1, future, traits, age: 0, life: K.lifespan(this.rnd), hunger: 20, energy: 90, social: 60, coin: 0 }, this.rnd);
  d.speed = 0.26; this.dots[slot.id] = d; this.names[slot.id] = d.name;
  for (const p of [a, b]) { p.aff.set(d.id, 70); d.aff.set(p.id, 70); p.kids++; }
  for (const o of this.dots) if (!o.dead && o.home === a.home && o.id !== d.id && o.id !== a.id && o.id !== b.id) { o.aff.set(d.id, 40); d.aff.set(o.id, 40); }
  this.stats.births++;
  this.out.push({ t: 'born', id: d.id, name: d.name, f: d.fam, j: d.job, h: d.home, tr: d.traits });
  this.ev('birth', `👶 ${a.name} and ${b.name} had a baby: ${d.name}!`, [d.id, a.id], 0, 2);
  return true;
}

function newName(this: World) { const taken = new Set(this.dots.map(d => d.name)); for (let i = 0; i < 60; i++) { const w = this.nameGen(); if (!taken.has(w)) return w; } return this.nameGen() + 'x'; }

function grow(this: World, d) { d.adult = true; d.job = d.future; { const w = d.job === 3 || d.job === 2 ? null : this.workFor(d.job, this.buildings[d.home].sid); d.work = w ? w.id : -1; if (!w && d.job < 2) d.job = 3; } this.ev('grow', `🎓 ${d.name} grew up and became a ${JOBS[d.job]}.`, [d.id], 60, 1); }

function dreamCheck(this: World, d) {
  if (d.dream === 'content') return;
  const ok = d.dream === 'rich' ? d.coin >= K.RICH : d.dream === 'famous' ? this.friends(d).length >= 8 : d.dream === 'family' ? d.kids >= 2 : d.partner >= 0;
  if (!ok) return;
  d.done.add(d.dream); d.dreams++; d.social = 100; if (d.dream === 'rich' && this.rnd() < 0.5) this.shiftTrait(d, this.rnd() < 0.5 ? 'generous' : 'greedy', 'success changed them'); this.ev('dream', `✨ ${d.name} achieved a dream: ${DREAM_TXT[d.dream]}.`, [d.id], 20, 2);
  this.say(d, [C.ME, C.HAPPY]); d.dream = this.pickDream(d, this.rnd, d.dream);
}

function addDot(this: World, o) {
  const slot = this.dots.find(x => x.dead), id = this.dots.length < this.maxPop ? this.dots.length : (slot ? slot.id : -1); if (id < 0) return null;
  const d = this.makeDot(id, o, this.rnd); this.dots[id] = d; this.names[id] = d.name; if (this.rep.length <= id) this.rep = new Float32Array(this.dots.length + 8);
  this.out.push({ t: 'born', id: d.id, name: d.name, f: d.fam, j: d.job, h: d.home, tr: d.traits }); return d;
}

function residents(this: World, hid) { let n = 0; for (const d of this.dots) if (!d.dead && d.home === hid) n++; return n; }

function unemployed(this: World, sid) { let n = 0; for (const d of this.dots) if (!d.dead && d.adult && d.job === 3 && this.buildings[d.home].sid === sid) n++; return n; }

function unstaff(this: World, b) {
  for (const d of this.dots) if (!d.dead && d.work === b.id) {
    d.work = -1; const w = d.job === 3 || d.job === 2 ? null : this.workFor(d.job, b.sid);
    if (w && w.id !== b.id) d.work = w.id; else d.job = 3;
  }
  b.staff = 0;
}

function inherit(this: World, d) {
  for (const b of this.buildings) if (b.owner === d.id && b.state !== 'gone') {
    const heir = (d.partner >= 0 && !this.dots[d.partner].dead && this.dots[d.partner]) || this.dots.find(k => !k.dead && k.adult && k.home === d.home && k.id !== d.id) || this.friends(d).map(f => this.dots[f[0]]).find(k => k.adult) || null;
    if (b.type !== BT.HOUSE && heir) { b.owner = heir.id; this.ev('inherit', `📜 ${heir.name} inherits ${b.name} ${BT_NAME[b.type]}.`, [heir.id], 40, 2); } else b.owner = heir ? heir.id : -1;
    if (b.state === 'build' && b.owner < 0) { /* orphaned site: town finishes it */ }
  }
}

/** Retirement at 80% of lifespan: stop working, draw a national pension. */
function retirement(this: World) {
  for (const d of this.dots) {
    if (d.dead || !d.adult || d.age < d.life * K.RETIRE_FRAC) continue;
    if (d.work >= 0 || d.job !== 3) { d.work = -1; d.job = 3; }
    const p = Math.min(K.PENSION, this.nation.treasury); this.nation.treasury -= p; d.coin += p; d.earn = (d.earn || 0) + p;
  }
}

/** Daily health: illness (worse in winter, for the old, the hungry and the very young) and workplace accidents. */
function mortality(this: World) {
  const winter = this.season() === 3 ? 2 : 1;
  for (const d of this.dots) {
    if (d.dead) continue;
    const old = d.age > d.life * 0.8 ? 1 + (d.age / d.life - 0.8) * 25 : 1;
    const p = 0.000025 * old * winter * (winter > 1 ? 1 - 0.5 * eff(d, 'coat') : 1) * (d.hunger > 85 ? 3 : 1) * (d.age < 2 ? 2.5 : 1) * (d.fx.risk > 1.6 ? 1.2 : 1);
    if (this.rnd() < p) { this.die(d, 'illness'); continue; }
    if (d.adult && (d.job === 0 || d.job === 1) && this.rnd() < 0.000002 * d.fx.risk) this.die(d, 'accident');
  }
}

Object.assign(World.prototype, { retirement, mortality, makeDot, pickDream, workFor, makeDots, ownedBy, die, spawn, newName, grow, dreamCheck, addDot, residents, unemployed, unstaff, inherit });
declare module './world' { interface World {
  retirement: (...args: any[]) => any;
  mortality: (...args: any[]) => any;
  makeDot: (...args: any[]) => any;
  pickDream: (...args: any[]) => any;
  workFor: (...args: any[]) => any;
  makeDots: (...args: any[]) => any;
  ownedBy: (...args: any[]) => any;
  die: (...args: any[]) => any;
  spawn: (...args: any[]) => any;
  newName: (...args: any[]) => any;
  grow: (...args: any[]) => any;
  dreamCheck: (...args: any[]) => any;
  addDot: (...args: any[]) => any;
  residents: (...args: any[]) => any;
  unemployed: (...args: any[]) => any;
  unstaff: (...args: any[]) => any;
  inherit: (...args: any[]) => any;
} }
