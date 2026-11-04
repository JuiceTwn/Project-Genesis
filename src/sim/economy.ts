import { World } from './world';
import { makeField, b64, tkLess, rollTraits, mk } from '../shared/util';
import * as K from '../shared/constants';
import * as Gen from '../worldgen';
const { TICK_HZ, DAY_TICKS, INF, TILE, COST, BT, BT_NAME, BUILD_SHIFTS, UPKEEP, STAFF, MAXM, JOBS, FOOD_PRICE, DRINK_PRICE, STOCK_CAP, ADULT, YEAR_DAYS, SEASON_DAYS, SEASONS, YIELD, RAIN_P, CON, C, TRAITS, TRAIT_W, DREAMS, DREAM_TXT } = K;
import { W, H } from "../shared/dims";

function economyDawn(this: World) {
  this.sPop = []; for (const d of this.dots) if (!d.dead) { const sid = this.buildings[d.home].sid; this.sPop[sid] = (this.sPop[sid] || 0) + 1; }
  this.settle(); this.hire(); this.disasters(); this.housing(); this.entrepreneurs(); this.sales(); this.immigration(); this.vacancies();
}

function settle(this: World) {
  const day = this.day();
  for (const b of this.buildings) {
    if (b.state !== 'ok' || !this.isBiz(b)) continue;
    if (b.type === BT.DOCK && this.rnd() < 0.45) {                       // a ship comes in: trade, and sometimes grain
      const mk = this.sbl[b.sid].find(x => x.type === BT.MARKET), tr = this.S[b.sid].trade + 0.5; b.rev += Math.round(40 + this.rnd() * 70 * tr);
      if (mk && mk.stock < 300 && this.rnd() < 0.6) { const q = 70 + ((this.rnd() * 90) | 0); mk.stock = Math.min(STOCK_CAP, mk.stock + q); this.ev('ship', `⚓ A trading ship docked at ${this.S[b.sid].name} and unloaded ${q} sacks of grain at ${b.name} Dock.`, [], 30, 2); }
    }
    if (b.owner < 0) { b.rev = 0; b.wage = 0; b.visits = 0; continue; }
    const o = this.dots[b.owner]; if (!o || o.dead) { b.owner = -1; continue; }
    const up = UPKEEP[b.type], inc = b.type === BT.MARKET ? b.rev * 0.3 : b.rev, profit = inc - up - b.wage;
    b.hist.push(Math.round(profit)); if (b.hist.length > 6) b.hist.shift();
    b.cash += profit;
    if (b.cash > 70) { const dv = Math.round((b.cash - 40) * 0.6); b.cash -= dv; o.coin += dv; }
    if (b.cash < -25 && o.coin > 45) { const inj = Math.min(40, o.coin - 20); o.coin -= inj; b.cash += inj; }
    const young = this.tick - b.born < 3 * DAY_TICKS, v = b.visits; b.rev = 0; b.wage = 0; b.visits = 0;
    if (b.cash < -80 && !young) this.fail(b, v);
  }
}

function fail(this: World, b, visits) {
  const o = this.dots[b.owner], s = this.S[b.sid], rivals = this.sbl[b.sid].filter(x => x !== b && x.type === b.type).length;
  const why = b.type === BT.FARM && this.tick - this.blightAt < 4 * DAY_TICKS ? 'the blight wrecked the harvest' : (b.type === BT.FARM || b.type === BT.WORKSHOP || b.type === BT.TAVERN) && (b.staff || 0) === 0 ? 'nobody was working there' : rivals >= 2 ? 'too many rivals in town' : visits < 4 ? 'hardly any customers' : o.traits.includes('lazy') ? 'the owner never kept it up' : 'costs outran takings';
  this.ev('bankrupt', `📉 ${o.name}'s ${BT_NAME[b.type].toLowerCase()} ${b.name} in ${s.name} went bankrupt — ${why}.`, [o.id], 0, 4);
  o.coin = Math.max(0, o.coin - 20); o.social = Math.max(0, o.social - 25); this.say(o, [C.ME, C.BROKE]);
  b.state = 'vacant'; b.vac = 0; b.owner = -1; b.cash = 0; if (b.type === BT.MARKET) b.stock = 0;
  this.biz.closed++; this.unstaff(b); this.rebuild(); this.fgen++; this.pushBld(b, 'upd');
}

function hire(this: World) {
  const staff = new Map(); for (const d of this.dots) if (!d.dead && d.adult && d.work >= 0) staff.set(d.work, (staff.get(d.work) || 0) + 1);
  const pools = {}; for (const d of this.dots) if (!d.dead && d.adult && d.job === 3) (pools[this.buildings[d.home].sid] = pools[this.buildings[d.home].sid] || []).push(d);
  for (const b of this.buildings) b.staff = staff.get(b.id) || 0;
  for (const b of this.buildings) {
    if (b.state !== 'ok' || !STAFF[b.type]) continue; let need = STAFF[b.type] - b.staff; const pool = pools[b.sid]; if (need <= 0 || !pool) continue;
    const job = b.type === BT.FARM ? 0 : b.type === BT.TAVERN ? 2 : 1;
    while (need > 0 && pool.length) { const d = pool.splice((this.rnd() * pool.length) | 0, 1)[0]; d.job = job; d.work = b.id; need--; b.staff++; }
  }
}

