import type { Dot, Building } from '../shared/types';
import { World } from './world';
import { eff } from './gear';
import { makeField, b64, tkLess, mk } from '../shared/util';
import * as K from '../shared/constants';
import * as Gen from '../worldgen';
const { TS, YEAR_TICKS, HOUR_TICKS, KB, MEAL_UNIT, TICK_HZ, DAY_TICKS, INF, TILE, COST, BT, BT_NAME, BUILD_SHIFTS, UPKEEP, STAFF, MAXM, JOBS, FOOD_PRICE, DRINK_PRICE, STOCK_CAP, ADULT, YEAR_DAYS, SEASON_DAYS, SEASONS, YIELD, RAIN_P, CON, C, TRAITS, TRAIT_W, DREAMS, DREAM_TXT } = K;
import { W, H } from "../shared/dims";

function move(this: World, d: Dot) {
  const f = this.F(this.buildings[d.goal.b]);
  if (d.nx < 0) {
    const cur = f[d.y * W + d.x];
    if (cur === 0) { this.arrive(d); return; }
    let best = -1, bv = cur;
    const s = (this.rnd() * 4) | 0;
    for (let q0 = 0; q0 < 4; q0++) {
      const q = (q0 + s) & 3, nx = d.x + (q === 0 ? 1 : q === 1 ? -1 : 0), ny = d.y + (q === 2 ? 1 : q === 3 ? -1 : 0);
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const v = f[ny * W + nx]; if (v < bv) { bv = v; best = ny * W + nx; }
    }
    if (best < 0) { d.goal = null; return; }
    d.nx = best % W; d.ny = (best / W) | 0; d.prog = 0;
  }
  const tt = this.tiles[d.y * W + d.x];
  d.prog += d.speed * (tt === TILE.ROAD ? 1 : tt === TILE.OPEN ? 0.85 : 0.7) * (this.weather ? 0.8 : 1);
  if (d.prog >= 1) { d.x = d.nx; d.y = d.ny; d.nx = -1; d.prog = 0; if (f[d.y * W + d.x] === 0) this.arrive(d); }
}

