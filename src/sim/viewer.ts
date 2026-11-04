import { World } from './world';
import { makeField, b64, tkLess, rollTraits, mk } from '../shared/util';
import * as K from '../shared/constants';
import * as Gen from '../worldgen';
const { TICK_HZ, DAY_TICKS, INF, TILE, COST, BT, BT_NAME, BUILD_SHIFTS, UPKEEP, STAFF, MAXM, JOBS, FOOD_PRICE, DRINK_PRICE, STOCK_CAP, ADULT, YEAR_DAYS, SEASON_DAYS, SEASONS, YIELD, RAIN_P, CON, C, TRAITS, TRAIT_W, DREAMS, DREAM_TXT } = K;
import { W, H } from "../shared/dims";

function act(this: World, name, id) {
  const tk = this.tick, CD = 100;
  if (name === 'festival' && tk - this.cd.festival > 5 * 45) { this.cd.festival = tk; this.festival = tk + 5 * 60; this.ev('fest', '🎉 A viewer declared a festival! Everyone heads to the parks.', [], 0, 2); return true; }
  if (name === 'blight' && tk - this.cd.blight > 5 * 45) { this.cd.blight = tk; this.blightAt = tk; this.blight = tk + 5 * 40; this.ev('blight', '🥀 Blight strikes the fields. Farms produce nothing!', [], 0, 2); return true; }
  if (name === 'gift' || name === 'zap' || name === 'cupid') {
    const d = this.dots[id]; if (!d || d.dead || tk - this.cd[name] < CD) return false;
    if (name === 'gift') { d.coin += 30; this.ledger.minted += 30; this.say(d, [C.THANKS]); this.ev('gift', `🎁 A viewer gifted ${d.name} 30 coins.`, [d.id], 0, 2); }
    else if (name === 'zap') { d.energy = 3; this.say(d, [C.AFRAID]); this.ev('zap', `⚡ A viewer zapped ${d.name}! They're completely drained.`, [d.id], 0, 3); }
    else {
      if (!d.adult || d.partner >= 0) return false;
      let best = null, bv = 1e9;
      for (const o of this.dots) { if (o === d || o.dead || !o.adult || o.partner >= 0 || o.home === d.home || o.fam === d.fam) continue; const v = (o.x - d.x) ** 2 + (o.y - d.y) ** 2; if (v < bv) { bv = v; best = o; } }
      if (!best) return false;
      d.aff.set(best.id, Math.max(50, d.aff.get(best.id) || 0)); best.aff.set(d.id, Math.max(50, best.aff.get(d.id) || 0));
      const park = this.nearest(this.parks, d, 10), inv = { k: 'social', b: park.id, until: tk + 400 }; d.invite = inv; best.invite = Object.assign({}, inv);
      d.rejectCd = 0; best.rejectCd = 0;
      this.ev('cupid', `💘 A viewer's cupid arrow hits ${d.name} and ${best.name}…`, [d.id, best.id], 0, 3);
    }
    this.cd[name] = tk; return true;
  }
  return false;
}

Object.assign(World.prototype, { act });
declare module './world' { interface World {
  act: (...args: any[]) => any;
} }
