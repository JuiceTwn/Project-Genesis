import { World } from './world';
import { rollTraits } from './personality';
import { makeField, b64, tkLess, mk } from '../shared/util';
import * as K from '../shared/constants';
import * as Gen from '../worldgen';
const { TS, YEAR_TICKS, HOUR_TICKS, KB, MEAL_UNIT, TICK_HZ, DAY_TICKS, INF, TILE, COST, BT, BT_NAME, BUILD_SHIFTS, UPKEEP, STAFF, MAXM, JOBS, FOOD_PRICE, DRINK_PRICE, STOCK_CAP, ADULT, YEAR_DAYS, SEASON_DAYS, SEASONS, YIELD, RAIN_P, CON, C, TRAITS, TRAIT_W, DREAMS, DREAM_TXT } = K;
import { W, H } from "../shared/dims";

function economyDawn(this: World) {
  this.sPop = []; for (const d of this.dots) if (!d.dead) { const sid = this.buildings[d.home].sid; this.sPop[sid] = (this.sPop[sid] || 0) + 1; }
  this.settle(); this.hire(); this.disasters(); this.housing(); this.entrepreneurs(); this.sales(); this.immigration(); this.vacancies();
}

/** Pay a shift's wage out of the employer's pocket. Returns what the worker actually received.
    A private firm that cannot cover payroll misses it; after three missed shifts in a row the worker quits.
    Publicly run buildings are paid for by the town treasury (and, when that is dry, the wage is still honoured). */
/** Taxes come out of every paycheque: a local income tax set by the mayor and a national one. Returns the take-home pay. */
function withhold(this: World, b, w: number): number {
  const g = this.gov(this.S[b.sid]), local = w * g.tax / 100, nat = w * K.NATION_TAX;
  g.treasury += local; this.nation.treasury += nat; this.stats.taxLocal = (this.stats.taxLocal || 0) + local; this.stats.taxNation = (this.stats.taxNation || 0) + nat; return w - local - nat;
}

/** Wholesale imports: a market that runs low orders grain from abroad. It pays from its own till, else the town treasury, else the national
    treasury (a strategic reserve), so a remote village can never simply run dry while its people hold money. Runs four times a day. */
function restockMarkets(this: World) {
  for (const b of this.buildings) {
    if (b.state !== 'ok' || b.type !== BT.MARKET || b.stock >= 80) continue;
    const qty = Math.min(STOCK_CAP - b.stock, 160), cost = qty * MEAL_UNIT, [o, k] = this.till(b);
    let paid = this.toAbroad(o, k, cost, 'imports');
    if (paid < cost) paid += this.toAbroad(this.gov(this.S[b.sid]), 'treasury', cost - paid, 'imports');
    if (paid < cost) paid += this.toAbroad(this.nation, 'treasury', cost - paid, 'imports');
    b.stock += Math.round(paid / MEAL_UNIT); this.checkStock(b);
  }
}

function payWage(this: World, b, d, w: number): number {
  if (b.state !== 'ok' || !this.isBiz(b)) return 0;   // nobody pays wages out of thin air: site crews are paid from escrow (buildStep), a closed workplace pays nothing
  const [o, k] = this.till(b);
  if (o[k] >= w) { o[k] -= w; b.wage += w; d.unpaid = 0; return this.withhold(b, w); }
  const frac = w / (K.WAGE[b.type] || K.DAY_WAGE); d.unpaid = (d.unpaid || 0) + frac; this.biz.unpaid += frac;
  this.ev('unpaid' + b.id, `💸 ${b.name} ${this.kindName(b)} in ${this.S[b.sid].name} missed payroll — ${d.name} went home unpaid.`, [d.id, b.owner], 2 * DAY_TICKS, 2);
  if (d.unpaid >= 3 && d.job !== 3 && d.work === b.id) {
    d.job = 3; d.work = -1; d.unpaid = 0; b.staff = Math.max(0, (b.staff || 1) - 1); this.biz.quit++;
    this.ev('quit', `🚪 ${d.name} quit ${b.name} ${this.kindName(b)} after weeks of missed pay.`, [d.id], 3 * DAY_TICKS, 3); this.say(d, [C.ME, C.ANGRY]);
  }
  return 0;
}