function arrive(this: World, d: Dot) {
  const g = d.goal, b = this.buildings[g.b];
  if ((b.state === 'gone' || b.state === 'vacant') && g.k !== 'wander' && g.k !== 'social') { d.phase = 'walk'; d.goal = null; return; }
  d.phase = 'do';
  switch (g.k) {
    case 'sleep': this.enter(d, b); d.timer = Math.round(900 * TS); break;
    case 'eat':
      {
        let pr = d.adult ? this.mprice(b) : 0; if (d.adult && d.hunger > 85 && d.coin < pr && b.stock > 20) pr = 0;   // the starving get charity
        if (b.stock > 0 && d.coin >= pr) { b.stock--; d.coin -= pr; this.credit(b, pr); b.rev += pr; b.visits++; this.enter(d, b); d.timer = Math.round(14 * TS); this.stats.meals++; d.meals++; if (b.stock === 0) this.checkStock(b); }
        else if (b.stock > 0) { this.sayDelayed(d, [C.ME, C.BROKE]); d.phase = 'walk'; d.goal = null; d.shortAt = this.tick; }
        else { d.belief[b.mi] = this.tick; this.sayDelayed(d, [K.TOK_PLACE + b.id, C.NO, C.FOOD]); this.checkStock(b); d.phase = 'walk'; d.goal = null; }
      }
      break;
    case 'work': {
      const t = d.job === 0 ? Math.round(55 * TS) : d.job === 3 ? Math.round(60 * TS) : HOUR_TICKS * 8;   // a farm cycle; or an 8-hour shift for everyone else
      if (g.enter) this.enter(d, b); d.timer = t; d.shiftTicks = t; d.paidH = 0; break;
    }
    case 'deliver': {
      this.enter(d, b);
      const room = STOCK_CAP - b.stock, add = Math.min(room, d.carry);
      const rate = this.mprice(b) * 0.9 / 1.6;
      b.stock += add;
      {   // the market pays for the crops out of its own till (or the town treasury, for a public market); the farm owner takes a 15% share
        const due = d.carry * rate * 1.6, [mo, mk] = this.till(b), paid = this.takeUpTo(mo, mk, due); b.cost = (b.cost || 0) + paid;
        const fb = this.buildings[d.work], owned = fb && fb.owner >= 0 && fb.state === 'ok' && fb.type === BT.FARM;
        if (owned) { fb.cash += paid * 0.15; fb.rev += paid * 0.15; fb.visits++; d.coin += paid * 0.85; } else d.coin += paid;
      } this.stats.deliveries++; this.stats.wasted += d.carry - add; d.carry = 0; d.timer = Math.round(8 * TS); this.checkStock(b); break;
    }
    case 'build': if (b.state !== 'build') { d.phase = 'walk'; d.goal = null; } else d.timer = HOUR_TICKS * 8; break;
    case 'social': d.timer = Math.round((70 + ((this.rnd() * 70) | 0)) * TS); break;
    case 'confront': d.timer = Math.round(40 * TS); break;
    case 'shop': this.enter(d, b); this.shopAt(d, b); d.timer = Math.round(HOUR_TICKS * 0.75); break;
    case 'drink':
      if (d.coin >= K.NIGHT_OUT) { d.coin -= K.NIGHT_OUT; d.budget = Math.max(0, (d.budget || 0) - K.NIGHT_OUT); this.credit(b, K.NIGHT_OUT); b.rev += K.NIGHT_OUT; { const [to, tk2] = this.till(b); this.toAbroad(to, tk2, K.NIGHT_OUT * 0.3, 'supplies'); } b.visits++; this.enter(d, b); d.timer = Math.round((60 + ((this.rnd() * 50) | 0)) * TS); }
      else { d.phase = 'walk'; d.goal = null; }
      break;
    default: d.timer = Math.round((12 + ((this.rnd() * 25) | 0)) * TS);
  }
}

function doing(this: World, d: Dot) {
  const g = d.goal;
  switch (g.k) {
    case 'sleep': {
      d.energy = Math.min(100, d.energy + 0.42 / TS);
      if (--d.timer <= 0 || d.hunger > 96 || (!this.isNight(d) && d.energy >= 80)) this.finish(d);
      break;
    }
    case 'eat': if (--d.timer <= 0) { d.hunger = Math.max(0, d.hunger - 62); this.finish(d); } break;
    case 'work':
      if (d.job !== 0) this.payShiftHours(d, g, false);   // paid by the hour, so an interrupted shift still earns what was worked
      if (--d.timer <= 0) {
        if (d.job === 0) { d.carry = tkLess(this.tick, this.blight) || this.tick < (this.S[this.buildings[d.home].sid].drought || 0) ? 0 : Math.max(1, Math.round(4 * YIELD[this.season()] * K.FARM_PRODUCTIVITY * (1 + 0.2 * eff(d, 'tool')) * (this.perf(d, 'farm') / 0.9))); if (d.carry) this.trainSkill(d, 'farm', 0.02); if (!d.carry) this.say(d, [C.FARM, C.BAD]); else if (d.carry > 1) { d.carry--; d.hunger = Math.max(0, d.hunger - 30); } }   // farm hands eat a share of the harvest on the spot
        else { this.buildings[g.b].visits++; this.payShiftHours(d, g, true); }
        this.finish(d);
      }
      break;
    case 'build': if (--d.timer <= 0) { this.buildStep(d, this.buildings[g.b]); this.finish(d); } break;
    case 'social': d.social = Math.min(100, d.social + 0.30 / TS); if (--d.timer <= 0) this.finish(d); break;
    case 'confront': {   // wait outside for them; if they come within reach, it starts
      const t = this.dots[g.t];
      if (!t || t.dead) { this.finish(d); break; }
      if (!g.done && this.tick % 4 === d.id % 4 && !t.inside && t.phase !== 'chat') { const dx = t.x - d.x, dy = t.y - d.y; if (dx * dx + dy * dy <= 9) { g.done = true; d.timer = 1; d.revCd = this.tick + 3 * DAY_TICKS; this.fight(d, t, { rev: true }); break; } }
      if (--d.timer <= 0) { d.revCd = this.tick + 1 * DAY_TICKS; if (!t.inside) this.say(d, [K.TOK_PERSON + t.id, C.BAD]); this.finish(d); }
      break;
    }
    case 'drink': {
      d.social = Math.min(100, d.social + 0.38 / TS);
      if (this.tick % 20 === d.id % 20) { const b = this.buildings[g.b]; if (b.inside.length > 1) { const o = this.pick(b.inside); if (o !== d) { this.addAff(d, o, 3); this.addAff(o, d, 3); } } }
      if (--d.timer <= 0) this.finish(d); break;
    }
    default: if (--d.timer <= 0) this.finish(d);
  }
}

