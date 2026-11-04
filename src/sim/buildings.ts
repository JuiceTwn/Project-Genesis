import { World } from './world';
import type { Building } from '../shared/types';
import { COUNTRY, FIELD_BUDGET } from './config';
import { makeField, b64, tkLess, rollTraits, mk } from '../shared/util';
import * as K from '../shared/constants';
import * as Gen from '../worldgen';
const { TICK_HZ, DAY_TICKS, INF, TILE, COST, BT, BT_NAME, BUILD_SHIFTS, UPKEEP, STAFF, MAXM, JOBS, FOOD_PRICE, DRINK_PRICE, STOCK_CAP, ADULT, YEAR_DAYS, SEASON_DAYS, SEASONS, YIELD, RAIN_P, CON, C, TRAITS, TRAIT_W, DREAMS, DREAM_TXT } = K;
import { W, H, setDims } from "../shared/dims";

function mkBuilding(this: World, type, x, y, door, open, sid) {
  const b: Building = { id: this.buildings.length, type, x, y, door, open, occ: 0, stock: 0, inside: [], name: '', flag: false, sid, owner: -1, cash: 0, rev: 0, wage: 0, state: 'ok', born: this.tick || 0, visits: 0, hist: [], mi: -1, vac: 0, w: 3, h: 3, plot: -1 };
  if (type === BT.MARKET) b.mi = this.mcount++;
  this.buildings.push(b); return b;
}

function placeOn(this: World, plot, type, state) {
  const open = type === BT.FARM || type === BT.PARK, t = this.tiles;
  const b = this.mkBuilding(type, plot.x, plot.y, [plot.dx, plot.dy], open, plot.sid);
  for (let dy = 0; dy < 3; dy++) for (let dx = 0; dx < 3; dx++) t[(plot.y + dy) * W + plot.x + dx] = open ? TILE.OPEN : TILE.BLOCK;
  plot.used = true; plot.bid = b.id; b.plot = plot.id; b.state = state || 'ok';
  b.src = []; if (open) { for (let dy = 0; dy < 3; dy++) for (let dx = 0; dx < 3; dx++) b.src.push((plot.y + dy) * W + plot.x + dx); } else b.src.push(plot.dy * W + plot.dx);
  return b;
}

function rebuild(this: World) {
  this.markets = []; this.taverns = []; this.workshops = []; this.parks = []; this.farms = []; this.houses = []; this.halls = []; this.docks = [];
  for (const l of this.sbl) l.length = 0;
  for (const b of this.buildings) {
    if (b.state !== 'ok') continue;
    (this.sbl[b.sid] = this.sbl[b.sid] || []).push(b);
    switch (b.type) { case BT.MARKET: this.markets.push(b); break; case BT.TAVERN: this.taverns.push(b); break; case BT.WORKSHOP: this.workshops.push(b); break; case BT.DOCK: this.workshops.push(b); this.docks.push(b); break; case BT.OFFICE: case BT.FACTORY: case BT.STORE: this.workshops.push(b); break; case BT.PARK: this.parks.push(b); break; case BT.FARM: this.farms.push(b); break; case BT.HOUSE: this.houses.push(b); break; case BT.HALL: this.halls.push(b); break; }
  }
}

function F(this: World, b) {   // distance field to a building: computed on demand, refreshed (a few per tick) when the map changes, evicted LRU
  b.fuse = this.tick;
  if (!b.field) {
    b.field = makeField(this.tiles, b.src); b.fgen = this.fgen; this.fieldHolders.push(b);
    if (this.fieldHolders.length > Math.max(48, Math.floor(FIELD_BUDGET / (W * H * 2)))) this.evictFields();
  } else if (b.fgen !== this.fgen && !b.fq) { b.fq = true; this.fq.push(b); }
  return b.field;
}
function evictFields(this: World) {
  const keep = this.fieldHolders.filter(b => b.field).sort((x, y) => y.fuse - x.fuse);
  const n = Math.floor(keep.length * 0.7);
  for (let i = n; i < keep.length; i++) { keep[i].field = undefined; keep[i].fq = false; }
  this.fieldHolders = keep.slice(0, n);
}

function nameBuilding(this: World, b, owner) { if (b.type === BT.HOUSE) b.fam = owner ? owner.fam : this.word(2, 3, true); else if (!b.name) b.name = this.word(2, 2, true); }