function settle(this: World) {
  for (const b of this.buildings) {
    if (b.state !== 'ok' || !this.isBiz(b)) continue;
    const town = this.S[b.sid];
    if (b.type === BT.DOCK && this.rnd() < 0.45) {                       // a ship comes in: foreign trade pays the dock, and sometimes brings grain
      this.exportIn(b, Math.round((40 + this.rnd() * 70 * (town.trade + 0.5)) * KB));
      const mk = this.sbl[b.sid].find(x => x.type === BT.MARKET);
      if (mk && mk.stock < 300 && this.rnd() < 0.6) {
        const q = 70 + ((this.rnd() * 90) | 0), [mo, mkey] = this.till(mk); this.toAbroad(mo, mkey, q * 1.2 * MEAL_UNIT, 'imports');   // the market pays the importer what it can
        mk.stock = Math.min(STOCK_CAP, mk.stock + q); this.ev('ship', `⚓ A trading ship docked at ${town.name} and unloaded ${q} sacks of grain at ${b.name} Dock.`, [], 30, 2);
      }
    }
    const up = UPKEEP[b.type], [to, tk] = this.till(b);
    if (b.owner < 0) { this.toAbroad(to, tk, up, 'upkeep'); b.rev = 0; b.wage = 0; b.cost = 0; b.visits = 0; continue; }   // public building: the town pays the bills
    const o = this.dots[b.owner]; if (!o || o.dead) { b.owner = -1; this.liquidate(b); continue; }
    // utilities and supplies are bought from outside; unpaid bills accumulate as debt (debt is not money)
    b.debt = (b.debt || 0) + up; b.debt -= this.toAbroad(b, 'cash', b.debt, 'upkeep');
    const profit = b.rev - (b.cost || 0) - up - b.wage;
    b.hist.push(Math.round(profit)); if (b.hist.length > 6) b.hist.shift();
    if (b.cash > 70 * KB) { const dv = Math.round((b.cash - 40 * KB) * 0.6); b.cash -= dv; o.coin += dv; }                          // dividends
    if ((b.debt || 0) > 25 * KB && o.coin > 45 * KB) { const inj = Math.min(40 * KB, o.coin - 20 * KB); o.coin -= inj; b.cash += inj; }         // the owner bails the firm out
    const young = this.tick - b.born < 3 * DAY_TICKS, v = b.visits; b.rev = 0; b.wage = 0; b.cost = 0; b.visits = 0;
    if ((b.debt || 0) > 80 * KB && !young) this.fail(b, v);
  }
}

function fail(this: World, b, visits) {
  const o = this.dots[b.owner], s = this.S[b.sid], rivals = this.sbl[b.sid].filter(x => x !== b && x.type === b.type).length;
  const why = b.type === BT.FARM && this.tick - this.blightAt < 4 * DAY_TICKS ? 'the blight wrecked the harvest' : (b.type === BT.FARM || b.type === BT.WORKSHOP || b.type === BT.TAVERN) && (b.staff || 0) === 0 ? 'nobody was working there' : rivals >= 2 ? 'too many rivals in town' : visits < 4 ? 'hardly any customers' : o.traits.includes('lazy') ? 'the owner never kept it up' : 'costs outran takings';
  this.ev('bankrupt', `📉 ${o.name}'s ${this.kindName(b).toLowerCase()} ${b.name} in ${s.name} went bankrupt — ${why}.`, [o.id], 0, 4);
  { const fee = Math.min(20 * KB, o.coin); o.coin -= fee; this.gov(s).treasury += fee; } o.social = Math.max(0, o.social - 25); this.say(o, [C.ME, C.BROKE]); this.shiftTrait(o, this.rnd() < 0.55 ? 'frugal' : 'pessimist', 'burned by bankruptcy');   // court costs go to the town
  this.liquidate(b); b.state = 'vacant'; b.vac = 0; b.owner = -1; if (b.type === BT.MARKET) b.stock = 0;
  this.biz.closed++; this.unstaff(b); this.rebuild(); this.fgen++; this.pushBld(b, 'upd');
}

