import { World } from './world';
import { makeField, b64, tkLess, rollTraits, mk } from '../shared/util';
import * as K from '../shared/constants';
import * as Gen from '../worldgen';
const { TICK_HZ, DAY_TICKS, INF, TILE, COST, BT, BT_NAME, BUILD_SHIFTS, UPKEEP, STAFF, MAXM, JOBS, FOOD_PRICE, DRINK_PRICE, STOCK_CAP, ADULT, YEAR_DAYS, SEASON_DAYS, SEASONS, YIELD, RAIN_P, CON, C, TRAITS, TRAIT_W, DREAMS, DREAM_TXT } = K;
import { W, H } from "../shared/dims";

function initMsg(this: World) {
  const m = this.map, el = new Uint8Array(W * H); for (let i = 0; i < el.length; i++) el[i] = Math.round(Math.min(1, m.h[i]) * 255);
  return { t: 'init', W, H, hz: TICK_HZ, tiles: Array.from(this.tiles).join(''), wk: Array.from(m.wk).join(''), el: b64(el), tick: this.tick,
    setts: this.S.map(s => ({ i: s.id, n: s.name, t: s.tier, x: s.x, y: s.y })),
    blds: this.buildings.map(b => this.bldMsg(b)),
    hist: this.hist.slice(-25), dots: this.dots.map(d => ({ n: d.name, f: d.fam, j: d.job, h: d.home, tr: d.traits })), lex: this.lex, jobs: JOBS, bt: BT_NAME };
}

function actCode(this: World, d) {
  if (d.phase === 'chat') return 7; if (d.phase === 'walk' || !d.goal) return 1;
  switch (d.goal.k) { case 'sleep': return 2; case 'work': case 'deliver': case 'build': return 3; case 'eat': return 4; case 'social': return 5; case 'drink': return 6; default: return 0; }
}

function frame(this: World) {
  const n = this.dots.length, nb = this.buildings.length, buf = new ArrayBuffer(15 + n * 5 + nb * 2), v = new DataView(buf);
  v.setUint8(0, 1); v.setUint32(1, this.tick, true); v.setFloat32(5, this.tod(), true); v.setUint16(9, this.day(), true); v.setUint16(11, n, true); v.setUint16(13, nb, true);
  let o = 15;
  for (const d of this.dots) {
    const px = d.x + (d.nx >= 0 ? (d.nx - d.x) * d.prog : 0), py = d.y + (d.ny >= 0 ? (d.ny - d.y) * d.prog : 0);
    v.setUint16(o, Math.round((px + 0.5) * 16), true); v.setUint16(o + 2, Math.round((py + 0.5) * 16), true);
    v.setUint8(o + 4, (d.inside ? 1 : 0) | (this.actCode(d) << 1) | (d.carry > 0 ? 16 : 0) | (d.fight ? 32 : 0) | (d.dead ? 64 : 0) | (d.adult ? 0 : 128)); o += 5;
  }
  for (const b of this.buildings) { v.setUint16(o, b.occ, true); o += 2; }
  return buf;
}

function drain(this: World) { const o = this.out; this.out = []; return o; }

function computeRep(this: World) {
  const rep = new Float32Array(this.dots.length);
  for (const d of this.dots) { if (d.dead) continue; for (const [k, v] of d.aff) if (!this.dots[k].dead) rep[k] += v; }
  this.rep = rep;
}

function statsMsg(this: World) {
  this.computeRep();
  const alive = this.dots.filter(d => !d.dead), n = alive.length || 1;
  let mood = 0, coin = 0; for (const d of alive) { mood += this.mood(d); coin += d.coin; }
  const top = (f, k = 3, desc = true) => alive.map(d => [d.id, Math.round(f(d))]).sort((a, b) => desc ? b[1] - a[1] : a[1] - b[1]).slice(0, k);
  const cdl = k => Math.max(0, (this.cd[k] + (k === 'festival' || k === 'blight' ? 225 : 100) - this.tick) / TICK_HZ | 0);
  return { t: 'stats', day: this.day(), pop: alive.length, food: this.markets.map(m => m.stock), mk: this.markets.map(m => this.S[m.sid].name),
    towns: this.S.map(s => [s.name, s.tier, this.sPop[s.id] || 0]), biz: { open: this.buildings.filter(b => b.state === 'ok' && this.isBiz(b)).length, built: this.biz.built, closed: this.biz.closed, sold: this.biz.sold, fires: this.biz.fires, arrived: this.biz.arrived, sites: this.sites.length, vacant: this.buildings.filter(b => b.state === 'vacant').length }, mood: Math.round(mood / n), coin: Math.round(coin / n),
    meals: this.stats.meals, chats: this.stats.chats, friends: this.stats.friends, births: this.stats.births, deaths: this.stats.deaths, thefts: this.stats.thefts, fights: this.stats.fights,
    couples: alive.filter(d => d.partner >= 0).length / 2,
    lead: { rich: top(d => d.coin), loved: top(d => this.rep[d.id]), hated: top(d => this.rep[d.id], 3, false), old: top(d => d.age) },
    cd: { festival: cdl('festival'), blight: cdl('blight'), gift: cdl('gift'), zap: cdl('zap'), cupid: cdl('cupid') },
    fest: this.tick < this.festival, blight: this.tick < this.blight,
    season: this.season(), year: this.year(), weather: this.weather, mayor: this.mayor, treasury: Math.round(this.treasury), tax: this.taxRate, nextElection: this.nextElection };
}