function finish(this: World, d: Dot) {
  this.leave(d);
  const was = d.goal; d.goal = null; d.phase = 'walk';
  if (was.k === 'work' && d.job === 0 && d.carry > 0) {
    const m = this.markets.reduce((a, b) => (this.F(a)[d.y * W + d.x] + a.stock * 0.3 < this.F(b)[d.y * W + d.x] + b.stock * 0.3 ? a : b));
    d.goal = { k: 'deliver', b: m.id, enter: true }; d.nx = -1; d.prog = 0;
  }
}

function checkStock(this: World, b: Building) {
  if (b.stock <= 0 && !b.flag) { b.flag = true; this.ev('empty' + b.id, `🍞 ${b.name} Market has run out of food!`, [], 40, 2); }
  else if (b.stock >= 25 && b.flag) { b.flag = false; this.ev('restock' + b.id, `🌾 ${b.name} Market is stocked again.`, [], 40); }
}

function enter(this: World, d: Dot, b: Building) { d.inside = true; b.occ++; b.inside.push(d); }

function leave(this: World, d: Dot) { if (!d.inside) return; const b = this.buildings[d.goal.b]; d.inside = false; b.occ--; const i = b.inside.indexOf(d); if (i >= 0) b.inside.splice(i, 1); }

function sayDelayed(this: World, d: Dot, k) { this.later(1, { t: 'say', d: d.id, k }); }

/** Pay (and book export revenue for) the hours worked so far in this shift; `final` settles the remainder. A shift is 8 hours = one day's wage. */
function payShiftHours(this: World, d: Dot, g, final: boolean) {
  const wb = this.buildings[g.b], total = (d.shiftTicks || HOUR_TICKS * 8) / HOUR_TICKS, done = final ? total : Math.floor(((d.shiftTicks || 0) - d.timer) / HOUR_TICKS), n = done - (d.paidH || 0);
  if (n <= 0.001) return;
  d.paidH = (d.paidH || 0) + n;
  const day = K.WAGE[wb.type] || K.DAY_WAGE * 0.6;
  if (wb.state === 'ok' && K.REV[wb.type]) this.exportIn(wb, K.REV[wb.type] * n / 8 * this.firmPerf(wb));
  const net = this.payWage(wb, d, day * n / 8); d.coin += net; d.earn = (d.earn || 0) + net;
  this.trainSkill(d, this.skillAt(wb), 0.02 * n / 8);
}

Object.assign(World.prototype, { payShiftHours, move, arrive, doing, finish, checkStock, enter, leave, sayDelayed });
declare module './world' { interface World {
  payShiftHours: (...args: any[]) => any;
  move: (...args: any[]) => any;
  arrive: (...args: any[]) => any;
  doing: (...args: any[]) => any;
  finish: (...args: any[]) => any;
  checkStock: (...args: any[]) => any;
  enter: (...args: any[]) => any;
  leave: (...args: any[]) => any;
  sayDelayed: (...args: any[]) => any;
} }