function hire(this: World) {
  for (const d of this.dots) {   // anyone whose workplace has closed down is out of work (site crews may work at a site that is still being built)
    if (d.dead || !d.adult || d.work < 0 || d.job > 2) continue;
    const wb = this.buildings[d.work];
    if (!wb || (wb.state !== 'ok' && !(wb.state === 'build' && d.job === 1))) { d.job = 3; d.work = -1; }
  }
  const staff = new Map(); for (const d of this.dots) if (!d.dead && d.adult && d.work >= 0) staff.set(d.work, (staff.get(d.work) || 0) + 1);
  const pools = {}; for (const d of this.dots) if (!d.dead && d.adult && d.job === 3 && d.age < d.life * K.RETIRE_FRAC) (pools[this.buildings[d.home].sid] = pools[this.buildings[d.home].sid] || []).push(d);
  for (const b of this.buildings) b.staff = staff.get(b.id) || 0;
  for (const b of this.buildings) {
    if (b.state !== 'ok' || !STAFF[b.type]) continue; let need = STAFF[b.type] - b.staff; if (need <= 0) continue;
    const job = b.type === BT.FARM ? 0 : b.type === BT.TAVERN ? 2 : 1, town = this.S[b.sid];
    while (need > 0) {
      let pool = pools[b.sid];
      if (!pool || !pool.length) {   // nobody local: hire a commuter from the nearest settlement within ~45 tiles (a 40-minute walk)
        let best = -1, bd = 45; for (const k of Object.keys(pools)) { const o = this.S[+k]; if (!pools[+k].length) continue; const dd = Math.hypot(o.x - town.x, o.y - town.y); if (dd < bd) { bd = dd; best = +k; } }
        if (best < 0) break; pool = pools[best];
      }
      const d = pool.splice(this.bestOf(pool, this.skillAt(b)), 1)[0]; d.job = job; d.work = b.id; need--; b.staff++;
    }
  }
  // construction is a job too: every building site hires a crew of builders from the same labour pool, paid a day's wage per shift out of the site's escrow
  for (const b of this.sites) {
    if (b.state !== 'build' || (b.contractor >= 0 && this.buildings[b.contractor] && this.buildings[b.contractor].state === 'ok')) continue;
    const crew = Math.max(2, Math.min(6, Math.ceil((b.need - b.prog) / 12)));
    let have = this.dots.filter(d => !d.dead && d.work === b.id && d.job === 1).length;
    while (have < crew) {
      let pool = pools[b.sid];
      if (!pool || !pool.length) { let best = -1, bd = 45; for (const k of Object.keys(pools)) { const o = this.S[+k], t = this.S[b.sid]; if (!pools[+k].length) continue; const dd = Math.hypot(o.x - t.x, o.y - t.y); if (dd < bd) { bd = dd; best = +k; } } if (best < 0) break; pool = pools[best]; }
      const d = pool.splice((this.rnd() * pool.length) | 0, 1)[0]; d.job = 1; d.work = b.id; have++;
    }
  }
}

function entrepreneurs(this: World) {
  if (this.sites.length >= 8) return; let made = 0;
  for (const d of this.dots) {
    if (d.dead || !d.adult || d.coin < 40_000 || made >= 2) continue;
    let m = 0.006 * d.fx.ambition * Math.min(2, d.fx.risk); if (d.dream === 'rich') m *= 2; if (d.job === 3) m *= 1.6; if (d.coin > 200 * KB) m *= 2;
    if (this.ownedBy(d.id).length >= 2 || this.sites.some(x => x.owner === d.id) || this.rnd() > m) continue;
    if (this.tryFound(d)) made++;
  }
}

