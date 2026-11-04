import { World } from './world';
import type { Building } from '../shared/types';
import { makeField, b64, tkLess, rollTraits, mk } from '../shared/util';
import * as K from '../shared/constants';
import * as Gen from '../worldgen';
const { TICK_HZ, DAY_TICKS, INF, TILE, COST, BT, BT_NAME, BUILD_SHIFTS, UPKEEP, STAFF, MAXM, JOBS, FOOD_PRICE, DRINK_PRICE, STOCK_CAP, ADULT, YEAR_DAYS, SEASON_DAYS, SEASONS, YIELD, RAIN_P, CON, C, TRAITS, TRAIT_W, DREAMS, DREAM_TXT } = K;
import { W, H } from "../shared/dims";

function serialize(this: World) {
  const pl = this.map.plots;
  return { v: 4, civ: { ledger: this.ledger, nation: this.nation.treasury, gov: this.S.map(s => { const g = this.gov(s); return [g.mayor, g.treasury, g.tax, g.next, g.festival]; }), weather: this.weather, mcount: this.mcount }, tick: this.tick, stats: this.stats, biz: this.biz, pairs: [...this.pairs],
    tiles: Array.from(this.tiles).join(''),
    plots: pl.map(p => [p.x, p.y, p.dx, p.dy, p.sid, p.rural ? 1 : 0, p.used ? 1 : 0, p.bid, Math.round(p.dc * 10), Math.round(p.fert * 100), p.sq ? 1 : 0, p.quay ? 1 : 0]),
    blds: this.buildings.map(b => [b.type, b.x, b.y, b.door, b.open ? 1 : 0, b.sid, b.owner, b.cash, b.state, b.name, b.fam || '', b.stock, b.w, b.h, b.plot, b.mi, b.born, b.sqPark ? 1 : 0, b.need || 0, b.prog || 0, b.escrow || 0, b.vac, b.debt || 0]),
    dots: this.dots.map(d => ({ n: d.name, fm: d.fam, j: d.job, h: d.home, w: d.work, f: d.future, tr: d.traits, dr: d.dream, a: d.age, l: d.life, p: d.partner, m: d.married ? 1 : 0, x: d.dead ? 1 : 0, s: d.since,
      e: [d.hunger, d.energy, d.social, d.coin], af: [...d.aff], th: [...d.thieves], kd: d.kids, drs: d.dreams, dn: [...d.done] })) };
}

function load(this: World, s) {
  if (!s || s.v !== 4 || s.tiles.length !== W * H) return;
  this.tick = s.tick; this.lastSeason = this.season(); const c = s.civ; this.nation.treasury = c.nation; if (c.ledger) this.ledger = c.ledger; c.gov.forEach((a, i) => { Object.assign(this.gov(this.S[i]), { mayor: a[0], treasury: a[1], tax: a[2], next: a[3], festival: a[4] }); }); this.weather = c.weather; this.mcount = c.mcount || 0;
  this.stats = Object.assign(this.stats, s.stats); this.biz = Object.assign(this.biz, s.biz || {}); this.pairs = new Set(s.pairs);
  for (let i = 0; i < s.tiles.length; i++) this.tiles[i] = +s.tiles[i];
  const map = this.map; map.plots.length = 0; map.pm.fill(-1);
  for (const q of this.S) { const [sw, sh] = Gen.SQ[q.tier], hw = sw >> 1, hh = sh >> 1; for (let b = -hh; b <= hh; b++) for (let a = -hw; a <= hw; a++) map.pm[(q.y + b) * W + q.x + a] = -2; q.plots = []; }
  s.plots.forEach((o, i) => { const p = { id: i, sid: o[4], x: o[0], y: o[1], dx: o[2], dy: o[3], rural: !!o[5], used: !!o[6], bid: o[7], dc: o[8] / 10, fert: o[9] / 100, sq: !!o[10], quay: !!o[11] }; map.plots.push(p); this.S[p.sid].plots.push(i); for (let b = 0; b < 3; b++) for (let a = 0; a < 3; a++) map.pm[(p.y + b) * W + p.x + a] = i; });
  this.buildings = s.blds.map((o, i) => { const b: Building = { id: i, type: o[0], x: o[1], y: o[2], door: o[3], open: !!o[4], occ: 0, stock: o[11], inside: [], name: o[9], fam: o[10], flag: false, sid: o[5], owner: o[6], cash: o[7], rev: 0, wage: 0, state: o[8], born: o[16], visits: 0, hist: [], mi: o[15], vac: o[21] || 0, w: o[12], h: o[13], plot: o[14], sqPark: !!o[17], need: o[18], prog: o[19], escrow: o[20], debt: o[22] || 0 };
    b.src = []; if (b.sqPark) { for (let q = 0; q < b.h; q++) for (let p = 0; p < b.w; p++) b.src.push((b.y + q) * W + b.x + p); } else if (b.open) { for (let q = 0; q < 3; q++) for (let p = 0; p < 3; p++) b.src.push((b.y + q) * W + b.x + p); } else b.src.push(b.door[1] * W + b.door[0]);
    return b; });
  this.sites = this.buildings.filter(b => b.state === 'build'); this.fgen++; this.rebuild();
  this.dots = []; this.names = [];
  s.dots.forEach((o, i) => {
    const d = this.makeDot(i, { name: o.n, fam: o.fm, job: o.j, home: o.h, work: o.w, future: o.f, traits: o.tr, age: o.a, life: o.l, hunger: o.e[0], energy: o.e[1], social: o.e[2], coin: o.e[3] }, this.rnd);
    d.dream = o.dr; d.partner = o.p; d.married = !!o.m; d.dead = !!o.x; d.since = o.s; d.aff = new Map(o.af); d.thieves = new Set(o.th); d.kids = o.kd; d.dreams = o.drs; d.done = new Set(o.dn || []);
    this.dots[i] = d; this.names[i] = d.name;
  });
  this.rep = new Float32Array(this.dots.length + 8);
}

Object.assign(World.prototype, { serialize, load });
declare module './world' { interface World {
  serialize: (...args: any[]) => any;
  load: (...args: any[]) => any;
} }
