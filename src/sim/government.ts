/* Government: every settlement has its own mayor, tax rate, treasury and elections. A small national
   treasury takes a cut of local taxes and pays for bridges and emergency grants to towns in trouble. */
import { World } from './world';
import * as K from '../shared/constants';
import type { Dot } from '../shared/types';
const { BT, MAXM, STOCK_CAP, TILE, C } = K;

export interface Gov { mayor: number; treasury: number; tax: number; next: number; festival: number }
export const NATION_CUT = 0.15;          // share of local taxes remitted to the national treasury
export const ELECTION_DAYS = 6;
export const BENEFIT = 4;                // daily unemployment benefit for jobless adults who are short of cash

/** Rough yearly-budget scale for a town: spending thresholds are multiples of this, so a hamlet and the capital behave alike. */
export function reserve(P: number): number { return Math.max(60, P * 12); }

function gov(this: World, s: any): Gov { return s.gov || (s.gov = { mayor: -1, treasury: 0, tax: 5, next: 7, festival: 0 }); }

/** Townspeople of a settlement (alive adults, by home). */
function townAdults(this: World, sid: number): Dot[] { return this.dots.filter(d => !d.dead && d.adult && this.buildings[d.home].sid === sid); }

function isMayor(this: World, id: number): boolean { return this.S.some(s => s.gov && s.gov.mayor === id); }

function election(this: World, s: any, first?: boolean, exclude?: number) {
  const g = this.gov(s);
  const adults = this.townAdults(s.id).filter(d => d.id !== exclude);
  if (!adults.length) { g.mayor = -1; return; }
  const cands = adults.slice().sort((a, b) => this.rep[b.id] - this.rep[a.id]).slice(0, 3);
  const votes = new Map(cands.map(c => [c.id, 0]));
  for (const v of adults) {
    let bc = cands[0], bs = -1e9;
    for (const c of cands) { const sc = (v.aff.get(c.id) || 0) + this.rnd() * 25 + (v.thieves.has(c.id) ? -60 : 0); if (sc > bs) { bs = sc; bc = c; } }
    votes.set(bc.id, votes.get(bc.id) + 1);
  }
  const win = cands.slice().sort((a, b) => votes.get(b.id) - votes.get(a.id))[0], re = win.id === g.mayor;
  g.mayor = win.id; g.tax = win.traits.includes('ambitious') ? 8 : win.traits.includes('kind') ? 3 : 5; g.next = this.day() + ELECTION_DAYS;
  if (!first && cands.length > 1) {
    this.ev('elect' + s.id, `🗳️ ${s.name} votes! ${cands.map(c => `${c.name} (${votes.get(c.id)})`).join(' vs ')} — ${win.name} ${re ? 'is re-elected' : 'wins'} as mayor. Tax: ${g.tax}/day.`, [win.id], 0, 4);
    this.say(win, [C.ME, C.HAPPY]);
  }
}
function electAll(this: World, first?: boolean) { this.computeRep(); for (const s of this.S) this.election(s, first); }

/** Collect local taxes at dawn; the nation takes its cut. */
function collectTaxes(this: World) {
  for (const d of this.dots) {
    if (d.dead || !d.adult) continue;
    const g = this.gov(this.S[this.buildings[d.home].sid]), pay = Math.min(d.coin, g.tax);
    d.coin -= pay; g.treasury += pay * (1 - NATION_CUT); this.nation.treasury += pay * NATION_CUT;
    if (d.job === 3 && d.work < 0 && d.coin < 40 && g.treasury >= BENEFIT) { d.coin += BENEFIT; g.treasury -= BENEFIT; this.biz.benefits++; }   // unemployment benefit
  }
}

function civicBuild(this: World, s: any, m: Dot) {
  if (this.sites.length >= 6) return false;
  const g = this.gov(s), P = this.sPop[s.id] || 0, has = (t: number) => this.sbl[s.id].some(b => b.type === t) || this.sites.some(b => b.sid === s.id && b.type === t);
  if (s.tier <= 2 && P >= 16 && !has(BT.MARKET) && this.mcount < MAXM && g.treasury >= 160) {
    const p = this.plotFor(s, 'center'); if (p) { g.treasury -= 110; this.startBuild(p, BT.MARKET, -1, 110); this.ev('civic', `🏛️ Mayor ${m.name} funds a public market for ${s.name}.`, [m.id], 0, 3); return true; }
  }
  if (s.tier <= 1 && !has(BT.HALL) && g.treasury >= 300) {
    const p = this.plotFor(s, 'center'); if (p) { g.treasury -= 150; this.startBuild(p, BT.HALL, -1, 150); this.ev('civic', `🏛️ Mayor ${m.name} commissions a town hall for ${s.name}.`, [m.id], 0, 3); return true; }
  }
  return false;
}