function tryFound(this: World, d) {
  const home = this.buildings[d.home], s = this.S[home.sid], P = this.sPop[s.id] || 1, L = this.sbl[s.id];
  const cnt = t => L.filter(b => b.type === t).length, nm = this.nearest(this.markets, d, 0), starved = nm && nm.stock < 60 ? 0.5 : 0;
  const opts = [[BT.MARKET, P / 85 - cnt(BT.MARKET) + starved + (s.tier <= 1 ? 0.1 : -0.25)], [BT.TAVERN, P / 60 - cnt(BT.TAVERN)], [BT.WORKSHOP, P / 40 - cnt(BT.WORKSHOP) + this.unemployed(s.id) / 12], [BT.FARM, P * K.FARMERS_SHARE / 4 - this.farms.filter(f => f.sid === s.id).length + starved]];
  const jobless = this.unemployed(s.id);
  if (s.tier <= 1) { opts.push([BT.OFFICE, P / 60 - cnt(BT.OFFICE) + jobless / 25], [BT.FACTORY, P / 70 - cnt(BT.FACTORY) + jobless / 20]); }
  { const have = this.buildings.filter(x => x.type === BT.BUILDER && (x.state === 'ok' || x.state === 'build')).length, want = Math.max(1, Math.round(this.dots.length / 220)); if (s.tier <= 1 && P >= 30) opts.push([BT.BUILDER, 0.7 * (want - have) + this.sites.length / 8]); }
  if (s.tier <= 2 && P >= 20) opts.push([BT.STORE, P / 50 - cnt(BT.STORE) + jobless / 40]);
  if (s.quayAt !== undefined && cnt(BT.DOCK) < (s.tier === 0 ? 3 : 1)) opts.push([BT.DOCK, 0.55 - cnt(BT.DOCK) * 0.3 + s.trade * 0.5]);
  for (const o of opts) { o[1] += (this.rnd() - 0.5) * 0.9; if (o[0] === BT.MARKET && this.mcount >= MAXM) o[1] = -9; }   // overconfidence: people misjudge a market
  opts.sort((a, b) => b[1] - a[1]); const [type, score] = opts[0]; if (score < 0.15) return false;
  const why = d.traits.includes('ambitious') ? 'ambitious' : d.dream === 'rich' ? 'dreams of getting rich' : d.job === 3 ? 'tired of odd jobs' : starved && (type === BT.MARKET || type === BT.FARM) ? `saw ${nm.name} Market run low` : d.coin > 200 ? 'has money to put to work' : 'saw an opening';
  // reuse a closed-down building if one fits (cheaper: a refit, not a new build)
  const vac = this.buildings.find(b => b.state === 'vacant' && b.sid === s.id && this.isBiz(b) && (type === BT.FARM ? b.type === BT.FARM : (!b.open && type !== BT.DOCK) || b.type === type));
  if (vac) {
    const cost = Math.round(K.BUILD_COST[type] * 0.35); if (d.coin < cost + 30 * KB) return false;
    d.coin -= cost; const cap0 = Math.max(0, Math.min(50 * KB, d.coin - 10 * KB)); d.coin -= cap0; vac.cash = (vac.cash || 0) + cap0; const was = BT_NAME[vac.type].toLowerCase();
    const spec = this.pickSpec(type, s.id, d); vac.spec = spec.id; vac.type = type; vac.open = type === BT.FARM; vac.state = 'build'; vac.need = Math.max(2, Math.ceil(BUILD_SHIFTS[type] * 0.4)); vac.prog = 0; vac.escrow = cost * K.LABOUR_SHARE; this.ledger.outflow += cost * (1 - K.LABOUR_SHARE); this.ledger.flow.materials = (this.ledger.flow.materials || 0) - cost * (1 - K.LABOUR_SHARE); vac.owner = d.id; vac.vac = 0; vac.name = this.word(2, 2, true); vac.hist = [];
    if (type === BT.MARKET && vac.mi < 0) vac.mi = this.mcount++;
    this.sites.push(vac); this.rebuild(); this.fgen++; this.pushBld(vac, 'upd');
    this.ev('refit', `♻️ ${d.name} (${why}) is turning the empty ${was} in ${s.name} into a ${this.specOf(vac).name.toLowerCase()}.`, [d.id], 0, 3); return true;
  }
  const kind = type === BT.DOCK ? 'dock' : type === BT.FARM ? 'farm' : (type === BT.WORKSHOP || type === BT.BUILDER || type === BT.OFFICE || type === BT.FACTORY || type === BT.STORE) ? 'shop' : 'center', cost = K.BUILD_COST[type];
  if (d.coin < cost + 40 * KB) return false;
  const plot = this.plotFor(s, kind); if (!plot) return false;
  d.coin -= cost; const spec = this.pickSpec(type, s.id, d), nb = this.startBuild(plot, type, d.id, cost); nb.spec = spec.id; { const cap = Math.max(0, Math.min(50 * KB, d.coin - 10 * KB)); d.coin -= cap; nb.cash += cap; }
  this.ev('found', `🏗️ ${d.name} (${why}) is building a ${spec.name.toLowerCase()} in ${s.name}.`, [d.id], 0, 3); return true;
}

