/* Companies and brands as entities. A brand is a name people know, with a quality, a price level, an awareness (how many have heard of it), a reputation
   and a set of branches (store buildings). Customers choose a store by distance, quality, price, awareness and what their friends recommend, so a
   newcomer can overtake an incumbent: incumbents drift (complacency, scandals, price wars) unless they keep investing. Money still lives in the
   building tills; a brand only decides who gets the customers. Advertising is paid out of a branch's cash to outside agencies (conserved). */
import { World } from './world';
import * as K from '../shared/constants';
import { W } from '../shared/dims';
const { BT, KB } = K;

export interface Brand {
  id: number; name: string; founder: number; born: number; quality: number; price: number; awareness: number; rep: number;
  branches: number; peak: number; dead: boolean; diedAt: number; ads: number; sales: number; origin: number;
}

const A = ['Golden', 'Blue', 'Maple', 'Copper', 'Little', 'Grand', 'Happy', 'Fresh', 'Lucky', 'Old', 'Bright', 'Quick', 'Honest', 'Royal', 'Sunny', 'Northern', 'Silver', 'Cosy'];
const B = ['Basket', 'Mart', 'Goods', 'Corner', 'Emporium', 'Bazaar', 'Stores', 'Trading', 'Pantry', 'Outfitters', 'Supply', 'Shop', 'Wares', 'Depot'];

function brandName(this: World, founder): string {
  const used = new Set(this.brands.filter(b => !b.dead).map(b => b.name));
  for (let i = 0; i < 20; i++) {
    const n = this.rnd() < 0.4 ? `${founder.name.split(' ').slice(-1)[0]}'s ${this.pick(B)}` : `${this.pick(A)} ${this.pick(B)}`;
    if (!used.has(n)) return n;
  }
  return `${this.pick(A)} ${this.pick(B)} ${this.brands.length}`;
}

/** Make a new brand run by `founder`. */
function newBrand(this: World, founder, sid: number): Brand {
  const b: Brand = { id: this.brands.length, name: this.brandName(founder), founder: founder.id, born: this.tick, quality: 0.3 + this.rnd() * 0.5, price: 0.9 + this.rnd() * 0.3,
    awareness: 0.03, rep: 0, branches: 0, peak: 0, dead: false, diedAt: -1, ads: 0, sales: 0, origin: sid };
  this.brands.push(b); return b;
}

/** The brands' branches that are open for business. */
function branchesOf(this: World, id: number) { return this.stores.filter(b => b.brand === id && b.state === 'ok'); }

/** Pick a store to shop at: closer, better, cheaper, better known and recommended stores win. Returns a building or null. */
function pickStore(this: World, d) {
  let best = null, bv = -1e9;
  for (const b of this.stores) {
    if (b.state !== 'ok') continue;
    const dist = this.F(b)[d.y * W + d.x]; if (dist >= K.INF) continue;
    const br = b.brand !== undefined && b.brand >= 0 ? this.brands[b.brand] : null;
    const appeal = br ? 1.4 * br.quality + 0.9 * br.awareness - 1.3 * (br.price - 1) + (d.fav === br.id ? 0.55 : 0) + 0.3 * br.rep : 0.3;
    const v = appeal * 40 - dist + this.rnd() * 8;
    if (v > bv) { bv = v; best = b; }
  }
  return best;
}

/** After a purchase: the customer notes whether they were satisfied and may start recommending the brand. */
function brandSale(this: World, d, b, amt: number) {
  const br = b.brand !== undefined && b.brand >= 0 ? this.brands[b.brand] : null; if (!br) return;
  br.sales += amt; br.awareness = Math.min(1, br.awareness + 0.002);
  if (br.quality + this.rnd() * 0.4 - br.price * 0.4 > 0.5) d.fav = br.id; else if (d.fav === br.id) d.fav = -1;
}

/** Called when two people chat: a happy customer talks the other round. */
function wordOfMouth(this: World, a, b) {
  for (const [s, t] of [[a, b], [b, a]]) {
    if (s.fav === undefined || s.fav < 0 || this.rnd() > 0.2) continue;
    const br = this.brands[s.fav]; if (!br || br.dead) continue;
    br.awareness = Math.min(1, br.awareness + 0.004); if (t.fav === undefined || t.fav < 0) t.fav = s.fav;
  }
}

