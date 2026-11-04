import { World } from './world';
import { makeField, b64, tkLess, rollTraits, mk } from '../shared/util';
import * as K from '../shared/constants';
import * as Gen from '../worldgen';
const { TICK_HZ, DAY_TICKS, INF, TILE, COST, BT, BT_NAME, BUILD_SHIFTS, UPKEEP, STAFF, MAXM, JOBS, FOOD_PRICE, DRINK_PRICE, STOCK_CAP, ADULT, YEAR_DAYS, SEASON_DAYS, SEASONS, YIELD, RAIN_P, CON, C, TRAITS, TRAIT_W, DREAMS, DREAM_TXT } = K;
import { W, H } from "../shared/dims";

function makeLexicon(this: World) {
  const R = this.R, used = new Set();
  const C1 = 'ptkbdgmnslrvz', V1 = 'aeiou';
  const syl = () => C1[(R() * C1.length) | 0] + V1[(R() * V1.length) | 0];
  const word = (a, b, cap) => { for (;;) { let w = ''; const n = a + ((R() * (b - a + 1)) | 0); for (let i = 0; i < n; i++) w += syl(); if (R() < 0.25) w += 'n'; if (!used.has(w)) { used.add(w); return cap ? w[0].toUpperCase() + w.slice(1) : w; } } };
  this.word = word;
  this.lex = CON.map(c => [word(1, 2, false), c[1]]);
  this.nameGen = () => word(2, 3, true);
  this.names = []; for (let i = 0; i < this.pop + 10; i++) this.names.push(this.nameGen());
  for (const s of this.S) s.name = word(2, 3, true);
  for (const b of this.buildings) { if (b.type !== BT.HOUSE) b.name = b.sqPark ? this.S[b.sid].name : word(2, 2, true); else b.fam = word(2, 3, true); }
  this.famGen = () => word(2, 3, true);
}

Object.assign(World.prototype, { makeLexicon });
declare module './world' { interface World {
  makeLexicon: (...args: any[]) => any;
} }