/** One settlement's daily council business. */
function mayorDawn(this: World, s: any) {
  const g = this.gov(s);
  if (g.mayor >= 0 && this.dots[g.mayor].dead) this.election(s);
  const m = this.dots[g.mayor]; if (!m) { if (this.day() >= g.next) this.election(s); return; }
  const P = this.sPop[s.id] || 1, R = reserve(P), local = this.sbl[s.id] || [];

  // emergency grain for the town's emptiest market
  const mk = local.filter(b => b.type === BT.MARKET);
  const low = mk.length ? mk.reduce((a, b) => (a.stock < b.stock ? a : b)) : null;
  if (low && low.stock < 150 && g.treasury >= R * 0.25) {
    const spend = this.toAbroad(g, 'treasury', Math.min(Math.round(R * 0.7), Math.floor(g.treasury)), 'imports'); low.stock = Math.min(STOCK_CAP, low.stock + Math.round(spend * 1.6));   // emergency grain is imported
    this.ev('grain' + s.id, `🏛️ Mayor ${m.name} spent ${spend} coins on emergency grain for ${low.name} Market.`, [m.id], 0, 3);
  }
  // relief payments
  if (g.treasury > R) {
    const poor = this.townAdults(s.id).filter(o => o.id !== m.id).sort((a, b) => a.coin - b.coin).slice(0, Math.max(3, Math.round(P * 0.12)));
    for (const o of poor) { o.coin += 12; g.treasury -= 12; this.addAff(o, m, 3); }
    if (poor.length) this.ev('welfare' + s.id, `🏛️ Mayor ${m.name} handed relief payments to the ${poor.length} poorest households of ${s.name}.`, [m.id], 0, 2);
  }
  // a town feast
  if (g.treasury > R * 2.2) { g.treasury -= R * 0.6; this.spendLocal(s.id, R * 0.6); g.festival = this.tick + 5 * 50; this.ev('feast' + s.id, `🎪 Mayor ${m.name} funded a feast in ${s.name}!`, [m.id], 0, 3); }
  // public works, then grander projects
  if (g.treasury > R * 0.6 && this.civicBuild(s, m)) { /* real public works */ }
  else if (g.treasury > R * 3) {
    const what = this.pick(['a new well', 'a clock tower', 'a town library', 'a bigger granary', 'a fountain in the square']), cost = Math.round(g.treasury * 0.5); g.treasury -= cost; this.spendLocal(s.id, cost);
    this.ev('project' + s.id, `🏗️ Mayor ${m.name} funded ${what} in ${s.name} (${cost} coins).`, [m.id], 0, 3);
    for (const o of this.townAdults(s.id)) if (this.rnd() < 0.5) o.aff.set(m.id, Math.min(100, (o.aff.get(m.id) || 0) + 4));
  }
  // corruption
  if (m.isThief && g.treasury > 80 && this.rnd() < 0.3) {
    const cut = Math.round(g.treasury * 0.4); g.treasury -= cut; m.coin += cut;
    this.ev('scandal' + s.id, `📰 SCANDAL: Mayor ${m.name} of ${s.name} skimmed ${cut} coins from the treasury!`, [m.id], 0, 4);
    for (const o of this.townAdults(s.id)) if (o.id !== m.id && this.rnd() < 0.5) o.aff.set(m.id, (o.aff.get(m.id) || 0) - 25);
    this.election(s, false, m.id); return;
  }
  // taxes follow the treasury
  if (g.treasury > R * 3.5 && g.tax > 1) { g.tax--; this.ev('tax' + s.id, `📉 Mayor ${m.name} cut ${s.name}'s tax to ${g.tax}/day.`, [m.id], 0, 2); }
  else if (g.treasury < R * 0.15 && g.tax < 12) { g.tax++; this.ev('tax' + s.id, `📈 Mayor ${m.name} raised ${s.name}'s tax to ${g.tax}/day.`, [m.id], 0, 2); }
  if (this.day() >= g.next) this.election(s);
}

/** The national treasury: bridges, and grants to towns that have run dry. */
function nationDawn(this: World) {
  const n = this.nation;
  for (const s of this.S) {   // regional grant for a struggling town with empty markets
    const g = this.gov(s), P = this.sPop[s.id] || 0, R = reserve(P);
    if (P >= 12 && g.treasury < R * 0.1) {
      const mk = (this.sbl[s.id] || []).filter(b => b.type === BT.MARKET);
      if (mk.some(b => b.stock < 60)) { const grant = Math.round(R * 0.6); if (n.treasury < grant) this.mint(grant - n.treasury, `regional grant to ${s.name}`); n.treasury -= grant; g.treasury += grant; this.ev('grant' + s.id, `🏦 The national government granted ${s.name} ${grant} coins after its markets ran low.`, [], 0, 3); break; }
    }
  }
  if (n.treasury > 2500 && this.tick - (this.lastEv.bridge || -1e9) > 3 * K.DAY_TICKS) {
    const fords: number[] = []; for (let i = 0; i < this.tiles.length; i++) if (this.tiles[i] === TILE.FORD) fords.push(i);
    if (fords.length) { const i = this.pick(fords); this.tiles[i] = TILE.BRIDGE; n.treasury -= 800; { const towns = this.S.filter(t => (this.sPop[t.id] || 0) > 0); if (towns.length) this.spendLocal(this.pick(towns).id, 800); else n.treasury += 800; } this.fgen++; this.pushTiles([i]); this.ev('bridge', `🌉 The national highway agency replaced a river ford with a stone bridge.`, [], 0, 3); }
  }
}

/** Sum of all local treasuries (for stats). */
function townTreasury(this: World): number { let t = 0; for (const s of this.S) t += s.gov ? s.gov.treasury : 0; return t; }

Object.assign(World.prototype, { gov, townAdults, isMayor, election, electAll, collectTaxes, civicBuild, mayorDawn, nationDawn, townTreasury });
declare module './world' { interface World {
  gov: typeof gov; townAdults: typeof townAdults; isMayor: typeof isMayor; election: typeof election; electAll: typeof electAll;
  collectTaxes: typeof collectTaxes; civicBuild: typeof civicBuild; mayorDawn: typeof mayorDawn; nationDawn: typeof nationDawn; townTreasury: typeof townTreasury;
} }