/** At dawn: assign brands to new stores, run advertising, drift quality, set prices, roll scandals, retire dead brands. */
function brandDawn(this: World) {
  for (const b of this.stores) {   // a new store with an owner joins one of the owner's brands (a branch) or founds its own
    if (b.state !== 'ok' || b.owner < 0 || (b.brand !== undefined && b.brand >= 0 && !this.brands[b.brand].dead)) continue;
    const o = this.dots[b.owner]; if (!o || o.dead) continue;
    const mine = this.stores.find(x => x !== b && x.state === 'ok' && x.owner === o.id && x.brand >= 0 && !this.brands[x.brand].dead);
    if (mine) { b.brand = mine.brand; this.ev('branch', `🏪 ${this.brands[b.brand].name} opened a new branch in ${this.S[b.sid].name}.`, [o.id], 0, 2); }
    else { const br = this.newBrand(o, b.sid); b.brand = br.id; b.name = br.name; this.ev('brand', `✨ ${o.name} launched a new store brand, ${br.name}, in ${this.S[b.sid].name}.`, [o.id], 0, 3); }
  }
  for (const br of this.brands) {
    if (br.dead) continue;
    const bs = this.branchesOf(br.id); br.branches = bs.length;
    if (!bs.length) { br.dead = true; br.diedAt = this.tick; if (br.peak > 0.25) this.ev('brandgone', `🪦 ${br.name}, once known to ${Math.round(br.peak * 100)}% of the country, has closed its last shop.`, [br.founder], 0, 4); continue; }
    const profit = bs.reduce((a, x) => a + (x.hist.length ? x.hist[x.hist.length - 1] : 0), 0);
    br.awareness = Math.max(0.01, br.awareness * 0.992);   // people forget
    // advertising: a profitable branch with spare cash buys a campaign from outside agencies
    for (const x of bs) if (x.cash > 60 * KB && profit > 0) { const spend = Math.min(x.cash * 0.04, 8 * KB), paid = this.toAbroad(x, 'cash', spend, 'advertising'); br.ads += paid; br.awareness = Math.min(1, br.awareness + 0.02 * paid / (4 * KB)); }
    // quality: reinvestment lifts it, losses and a long lead (complacency) erode it
    br.quality = Math.max(0.05, Math.min(1, br.quality + (profit > 0 ? 0.0015 : -0.002) - (br.awareness > 0.6 ? 0.0015 : 0) + (this.rnd() - 0.5) * 0.004));
    // price war: a brand losing money cuts price; a comfortable one creeps it up
    br.price = Math.max(0.75, Math.min(1.4, br.price + (profit < 0 ? -0.006 : 0.002)));
    br.rep = br.rep * 0.98 + (br.quality - 0.5) * 0.02;
    br.peak = Math.max(br.peak, br.awareness);
    if (br.awareness > 0.35 && this.rnd() < 0.002) {   // a scandal: the better known you are, the more it hurts
      br.rep -= 0.4; br.awareness *= 0.85; br.quality = Math.max(0.05, br.quality - 0.08);
      this.ev('scandal', `📰 Scandal at ${br.name}: ${this.pick(['rotten goods on the shelves', 'a staff wage row', 'prices quietly raised', 'a customer injured', 'fake discounts exposed'])}.`, [br.founder], 0, 4);
    }
  }
}

/** A store changes hands: when the buyer already runs a brand the shop joins it (an acquisition). */
function brandAcquired(this: World, b, seller, buyer) {
  if (b.type !== BT.STORE || b.brand === undefined || b.brand < 0) return;
  const mine = this.stores.find(x => x !== b && x.state === 'ok' && x.owner === buyer.id && x.brand >= 0 && x.brand !== b.brand && !this.brands[x.brand].dead);
  if (!mine) return;
  const old = this.brands[b.brand], to = this.brands[mine.brand];
  this.ev('acquire', `🤝 ${to.name} acquired ${old.name} in ${this.S[b.sid].name}: the shop now trades under the ${to.name} name.`, [seller.id, buyer.id], 0, 4);
  b.brand = mine.brand;
}

/** Gazette lines: the leading brands and the biggest movers. */
function brandLines(this: World): string[] {
  const live = this.brands.filter(b => !b.dead).sort((a, b) => b.awareness * (1 + b.branches) - a.awareness * (1 + a.branches)).slice(0, 3);
  return live.map(b => `${b.name}: ${b.branches} shop${b.branches === 1 ? '' : 's'}, known to ${Math.round(b.awareness * 100)}%, quality ${Math.round(b.quality * 100)}, prices ${b.price >= 1 ? '+' : ''}${Math.round((b.price - 1) * 100)}%.`);
}

Object.assign(World.prototype, { brandName, newBrand, branchesOf, pickStore, brandSale, wordOfMouth, brandDawn, brandAcquired, brandLines });
declare module './world' { interface World { brandName: typeof brandName; newBrand: typeof newBrand; branchesOf: typeof branchesOf; pickStore: typeof pickStore; brandSale: typeof brandSale; wordOfMouth: typeof wordOfMouth; brandDawn: typeof brandDawn; brandAcquired: typeof brandAcquired; brandLines: typeof brandLines } }