function entrepreneurs(this: World) {
  if (this.sites.length >= 8) return; let made = 0;
  for (const d of this.dots) {
    if (d.dead || !d.adult || d.coin < 75 || made >= 2) continue;
    let m = 0.004; if (d.traits.includes('ambitious')) m *= 3; if (d.dream === 'rich') m *= 2; if (d.job === 3) m *= 1.6; if (d.traits.includes('lazy')) m *= 0.3; if (d.coin > 200) m *= 2;
    if (this.ownedBy(d.id).length >= 2 || this.sites.some(x => x.owner === d.id) || this.rnd() > m) continue;
    if (this.tryFound(d)) made++;
  }
}

function tryFound(this: World, d) {
  const home = this.buildings[d.home], s = this.S[home.sid], P = this.sPop[s.id] || 1, L = this.sbl[s.id];
  const cnt = t => L.filter(b => b.type === t).length, nm = this.nearest(this.markets, d, 0), starved = nm && nm.stock < 60 ? 0.5 : 0;
  const opts = [[BT.MARKET, P / 85 - cnt(BT.MARKET) + starved + (s.tier <= 1 ? 0.1 : -0.25)], [BT.TAVERN, P / 60 - cnt(BT.TAVERN)], [BT.WORKSHOP, P / 40 - cnt(BT.WORKSHOP) + this.unemployed(s.id) / 12], [BT.FARM, P * 0.36 / 11 - this.farms.filter(f => f.sid === s.id).length + starved]];
  if (s.quayAt !== undefined && cnt(BT.DOCK) < (s.tier === 0 ? 3 : 1)) opts.push([BT.DOCK, 0.55 - cnt(BT.DOCK) * 0.3 + s.trade * 0.5]);
  for (const o of opts) { o[1] += (this.rnd() - 0.5) * 0.9; if (o[0] === BT.MARKET && this.mcount >= MAXM) o[1] = -9; }   // overconfidence: people misjudge a market
  opts.sort((a, b) => b[1] - a[1]); const [type, score] = opts[0]; if (score < 0.15) return false;
  const why = d.traits.includes('ambitious') ? 'ambitious' : d.dream === 'rich' ? 'dreams of getting rich' : d.job === 3 ? 'tired of odd jobs' : starved && (type === BT.MARKET || type === BT.FARM) ? `saw ${nm.name} Market run low` : d.coin > 200 ? 'has money to put to work' : 'saw an opening';
  // reuse a closed-down building if one fits (cheaper: a refit, not a new build)
  const vac = this.buildings.find(b => b.state === 'vacant' && b.sid === s.id && this.isBiz(b) && (type === BT.FARM ? b.type === BT.FARM : (!b.open && type !== BT.DOCK) || b.type === type));
  if (vac) {
    const cost = Math.round(BUILD_SHIFTS[type] * 10 * 0.35); if (d.coin < cost + 30) return false;
    d.coin -= cost; const was = BT_NAME[vac.type].toLowerCase();
    vac.type = type; vac.open = type === BT.FARM; vac.state = 'build'; vac.need = Math.max(2, Math.ceil(BUILD_SHIFTS[type] * 0.4)); vac.prog = 0; vac.escrow = cost; vac.owner = d.id; vac.vac = 0; vac.name = this.word(2, 2, true); vac.hist = [];
    if (type === BT.MARKET && vac.mi < 0) vac.mi = this.mcount++;
    this.sites.push(vac); this.rebuild(); this.fgen++; this.pushBld(vac, 'upd');
    this.ev('refit', `♻️ ${d.name} (${why}) is turning the empty ${was} in ${s.name} into a ${BT_NAME[type].toLowerCase()}.`, [d.id], 0, 3); return true;
  }
  const kind = type === BT.DOCK ? 'dock' : type === BT.FARM ? 'farm' : type === BT.WORKSHOP ? 'shop' : 'center', cost = BUILD_SHIFTS[type] * 10;
  if (d.coin < cost + 25) return false;
  const plot = this.plotFor(s, kind); if (!plot) return false;
  d.coin -= cost; this.startBuild(plot, type, d.id, cost);
  this.ev('found', `🏗️ ${d.name} (${why}) is building a ${BT_NAME[type].toLowerCase()} in ${s.name}.`, [d.id], 0, 3); return true;
}