function housing(this: World) {
  if (this.sites.length >= 8) return;
  const res = new Map(); for (const d of this.dots) if (!d.dead) { if (!res.has(d.home)) res.set(d.home, []); res.get(d.home).push(d); }
  let did = 0;
  for (const [hid, list] of res) {
    if (list.length < 5 || did >= 2) continue; const h = this.buildings[hid]; if (h.state !== 'ok') continue;
    const ad = list.filter(d => d.adult && d.id !== h.owner && !this.sites.some(x => x.owner === d.id));
    const mover = ad.find(d => d.partner >= 0 && list.includes(this.dots[d.partner])) || ad.sort((a, b) => b.coin - a.coin)[0]; if (!mover) continue;
    const cost = K.BUILD_COST[BT.HOUSE]; const tg = this.gov(this.S[h.sid]); if (mover.coin < cost * 0.4 && tg.treasury < cost * 3) continue;
    const s = this.S[h.sid], plot = this.plotFor(s, 'house'); if (!plot) continue;
    const own = Math.max(0, Math.min(cost, mover.coin - 5 * KB)); mover.coin -= own; if (own < cost) tg.treasury -= cost - own;
    this.startBuild(plot, BT.HOUSE, mover.id, cost); did++;
    this.ev('moveout', `🏠 ${mover.name} is building a place of their own in ${s.name}${own < cost ? ' (town housing grant)' : ''}.`, [mover.id], 30, 1);
  }
}

