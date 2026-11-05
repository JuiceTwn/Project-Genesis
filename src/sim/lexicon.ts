import { World } from './world';
import { makeField, b64, tkLess, mk } from '../shared/util';
import * as K from '../shared/constants';
import * as Gen from '../worldgen';
const { TS, YEAR_TICKS, HOUR_TICKS, KB, MEAL_UNIT, TICK_HZ, DAY_TICKS, INF, TILE, COST, BT, BT_NAME, BUILD_SHIFTS, UPKEEP, STAFF, MAXM, JOBS, FOOD_PRICE, DRINK_PRICE, STOCK_CAP, ADULT, YEAR_DAYS, SEASON_DAYS, SEASONS, YIELD, RAIN_P, CON, C, TRAITS, TRAIT_W, DREAMS, DREAM_TXT } = K;
import { W, H } from "../shared/dims";

function makeLexicon(this: World) {
  const R = this.R, used = new Set();
  const C1 = 'ptkbdgmnslrvz', V1 = 'aeiou';
  const syl = () => C1[(R() * C1.length) | 0] + V1[(R() * V1.length) | 0];
  const word = (a, b, cap) => { for (;;) { let w = ''; const n = a + ((R() * (b - a + 1)) | 0); for (let i = 0; i < n; i++) w += syl(); if (R() < 0.25) w += 'n'; if (!used.has(w)) { used.add(w); return cap ? w[0].toUpperCase() + w.slice(1) : w; } } };
  this.word = word;
  this.lex = CON.map(c => [word(1, 2, false), c[1]]);
  /* People get names you can say out loud: a chunky start, an optional link, a friendly ending ("Pimbert", "Wobkin", "Gusley", "Zedina"). Families get comic surnames. */
  const A = ['Bor', 'Mil', 'Tib', 'Gus', 'Pim', 'Wob', 'Fen', 'Dag', 'Nib', 'Hob', 'Zed', 'Lum', 'Rob', 'Pod', 'Tum', 'Bram', 'Cob', 'Fitz', 'Gil', 'Jub', 'Kip', 'Lob', 'Mab', 'Nod', 'Oz', 'Pud', 'Quill', 'Rud', 'Sib', 'Tuck', 'Ulf', 'Vic', 'Wim', 'Yor', 'Zib', 'Bix', 'Dob', 'Fob', 'Gob', 'Hap', 'Jem', 'Kor', 'Lin', 'Mog', 'Nan', 'Ob', 'Per', 'Rix', 'Sam', 'Tor', 'Wex', 'Ash', 'Bel', 'Cas', 'Del', 'Eli', 'Fay', 'Hol', 'Isa', 'Joz', 'Kel', 'Lot', 'Mar', 'Nel', 'Ora', 'Pru', 'Rue', 'Sol', 'Tam', 'Una', 'Val', 'Wyn'];
  const M = ['', '', 'a', 'i', 'o', 'e', 'ley', 'win'], E = ['by', 'o', 'bert', 'kin', 'ton', 'ley', 'sy', 'nard', 'ric', 'dy', 'la', 'ssa', 'na', 'mi', 'bo', 'pin', 'ford', 'ina', 'ie', 'us', 'a', 'el'];
  const Sx = ['Bottom', 'Crumb', 'Pudding', 'Wiggle', 'Tumble', 'Fidget', 'Gobble', 'Hogg', 'Loaf', 'Mudge', 'Nettle', 'Pickle', 'Quibble', 'Rumple', 'Snook', 'Toddle', 'Wobble', 'Thimble', 'Biscuit', 'Cobble', 'Dapple', 'Fumble', 'Grumble', 'Humble', 'Jostle', 'Kettle', 'Muddle', 'Noodle', 'Puddle', 'Ramble', 'Scuttle', 'Tinker', 'Waddle', 'Yodel'], Sy = ['', '', 'ford', 'well', 'by', 'worth', 'ton', 'ham'];
  const taken = new Set<string>(), pickOf = (a: string[]) => a[(R() * a.length) | 0];
  this.nameGen = () => { for (let i = 0; i < 40; i++) { const n = pickOf(A) + pickOf(M) + pickOf(E); if (!taken.has(n) && n.length <= 11) { taken.add(n); return n; } } return word(2, 3, true); };
  this.famGen = () => pickOf(Sx) + pickOf(Sy);
  this.names = []; for (let i = 0; i < this.pop + 10; i++) this.names.push(this.nameGen());
  for (const s of this.S) s.name = word(2, 3, true);
  for (const b of this.buildings) { if (b.type !== BT.HOUSE) b.name = b.sqPark ? this.S[b.sid].name : word(2, 2, true); else b.fam = this.famGen(); }
}

Object.assign(World.prototype, { makeLexicon });
declare module './world' { interface World {
  makeLexicon: (...args: any[]) => any;
} }
