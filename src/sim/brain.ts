import type { Dot } from '../shared/types';
import { World } from './world';
import { makeField, b64, tkLess, mk } from '../shared/util';
import * as K from '../shared/constants';
import * as Gen from '../worldgen';
const { TS, YEAR_TICKS, HOUR_TICKS, KB, MEAL_UNIT, TICK_HZ, DAY_TICKS, INF, TILE, COST, BT, BT_NAME, BUILD_SHIFTS, UPKEEP, STAFF, MAXM, JOBS, FOOD_PRICE, DRINK_PRICE, STOCK_CAP, ADULT, YEAR_DAYS, SEASON_DAYS, SEASONS, YIELD, RAIN_P, CON, C, TRAITS, TRAIT_W, DREAMS, DREAM_TXT } = K;
import { W, H } from "../shared/dims";

function decide(this: World, d: Dot) {
  const tk = this.tick, tod = this.tod(), night = this.isNight(d), hours = tod > 0.27 && tod < 0.80;
  if ((d.jailUntil || 0) > tk) { const h = this.nearest(this.halls, d, 0) || this.buildings[d.home]; this.setGoal(d, 'sleep', h.id, null); return; }   // in prison
  if (d.adult && this.sickLevel(d) >= 0.5 && d.hunger < 85) { this.setGoal(d, 'sleep', d.home, null); return; }   // too ill to go anywhere: bed rest at home
  const c = [];
  c.push(['sleep', (100 - d.energy) * 1.15 + (night ? 75 : 0) - (d.hunger > 88 ? 60 : 0)]);
  const mk = d.hunger > 35 ? this.pickMarket(d) : -1;
  if (d.hunger > 90 && mk >= 0) { this.setGoal(d, 'eat', mk, null); return; }   // survival first
  { const wb = d.adult && d.work >= 0 && d.job <= 2 ? this.buildings[d.work] : null;   // a job is a commitment: go in for the working day unless starving or exhausted
    if (wb && wb.state === 'ok' && tod > 0.28 && tod < 0.62 && d.energy > 25 && d.hunger < 80) { this.setGoal(d, 'work', mk, null); return; } }
  if (mk >= 0 && d.coin >= this.price(d) && !(d.shortAt && this.tick - d.shortAt < 150 * TS && d.coin < 8 * MEAL_UNIT)) c.push(['eat', d.hunger * 1.3 - (night && d.energy < 40 ? 30 : 0) + (d.hunger > 45 && tod > 0.7 && tod < 0.95 ? 45 : 0)]);
  const broke = d.coin < FOOD_PRICE * 2;
  const retired = d.age >= d.life * K.RETIRE_FRAC;
  if (d.adult && !retired && (hours || (broke && d.hunger > 50 && !night) || (d.job === 0 && this.believedEmpty(d) && !night)) && d.energy > 20) {
    let s = d.dil * 32 + (d.coin < 30 * KB ? 35 : 0) + (d.coin < 10 * KB ? 30 : 0) - (d.coin > 140 * KB ? 45 : 0);
    if (d.job === 0) { const nm = this.nearest(this.markets, d, 0), low = nm ? nm.stock : 999; s += (low < 90 ? 30 : 0) + (low < 30 ? 35 : 0) + (low > (this.season() === 2 ? 600 : 250) ? -50 : 0) + (this.believedEmpty(d) ? 30 : 0) + (low < 40 && d.coin > 60 ? 45 : 0) + (this.season() === 2 ? 20 : 0); }
    if (d.hunger > 85 && d.coin >= FOOD_PRICE && mk >= 0) s -= 60;
    c.push(['work', s]);
  }
  if (d.adult && !retired && (d.job === 1 || d.job === 3) && this.sites.length && hours && d.energy > 22) {
    const st = this.siteFor(d); if (st) c.push(['build', 38 + d.dil * 18 + (d.coin < 30 * KB ? 28 : 0) + (d.job === 3 ? 12 : 0) + (d.work >= 0 && this.buildings[d.work] && this.buildings[d.work].state === 'build' ? 70 : 0)]);
  }
  const fest = tk < this.festival || tk < ((this.gov(this.S[this.buildings[d.home].sid])).festival || 0), inv = d.invite && tk < d.invite.until ? d.invite : null;
  c.push(['social', (100 - d.social) * d.soc * 0.95 + (fest ? 90 : 0) + (inv && inv.k === 'social' ? 60 : 0) - (night ? 45 : 0) - (this.weather ? 30 : 0)]);
  if (d.adult && this.stores.length && (d.budget || 0) >= 0.2 * K.DAY_WAGE && tod > 0.36 && tod < 0.84) c.push(['shop', 55 + Math.min(70, (d.budget || 0) / K.DAY_WAGE * 22) + this.rnd() * 10]);
  if (d.adult && d.coin >= K.NIGHT_OUT * 2) c.push(['drink', d.fx.spend * (100 - d.social) * d.soc * 0.55 + (tod > 0.62 && tod < 0.92 ? 22 : -35) + (inv && inv.k === 'drink' ? 60 : 0) + (fest ? 30 : 0) + (this.weather ? 15 : 0)]);
  if (d.adult && !retired && d.foes && d.foes.size && !night && d.energy > 40 && d.hunger < 70 && (d.fx.temper > 1.4 || d.traits.includes('vengeful') || d.traits.includes('hothead')) && d.fx.courage > -0.2) {
    const rg = this.revengeGoal(d); if (rg) c.push(['confront', 30 + this.grudge(d, rg.t) * 0.9 + (d.fx.temper - 1) * 14]);
  }
  c.push(['wander', 18 + this.rnd() * 10]);
  let bk = 'wander', bs = -1e9;
  for (const [k, s] of c) { const v = s + (this.rnd() - 0.5) * 14; if (v > bs) { bs = v; bk = k; } }
  this.setGoal(d, bk, mk, inv);
}