function doingText(this: World, d) {
  const g = d.goal, b = g ? this.buildings[g.b] : null, nm = b ? (b.name ? `${b.name} ${BT_NAME[b.type]}` : 'home') : '';
  if (d.phase === 'chat') return 'chatting';
  if (!g) return 'thinking';
  const walk = d.phase === 'walk';
  switch (g.k) {
    case 'sleep': return walk ? 'heading home to sleep' : 'sleeping';
    case 'eat': return walk ? `walking to ${nm} for food` : 'eating';
    case 'work': return walk ? `heading to work at ${nm}` : `working at ${nm}`;
    case 'deliver': return walk ? `carrying crops to ${nm}` : `delivering crops`;
    case 'build': return walk ? `heading to the building site` : `building a ${BT_NAME[b.type].toLowerCase()}`;
    case 'social': return walk ? `heading to ${nm}` : `hanging out at ${nm}`;
    case 'drink': return walk ? `off to ${nm}` : `having a drink at ${nm}`;
    default: return 'wandering';
  }
}

function thought(this: World, d) {
  const e = this.believedEmpty(d), tod = this.tod();
  if (this.tick < d.grief) return 'Missing someone.';
  if (d.thieves.size && this.rnd() < 0.5) return 'Watching out for thieves.';
  if (d.hunger > 85) return e >= this.markets.length ? 'Starving, and I heard every market is empty.' : 'So hungry I can barely think.';
  if (d.phase === 'do' && d.goal && d.goal.k === 'sleep') return 'zzz…';
  if (d.coin < 8) return 'Pockets are empty. I need to work.';
  if (e > 0 && d.hunger > 40) return 'Heard one market has no food. Trying another.';
  if (d.energy < 25) return 'Running on fumes.';
  if (d.social < 25) return 'Could really use some company.';
  if (d.invite && this.tick < d.invite.until) return 'Meeting a friend soon.';
  if (this.mood(d) > 75) return tod < 0.5 ? 'Nice morning.' : 'Good day so far.';
  return 'Just getting on with it.';
}

function detail(this: World, id) {
  const d = this.dots[id]; if (!d) return null;
  const p = d.partner >= 0 ? this.dots[d.partner] : null;
  return { t: 'detail', id, name: d.name, fam: d.fam, mayor: id === this.mayor, dead: d.dead, job: d.adult ? JOBS[d.job] : 'child', age: Math.round(d.age), traits: d.traits,
    hunger: Math.round(d.hunger), energy: Math.round(d.energy), social: Math.round(d.social), coin: Math.round(d.coin),
    mood: this.mood(d), doing: d.dead ? 'passed away' : this.doingText(d), thought: this.thought(d), home: d.home,
    dream: DREAM_TXT[d.dream], partner: p ? p.name : null, pid: p ? p.id : -1, married: d.married, rep: Math.round(this.rep ? this.rep[id] : 0), kids: d.kids,
    thieves: [...d.thieves].filter(x => !this.dots[x].dead).slice(0, 3),
    friends: this.friends(d).slice(0, 6).map(([k, v]) => [k, Math.round(v)]) };
}

Object.assign(World.prototype, { initMsg, actCode, frame, drain, computeRep, statsMsg, doingText, thought, detail });
declare module './world' { interface World {
  initMsg: (...args: any[]) => any;
  actCode: (...args: any[]) => any;
  frame: (...args: any[]) => any;
  drain: (...args: any[]) => any;
  computeRep: (...args: any[]) => any;
  statsMsg: (...args: any[]) => any;
  doingText: (...args: any[]) => any;
  thought: (...args: any[]) => any;
  detail: (...args: any[]) => any;
} }
