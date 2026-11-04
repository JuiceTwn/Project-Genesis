import { World } from './world';
import { makeField, b64, tkLess, rollTraits, mk } from '../shared/util';
import * as K from '../shared/constants';
import * as Gen from '../worldgen';
const { TICK_HZ, DAY_TICKS, INF, TILE, COST, BT, BT_NAME, BUILD_SHIFTS, UPKEEP, STAFF, MAXM, JOBS, FOOD_PRICE, DRINK_PRICE, STOCK_CAP, ADULT, YEAR_DAYS, SEASON_DAYS, SEASONS, YIELD, RAIN_P, CON, C, TRAITS, TRAIT_W, DREAMS, DREAM_TXT } = K;
import { W, H } from "../shared/dims";

function civicBuild(this: World, m) {
  if (this.sites.length >= 6) return false;
  for (const s of this.S) {
    const P = this.sPop[s.id] || 0, has = t => this.sbl[s.id].some(b => b.type === t) || this.sites.some(b => b.sid === s.id && b.type === t);
    if (s.tier <= 2 && P >= 16 && !has(BT.MARKET) && this.mcount < MAXM && this.treasury >= 160) { const p = this.plotFor(s, 'center'); if (p) { this.treasury -= 110; this.startBuild(p, BT.MARKET, -1, 110); this.ev('civic', `🏛️ Mayor ${m.name} funds a public market for ${s.name}.`, [m.id], 0, 3); return true; } }
    if (s.tier <= 1 && !has(BT.HALL) && this.treasury >= 300) { const p = this.plotFor(s, 'center'); if (p) { this.treasury -= 150; this.startBuild(p, BT.HALL, -1, 150); this.ev('civic', `🏛️ Mayor ${m.name} commissions a town hall for ${s.name}.`, [m.id], 0, 3); return true; } }
  }
  if (this.treasury > 900) { const fords = []; for (let i = 0; i < this.tiles.length; i++) if (this.tiles[i] === TILE.FORD) fords.push(i); if (fords.length) { const i = this.pick(fords); this.tiles[i] = TILE.BRIDGE; this.treasury -= 200; this.fgen++; this.pushTiles([i]); this.ev('bridge', `🌉 Mayor ${m.name} replaced a river ford with a stone bridge.`, [m.id], 0, 3); return true; } }
  return false;
}

function election(this: World, first, exclude) {
  this.computeRep();
  const adults = this.dots.filter(d => !d.dead && d.adult && d.id !== exclude);
  const cands = adults.slice().sort((a, b) => this.rep[b.id] - this.rep[a.id]).slice(0, 3);
  if (!cands.length) return;
  const votes = new Map(cands.map(c => [c.id, 0]));
  for (const v of adults) {
    let bc = cands[0], bs = -1e9;
    for (const c of cands) { const sc = (v.aff.get(c.id) || 0) + this.rnd() * 25 + (v.thieves.has(c.id) ? -60 : 0); if (sc > bs) { bs = sc; bc = c; } }
    votes.set(bc.id, votes.get(bc.id) + 1);
  }
  const win = cands.slice().sort((a, b) => votes.get(b.id) - votes.get(a.id))[0], re = win.id === this.mayor;
  this.mayor = win.id; this.taxRate = win.traits.includes('ambitious') ? 8 : win.traits.includes('kind') ? 3 : 5; this.nextElection = this.day() + 6;
  if (!first) { this.ev('elect', `🗳️ Election! ${cands.map(c => `${c.name} (${votes.get(c.id)})`).join(' vs ')} — ${win.name} ${re ? 'is re-elected' : 'wins'} as mayor. Tax: ${this.taxRate}/day.`, [win.id], 0, 4); this.say(win, [C.ME, C.HAPPY]); }
}

function mayorDawn(this: World) {
  if (this.mayor >= 0 && this.dots[this.mayor].dead) { this.election(); return; }
  const m = this.dots[this.mayor]; if (!m) return;
  const low = this.markets.reduce((a, b) => (a.stock < b.stock ? a : b));
  if (low.stock < 150 && this.treasury >= 100) {
    const spend = Math.min(300, Math.floor(this.treasury)); this.treasury -= spend; low.stock = Math.min(STOCK_CAP, low.stock + Math.round(spend * 1.6));
    this.ev('grain', `🏛️ Mayor ${m.name} spent ${spend} coins on emergency grain for ${low.name} Market.`, [m.id], 0, 3);
  }
  if (this.treasury > 400) {
    const poor = this.dots.filter(o => !o.dead && o.adult && o.id !== m.id).sort((a, b) => a.coin - b.coin).slice(0, 50);
    for (const o of poor) { o.coin += 12; this.treasury -= 12; this.addAff(o, m, 3); }
    this.ev('welfare', `🏛️ Mayor ${m.name} handed relief payments to the ${poor.length} poorest households.`, [m.id], 0, 2);
  }
  if (this.treasury > 900) { this.treasury -= 250; this.festival = this.tick + 5 * 50; this.ev('feast', `🎪 Mayor ${m.name} funded a town feast!`, [m.id], 0, 3); }
  if (this.treasury > 250 && this.civicBuild(m)) { /* real public works */ }
  else if (this.treasury > 1200) {
    const what = this.pick(['a new well', 'a clock tower', 'a town library', 'a bigger granary', 'a fountain in the square']);
    const cost = Math.round(this.treasury * 0.6); this.treasury -= cost;
    this.ev('project', `🏗️ Mayor ${m.name} funded ${what} (${cost} coins).`, [m.id], 0, 3);
    for (const o of this.dots) if (!o.dead && o.adult && this.rnd() < 0.5) o.aff.set(m.id, Math.min(100, (o.aff.get(m.id) || 0) + 4));
  }
  if (m.isThief && this.treasury > 80 && this.rnd() < 0.3) {
    const cut = Math.round(this.treasury * 0.4); this.treasury -= cut; m.coin += cut;
    this.ev('scandal', `📰 SCANDAL: Mayor ${m.name} skimmed ${cut} coins from the treasury!`, [m.id], 0, 4);
    for (const o of this.dots) if (!o.dead && o.adult && o.id !== m.id && this.rnd() < 0.5) o.aff.set(m.id, (o.aff.get(m.id) || 0) - 25);
    this.election(false, m.id); return;
  }
  if (this.treasury > 1500 && this.taxRate > 1) { this.taxRate--; this.ev('tax', `📉 Mayor ${m.name} cut the tax to ${this.taxRate}/day.`, [m.id], 0, 2); }
  else if (this.treasury < 80 && this.taxRate < 12) { this.taxRate++; this.ev('tax', `📈 Mayor ${m.name} raised the tax to ${this.taxRate}/day.`, [m.id], 0, 2); }
  if (this.day() >= this.nextElection) this.election();
}

Object.assign(World.prototype, { civicBuild, election, mayorDawn });
declare module './world' { interface World {
  civicBuild: (...args: any[]) => any;
  election: (...args: any[]) => any;
  mayorDawn: (...args: any[]) => any;
} }