function buildMap(this: World) {
  const map = this.map = Gen.generate(this.seed, { pop: this.pop, ...COUNTRY });
  setDims(map.W, map.H); this.tiles = map.t;
  this.buildings = []; this.markets = []; this.taverns = []; this.workshops = []; this.parks = []; this.farms = []; this.houses = []; this.halls = []; this.docks = [];
  this.mcount = 0; this.S = map.settlements;
  let tot = 0;
  for (const s of this.S) { s.pop0 = Math.max([0, 24, 14, 8][s.tier], Math.round(s.share * this.pop)); tot += s.pop0; this.sbl[s.id] = []; }
  this.S[0].pop0 = Math.max(30, this.S[0].pop0 + this.pop - tot);
  const plots = map.plots;
  for (const s of this.S) for (let k = 0; k < 10 && Gen.freeUrbanPlots(map, s) < Math.ceil(s.pop0 / 4) + 3; k++) Gen.expand(map, s, () => this.R());
  for (const s of this.S) {
    const tier = s.tier, P = s.pop0, [sw, sh] = Gen.SQ[tier];
    const sq = this.mkBuilding(BT.PARK, s.x - (sw >> 1), s.y - (sh >> 1), [s.x, s.y], true, s.id);   // the square is the town green
    sq.w = sw; sq.h = sh; sq.sqPark = true; sq.src = []; for (let b = 0; b < sh; b++) for (let a = 0; a < sw; a++) sq.src.push((sq.y + b) * W + sq.x + a);
    const mine = (s.plots || []).map(id => plots[id]);
    const urban = mine.filter(p => !p.rural).sort((a, b) => a.dc - b.dc), rural = mine.filter(p => p.rural).sort((a, b) => (b.fert - a.fert) + (a.dc - b.dc) * 0.045);
    const take = (list, pred?) => { for (const p of list) if (!p.used && (!pred || pred(p))) return p; return null; };
    const put = (type, p) => (p ? this.placeOn(p, type) : null);
    const nMarket = tier === 0 ? 2 : tier <= 2 ? 1 : 0, nTavern = tier === 0 ? Math.max(2, Math.round(P / 55)) : tier === 1 ? 1 : (tier === 2 && P >= 16 ? 1 : 0);
    const nShop = tier === 0 ? Math.max(2, Math.round(P * 0.26 / 18)) : tier === 1 ? 1 : (tier === 2 && P >= 22 ? 1 : 0), nDock = s.quayAt !== undefined && tier <= 1 ? (tier === 0 ? 2 : 1) : 0;
    for (let i = 0; i < nMarket; i++) put(BT.MARKET, take(urban, p => p.sq) || take(urban));
    if (tier <= 1) put(BT.HALL, take(urban, p => p.sq) || take(urban));
    for (let i = 0; i < nTavern; i++) put(BT.TAVERN, take(urban, p => p.sq) || take(urban));
    for (let i = 0; i < nDock; i++) put(BT.DOCK, take(urban, p => p.quay));
    for (let i = 0; i < nShop; i++) { const free = urban.filter(p => !p.used && !p.sq); put(BT.WORKSHOP, free.length ? free[Math.floor(free.length * (0.45 + 0.1 * i))] || free[free.length - 1] : take(urban)); }
    // modern employers, sized to the town so there are jobs for most adults
    const nOffice = tier === 0 ? Math.round(P / 55) : tier === 1 ? Math.max(1, Math.round(P / 60)) : 0, nFactory = tier <= 1 ? Math.max(1, Math.round(P / 65)) : 0, nStore = tier <= 2 && P >= 22 ? Math.max(1, Math.round(P / 75)) : 0;
    for (const [type, n] of [[BT.OFFICE, nOffice], [BT.FACTORY, nFactory], [BT.STORE, nStore]]) for (let i = 0; i < n; i++) { const free = urban.filter(p => !p.used && !p.sq); put(type, free.length ? free[Math.floor(free.length * (0.2 + 0.6 * this.R()))] : take(urban)); }
    if (tier === 0) { const free = urban.filter(p => !p.used && !p.sq); put(BT.PARK, free[Math.floor(free.length * 0.3)]); }
    const nHouse = Math.ceil(P / 4);
    for (let i = 0; i < nHouse; i++) put(BT.HOUSE, take(urban, p => !p.sq) || take(urban) || take(rural));
    const nFarm = Math.max(1, Math.round(P * 0.36 / 11));
    for (let i = 0; i < nFarm; i++) put(BT.FARM, take(rural) || take(urban.slice().reverse()));
  }
  this.pop = this.S.reduce((a, s) => a + s.pop0, 0); this.maxPop = Math.max(this.maxPop, Math.round(this.pop * 1.7));
  this.rebuild();
  for (const m of this.markets) m.stock = 90;
}