function housing(this: World) {
  if (this.sites.length >= 8) return;
  const res = new Map(); for (const d of this.dots) if (!d.dead) { if (!res.has(d.home)) res.set(d.home, []); res.get(d.home).push(d); }
  let did = 0;
  for (const [hid, list] of res) {
    if (list.length < 5 || did >= 2) continue; const h = this.buildings[hid]; if (h.state !== 'ok') continue;
    const ad = list.filter(d => d.adult && d.id !== h.owner && !this.sites.some(x => x.owner === d.id));
    const mover = ad.find(d => d.partner >= 0 && list.includes(this.dots[d.partner])) || ad.sort((a, b) => b.coin - a.coin)[0]; if (!mover) continue;
    const cost = BUILD_SHIFTS[BT.HOUSE] * 10; const tg = this.gov(this.S[h.sid]); if (mover.coin < cost * 0.4 && tg.treasury < cost * 3) continue;
    const s = this.S[h.sid], plot = this.plotFor(s, 'house'); if (!plot) continue;
    const own = Math.max(0, Math.min(cost, mover.coin - 5)); mover.coin -= own; if (own < cost) tg.treasury -= cost - own;
    this.startBuild(plot, BT.HOUSE, mover.id, cost); did++;
    this.ev('moveout', `🏠 ${mover.name} is building a place of their own in ${s.name}${own < cost ? ' (town housing grant)' : ''}.`, [mover.id], 30, 1);
  }
}

function immigration(this: World) {
  if (this.dots.filter(d => !d.dead).length >= this.maxPop || !this.markets.length) return;
  const avg = this.markets.reduce((a, m) => a + m.stock, 0) / this.markets.length; if (avg < 130 || this.rnd() > 0.3) return;
  const w = this.S.map(s => { const sp = this.sbl[s.id].filter(b => b.type === BT.HOUSE && this.residents(b.id) <= 2).length; return (s.tier === 0 ? 3 : s.tier === 1 ? 1.5 : 1) * (1 + sp) * (this.sbl[s.id].some(b => b.type === BT.HOUSE) ? 1 : 0); });
  let r = this.rnd() * w.reduce((a, b) => a + b, 0), s = this.S[0]; for (let i = 0; i < w.length; i++) { r -= w[i]; if (r <= 0) { s = this.S[i]; break; } }
  const houses = this.sbl[s.id].filter(b => b.type === BT.HOUSE).sort((a, b) => this.residents(a.id) - this.residents(b.id)); if (!houses.length) return;
  const home = houses[0], n = 1 + ((this.rnd() * 3) | 0), fam = this.famGen(), made = [];
  for (let i = 0; i < n; i++) { const d = this.addDot({ name: this.newName(), fam, job: 3, home: home.id, work: -1, traits: rollTraits(this.rnd), age: ADULT + 2 + this.rnd() * 14, life: 45 + this.rnd() * 25, coin: 50 + this.rnd() * 90 }); if (d) made.push(d); }
  for (const a of made) for (const b of made) if (a !== b) a.aff.set(b.id, 40);
  if (made.length) { this.biz.arrived += made.length; this.ev('arrive', `🚶 ${made.length === 1 ? made[0].name + ' arrives' : made.map(m => m.name).join(' & ') + ' arrive'} in ${s.name} looking for work and a home.`, made.map(m => m.id), 0, 3); }
}

function sales(this: World) {
  if (this.rnd() > 0.25) return; const cand = this.buildings.filter(b => b.state === 'ok' && b.owner >= 0 && this.isBiz(b)); if (!cand.length) return;
  const b = this.pick(cand), o = this.dots[b.owner], avg = b.hist.length ? b.hist.reduce((x, y) => x + y, 0) / b.hist.length : 0;
  const price = Math.max(40, Math.round(avg * 5)), buyer = this.dots.filter(x => !x.dead && x.adult && x.id !== o.id && x.coin > price * 1.2 && this.buildings[x.home].sid === b.sid).sort((x, y) => y.coin - x.coin)[0];
  if (!buyer || (o.coin > 60 && avg > 0 && this.rnd() > 0.15)) return;
  buyer.coin -= price; o.coin += price; b.owner = buyer.id; this.biz.sold++; this.pushBld(b, 'upd');
  this.ev('sale', `🔑 ${o.name} sold ${b.name} ${BT_NAME[b.type]} to ${buyer.name} for ${price} coins.`, [o.id, buyer.id], 0, 2);
}

function disasters(this: World) {
  for (const b of this.buildings) {
    if (b.state !== 'ok' || b.type === BT.PARK) continue;
    const p = 0.0007 * (this.season() === 3 ? 1.5 : 1) * (b.type === BT.TAVERN || b.type === BT.WORKSHOP ? 1.6 : 1);
    if (this.rnd() < p) { this.burn(b); break; }
  }
}

function mprice(this: World, b) { return b.stock < 25 ? 8 : b.stock < 60 ? 6 : b.stock < 120 ? 4 : b.stock < 260 ? 3 : 2; }

function price(this: World, d) { return d.adult ? 2 : 0; }

Object.assign(World.prototype, { economyDawn, settle, fail, hire, entrepreneurs, tryFound, housing, immigration, sales, disasters, mprice, price });
declare module './world' { interface World {
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
