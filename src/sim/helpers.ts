import { World } from './world';
import { makeField, b64, tkLess, mk } from '../shared/util';
import * as K from '../shared/constants';
import * as Gen from '../worldgen';
const { TS, YEAR_TICKS, HOUR_TICKS, KB, MEAL_UNIT, TICK_HZ, DAY_TICKS, INF, TILE, COST, BT, BT_NAME, BUILD_SHIFTS, UPKEEP, STAFF, MAXM, JOBS, FOOD_PRICE, DRINK_PRICE, STOCK_CAP, ADULT, YEAR_DAYS, SEASON_DAYS, SEASONS, YIELD, RAIN_P, CON, C, TRAITS, TRAIT_W, DREAMS, DREAM_TXT } = K;
import { W, H } from "../shared/dims";

function dayIdx(this: World) { return Math.floor(this.tick / DAY_TICKS); }

function season(this: World) { return Math.floor(this.dayIdx() / SEASON_DAYS) % 4; }

function year(this: World) { return Math.floor(this.dayIdx() / (SEASON_DAYS * 4)) + 1; }

function tod(this: World) { return (this.tick % DAY_TICKS) / DAY_TICKS; }

function day(this: World) { return Math.floor(this.tick / DAY_TICKS) + 1; }

function isNight(this: World, d) { const t = this.tod(); return t < 0.22 + d.off || t > 0.88 + d.off; }

function say(this: World, d, k) { this.out.push({ t: 'say', d: d.id, k }); }

function sayB(this: World, b, k) { this.out.push({ t: 'say', b: b.id, k }); }

function ev(this: World, kind, text, ids, gap = 0, w = 1) {
  if (gap && this.tick - (this.lastEv[kind] || -1e9) < gap) return;
  this.lastEv[kind] = this.tick; if (this.dayLog.length < 600) this.dayLog.push({ k: kind, x: text, ids: ids || [], w, tick: this.tick }); if (this.story) this.story.heat += w >= 4 ? 1 : w === 3 ? 0.15 : 0; const m = { t: 'ev', k: kind, x: text, ids: ids || [], w }; this.out.push(m); this.hist.push(m); if (this.hist.length > 40) this.hist.shift();
  if (this.mediaHook) this.mediaHook(kind, text, ids || [], w);
  if (this.thoughtHook) this.thoughtHook(kind, text, ids || [], w);
}

function later(this: World, dt, m) { this.pending.push({ at: this.tick + dt, m }); }

function fieldAt(this: World, b, d) { return this.F(this.buildings[b])[d.y * W + d.x]; }

function nearest(this: World, list, d, jitter = 0) { let best = null, bv = 1e9; for (const b of list) { const v = this.F(b)[d.y * W + d.x] + this.rnd() * jitter; if (v < bv) { bv = v; best = b; } } return best; }

Object.assign(World.prototype, { dayIdx, season, year, tod, day, isNight, say, sayB, ev, later, fieldAt, nearest });
declare module './world' { interface World {
  dayIdx: (...args: any[]) => any;
  season: (...args: any[]) => any;
  year: (...args: any[]) => any;
  tod: (...args: any[]) => any;
  day: (...args: any[]) => any;
  isNight: (...args: any[]) => any;
  say: (...args: any[]) => any;
  sayB: (...args: any[]) => any;
  ev: (...args: any[]) => any;
  later: (...args: any[]) => any;
  fieldAt: (...args: any[]) => any;
  nearest: (...args: any[]) => any;
} }