function bldMsg(this: World, b) { return { i: b.id, ty: b.type, x: b.x, y: b.y, n: b.name, d: b.door, w: b.w, h: b.h, st: b.state === 'ok' ? 0 : b.state === 'build' ? 1 : b.state === 'vacant' ? 2 : 3, o: b.owner, s: b.sid, f: b.fam || '', ow: b.owner >= 0 && this.dots[b.owner] ? this.dots[b.owner].name : '' }; }

function pushBld(this: World, b, op) { this.out.push({ t: 'bld', op, b: this.bldMsg(b) }); }

function pushTiles(this: World, list) { if (list.length) this.out.push({ t: 'tiles', c: list.map(i => [i, this.tiles[i]]) }); }

function footprint(this: World, b) { const r = []; for (let dy = 0; dy < b.h; dy++) for (let dx = 0; dx < b.w; dx++) r.push((b.y + dy) * W + b.x + dx); return r; }

function siteFor(this: World, d) {
  const sid = this.buildings[d.home].sid; let best = null, bv = 1e9;
  for (const st of this.sites) { const v = (st.sid === sid ? 0 : 30) + Math.hypot(st.x - d.x, st.y - d.y); if (v < bv && v < 60) { bv = v; best = st; } }
  return best;
}

function freePlot(this: World, s, kind) {
  const pl = (s.plots || []).map(id => this.map.plots[id]).filter(p => !p.used), dc = (a, b) => a.dc - b.dc;
  const urban = pl.filter(p => !p.rural), rural = pl.filter(p => p.rural);
  switch (kind) {
    case 'center': return urban.filter(p => p.sq).sort(dc)[0] || urban.sort(dc)[0] || null;
    case 'house': return urban.filter(p => !p.sq).sort(dc)[0] || rural.sort(dc)[0] || null;
    case 'dock': return urban.filter(p => p.quay)[0] || null;
    case 'shop': { const f = urban.filter(p => !p.sq).sort(dc); return f.length ? f[Math.floor(f.length * 0.55)] : null; }
    case 'farm': return rural.sort((a, b) => (b.fert - a.fert) + (a.dc - b.dc) * 0.045)[0] || urban.sort((a, b) => b.dc - a.dc)[0] || null;
  }
  return null;
}

function expandSettlement(this: World, s) {
  const r = Gen.expand(this.map, s, () => this.rnd()); if (!r.ok) return false;
  if (r.tiles.length) { this.pushTiles(r.tiles); this.fgen++; this.ev('road', `🛣️ ${s.name} laid a new street.`, [], 40, 1); }
  return true;
}

function plotFor(this: World, s, kind) { return this.freePlot(s, kind) || (this.expandSettlement(s) ? this.freePlot(s, kind) : null); }

function startBuild(this: World, plot, type, owner, cost) {
  const b = this.placeOn(plot, type, 'build'); b.owner = owner; b.need = BUILD_SHIFTS[type]; b.prog = 0; b.escrow = cost; b.started = this.tick;
  this.nameBuilding(b, owner >= 0 ? this.dots[owner] : null);
  this.sites.push(b); this.fgen++; this.pushBld(b, 'add'); this.pushTiles(this.footprint(b)); return b;
}

function buildStep(this: World, d, b) {
  if (!b || b.state !== 'build') return;
  const w = Math.min(9, Math.max(0, b.escrow)); b.escrow -= w; d.coin += w; b.prog++;
  if (b.prog >= b.need) this.completeBuild(b);
}

function completeBuild(this: World, b) {
  b.state = 'ok'; b.born = this.tick; this.sites = this.sites.filter(x => x !== b); this.biz.built++; this.rebuild(); this.fgen++; this.pushBld(b, 'upd');
  const o = b.owner >= 0 ? this.dots[b.owner] : null, s = this.S[b.sid], nm = BT_NAME[b.type].toLowerCase();
  if (b.type === BT.MARKET) { b.stock = 40; b.cash = 20; }
  if (b.type === BT.HOUSE) { this.moveIn(b); this.ev('house', `🏠 ${o ? o.name + "'s" : 'A'} new house is finished in ${s.name}.`, o ? [o.id] : [], 20, 1); return; }
  if (o && b.owner >= 0) b.cash = Math.max(b.cash, 15);
  this.ev('opened', `${o ? '🏪' : '🏛️'} ${b.name} ${BT_NAME[b.type]} opens in ${s.name}${o ? ` — owner ${o.name}` : ' — a public works project'}!`, o ? [o.id] : [], 0, 3);
}