function immigration(this: World) {
  if (this.dots.filter(d => !d.dead).length >= this.maxPop || !this.markets.length) return;
  { const ad = this.dots.filter(d => !d.dead && d.adult && d.age < d.life * K.RETIRE_FRAC), jl = ad.filter(d => d.job === 3 && d.work < 0).length; if (jl > 0.07 * ad.length) return; }   // people only move to where there is work
  const avg = this.markets.reduce((a, m) => a + m.stock, 0) / this.markets.length; if (avg < 130 || this.rnd() > 0.08) return;
  const w = this.S.map(s => { const sp = this.sbl[s.id].filter(b => b.type === BT.HOUSE && this.residents(b.id) <= 2).length; return (s.tier === 0 ? 3 : s.tier === 1 ? 1.5 : 1) * (1 + sp) * (this.sbl[s.id].some(b => b.type === BT.HOUSE) ? 1 : 0); });
  let r = this.rnd() * w.reduce((a, b) => a + b, 0), s = this.S[0]; for (let i = 0; i < w.length; i++) { r -= w[i]; if (r <= 0) { s = this.S[i]; break; } }
  const houses = this.sbl[s.id].filter(b => b.type === BT.HOUSE).sort((a, b) => this.residents(a.id) - this.residents(b.id)); if (!houses.length) return;
  const home = houses[0], n = 1 + ((this.rnd() * 3) | 0), fam = this.famGen(), made = [];
  for (let i = 0; i < n; i++) { const d = this.addDot({ name: this.newName(), fam, job: 3, home: home.id, work: -1, traits: rollTraits(this.rnd), age: ADULT + 2 + this.rnd() * 14, life: K.lifespan(this.rnd), coin: K.drawWealth(this.rnd, 30) * 1.3 }); if (d) { made.push(d); this.ledger.inflow += d.coin; this.ledger.flow.migrants = (this.ledger.flow.migrants || 0) + d.coin; } }
  for (const a of made) for (const b of made) if (a !== b) a.aff.set(b.id, 40);
  if (made.length) { this.biz.arrived += made.length; this.ev('arrive', `🚶 ${made.length === 1 ? made[0].name + ' arrives' : made.map(m => m.name).join(' & ') + ' arrive'} in ${s.name} looking for work and a home.`, made.map(m => m.id), 0, 3); }
}

function sales(this: World) {
  if (this.rnd() > 0.25) return; const cand = this.buildings.filter(b => b.state === 'ok' && b.owner >= 0 && this.isBiz(b)); if (!cand.length) return;
  const b = this.pick(cand), o = this.dots[b.owner], avg = b.hist.length ? b.hist.reduce((x, y) => x + y, 0) / b.hist.length : 0;
  const price = Math.max(40 * KB, Math.round(avg * 5)), buyer = this.dots.filter(x => !x.dead && x.adult && x.id !== o.id && x.coin > price * 1.2 && this.buildings[x.home].sid === b.sid).sort((x, y) => y.coin - x.coin)[0];
  if (!buyer || (o.coin > 60 * KB && avg > 0 && this.rnd() > 0.15)) return;
  buyer.coin -= price; o.coin += price; b.owner = buyer.id; this.biz.sold++; this.brandAcquired(b, o, buyer); this.pushBld(b, 'upd');
  this.ev('sale', `🔑 ${o.name} sold ${b.name} ${this.kindName(b)} to ${buyer.name} for ${K.usd(price)}.`, [o.id, buyer.id], 0, 2);
}

function disasters(this: World) {
  for (const b of this.buildings) {
    if (b.state !== 'ok' || b.type === BT.PARK) continue;
    const p = 0.0001 * (this.season() === 3 ? 1.5 : 1) * (b.type === BT.TAVERN || b.type === BT.WORKSHOP ? 1.6 : 1);
    if (this.rnd() < p) { this.burn(b); break; }
  }
}

function mprice(this: World, b) { return MEAL_UNIT * (b.stock < 25 ? 8 : b.stock < 60 ? 6 : b.stock < 120 ? 4 : b.stock < 260 ? 3 : 2); }

function price(this: World, d) { return d.adult ? 2 * MEAL_UNIT : 0; }

Object.assign(World.prototype, { restockMarkets, withhold, payWage, economyDawn, settle, fail, hire, entrepreneurs, tryFound, housing, immigration, sales, disasters, mprice, price });
declare module './world' { interface World {
  restockMarkets: (...args: any[]) => any;
  withhold: (...args: any[]) => any;
  payWage: (...args: any[]) => any;
  economyDawn: (...args: any[]) => any;
  settle: (...args: any[]) => any;
  fail: (...args: any[]) => any;
  hire: (...args: any[]) => any;
  entrepreneurs: (...args: any[]) => any;
  tryFound: (...args: any[]) => any;
  housing: (...args: any[]) => any;
  immigration: (...args: any[]) => any;
  sales: (...args: any[]) => any;
  disasters: (...args: any[]) => any;
  mprice: (...args: any[]) => any;
  price: (...args: any[]) => any;
} }
