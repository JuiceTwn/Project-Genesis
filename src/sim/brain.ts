import { World } from './world';
import { makeField, b64, tkLess, rollTraits, mk } from '../shared/util';
import * as K from '../shared/constants';
import * as Gen from '../worldgen';
const { TICK_HZ, DAY_TICKS, INF, TILE, COST, BT, BT_NAME, BUILD_SHIFTS, UPKEEP, STAFF, MAXM, JOBS, FOOD_PRICE, DRINK_PRICE, STOCK_CAP, ADULT, YEAR_DAYS, SEASON_DAYS, SEASONS, YIELD, RAIN_P, CON, C, TRAITS, TRAIT_W, DREAMS, DREAM_TXT } = K;
import { W, H } from "../shared/dims";

function decide(this: World, d) {
  const tk = this.tick, tod = this.tod(), night = this.isNight(d), hours = tod > 0.27 && tod < 0.80;
  const c = [];
  c.push(['sleep', (100 - d.energy) * 1.15 + (night ? 75 : 0) - (d.hunger > 88 ? 60 : 0)]);
  const mk = d.hunger > 35 ? this.pickMarket(d) : -1;
  if (mk >= 0 && d.coin >= this.price(d) && !(d.shortAt && this.tick - d.shortAt < 150 && d.coin < 8)) c.push(['eat', d.hunger * 1.3 - (night && d.energy < 40 ? 30 : 0) + (d.hunger > 45 && tod > 0.7 && tod < 0.95 ? 45 : 0)]);
  const broke = d.coin < FOOD_PRICE * 2;
  if (d.adult && (hours || (broke && d.hunger > 50 && !night) || (d.job === 0 && this.believedEmpty(d) && !night)) && d.energy > 20) {
    let s = d.dil * 32 + (d.coin < 30 ? 35 : 0) + (d.coin < 10 ? 30 : 0) - (d.coin > 140 ? 45 : 0);
    if (d.job === 0) { const nm = this.nearest(this.markets, d, 0), low = nm ? nm.stock : 999; s += (low < 90 ? 30 : 0) + (low < 30 ? 35 : 0) + (low > (this.season() === 2 ? 600 : 250) ? -50 : 0) + (this.believedEmpty(d) ? 30 : 0) + (low < 40 && d.coin > 60 ? 45 : 0) + (this.season() === 2 ? 20 : 0); }
    if (d.hunger > 85 && d.coin >= FOOD_PRICE && mk >= 0) s -= 60;
    c.push(['work', s]);
  }
  if (d.adult && (d.job === 1 || d.job === 3) && this.sites.length && hours && d.energy > 22) {
    const st = this.siteFor(d); if (st) c.push(['build', 38 + d.dil * 18 + (d.coin < 30 ? 28 : 0) + (d.job === 3 ? 12 : 0)]);
  }
  const fest = tk < this.festival || tk < ((this.gov(this.S[this.buildings[d.home].sid])).festival || 0), inv = d.invite && tk < d.invite.until ? d.invite : null;
  c.push(['social', (100 - d.social) * d.soc * 0.95 + (fest ? 90 : 0) + (inv && inv.k === 'social' ? 60 : 0) - (night ? 45 : 0) - (this.weather ? 30 : 0)]);
  if (d.adult && d.coin >= DRINK_PRICE * 2) c.push(['drink', (100 - d.social) * d.soc * 0.55 + (tod > 0.62 && tod < 0.92 ? 22 : -35) + (inv && inv.k === 'drink' ? 60 : 0) + (fest ? 30 : 0) + (this.weather ? 15 : 0)]);
  c.push(['wander', 18 + this.rnd() * 10]);
  let bk = 'wander', bs = -1e9;
  for (const [k, s] of c) { const v = s + (this.rnd() - 0.5) * 14; if (v > bs) { bs = v; bk = k; } }
  this.setGoal(d, bk, mk, inv);
}

function setGoal(this: World, d, k, mk, inv) {
  let g;
  switch (k) {
    case 'sleep': g = { k, b: d.home, enter: true }; break;
    case 'eat': g = { k, b: mk, enter: true }; break;
    case 'work': {
      let b = d.job === 3 ? this.nearest(this.workshops, d, 10) : this.buildings[d.work];
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
    case 'drink': {
      let b = (inv && inv.k === 'drink') ? this.buildings[inv.b] : this.nearest(this.taverns, d, 25);
      if (inv && inv.k === 'drink') d.invite = null;
      g = { k, b: b.id, enter: true }; break;
    }
    default: { const sb = this.sbl[this.buildings[d.home].sid] || [], far = this.rnd() < 0.04, b = far ? this.pick(this.parks.filter(p => Math.hypot(p.x - d.x, p.y - d.y) < 70).concat([this.buildings[d.home]])) : (sb.length ? this.pick(sb) : this.buildings[d.home]); g = { k: 'wander', b: b.id, enter: false }; }
  }
  d.goal = g; d.phase = 'walk'; d.nx = -1; d.prog = 0;
}

function believedEmpty(this: World, d) { let n = 0; for (const m of this.markets) { const b = d.belief[m.mi]; if (b >= 0 && this.tick - b < 300 && this.F(m)[d.y * W + d.x] < 160) n++; } return n; }

function pickMarket(this: World, d) {
  let best = -1, bv = 1e9;
  for (const m of this.markets) { const b = d.belief[m.mi]; if (b >= 0 && this.tick - b < 300) continue; const v = this.F(m)[d.y * W + d.x]; if (v < bv) { bv = v; best = m.id; } }
  return best;
}

Object.assign(World.prototype, { decide, setGoal, believedEmpty, pickMarket });
declare module './world' { interface World {
  decide: (...args: any[]) => any;
  setGoal: (...args: any[]) => any;
  believedEmpty: (...args: any[]) => any;
  pickMarket: (...args: any[]) => any;
} }