function moveIn(this: World, b) {
  const o = this.dots[b.owner]; if (!o || o.dead) return; const old = o.home, grp = [o];
  if (o.partner >= 0 && !this.dots[o.partner].dead && this.dots[o.partner].home === old) grp.push(this.dots[o.partner]);
  for (const k of this.dots) if (!k.dead && !k.adult && k.home === old && k.fam === o.fam) grp.push(k);
  for (const m of grp) m.home = b.id; b.fam = o.fam;
}

function demolish(this: World, b) {
  for (const d of b.inside.slice()) { d.inside = false; d.phase = 'walk'; d.goal = null; } b.inside.length = 0; b.occ = 0;
  b.state = 'gone'; b.stock = 0; const p = this.map.plots[b.plot]; if (p) { p.used = false; p.bid = -1; }
  const fp = this.footprint(b); for (const i of fp) this.tiles[i] = TILE.GRASS;
  this.sites = this.sites.filter(x => x !== b); this.rebuild(); this.fgen++; this.pushBld(b, 'del'); this.pushTiles(fp);
}

function isBiz(this: World, b) { return b.type === BT.OFFICE || b.type === BT.FACTORY || b.type === BT.STORE || b.type === BT.MARKET || b.type === BT.TAVERN || b.type === BT.WORKSHOP || b.type === BT.FARM || b.type === BT.DOCK; }

function burn(this: World, b) {
  const o = b.owner >= 0 ? this.dots[b.owner] : null, s = this.S[b.sid]; let homeless = 0;
  if (b.type === BT.HOUSE) {
    const alt = this.sbl[b.sid].filter(x => x.type === BT.HOUSE && x !== b).sort((x, y) => this.residents(x.id) - this.residents(y.id))[0];
    for (const d of this.dots) if (!d.dead && d.home === b.id) { d.home = alt ? alt.id : this.houses.find(x => x !== b).id; d.coin = Math.max(0, d.coin - 10); d.social = Math.max(0, d.social - 20); homeless++; }
  } else this.unstaff(b);
  this.ev('fire', `🔥 Fire in ${s.name}! ${b.name} ${BT_NAME[b.type]} burned to the ground${o ? ` — ${o.name} loses everything in it` : ''}${homeless ? `, ${homeless} left homeless` : ''}.`, o ? [o.id] : [], 0, 4);
  this.biz.fires++; this.demolish(b);
}

function vacancies(this: World) {
  for (const b of this.buildings) if (b.state === 'vacant') {
    b.vac++;
    if (b.vac >= 8) { this.ev('demolish', `🧱 The empty ${BT_NAME[b.type].toLowerCase()} ${b.name} in ${this.S[b.sid].name} was torn down.`, [], 60, 1); this.demolish(b); }
  }
}

Object.assign(World.prototype, { evictFields, mkBuilding, placeOn, rebuild, F, nameBuilding, buildMap, bldMsg, pushBld, pushTiles, footprint, siteFor, freePlot, expandSettlement, plotFor, startBuild, buildStep, completeBuild, moveIn, demolish, isBiz, burn, vacancies });
declare module './world' { interface World {
  mkBuilding: (...args: any[]) => any;
  placeOn: (...args: any[]) => any;
  rebuild: (...args: any[]) => any;
  F: (...args: any[]) => any;
  evictFields: (...args: any[]) => any;
  nameBuilding: (...args: any[]) => any;
  buildMap: (...args: any[]) => any;
  bldMsg: (...args: any[]) => any;
  pushBld: (...args: any[]) => any;
  pushTiles: (...args: any[]) => any;
  footprint: (...args: any[]) => any;
  siteFor: (...args: any[]) => any;
  freePlot: (...args: any[]) => any;
  expandSettlement: (...args: any[]) => any;
  plotFor: (...args: any[]) => any;
  startBuild: (...args: any[]) => any;
  buildStep: (...args: any[]) => any;
  completeBuild: (...args: any[]) => any;
  moveIn: (...args: any[]) => any;
  demolish: (...args: any[]) => any;
  isBiz: (...args: any[]) => any;
  burn: (...args: any[]) => any;
  vacancies: (...args: any[]) => any;
} }