function setGoal(this: World, d: Dot, k, mk, inv) {
  let g;
  switch (k) {
    case 'sleep': g = { k, b: d.home, enter: true }; break;
    case 'confront': { const rg = this.revengeGoal(d); if (!rg) { g = { k: 'wander', b: d.home, enter: false }; break; } g = { k, b: rg.b, enter: false, t: rg.t }; break; }
    case 'eat': g = { k, b: mk, enter: true }; break;
    case 'work': {
      let b = d.job === 3 ? this.nearest(this.workshops, d, 10) : this.buildings[d.work];
      if (b && b.type === BT.BUILDER && b.state === 'ok') { const st = this.siteOfFirm(b); if (st) { g = { k: 'build', b: st.id, enter: false }; break; } }
      if (b && b.state === 'build') { g = { k: 'build', b: b.id, enter: false }; break; }
      if (!b || b.state !== 'ok') { b = this.nearest(this.workshops, d, 10) || this.buildings[d.home]; }
      g = { k, b: b.id, enter: !b.open }; break;
    }
    case 'build': {
      const st = this.siteFor(d) || this.buildings[d.home];
      g = { k, b: st.id, enter: false }; break;
    }
    case 'social': {
      let b = (inv && inv.k === 'social') ? this.buildings[inv.b] : this.nearest(this.parks, d, this.tick < this.festival || this.tick < (this.gov(this.S[this.buildings[d.home].sid]).festival || 0) ? 8 : 40);
      if (inv && inv.k === 'social') d.invite = null;
      g = { k, b: b.id, enter: false }; break;
    }
    case 'shop': { const b = this.pickStore(d) || this.nearest(this.stores, d, 40); g = { k, b: b.id, enter: true }; break; }
    case 'drink': {
      let b = (inv && inv.k === 'drink') ? this.buildings[inv.b] : this.nearest(this.taverns, d, 25);
      if (inv && inv.k === 'drink') d.invite = null;
      g = { k, b: b.id, enter: true }; break;
    }
    default: { const sb = this.sbl[this.buildings[d.home].sid] || [], far = this.rnd() < 0.04, b = far ? this.pick(this.parks.filter(p => Math.hypot(p.x - d.x, p.y - d.y) < 70).concat([this.buildings[d.home]])) : (sb.length ? this.pick(sb) : this.buildings[d.home]); g = { k: 'wander', b: b.id, enter: false }; }
  }
  d.goal = g; d.phase = 'walk'; d.nx = -1; d.prog = 0;
}

function believedEmpty(this: World, d: Dot) { let n = 0; for (const m of this.markets) { const b = d.belief[m.mi]; if (b >= 0 && this.tick - b < 300 * TS && this.F(m)[d.y * W + d.x] < 160) n++; } return n; }

function pickMarket(this: World, d: Dot) {
  let best = -1, bv = 1e9;
  for (const m of this.markets) { const b = d.belief[m.mi]; if (b >= 0 && this.tick - b < 300 * TS) continue; const v = this.F(m)[d.y * W + d.x]; if (v < bv) { bv = v; best = m.id; } }
  return best;
}

Object.assign(World.prototype, { decide, setGoal, believedEmpty, pickMarket });
declare module './world' { interface World {
  decide: (...args: any[]) => any;
  setGoal: (...args: any[]) => any;
  believedEmpty: (...args: any[]) => any;
  pickMarket: (...args: any[]) => any;
} }
