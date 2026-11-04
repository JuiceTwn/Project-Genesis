/* Dotville sim core. Runs in Node (server) and in the browser (local demo).
   No dependencies. The "brain" lives in World.decide(); swap it for an ML policy later. */
(function (root) {
'use strict';

const Gen = (typeof module !== 'undefined' && module.exports && typeof require === 'function') ? require('./worldgen.js') : root.Gen;
let W = 144, H = 108;                 // set from the generated map
const TICK_HZ = 5, DAY_TICKS = 1200, INF = 65535;
const TILE = { GRASS: 0, ROAD: 1, BLOCK: 2, WATER: 3, OPEN: 4, TREE: 5, BRIDGE: 6, FORD: 7, SAND: 8, ROCK: 9 };
const COST = [4, 2, INF, INF, 3, INF, 2, 4, 4, INF];
const BT = { HOUSE: 0, FARM: 1, MARKET: 2, TAVERN: 3, WORKSHOP: 4, PARK: 5, HALL: 6, DOCK: 7 };
const BT_NAME = ['House', 'Farm', 'Market', 'Tavern', 'Workshop', 'Park', 'Town Hall', 'Dock'];
const BUILD_SHIFTS = [6, 5, 10, 8, 8, 3, 14, 12], UPKEEP = [0, 10, 40, 22, 18, 0, 0, 35], STAFF = [0, 4, 0, 3, 4, 0, 0, 4], MAXM = 64;
const JOBS = ['farmer', 'crafter', 'keeper', 'drifter'];
const FOOD_PRICE = 3, DRINK_PRICE = 2, STOCK_CAP = 700, ADULT = 8, YEAR_DAYS = 3, SEASON_DAYS = 2;
const SEASONS = ['Spring', 'Summer', 'Autumn', 'Winter'], YIELD = [1.0, 1.3, 2.0, 0.7], RAIN_P = [0.35, 0.15, 0.4, 0.55];

const CON = [['ME','me'],['YOU','you'],['WANT','want'],['GO','go'],['GIVE','give'],['SEE','see'],['LIKE','like'],['HELP','help'],
  ['HUNGRY','hungry'],['TIRED','tired'],['HAPPY','happy'],['SAD','sad'],['LONELY','lonely'],['RICH','rich'],['BROKE','broke'],
  ['FOOD','food'],['HOME','home'],['WORK','work'],['SLEEP','sleep'],['COIN','coin'],['FRIEND','friend'],
  ['MARKET','market'],['FARM','farm'],['PARK','park'],['TAVERN','tavern'],['WORKSHOP','workshop'],
  ['NIGHT','night'],['DAY','day'],['DRINK','drink'],['NO','no'],['YES','yes'],['MUCH','plenty of'],['LITTLE','little'],
  ['GOOD','good'],['BAD','bad'],['NOW','now'],['HELLO','hello'],['BYE','bye'],['THANKS','thanks'],['AND','and'],
  ['STEAL','steal'],['LOVE','love'],['ANGRY','angry'],['THIEF','thief'],['STOP','stop'],['SORRY','sorry'],['BABY','baby'],['MARRY','marry'],['MINE','mine'],['DIE','died'],['AFRAID','afraid'],['JEALOUS','jealous']];
const C = {}; CON.forEach((c, i) => C[c[0]] = i);

const TRAITS = ['thief','hothead','gossip','kind','romantic','jealous','coward','ambitious','lazy'];
const TRAIT_W = [0.07,0.12,0.15,0.15,0.2,0.1,0.12,0.15,0.1];
const DREAMS = ['rich','famous','love','family'];
const DREAM_TXT = { rich: 'get rich (250 coins)', famous: 'have 8 friends', love: 'find true love', family: 'raise 2 children', content: 'content with life' };
function rollTraits(rf) {
  const n = rf() < 0.7 ? 1 : 2, out = [], tot = TRAIT_W.reduce((a, b) => a + b, 0);
  let guard = 0;
  while (out.length < n && guard++ < 20) { let r = rf() * tot, i = 0; for (; i < TRAITS.length - 1; i++) { r -= TRAIT_W[i]; if (r <= 0) break; } if (!out.includes(TRAITS[i])) out.push(TRAITS[i]); }
  if (out.includes('lazy') && out.includes('ambitious')) out.splice(out.indexOf('lazy'), 1);
  return out;
}
function mk(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

function makeField(tiles, sources) {
  const N = W * H, dist = new Uint16Array(N).fill(INF), heap = [];
  const push = k => { let i = heap.length; heap.push(k); while (i > 0) { const p = (i - 1) >> 1; if (heap[p] <= k) break; heap[i] = heap[p]; i = p; } heap[i] = k; };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { let i = 0; const n = heap.length; for (;;) { let c = 2 * i + 1; if (c >= n) break; if (c + 1 < n && heap[c + 1] < heap[c]) c++; if (heap[c] >= last) break; heap[i] = heap[c]; i = c; } heap[i] = last; } return top; };
  for (const s of sources) { dist[s] = 0; push(s); }
  while (heap.length) {
    const k = pop(), d = Math.floor(k / 32768), i = k - d * 32768;
    if (d > dist[i]) continue;
    const x = i % W, y = (i / W) | 0;
    for (let q = 0; q < 4; q++) {
      const nx = x + (q === 0 ? 1 : q === 1 ? -1 : 0), ny = y + (q === 2 ? 1 : q === 3 ? -1 : 0);
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const ni = ny * W + nx, c = COST[tiles[ni]];
      if (c >= INF) continue;
      const nd = d + c;
      if (nd < dist[ni]) { dist[ni] = nd; push(nd * 32768 + ni); }
    }
  }
  return dist;
}

const rnd = () => Math.random();
const pick = a => a[(rnd() * a.length) | 0];

class World {
  constructor(o = {}) {
    this.seed = o.seed || 1337; this.R = mk(this.seed); this.pop = o.pop || 420; this.maxPop = o.maxPop || Math.round(this.pop * 1.7);
    this.sites = []; this.fq = []; this.fgen = 0; this.biz = { opened: 0, closed: 0, built: 0, sold: 0, fires: 0, arrived: 0 }; this.blightAt = -1e9; this.lastTheftTick = -1e9; this.sPop = []; this.sbl = [];
    this.tick = Math.floor(0.3 * DAY_TICKS); this.out = []; this.pending = [];
    this.stats = { meals: 0, chats: 0, friends: 0, deliveries: 0, wasted: 0, thefts: 0, fights: 0, births: 0, deaths: 0 };
    this.pairs = new Set(); this.festival = 0; this.blight = 0;
    this.weather = 0; this.mayor = -1; this.treasury = 0; this.taxRate = 5; this.nextElection = 7; this.cd = { festival: -1e9, blight: -1e9, gift: -1e9, zap: -1e9, cupid: -1e9 }; this.rep = null; this.lastEv = {};
    this.grid = []; this.hist = [];
    this.buildMap(); this.makeLexicon(); this.makeDots(); this.rep = new Float32Array(this.dots.length); this.lastSeason = this.season(); this.election(true);
    this.rebuild(); for (const b of this.buildings) if (b.state === 'ok') this.F(b);
    if (o.state) this.load(o.state);
  }

  /* ---------- world gen: the whole country comes from worldgen.js ---------- */
  buildMap() {
    const map = this.map = Gen.generate(this.seed, { pop: this.pop });
    W = map.W; H = map.H; this.tiles = map.t;
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
      const take = (list, pred) => { for (const p of list) if (!p.used && (!pred || pred(p))) return p; return null; };
      const put = (type, p) => (p ? this.placeOn(p, type) : null);
      const nMarket = tier === 0 ? 2 : tier <= 2 ? 1 : 0, nTavern = tier === 0 ? Math.max(2, Math.round(P / 55)) : tier === 1 ? 1 : (tier === 2 && P >= 16 ? 1 : 0);
      const nShop = tier === 0 ? Math.max(2, Math.round(P * 0.26 / 18)) : tier === 1 ? 1 : (tier === 2 && P >= 22 ? 1 : 0), nDock = s.quayAt !== undefined && tier <= 1 ? (tier === 0 ? 2 : 1) : 0;
      for (let i = 0; i < nMarket; i++) put(BT.MARKET, take(urban, p => p.sq) || take(urban));
      if (tier <= 1) put(BT.HALL, take(urban, p => p.sq) || take(urban));
      for (let i = 0; i < nTavern; i++) put(BT.TAVERN, take(urban, p => p.sq) || take(urban));
      for (let i = 0; i < nDock; i++) put(BT.DOCK, take(urban, p => p.quay));
      for (let i = 0; i < nShop; i++) { const free = urban.filter(p => !p.used && !p.sq); put(BT.WORKSHOP, free.length ? free[Math.floor(free.length * (0.45 + 0.1 * i))] || free[free.length - 1] : take(urban)); }
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
  mkBuilding(type, x, y, door, open, sid) {
    const b = { id: this.buildings.length, type, x, y, door, open, occ: 0, stock: 0, inside: [], name: '', flag: false, sid, owner: -1, cash: 0, rev: 0, wage: 0, state: 'ok', born: this.tick || 0, visits: 0, hist: [], mi: -1, vac: 0, w: 3, h: 3, plot: -1 };
    if (type === BT.MARKET) b.mi = this.mcount++;
    this.buildings.push(b); return b;
  }
  placeOn(plot, type, state) {
    const open = type === BT.FARM || type === BT.PARK, t = this.tiles;
    const b = this.mkBuilding(type, plot.x, plot.y, [plot.dx, plot.dy], open, plot.sid);
    for (let dy = 0; dy < 3; dy++) for (let dx = 0; dx < 3; dx++) t[(plot.y + dy) * W + plot.x + dx] = open ? TILE.OPEN : TILE.BLOCK;
    plot.used = true; plot.bid = b.id; b.plot = plot.id; b.state = state || 'ok';
    b.src = []; if (open) { for (let dy = 0; dy < 3; dy++) for (let dx = 0; dx < 3; dx++) b.src.push((plot.y + dy) * W + plot.x + dx); } else b.src.push(plot.dy * W + plot.dx);
    return b;
  }
  rebuild() {
    this.markets = []; this.taverns = []; this.workshops = []; this.parks = []; this.farms = []; this.houses = []; this.halls = []; this.docks = [];
    for (const l of this.sbl) l.length = 0;
    for (const b of this.buildings) {
      if (b.state !== 'ok') continue;
      (this.sbl[b.sid] = this.sbl[b.sid] || []).push(b);
      switch (b.type) { case BT.MARKET: this.markets.push(b); break; case BT.TAVERN: this.taverns.push(b); break; case BT.WORKSHOP: this.workshops.push(b); break; case BT.DOCK: this.workshops.push(b); this.docks.push(b); break; case BT.PARK: this.parks.push(b); break; case BT.FARM: this.farms.push(b); break; case BT.HOUSE: this.houses.push(b); break; case BT.HALL: this.halls.push(b); break; }
    }
  }
  F(b) {   // distance field, computed lazily and refreshed (a few per tick) when the map changes
    if (!b.field) { b.field = makeField(this.tiles, b.src); b.fgen = this.fgen; }
    else if (b.fgen !== this.fgen && !b.fq) { b.fq = true; this.fq.push(b); }
    return b.field;
  }
  nameBuilding(b, owner) { if (b.type === BT.HOUSE) b.fam = owner ? owner.fam : this.word(2, 3, true); else if (!b.name) b.name = this.word(2, 2, true); }

  makeLexicon() {
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

  makeDot(id, o, rf) {
    const home = this.buildings[o.home], traits = o.traits, has = t => traits.includes(t);
    const d = {
      id, name: o.name, fam: o.fam || '', job: o.job, home: o.home, work: o.work, future: o.future !== undefined ? o.future : o.job,
      soc: 0.35 + rf() * 0.9 + (has('gossip') ? 0.3 : 0), dil: Math.max(0.15, 0.3 + rf() * 0.9 + (has('ambitious') ? 0.35 : 0) - (has('lazy') ? 0.35 : 0)), off: (rf() - 0.5) * 0.1,
      x: home.door[0], y: home.door[1], nx: -1, ny: -1, prog: 0, speed: 0.30 + rf() * 0.08,
      phase: 'walk', prev: 'walk', goal: null, timer: 0, chatT: 0, chatCd: (rf() * 100) | 0, inside: false, fight: false,
      hunger: o.hunger !== undefined ? o.hunger : 10 + rf() * 50, energy: o.energy !== undefined ? o.energy : 50 + rf() * 45,
      social: o.social !== undefined ? o.social : 30 + rf() * 60, coin: o.coin !== undefined ? o.coin : 10 + rf() * 50,
      aff: new Map(), belief: new Int32Array(MAXM).fill(-1), carry: 0, invite: null, starvedDay: -1, rich: false, meals: 0,
      traits, done: new Set(), isThief: has('thief'), age: o.age, life: o.life, partner: -1, married: false, since: 0, thieves: new Set(), dead: false,
      grief: 0, starveT: 0, theftCd: 200 + ((rf() * 900) | 0), dream: null, dreams: 0, adult: o.age >= ADULT, kids: 0, rejectCd: 0
    };
    d.dream = this.pickDream(d, rf);
    return d;
  }
  pickDream(d, rf, not) {
    const w = [d.traits.includes('ambitious') ? 3 : 1, d.traits.includes('gossip') ? 3 : 1, d.traits.includes('romantic') ? 3 : 1, 1];
    const ks = DREAMS.map((k, i) => [k, k === not || d.done.has(k) ? 0 : w[i]]); const tot = ks.reduce((a, b) => a + b[1], 0);
    if (!tot) return 'content';
    let r = rf() * tot;
    for (const [k, x] of ks) { r -= x; if (r <= 0 && x > 0) return k; }
    return 'rich';
  }

  workFor(job, sid) {
    const s = this.S[sid], list = job === 0 ? this.farms : job === 1 ? this.workshops : job === 2 ? this.taverns : null; if (!list || !list.length) return null;
    let best = null, bv = 1e9; for (const b of list) { const v = Math.hypot(b.x - s.x, b.y - s.y) + (b.staff || 0) * 0.9 + rnd() * 4; if (v < bv) { bv = v; best = b; } }
    if (best) best.staff = (best.staff || 0) + 1; return best;
  }
  makeDots() {
    const R = this.R, dots = this.dots = [];
    const link = (a, b, v) => { a.aff.set(b.id, v); b.aff.set(a.id, v); this.pairs.add(Math.min(a.id, b.id) * 1000 + Math.max(a.id, b.id)); this.stats.friends++; };
    for (const s of this.S) {
      const houses = this.sbl[s.id].filter(b => b.type === BT.HOUSE); if (!houses.length) continue;
      const per = Math.ceil(s.pop0 / houses.length), nTav = this.sbl[s.id].filter(b => b.type === BT.TAVERN).length;
      const near = l => l.some(b => b.sid === s.id || Math.hypot(b.x - s.x, b.y - s.y) <= 34), hasFarm = near(this.farms), hasShop = near(this.workshops);
      let left = s.pop0, keepers = nTav * 3;
      for (const home of houses) for (let k = 0; k < per && left > 0; k++, left--) {
        const id = dots.length, r = R();
        let job = keepers > 0 && this.taverns.length ? 2 : r < 0.36 ? (hasFarm ? 0 : 3) : r < 0.62 ? (hasShop ? 1 : hasFarm ? 0 : 3) : 3;
        if (job === 2) keepers--;
        const w = job === 3 ? null : this.workFor(job, s.id);
        const life = 45 + R() * 25, age = ADULT + R() * (life - ADULT - 4);
        if (id >= this.names.length) this.names.push(this.nameGen());
        dots.push(this.makeDot(id, { name: this.names[id], fam: home.fam, job, home: home.id, work: w ? w.id : -1, traits: rollTraits(R), age, life }, R));
      }
    }
    const n = dots.length;
    // starting relationships: housemates (kin), coworkers, and a batch of couples
    const byHome = {}; for (const d of dots) (byHome[d.home] = byHome[d.home] || []).push(d);
    for (const g of Object.values(byHome)) for (let i = 0; i < g.length; i++) for (let j = i + 1; j < g.length; j++) link(g[i], g[j], 35 + R() * 15);
    for (const d of dots) for (let k = 0; k < 2; k++) {
      const o = dots[(R() * n) | 0];
      if (o !== d && !d.aff.has(o.id) && (this.buildings[o.home].sid === this.buildings[d.home].sid) && (o.job === d.job || R() < 0.3)) link(d, o, 28 + R() * 10);
    }
    let made = 0, tries = 0; const wantC = Math.round(n * 0.07);
    while (made < wantC && tries++ < 1500) {
      const a = dots[(R() * n) | 0], b = dots[(R() * n) | 0];
      if (a === b || a.partner >= 0 || b.partner >= 0 || a.home === b.home || a.fam === b.fam || this.buildings[a.home].sid !== this.buildings[b.home].sid) continue;
      link(a, b, 45 + R() * 20); a.partner = b.id; b.partner = a.id; a.since = b.since = -Math.floor(R() * 1.2 * DAY_TICKS);
      a.married = b.married = made < wantC * 0.36; made++;
      for (const d of [a, b]) { d.done.add('love'); if (d.dream === 'love') d.dream = this.pickDream(d, R, 'love'); }
    }
    // ownership: house heads own their homes; about half of the businesses start in private hands
    for (const d of dots) { const h = this.buildings[d.home]; if (h.owner < 0) h.owner = d.id; }
    for (const b of this.buildings) if (b.state === 'ok' && (b.type === BT.MARKET || b.type === BT.TAVERN || b.type === BT.WORKSHOP || b.type === BT.FARM || b.type === BT.DOCK) && R() < 0.55) {
      const pool = dots.filter(d => d.adult && this.buildings[d.home].sid === b.sid && !this.ownedBy(d.id).length).sort((a, c) => (c.traits.includes('ambitious') ? 1 : 0) + R() * 0.8 - ((a.traits.includes('ambitious') ? 1 : 0) + R() * 0.8));
      if (pool.length) { b.owner = pool[0].id; b.cash = 40; pool[0].coin += 30; }
    }
  }
  ownedBy(id, types) { return this.buildings.filter(b => b.owner === id && b.state === 'ok' && b.type !== BT.HOUSE); }

  /* ---------- the growing country: construction, ownership, businesses, failure ---------- */
  bldMsg(b) { return { i: b.id, ty: b.type, x: b.x, y: b.y, n: b.name, d: b.door, w: b.w, h: b.h, st: b.state === 'ok' ? 0 : b.state === 'build' ? 1 : b.state === 'vacant' ? 2 : 3, o: b.owner, s: b.sid, f: b.fam || '', ow: b.owner >= 0 && this.dots[b.owner] ? this.dots[b.owner].name : '' }; }
  pushBld(b, op) { this.out.push({ t: 'bld', op, b: this.bldMsg(b) }); }
  pushTiles(list) { if (list.length) this.out.push({ t: 'tiles', c: list.map(i => [i, this.tiles[i]]) }); }
  footprint(b) { const r = []; for (let dy = 0; dy < b.h; dy++) for (let dx = 0; dx < b.w; dx++) r.push((b.y + dy) * W + b.x + dx); return r; }
  siteFor(d) {
    const sid = this.buildings[d.home].sid; let best = null, bv = 1e9;
    for (const st of this.sites) { const v = (st.sid === sid ? 0 : 30) + Math.hypot(st.x - d.x, st.y - d.y); if (v < bv && v < 60) { bv = v; best = st; } }
    return best;
  }
  freePlot(s, kind) {
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
  expandSettlement(s) {
    const r = Gen.expand(this.map, s, () => rnd()); if (!r.ok) return false;
    if (r.tiles.length) { this.pushTiles(r.tiles); this.fgen++; this.ev('road', `🛣️ ${s.name} laid a new street.`, [], 40, 1); }
    return true;
  }
  plotFor(s, kind) { return this.freePlot(s, kind) || (this.expandSettlement(s) ? this.freePlot(s, kind) : null); }
  startBuild(plot, type, owner, cost) {
    const b = this.placeOn(plot, type, 'build'); b.owner = owner; b.need = BUILD_SHIFTS[type]; b.prog = 0; b.escrow = cost; b.started = this.tick;
    this.nameBuilding(b, owner >= 0 ? this.dots[owner] : null);
    this.sites.push(b); this.fgen++; this.pushBld(b, 'add'); this.pushTiles(this.footprint(b)); return b;
  }
  buildStep(d, b) {
    if (!b || b.state !== 'build') return;
    const w = Math.min(9, Math.max(0, b.escrow)); b.escrow -= w; d.coin += w; b.prog++;
    if (b.prog >= b.need) this.completeBuild(b);
  }
  completeBuild(b) {
    b.state = 'ok'; b.born = this.tick; this.sites = this.sites.filter(x => x !== b); this.biz.built++; this.rebuild(); this.fgen++; this.pushBld(b, 'upd');
    const o = b.owner >= 0 ? this.dots[b.owner] : null, s = this.S[b.sid], nm = BT_NAME[b.type].toLowerCase();
    if (b.type === BT.MARKET) { b.stock = 40; b.cash = 20; }
    if (b.type === BT.HOUSE) { this.moveIn(b); this.ev('house', `🏠 ${o ? o.name + "'s" : 'A'} new house is finished in ${s.name}.`, o ? [o.id] : [], 20, 1); return; }
    if (o && b.owner >= 0) b.cash = Math.max(b.cash, 15);
    this.ev('opened', `${o ? '🏪' : '🏛️'} ${b.name} ${BT_NAME[b.type]} opens in ${s.name}${o ? ` — owner ${o.name}` : ' — a public works project'}!`, o ? [o.id] : [], 0, 3);
  }
  moveIn(b) {
    const o = this.dots[b.owner]; if (!o || o.dead) return; const old = o.home, grp = [o];
    if (o.partner >= 0 && !this.dots[o.partner].dead && this.dots[o.partner].home === old) grp.push(this.dots[o.partner]);
    for (const k of this.dots) if (!k.dead && !k.adult && k.home === old && k.fam === o.fam) grp.push(k);
    for (const m of grp) m.home = b.id; b.fam = o.fam;
  }
  residents(hid) { let n = 0; for (const d of this.dots) if (!d.dead && d.home === hid) n++; return n; }
  unemployed(sid) { let n = 0; for (const d of this.dots) if (!d.dead && d.adult && d.job === 3 && this.buildings[d.home].sid === sid) n++; return n; }
  unstaff(b) {
    for (const d of this.dots) if (!d.dead && d.work === b.id) {
      d.work = -1; const w = d.job === 3 || d.job === 2 ? null : this.workFor(d.job, b.sid);
      if (w && w.id !== b.id) d.work = w.id; else d.job = 3;
    }
    b.staff = 0;
  }
  demolish(b) {
    for (const d of b.inside.slice()) { d.inside = false; d.phase = 'walk'; d.goal = null; } b.inside.length = 0; b.occ = 0;
    b.state = 'gone'; b.stock = 0; const p = this.map.plots[b.plot]; if (p) { p.used = false; p.bid = -1; }
    const fp = this.footprint(b); for (const i of fp) this.tiles[i] = TILE.GRASS;
    this.sites = this.sites.filter(x => x !== b); this.rebuild(); this.fgen++; this.pushBld(b, 'del'); this.pushTiles(fp);
  }
  isBiz(b) { return b.type === BT.MARKET || b.type === BT.TAVERN || b.type === BT.WORKSHOP || b.type === BT.FARM || b.type === BT.DOCK; }

  economyDawn() {
    this.sPop = []; for (const d of this.dots) if (!d.dead) { const sid = this.buildings[d.home].sid; this.sPop[sid] = (this.sPop[sid] || 0) + 1; }
    this.settle(); this.hire(); this.disasters(); this.housing(); this.entrepreneurs(); this.sales(); this.immigration(); this.vacancies();
  }
  settle() {
    const day = this.day();
    for (const b of this.buildings) {
      if (b.state !== 'ok' || !this.isBiz(b)) continue;
      if (b.type === BT.DOCK && rnd() < 0.45) {                       // a ship comes in: trade, and sometimes grain
        const mk = this.sbl[b.sid].find(x => x.type === BT.MARKET), tr = this.S[b.sid].trade + 0.5; b.rev += Math.round(40 + rnd() * 70 * tr);
        if (mk && mk.stock < 300 && rnd() < 0.6) { const q = 70 + ((rnd() * 90) | 0); mk.stock = Math.min(STOCK_CAP, mk.stock + q); this.ev('ship', `⚓ A trading ship docked at ${this.S[b.sid].name} and unloaded ${q} sacks of grain at ${b.name} Dock.`, [], 30, 2); }
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
  fail(b, visits) {
    const o = this.dots[b.owner], s = this.S[b.sid], rivals = this.sbl[b.sid].filter(x => x !== b && x.type === b.type).length;
    const why = b.type === BT.FARM && this.tick - this.blightAt < 4 * DAY_TICKS ? 'the blight wrecked the harvest' : (b.type === BT.FARM || b.type === BT.WORKSHOP || b.type === BT.TAVERN) && (b.staff || 0) === 0 ? 'nobody was working there' : rivals >= 2 ? 'too many rivals in town' : visits < 4 ? 'hardly any customers' : o.traits.includes('lazy') ? 'the owner never kept it up' : 'costs outran takings';
    this.ev('bankrupt', `📉 ${o.name}'s ${BT_NAME[b.type].toLowerCase()} ${b.name} in ${s.name} went bankrupt — ${why}.`, [o.id], 0, 4);
    o.coin = Math.max(0, o.coin - 20); o.social = Math.max(0, o.social - 25); this.say(o, [C.ME, C.BROKE]);
    b.state = 'vacant'; b.vac = 0; b.owner = -1; b.cash = 0; if (b.type === BT.MARKET) b.stock = 0;
    this.biz.closed++; this.unstaff(b); this.rebuild(); this.fgen++; this.pushBld(b, 'upd');
  }
  hire() {
    const staff = new Map(); for (const d of this.dots) if (!d.dead && d.adult && d.work >= 0) staff.set(d.work, (staff.get(d.work) || 0) + 1);
    const pools = {}; for (const d of this.dots) if (!d.dead && d.adult && d.job === 3) (pools[this.buildings[d.home].sid] = pools[this.buildings[d.home].sid] || []).push(d);
    for (const b of this.buildings) b.staff = staff.get(b.id) || 0;
    for (const b of this.buildings) {
      if (b.state !== 'ok' || !STAFF[b.type]) continue; let need = STAFF[b.type] - b.staff; const pool = pools[b.sid]; if (need <= 0 || !pool) continue;
      const job = b.type === BT.FARM ? 0 : b.type === BT.TAVERN ? 2 : 1;
      while (need > 0 && pool.length) { const d = pool.splice((rnd() * pool.length) | 0, 1)[0]; d.job = job; d.work = b.id; need--; b.staff++; }
    }
  }
  entrepreneurs() {
    if (this.sites.length >= 8) return; let made = 0;
    for (const d of this.dots) {
      if (d.dead || !d.adult || d.coin < 75 || made >= 2) continue;
      let m = 0.004; if (d.traits.includes('ambitious')) m *= 3; if (d.dream === 'rich') m *= 2; if (d.job === 3) m *= 1.6; if (d.traits.includes('lazy')) m *= 0.3; if (d.coin > 200) m *= 2;
      if (this.ownedBy(d.id).length >= 2 || this.sites.some(x => x.owner === d.id) || rnd() > m) continue;
      if (this.tryFound(d)) made++;
    }
  }
  tryFound(d) {
    const home = this.buildings[d.home], s = this.S[home.sid], P = this.sPop[s.id] || 1, L = this.sbl[s.id];
    const cnt = t => L.filter(b => b.type === t).length, nm = this.nearest(this.markets, d, 0), starved = nm && nm.stock < 60 ? 0.5 : 0;
    const opts = [[BT.MARKET, P / 85 - cnt(BT.MARKET) + starved + (s.tier <= 1 ? 0.1 : -0.25)], [BT.TAVERN, P / 60 - cnt(BT.TAVERN)], [BT.WORKSHOP, P / 40 - cnt(BT.WORKSHOP) + this.unemployed(s.id) / 12], [BT.FARM, P * 0.36 / 11 - this.farms.filter(f => f.sid === s.id).length + starved]];
    if (s.quayAt !== undefined && cnt(BT.DOCK) < (s.tier === 0 ? 3 : 1)) opts.push([BT.DOCK, 0.55 - cnt(BT.DOCK) * 0.3 + s.trade * 0.5]);
    for (const o of opts) { o[1] += (rnd() - 0.5) * 0.9; if (o[0] === BT.MARKET && this.mcount >= MAXM) o[1] = -9; }   // overconfidence: people misjudge a market
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
  housing() {
    if (this.sites.length >= 8) return;
    const res = new Map(); for (const d of this.dots) if (!d.dead) { if (!res.has(d.home)) res.set(d.home, []); res.get(d.home).push(d); }
    let did = 0;
    for (const [hid, list] of res) {
      if (list.length < 5 || did >= 2) continue; const h = this.buildings[hid]; if (h.state !== 'ok') continue;
      const ad = list.filter(d => d.adult && d.id !== h.owner && !this.sites.some(x => x.owner === d.id));
      const mover = ad.find(d => d.partner >= 0 && list.includes(this.dots[d.partner])) || ad.sort((a, b) => b.coin - a.coin)[0]; if (!mover) continue;
      const cost = BUILD_SHIFTS[BT.HOUSE] * 10; if (mover.coin < cost * 0.4 && this.treasury < cost * 3) continue;
      const s = this.S[h.sid], plot = this.plotFor(s, 'house'); if (!plot) continue;
      const own = Math.max(0, Math.min(cost, mover.coin - 5)); mover.coin -= own; if (own < cost) this.treasury -= cost - own;
      this.startBuild(plot, BT.HOUSE, mover.id, cost); did++;
      this.ev('moveout', `🏠 ${mover.name} is building a place of their own in ${s.name}${own < cost ? ' (town housing grant)' : ''}.`, [mover.id], 30, 1);
    }
  }
  addDot(o) {
    const slot = this.dots.find(x => x.dead), id = this.dots.length < this.maxPop ? this.dots.length : (slot ? slot.id : -1); if (id < 0) return null;
    const d = this.makeDot(id, o, rnd); this.dots[id] = d; this.names[id] = d.name; if (this.rep.length <= id) this.rep = new Float32Array(this.dots.length + 8);
    this.out.push({ t: 'born', id: d.id, name: d.name, f: d.fam, j: d.job, h: d.home, tr: d.traits }); return d;
  }
  immigration() {
    if (this.dots.filter(d => !d.dead).length >= this.maxPop || !this.markets.length) return;
    const avg = this.markets.reduce((a, m) => a + m.stock, 0) / this.markets.length; if (avg < 130 || rnd() > 0.3) return;
    const w = this.S.map(s => { const sp = this.sbl[s.id].filter(b => b.type === BT.HOUSE && this.residents(b.id) <= 2).length; return (s.tier === 0 ? 3 : s.tier === 1 ? 1.5 : 1) * (1 + sp) * (this.sbl[s.id].some(b => b.type === BT.HOUSE) ? 1 : 0); });
    let r = rnd() * w.reduce((a, b) => a + b, 0), s = this.S[0]; for (let i = 0; i < w.length; i++) { r -= w[i]; if (r <= 0) { s = this.S[i]; break; } }
    const houses = this.sbl[s.id].filter(b => b.type === BT.HOUSE).sort((a, b) => this.residents(a.id) - this.residents(b.id)); if (!houses.length) return;
    const home = houses[0], n = 1 + ((rnd() * 3) | 0), fam = this.famGen(), made = [];
    for (let i = 0; i < n; i++) { const d = this.addDot({ name: this.newName(), fam, job: 3, home: home.id, work: -1, traits: rollTraits(rnd), age: ADULT + 2 + rnd() * 14, life: 45 + rnd() * 25, coin: 50 + rnd() * 90 }); if (d) made.push(d); }
    for (const a of made) for (const b of made) if (a !== b) a.aff.set(b.id, 40);
    if (made.length) { this.biz.arrived += made.length; this.ev('arrive', `🚶 ${made.length === 1 ? made[0].name + ' arrives' : made.map(m => m.name).join(' & ') + ' arrive'} in ${s.name} looking for work and a home.`, made.map(m => m.id), 0, 3); }
  }
  sales() {
    if (rnd() > 0.25) return; const cand = this.buildings.filter(b => b.state === 'ok' && b.owner >= 0 && this.isBiz(b)); if (!cand.length) return;
    const b = pick(cand), o = this.dots[b.owner], avg = b.hist.length ? b.hist.reduce((x, y) => x + y, 0) / b.hist.length : 0;
    const price = Math.max(40, Math.round(avg * 5)), buyer = this.dots.filter(x => !x.dead && x.adult && x.id !== o.id && x.coin > price * 1.2 && this.buildings[x.home].sid === b.sid).sort((x, y) => y.coin - x.coin)[0];
    if (!buyer || (o.coin > 60 && avg > 0 && rnd() > 0.15)) return;
    buyer.coin -= price; o.coin += price; b.owner = buyer.id; this.biz.sold++; this.pushBld(b, 'upd');
    this.ev('sale', `🔑 ${o.name} sold ${b.name} ${BT_NAME[b.type]} to ${buyer.name} for ${price} coins.`, [o.id, buyer.id], 0, 2);
  }
  disasters() {
    for (const b of this.buildings) {
      if (b.state !== 'ok' || b.type === BT.PARK) continue;
      const p = 0.0007 * (this.season() === 3 ? 1.5 : 1) * (b.type === BT.TAVERN || b.type === BT.WORKSHOP ? 1.6 : 1);
      if (rnd() < p) { this.burn(b); break; }
    }
  }
  burn(b) {
    const o = b.owner >= 0 ? this.dots[b.owner] : null, s = this.S[b.sid]; let homeless = 0;
    if (b.type === BT.HOUSE) {
      const alt = this.sbl[b.sid].filter(x => x.type === BT.HOUSE && x !== b).sort((x, y) => this.residents(x.id) - this.residents(y.id))[0];
      for (const d of this.dots) if (!d.dead && d.home === b.id) { d.home = alt ? alt.id : this.houses.find(x => x !== b).id; d.coin = Math.max(0, d.coin - 10); d.social = Math.max(0, d.social - 20); homeless++; }
    } else this.unstaff(b);
    this.ev('fire', `🔥 Fire in ${s.name}! ${b.name} ${BT_NAME[b.type]} burned to the ground${o ? ` — ${o.name} loses everything in it` : ''}${homeless ? `, ${homeless} left homeless` : ''}.`, o ? [o.id] : [], 0, 4);
    this.biz.fires++; this.demolish(b);
  }
  vacancies() {
    for (const b of this.buildings) if (b.state === 'vacant') {
      b.vac++;
      if (b.vac >= 8) { this.ev('demolish', `🧱 The empty ${BT_NAME[b.type].toLowerCase()} ${b.name} in ${this.S[b.sid].name} was torn down.`, [], 60, 1); this.demolish(b); }
    }
  }
  inherit(d) {
    for (const b of this.buildings) if (b.owner === d.id && b.state !== 'gone') {
      const heir = (d.partner >= 0 && !this.dots[d.partner].dead && this.dots[d.partner]) || this.dots.find(k => !k.dead && k.adult && k.home === d.home && k.id !== d.id) || this.friends(d).map(f => this.dots[f[0]]).find(k => k.adult) || null;
      if (b.type !== BT.HOUSE && heir) { b.owner = heir.id; this.ev('inherit', `📜 ${heir.name} inherits ${b.name} ${BT_NAME[b.type]}.`, [heir.id], 40, 2); } else b.owner = heir ? heir.id : -1;
      if (b.state === 'build' && b.owner < 0) { /* orphaned site: town finishes it */ }
    }
  }
  civicBuild(m) {
    if (this.sites.length >= 6) return false;
    for (const s of this.S) {
      const P = this.sPop[s.id] || 0, has = t => this.sbl[s.id].some(b => b.type === t) || this.sites.some(b => b.sid === s.id && b.type === t);
      if (s.tier <= 2 && P >= 16 && !has(BT.MARKET) && this.mcount < MAXM && this.treasury >= 160) { const p = this.plotFor(s, 'center'); if (p) { this.treasury -= 110; this.startBuild(p, BT.MARKET, -1, 110); this.ev('civic', `🏛️ Mayor ${m.name} funds a public market for ${s.name}.`, [m.id], 0, 3); return true; } }
      if (s.tier <= 1 && !has(BT.HALL) && this.treasury >= 300) { const p = this.plotFor(s, 'center'); if (p) { this.treasury -= 150; this.startBuild(p, BT.HALL, -1, 150); this.ev('civic', `🏛️ Mayor ${m.name} commissions a town hall for ${s.name}.`, [m.id], 0, 3); return true; } }
    }
    if (this.treasury > 900) { const fords = []; for (let i = 0; i < this.tiles.length; i++) if (this.tiles[i] === TILE.FORD) fords.push(i); if (fords.length) { const i = pick(fords); this.tiles[i] = TILE.BRIDGE; this.treasury -= 200; this.fgen++; this.pushTiles([i]); this.ev('bridge', `🌉 Mayor ${m.name} replaced a river ford with a stone bridge.`, [m.id], 0, 3); return true; } }
    return false;
  }

  /* ---------- helpers ---------- */
  dayIdx() { return Math.floor(this.tick / DAY_TICKS); }
  season() { return Math.floor(this.dayIdx() / SEASON_DAYS) % 4; }
  year() { return Math.floor(this.dayIdx() / (SEASON_DAYS * 4)) + 1; }
  mprice(b) { return b.stock < 25 ? 8 : b.stock < 60 ? 6 : b.stock < 120 ? 4 : b.stock < 260 ? 3 : 2; }
  price(d) { return d.adult ? 2 : 0; }   // cheapest possible meal; actual price is set by the market's stock
  tod() { return (this.tick % DAY_TICKS) / DAY_TICKS; }
  day() { return Math.floor(this.tick / DAY_TICKS) + 1; }
  isNight(d) { const t = this.tod(); return t < 0.22 + d.off || t > 0.88 + d.off; }
  say(d, k) { this.out.push({ t: 'say', d: d.id, k }); }
  sayB(b, k) { this.out.push({ t: 'say', b: b.id, k }); }
  ev(kind, text, ids, gap = 0, w = 1) {
    if (gap && this.tick - (this.lastEv[kind] || -1e9) < gap) return;
    this.lastEv[kind] = this.tick; const m = { t: 'ev', k: kind, x: text, ids: ids || [], w }; this.out.push(m); this.hist.push(m); if (this.hist.length > 40) this.hist.shift();
  }
  later(dt, m) { this.pending.push({ at: this.tick + dt, m }); }
  fieldAt(b, d) { return this.F(this.buildings[b])[d.y * W + d.x]; }
  nearest(list, d, jitter = 0) { let best = null, bv = 1e9; for (const b of list) { const v = this.F(b)[d.y * W + d.x] + rnd() * jitter; if (v < bv) { bv = v; best = b; } } return best; }

  believedEmpty(d) { let n = 0; for (const m of this.markets) { const b = d.belief[m.mi]; if (b >= 0 && this.tick - b < 300 && this.F(m)[d.y * W + d.x] < 160) n++; } return n; }
  pickMarket(d) {
    let best = -1, bv = 1e9;
    for (const m of this.markets) { const b = d.belief[m.mi]; if (b >= 0 && this.tick - b < 300) continue; const v = this.F(m)[d.y * W + d.x]; if (v < bv) { bv = v; best = m.id; } }
    return best;
  }

  addAff(a, b, v) {
    const prev = a.aff.get(b.id) || 0, nv = Math.max(-100, Math.min(100, prev + v));
    a.aff.set(b.id, nv);
    if (a.aff.size > 14) { let mk = -1, mv = 1e9; for (const [k, x] of a.aff) if (Math.abs(x) < mv && k !== b.id) { mv = Math.abs(x); mk = k; } a.aff.delete(mk); }
    if (prev < 25 && nv >= 25) {
      const o = this.dots[b.id].aff.get(a.id) || 0;
      if (o >= 25) { const key = Math.min(a.id, b.id) * 1000 + Math.max(a.id, b.id); if (!this.pairs.has(key)) { this.pairs.add(key); this.stats.friends++; this.ev('friend', `🤝 ${a.name} and ${b.name} became friends.`, [a.id, b.id], 8); } }
    }
  }
  friends(d) { const r = []; for (const [k, v] of d.aff) if (v >= 25 && !this.dots[k].dead) r.push([k, v]); return r.sort((a, b) => b[1] - a[1]); }
  mood(d) { return Math.max(0, Math.min(100, Math.round(100 - Math.max(0, d.hunger - 40) * 0.8 - Math.max(0, 60 - d.energy) * 0.5 - Math.max(0, 60 - d.social) * 0.5 + Math.min(10, this.friends(d).length * 2) - (this.tick < d.grief ? 25 : 0)))); }

  enter(d, b) { d.inside = true; b.occ++; b.inside.push(d); }
  leave(d) { if (!d.inside) return; const b = this.buildings[d.goal.b]; d.inside = false; b.occ--; const i = b.inside.indexOf(d); if (i >= 0) b.inside.splice(i, 1); }

  /* ---------- the brain (swap me for an ML policy) ---------- */
  decide(d) {
    const tk = this.tick, tod = this.tod(), night = this.isNight(d), hours = tod > 0.27 && tod < 0.80;
    const c = [];
    c.push(['sleep', (100 - d.energy) * 1.15 + (night ? 75 : 0) - (d.hunger > 88 ? 60 : 0)]);
    const mk = d.hunger > 35 ? this.pickMarket(d) : -1;
    if (mk >= 0 && d.coin >= this.price(d) && !(d.shortAt && this.tick - d.shortAt < 150 && d.coin < 8)) c.push(['eat', d.hunger * 1.3 - (night && d.energy < 40 ? 30 : 0)]);
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
    const fest = tk < this.festival, inv = d.invite && tk < d.invite.until ? d.invite : null;
    c.push(['social', (100 - d.social) * d.soc * 0.95 + (fest ? 90 : 0) + (inv && inv.k === 'social' ? 60 : 0) - (night ? 45 : 0) - (this.weather ? 30 : 0)]);
    if (d.adult && d.coin >= DRINK_PRICE * 2) c.push(['drink', (100 - d.social) * d.soc * 0.55 + (tod > 0.62 && tod < 0.92 ? 22 : -35) + (inv && inv.k === 'drink' ? 60 : 0) + (fest ? 30 : 0) + (this.weather ? 15 : 0)]);
    c.push(['wander', 18 + rnd() * 10]);
    let bk = 'wander', bs = -1e9;
    for (const [k, s] of c) { const v = s + (rnd() - 0.5) * 14; if (v > bs) { bs = v; bk = k; } }
    this.setGoal(d, bk, mk, inv);
  }

  setGoal(d, k, mk, inv) {
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
        let b = (inv && inv.k === 'social') ? this.buildings[inv.b] : this.nearest(this.parks, d, this.tick < this.festival ? 8 : 40);
        if (inv && inv.k === 'social') d.invite = null;
        g = { k, b: b.id, enter: false }; break;
      }
      case 'drink': {
        let b = (inv && inv.k === 'drink') ? this.buildings[inv.b] : this.nearest(this.taverns, d, 25);
        if (inv && inv.k === 'drink') d.invite = null;
        g = { k, b: b.id, enter: true }; break;
      }
      default: { const sb = this.sbl[this.buildings[d.home].sid] || [], far = rnd() < 0.04, b = far ? pick(this.parks) : (sb.length ? pick(sb) : this.buildings[d.home]); g = { k: 'wander', b: b.id, enter: false }; }
    }
    d.goal = g; d.phase = 'walk'; d.nx = -1; d.prog = 0;
  }

  /* ---------- movement + activities ---------- */
  move(d) {
    const f = this.F(this.buildings[d.goal.b]);
    if (d.nx < 0) {
      const cur = f[d.y * W + d.x];
      if (cur === 0) { this.arrive(d); return; }
      let best = -1, bv = cur;
      const s = (rnd() * 4) | 0;
      for (let q0 = 0; q0 < 4; q0++) {
        const q = (q0 + s) & 3, nx = d.x + (q === 0 ? 1 : q === 1 ? -1 : 0), ny = d.y + (q === 2 ? 1 : q === 3 ? -1 : 0);
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const v = f[ny * W + nx]; if (v < bv) { bv = v; best = ny * W + nx; }
      }
      if (best < 0) { d.goal = null; return; }
      d.nx = best % W; d.ny = (best / W) | 0; d.prog = 0;
    }
    const tt = this.tiles[d.y * W + d.x];
    d.prog += d.speed * (tt === TILE.ROAD ? 1 : tt === TILE.OPEN ? 0.85 : 0.7) * (this.weather ? 0.8 : 1);
    if (d.prog >= 1) { d.x = d.nx; d.y = d.ny; d.nx = -1; d.prog = 0; if (f[d.y * W + d.x] === 0) this.arrive(d); }
  }

  arrive(d) {
    const g = d.goal, b = this.buildings[g.b];
    if ((b.state === 'gone' || b.state === 'vacant') && g.k !== 'wander' && g.k !== 'social') { d.phase = 'walk'; d.goal = null; return; }
    d.phase = 'do';
    switch (g.k) {
      case 'sleep': this.enter(d, b); d.timer = 900; break;
      case 'eat':
        {
          let pr = d.adult ? this.mprice(b) : 0; if (d.adult && d.hunger > 85 && d.coin < pr && b.stock > 20) pr = 0;   // the starving get charity
          if (b.stock > 0 && d.coin >= pr) { b.stock--; d.coin -= pr; b.till = (b.till || 0) + pr; b.rev += pr; b.visits++; this.enter(d, b); d.timer = 14; this.stats.meals++; d.meals++; if (b.stock === 0) this.checkStock(b); }
          else if (b.stock > 0) { this.sayDelayed(d, [C.ME, C.BROKE]); d.phase = 'walk'; d.goal = null; d.shortAt = this.tick; }
          else { d.belief[b.mi] = this.tick; this.sayDelayed(d, [2000 + b.id, C.NO, C.FOOD]); this.checkStock(b); d.phase = 'walk'; d.goal = null; }
        }
        break;
      case 'work': {
        const t = d.job === 0 ? 55 : d.job === 1 ? 70 : d.job === 2 ? 80 : 60;
        if (g.enter) this.enter(d, b); d.timer = t; break;
      }
      case 'deliver': {
        this.enter(d, b);
        const room = STOCK_CAP - b.stock, add = Math.min(room, d.carry);
        const rate = this.mprice(b) * 0.9 / 1.6;
        b.stock += add; d.coin += Math.round(d.carry * rate * 1.6);
        { const fb = this.buildings[d.work]; if (fb && fb.owner >= 0 && fb.state === 'ok' && fb.type === BT.FARM) { fb.rev += Math.round(d.carry * rate * 1.6 * 0.15); fb.visits++; } } this.stats.deliveries++; this.stats.wasted += d.carry - add; d.carry = 0; d.timer = 8; this.checkStock(b); break;
      }
      case 'build': if (b.state !== 'build') { d.phase = 'walk'; d.goal = null; } else d.timer = 70; break;
      case 'social': d.timer = 70 + ((rnd() * 70) | 0); break;
      case 'drink':
        if (d.coin >= DRINK_PRICE) { d.coin -= DRINK_PRICE; b.rev += DRINK_PRICE; b.visits++; this.enter(d, b); d.timer = 60 + ((rnd() * 50) | 0); }
        else { d.phase = 'walk'; d.goal = null; }
        break;
      default: d.timer = 12 + ((rnd() * 25) | 0);
    }
  }
  sayDelayed(d, k) { this.later(1, { t: 'say', d: d.id, k }); }

  checkStock(b) {
    if (b.stock <= 0 && !b.flag) { b.flag = true; this.ev('empty' + b.id, `🍞 ${b.name} Market has run out of food!`, [], 40, 2); }
    else if (b.stock >= 25 && b.flag) { b.flag = false; this.ev('restock' + b.id, `🌾 ${b.name} Market is stocked again.`, [], 40); }
  }

  doing(d) {
    const g = d.goal;
    switch (g.k) {
      case 'sleep': {
        d.energy = Math.min(100, d.energy + 0.42);
        if (--d.timer <= 0 || d.hunger > 96 || (!this.isNight(d) && d.energy >= 80)) this.finish(d);
        break;
      }
      case 'eat': if (--d.timer <= 0) { d.hunger = Math.max(0, d.hunger - 62); this.finish(d); } break;
      case 'work':
        if (--d.timer <= 0) {
          if (d.job === 0) { d.carry = tkLess(this.tick, this.blight) ? 0 : Math.max(1, Math.round(4 * YIELD[this.season()])); if (!d.carry) this.out.push({ t: 'say', d: d.id, k: [C.FARM, C.BAD] }); }
          else { const w = d.job === 1 ? 9 : d.job === 2 ? 10 : 8; d.coin += w; const wb = this.buildings[g.b]; wb.visits++; if (wb.owner >= 0 && wb.state === 'ok') { wb.wage += w; wb.rev += wb.type === BT.DOCK ? 13 : wb.type === BT.WORKSHOP ? 11 : 0; } }
          this.finish(d);
        }
        break;
      case 'build': if (--d.timer <= 0) { this.buildStep(d, this.buildings[g.b]); this.finish(d); } break;
      case 'social': d.social = Math.min(100, d.social + 0.30); if (--d.timer <= 0) this.finish(d); break;
      case 'drink': {
        d.social = Math.min(100, d.social + 0.38);
        if (this.tick % 20 === d.id % 20) { const b = this.buildings[g.b]; if (b.inside.length > 1) { const o = pick(b.inside); if (o !== d) { this.addAff(d, o, 3); this.addAff(o, d, 3); } } }
        if (--d.timer <= 0) this.finish(d); break;
      }
      default: if (--d.timer <= 0) this.finish(d);
    }
  }
  finish(d) {
    this.leave(d);
    const was = d.goal; d.goal = null; d.phase = 'walk';
    if (was.k === 'work' && d.job === 0 && d.carry > 0) {
      const m = this.markets.reduce((a, b) => (this.F(a)[d.y * W + d.x] + a.stock * 0.3 < this.F(b)[d.y * W + d.x] + b.stock * 0.3 ? a : b));
      d.goal = { k: 'deliver', b: m.id, enter: true }; d.nx = -1; d.prog = 0;
    }
  }

  /* ---------- life, death, drama ---------- */
  die(d, cause) {
    if (d.dead) return;
    if (d.inside && d.goal) this.leave(d);
    d.inside = false; d.dead = true; d.goal = null; d.phase = 'walk'; d.nx = -1; d.prog = 0; d.fight = false;
    const home = this.buildings[d.home]; d.x = home.door[0]; d.y = home.door[1];
    const fr = this.friends(d).map(f => this.dots[f[0]]);
    const heir = d.partner >= 0 && !this.dots[d.partner].dead ? this.dots[d.partner] : fr[0];
    const est = Math.round(d.coin);
    if (heir && est > 0) heir.coin += est;
    if (d.partner >= 0) { const p = this.dots[d.partner]; p.partner = -1; p.married = false; p.grief = this.tick + 900; p.social = Math.max(0, p.social - 30); }
    d.partner = -1; d.coin = 0;
    this.inherit(d);
    const mourners = fr.slice(0, 6), park = this.nearest(this.parks, mourners[0] || d, 0);
    for (const m of mourners) { m.grief = this.tick + 400; m.social = Math.max(0, m.social - 15); m.invite = { k: 'social', b: park.id, until: this.tick + 300 }; this.later(2 + ((rnd() * 10) | 0), { t: 'say', d: m.id, k: [1000 + d.id, C.DIE] }); }
    this.stats.deaths++;
    this.ev('death', `🕯️ ${d.name} ${cause === 'hunger' ? 'starved' : 'died of old age'} at ${Math.round(d.age)}.${mourners.length ? ` ${mourners.length} friend${mourners.length > 1 ? 's' : ''} mourn.` : ''}${heir && est > 0 ? ` ${heir.name} inherits ${est} coins.` : ''}`, [d.id].concat(mourners.slice(0, 1).map(m => m.id)), 0, 4);
  }
  spawn(a, b) {
    const slot = this.dots.find(x => x.dead) || (this.dots.length < this.maxPop && this.residents(a.home) < 7 ? { id: this.dots.length } : null); if (!slot) return false;
    if (this.rep.length <= slot.id) this.rep = new Float32Array(this.dots.length + 8);
    let traits = []; for (const t of a.traits.concat(b.traits)) if (rnd() < 0.35 && !traits.includes(t) && traits.length < 2) traits.push(t);
    if (!traits.length) traits = rollTraits(rnd);
    if (traits.includes('lazy') && traits.includes('ambitious')) traits = traits.filter(t => t !== 'lazy');
    const pj = (rnd() < 0.5 ? a : b).future, future = pj === 2 ? 3 : pj;
    const d = this.makeDot(slot.id, { name: this.newName(), fam: (rnd() < 0.5 ? a : b).fam, job: 3, home: a.home, work: -1, future, traits, age: 0, life: 45 + rnd() * 25, hunger: 20, energy: 90, social: 60, coin: 0 }, rnd);
    d.speed = 0.26; this.dots[slot.id] = d; this.names[slot.id] = d.name;
    for (const p of [a, b]) { p.aff.set(d.id, 70); d.aff.set(p.id, 70); p.kids++; }
    for (const o of this.dots) if (!o.dead && o.home === a.home && o.id !== d.id && o.id !== a.id && o.id !== b.id) { o.aff.set(d.id, 40); d.aff.set(o.id, 40); }
    this.stats.births++;
    this.out.push({ t: 'born', id: d.id, name: d.name, f: d.fam, j: d.job, h: d.home, tr: d.traits });
    this.ev('birth', `👶 ${a.name} and ${b.name} had a baby: ${d.name}!`, [d.id, a.id], 0, 2);
    return true;
  }
  newName() { const taken = new Set(this.dots.map(d => d.name)); for (let i = 0; i < 60; i++) { const w = this.nameGen(); if (!taken.has(w)) return w; } return this.nameGen() + 'x'; }
  grow(d) { d.adult = true; d.job = d.future; { const w = d.job === 3 || d.job === 2 ? null : this.workFor(d.job, this.buildings[d.home].sid); d.work = w ? w.id : -1; if (!w && d.job < 2) d.job = 3; } this.ev('grow', `🎓 ${d.name} grew up and became a ${JOBS[d.job]}.`, [d.id], 60, 1); }
  dreamCheck(d) {
    if (d.dream === 'content') return;
    const ok = d.dream === 'rich' ? d.coin >= 250 : d.dream === 'famous' ? this.friends(d).length >= 8 : d.dream === 'family' ? d.kids >= 2 : d.partner >= 0;
    if (!ok) return;
    d.done.add(d.dream); d.dreams++; d.social = 100; this.ev('dream', `✨ ${d.name} achieved a dream: ${DREAM_TXT[d.dream]}.`, [d.id], 20, 2);
    this.say(d, [C.ME, C.HAPPY]); d.dream = this.pickDream(d, rnd, d.dream);
  }
  couple(a, b) {
    if (a.dead || b.dead || a.partner >= 0 || b.partner >= 0) return;
    a.partner = b.id; b.partner = a.id; a.since = b.since = this.tick; a.social = b.social = 100;
    const park = this.nearest(this.parks, a, 10), inv = { k: 'social', b: park.id, until: this.tick + 300 }; a.invite = inv; b.invite = Object.assign({}, inv);
    this.ev('love', `💘 ${a.name} and ${b.name} are now a couple!`, [a.id, b.id], 0, 3);
  }
  reject(s, l) {
    s.rejectCd = 1500; s.social = Math.max(0, s.social - 30); s.aff.set(l.id, (s.aff.get(l.id) || 0) - 8);
    this.ev('reject', `💔 ${s.name} confessed to ${l.name} and got turned down.`, [s.id, l.id], 0, 3);
  }
  breakup(a, b) {
    a.partner = b.partner = -1; a.married = b.married = false; a.social = Math.max(0, a.social - 30); b.social = Math.max(0, b.social - 30);
    this.ev('breakup', `💔 ${a.name} and ${b.name} broke up.`, [a.id, b.id], 0, 3);
  }
  wedding(a, b) {
    a.married = b.married = true;
    const park = this.nearest(this.parks, a, 10), inv = { k: 'social', b: park.id, until: this.tick + 400 };
    const guests = this.friends(a).slice(0, 6).concat(this.friends(b).slice(0, 6)).map(f => this.dots[f[0]]);
    for (const g of guests.concat([a, b])) g.invite = Object.assign({}, inv);
    this.say(a, [C.ME, C.MARRY, C.YOU]); this.later(5, { t: 'say', d: b.id, k: [C.YES] });
    this.ev('wedding', `💍 ${a.name} and ${b.name} got married! ${guests.length} guests head to the park.`, [a.id, b.id], 0, 4);
  }
  jealous(a, b) {
    if (a.partner < 0 || b.id === a.partner) return;
    const P = this.dots[a.partner]; if (P.dead || P.inside) return;
    const dx = P.x - a.x, dy = P.y - a.y, jt = P.traits.includes('jealous');
    if (dx * dx + dy * dy > 64 || rnd() > (jt ? 0.7 : 0.06)) return;
    P.aff.set(b.id, Math.min(P.aff.get(b.id) || 0, 0) - 25); this.say(P, [C.ME, C.JEALOUS]);
    this.ev('jealous', `😠 ${P.name} saw ${a.name} chatting with ${b.name}.`, [P.id, a.id], 15, 3);
    if (rnd() < (jt ? 0.4 : 0.1)) this.breakup(P, a);
  }
  kindness(a, b) {
    if (a.traits.includes('kind') && b.coin < 15 && a.coin > 50 && rnd() < 0.5) { a.coin -= 15; b.coin += 15; this.addAff(b, a, 8); this.say(b, [C.THANKS]); this.ev('kind', `💖 ${a.name} gave ${b.name} 15 coins.`, [a.id, b.id], 40, 1); }
  }
  couples() {
    const tk = this.tick;
    for (const d of this.dots) {
      if (d.dead || d.partner < 0 || d.id > d.partner) continue;
      const p = this.dots[d.partner];
      if (rnd() < 0.05) { const tav = rnd() < 0.45 && d.coin > 6 && p.coin > 6 && d.adult, place = tav ? this.nearest(this.taverns, d, 0) : this.nearest(this.parks, d, 10); const inv = { k: tav ? 'drink' : 'social', b: place.id, until: tk + 300 }; d.invite = inv; p.invite = Object.assign({}, inv); }
      if (!d.married && tk - d.since > 2 * DAY_TICKS && rnd() < 0.03 && (d.aff.get(p.id) || 0) >= 50) this.wedding(d, p);
      if (d.married && d.kids < 4 && rnd() < 0.02) this.spawn(d, p);
    }
  }
  stealTick() {
    for (const t of this.dots) {
      if (!t.isThief || t.dead || t.inside || t.phase === 'chat' || t.theftCd > 0 || !t.adult || rnd() > 0.08) continue;
      let vic = null;
      for (const v of this.dots) {
        if (v === t || v.dead || v.inside || v.coin < 15 || v.phase === 'chat') continue;
        const dx = v.x - t.x, dy = v.y - t.y; if (dx * dx + dy * dy > 4 || (t.aff.get(v.id) || 0) >= 25) continue;
        vic = v; break;
      }
      if (vic) this.steal(t, vic);
    }
  }
  steal(t, v) {
    const amt = Math.round(Math.min(v.coin, 8 + rnd() * 14)); v.coin -= amt; t.coin += amt; t.theftCd = 900 + ((rnd() * 1200) | 0);
    const wit = [];
    for (const o of this.dots) { if (o === t || o === v || o.dead || o.inside) continue; const dx = o.x - t.x, dy = o.y - t.y; if (dx * dx + dy * dy <= 36 && rnd() < 0.5) wit.push(o); }
    const noticed = rnd() < 0.45;
    if (!noticed && !wit.length) { this.ev('theft0', `🥷 ${t.name} picked ${v.name}'s pocket (${amt} coins). Nobody noticed.`, [t.id, v.id], 25, 2); return; }
    const knowers = wit.slice(0, 4).concat(noticed ? [v] : []);
    for (const k of knowers) { k.thieves.add(t.id); k.aff.set(t.id, Math.min(k.aff.get(t.id) || 0, 0) - 30); }
    this.stats.thefts++;
    this.ev('theft', `🚨 ${t.name} robbed ${v.name}${noticed ? '' : ' unnoticed'}!${wit[0] ? ` ${wit[0].name} saw it.` : ''}`, [t.id, v.id], 0, 3);
    for (const k of knowers) { if (k.traits.includes('coward')) this.say(k, [C.AFRAID]); else if (k !== v) this.say(k, [1000 + t.id, C.THIEF]); }
    if (noticed && !v.traits.includes('coward') && rnd() < (v.traits.includes('hothead') ? 0.95 : 0.6)) this.fight(v, t, { amt });
    else if (noticed) this.say(v, [C.ME, C.ANGRY]);
  }
  fight(a, b, ctx) {
    if (a.phase === 'chat' || b.phase === 'chat' || a.inside || b.inside || a.dead || b.dead) return;
    for (const d of [a, b]) { d.prev = d.phase; d.phase = 'chat'; d.chatT = 18; d.fight = true; d.chatCd = 250; }
    this.say(a, [C.STOP, C.THIEF]); this.later(4, { t: 'say', d: b.id, k: [ctx ? C.SORRY : C.NO] }); this.later(9, { t: 'say', d: a.id, k: [C.ANGRY] });
    this.later(18, { fn: () => this.resolveFight(a, b, ctx) });
  }
  resolveFight(a, b, ctx) {
    if (a.dead || b.dead) return;
    const pw = d => d.energy * 0.3 + (d.traits.includes('hothead') ? 25 : 0) + rnd() * 40 + (d.isThief ? 8 : 0);
    const aw = pw(a) >= pw(b), w = aw ? a : b, l = aw ? b : a;
    w.energy = Math.max(0, w.energy - 6); l.energy = Math.max(0, l.energy - 16);
    this.addAff(a, b, -15); this.addAff(b, a, -15); this.stats.fights++;
    if (ctx) {
      if (aw) { const back = Math.round(Math.min(b.coin, ctx.amt + 5)); b.coin -= back; a.coin += back; this.ev('fight', `💥 ${a.name} caught ${b.name} red-handed and took ${back} coins back.`, [a.id, b.id], 0, 3); }
      else this.ev('fight', `🏃 ${b.name} beat ${a.name} in a scuffle and kept the loot.`, [b.id, a.id], 0, 3);
    } else this.ev('fight', `🥊 ${a.name} confronted known thief ${b.name} — ${w.name} won the brawl.`, [a.id, b.id], 0, 3);
  }

  /* ---------- talking ---------- */
  dialogue(a, b) {
    const tk = this.tick, nm = x => 1000 + x.id;
    const L = [];
    L.push([a, [C.HELLO].concat(rnd() < 0.4 ? [nm(b)] : [])]);
    L.push([b, [C.HELLO].concat(rnd() < 0.4 ? [nm(a)] : [])]);
    const fx = [];
    const moodTok = s => s.hunger > 70 ? C.HUNGRY : s.energy < 30 ? C.TIRED : s.social < 30 ? C.LONELY : this.mood(s) > 65 ? C.HAPPY : C.SAD;
    const topic = (s, l) => {
      if (s.hunger > 65) {
        L.push([s, [C.ME, C.HUNGRY]]);
        const m = this.pickMarket(l);
        if (m >= 0 && l.belief[this.buildings[m].mi] < 0) { L.push([l, [C.YOU, C.GO, 2000 + m]]); fx.push(() => { s.belief[this.buildings[m].mi] = -1; }); }
        else L.push([l, [C.ME, C.SAD]]);
        return true;
      }
      for (const m of this.markets) { const bs = s.belief[m.mi]; if (bs >= 0 && tk - bs < 250 && !(l.belief[m.mi] >= 0 && tk - l.belief[m.mi] < 250)) { L.push([s, [2000 + m.id, C.NO, C.FOOD]]); L.push([l, [C.THANKS]]); fx.push(() => { l.belief[m.mi] = bs; }); return true; } }
      if (s.coin < 12) { L.push([s, [C.ME, C.BROKE]]); L.push([l, [C.YOU, C.GO, C.WORK]]); return true; }
      if (s.adult && l.adult && s.partner < 0 && l.partner < 0 && s.home !== l.home && s.fam !== l.fam && s.rejectCd <= 0 && (s.aff.get(l.id) || 0) >= 22 && rnd() < (s.traits.includes('romantic') ? 0.5 : 0.2)) {
        L.push([s, [C.ME, C.LOVE, C.YOU]]);
        if (rnd() < 0.3 + (l.aff.get(s.id) || 0) / 100 + (l.traits.includes('romantic') ? 0.15 : 0)) { L.push([l, [C.ME, C.LOVE, C.YOU]]); fx.push(() => this.couple(s, l)); }
        else { L.push([l, [C.NO, C.SORRY]]); fx.push(() => this.reject(s, l)); }
        return true;
      }
      if (s.thieves.size) {
        const tid = [...s.thieves].find(x => x !== l.id && !this.dots[x].dead && !l.thieves.has(x));
        if (tid !== undefined && rnd() < (s.traits.includes('gossip') ? 0.9 : 0.5)) { L.push([s, [1000 + tid, C.THIEF]]); L.push([l, [C.ANGRY]]); fx.push(() => { l.thieves.add(tid); this.addAff(l, this.dots[tid], -12); }); return true; }
      }
      if (s.social < 70 && rnd() < 0.55 && l.coin >= 4 && s.coin >= 4) {
        const tav = rnd() < 0.4, place = tav ? this.nearest(this.taverns, s, 0) : this.nearest(this.parks, s, 10);
        L.push([s, [C.YOU, C.AND, C.ME, C.GO, 2000 + place.id]]);
        const yes = (l.aff.get(s.id) || 0) + rnd() * 40 > 15;
        if (yes) { L.push([l, [C.YES]]); fx.push(() => { const inv = { k: tav ? 'drink' : 'social', b: place.id, until: tk + 400 }; s.invite = inv; l.invite = Object.assign({}, inv); }); }
        else L.push([l, [C.NO]]);
        return true;
      }
      const fr = [...s.aff.keys()].filter(k => k !== l.id && !this.dots[k].dead);
      if (fr.length && rnd() < (s.traits.includes('gossip') ? 0.8 : 0.4)) {
        const c = this.dots[pick(fr)], good = (s.aff.get(c.id) || 0) >= 10;
        L.push([s, [nm(c), good ? C.GOOD : C.BAD]]); L.push([l, [C.YES]]);
        fx.push(() => this.addAff(l, c, good ? 3 : -3)); return true;
      }
      L.push([s, [C.ME, moodTok(s)]]); L.push([l, [C.ME, moodTok(l)]]); return true;
    };
    const sp = (a.hunger > 65 || (b.hunger <= 65 && rnd() < 0.5)) ? a : b;
    topic(sp, sp === a ? b : a);
    L.push([rnd() < 0.5 ? a : b, [C.BYE]]);
    return { L, fx };
  }

  startChat(a, b) {
    const { L, fx } = this.dialogue(a, b);
    L.forEach(([s, k], i) => this.later(1 + i * 4, { t: 'say', d: s.id, k }));
    const dur = 4 + L.length * 4 + 2;
    for (const d of [a, b]) { d.prev = d.phase; d.phase = 'chat'; d.chatT = dur; d.chatCd = 120 + ((rnd() * 80) | 0); }
    this.later(dur, { fn: () => {
      if (a.dead || b.dead) return;
      for (const f of fx) f();
      const bonus = 12;
      a.social = Math.min(100, a.social + bonus); b.social = Math.min(100, b.social + bonus);
      this.addAff(a, b, 7 + rnd() * 4); this.addAff(b, a, 7 + rnd() * 4); this.stats.chats++;
      this.jealous(a, b); this.jealous(b, a); this.kindness(a, b); this.kindness(b, a);
    } });
  }

  /* ---------- tick ---------- */
  step() {
    const tk = ++this.tick, tod = this.tod();
    // time-of-day events
    const tIn = tk % DAY_TICKS;
    if (tIn === Math.floor(0.25 * DAY_TICKS)) this.dawn();
    if (tIn === Math.floor(0.88 * DAY_TICKS)) this.ev('night', '🌙 Night falls over the town.', [], 0);
    if (tk === this.festival) this.ev('fest', '🎈 The festival is winding down.', [], 0);
    if (tk === this.blight) this.ev('blight', '🌱 The blight has passed — crops recover.', [], 0);
    for (let q = 0; q < 2 && this.fq.length; q++) { const b = this.fq.shift(); b.fq = false; b.field = makeField(this.tiles, b.src); b.fgen = this.fgen; }
    // pending
    if (this.pending.length) {
      const rest = [];
      for (const p of this.pending) { if (p.at <= tk) { if (p.m && p.m.fn) p.m.fn(); else if (p.m) this.out.push(p.m); } else rest.push(p); }
      this.pending = rest;
    }
    // chat grid
    const GW = Math.ceil(W / 2), GH = Math.ceil(H / 2), g = this.grid;
    if (g.length !== GW * GH) { g.length = 0; for (let i = 0; i < GW * GH; i++) g.push([]); }
    for (let i = 0; i < g.length; i++) g[i].length = 0;
    const dots = this.dots, hr = this.season() === 3 ? 1.1 : 1;
    for (const d of dots) {
      if (d.dead) continue;
      d.age += 1 / (DAY_TICKS * YEAR_DAYS); if (d.theftCd > 0) d.theftCd--; if (d.rejectCd > 0) d.rejectCd--;
      // needs
      const asleep = d.phase === 'do' && d.goal && d.goal.k === 'sleep';
      d.hunger = Math.min(100, d.hunger + (asleep ? 0.05 : 0.12) * hr);
      if (!asleep) d.energy = Math.max(0, d.energy - 0.075 - (d.phase === 'do' && d.goal && d.goal.k === 'work' ? 0.03 : 0));
      d.social = Math.max(0, d.social - 0.07);
      if (d.chatCd > 0) d.chatCd--;
      if (d.hunger >= 99.5) d.starveT++; else d.starveT = 0;
      if (d.starveT > 900) { this.die(d, 'hunger'); continue; }
      if (d.age > d.life && rnd() < 1 / (DAY_TICKS * 2)) { this.die(d, 'age'); continue; }
      if (!d.adult && d.age >= ADULT) this.grow(d);
      if ((tk + d.id) % 25 === 0) this.dreamCheck(d);
      if (d.hunger >= 99.5 && d.starvedDay !== this.day()) { d.starvedDay = this.day(); this.ev('starve', `😵 ${d.name} is starving.`, [d.id], 400); }
      if (!d.rich && d.coin > 220) { d.rich = true; this.ev('rich', `💰 ${d.name} is getting rich.`, [d.id], 60); }
      if (d.rich && d.coin < 100) d.rich = false;
      if (d.hunger > 85 && rnd() < 0.0015 && !d.inside) this.say(d, [C.ME, C.HUNGRY]);
      if (d.phase === 'chat') { if (--d.chatT <= 0) { d.phase = d.prev; d.fight = false; } continue; }
      if (!d.goal) this.decide(d);
      if (d.phase === 'walk') this.move(d); else if (d.phase === 'do') this.doing(d);
      if (!d.inside && d.chatCd <= 0 && d.phase !== 'chat' && !(d.phase === 'do' && d.goal && !this.buildings[d.goal.b].open && d.goal.k !== 'wander')) g[(d.y >> 1) * GW + (d.x >> 1)].push(d);
    }
    // chat matching
    for (let i = 0; i < g.length; i++) {
      const cell = g[i]; if (!cell.length) continue;
      const cx = i % GW, cy = (i / GW) | 0;
      for (const a of cell) {
        if (a.phase === 'chat' || a.chatCd > 0) continue;
        let done = false;
        for (let oy = -1; oy <= 1 && !done; oy++) for (let ox = -1; ox <= 1 && !done; ox++) {
          const X = cx + ox, Y = cy + oy; if (X < 0 || Y < 0 || X >= GW || Y >= GH) continue;
          for (const b of g[Y * GW + X]) {
            if (b === a || b.dead || b.phase === 'chat' || b.chatCd > 0) continue;
            const dx = (a.x + (a.nx >= 0 ? (a.nx - a.x) * a.prog : 0)) - (b.x + (b.nx >= 0 ? (b.nx - b.x) * b.prog : 0)), dy = (a.y + (a.ny >= 0 ? (a.ny - a.y) * a.prog : 0)) - (b.y + (b.ny >= 0 ? (b.ny - b.y) * b.prog : 0));
            if (dx * dx + dy * dy > 2.4) continue;
            if (a.thieves.has(b.id) || b.thieves.has(a.id)) {
              const kn = a.thieves.has(b.id) ? a : b, th = kn === a ? b : a;
              if (!kn.traits.includes('coward') && rnd() < (kn.traits.includes('hothead') ? 0.004 : 0.001)) { this.fight(kn, th, null); done = true; break; }
              continue;
            }
            const fr = (a.aff.get(b.id) || 0) >= 25;
            const p = 0.05 * (0.5 + (100 - a.social) / 100) * ((a.soc + b.soc) / 2) * (fr ? 2.5 : 1);
            if (rnd() < p) { this.startChat(a, b); done = true; break; }
          }
        }
      }
    }
    this.stealTick();
    if (tk % 50 === 0) this.couples();
    // tavern chatter
    for (const b of this.taverns) if (b.occ > 0 && tk % 25 === b.id % 25) {
      const o = pick(b.inside), lines = [[C.ME, C.WANT, C.DRINK], [C.HELLO], [C.ME, C.HAPPY], [C.YOU, C.GOOD], [C.DRINK, C.GOOD], [C.ME, C.LIKE, C.FRIEND]];
      this.out.push({ t: 'say', b: b.id, k: pick(lines) });
    }
  }

  dawn() {
    const day = this.day();
    const alive = this.dots.filter(d => !d.dead);
    for (const d of alive) if (d.adult) { const pay = Math.min(d.coin, this.taxRate); d.coin -= pay; this.treasury += pay; }   // taxes
    const se = this.season();
    if (se !== this.lastSeason) {
      this.lastSeason = se;
      const msg = ['🌱 Spring has arrived. Fields are planted.', '☀️ Summer is here. Long days, good growth.', '🍂 Autumn: harvest season!', `❄️ Winter has set in. Food will be scarce — Year ${this.year()}.`][se];
      this.ev('season', msg, [], 0, 3);
    }
    this.weather = rnd() < RAIN_P[se] ? (se === 3 ? 2 : 1) : 0;
    if (this.weather) this.ev('weather', this.weather === 2 ? '❄️ Snow falls on the town.' : '🌧️ It\'s raining today.', [], 0, 1);
    this.mayorDawn(); this.economyDawn();
    let mood = 0; for (const d of alive) mood += this.mood(d);
    const top = alive.reduce((a, b) => (this.friends(a).length >= this.friends(b).length ? a : b));
    const s = this.stats;
    this.ev('dawn', `☀️ Day ${day} begins. Mood ${Math.round(mood / alive.length)}/100 · ${alive.length} alive · ${s.births} born, ${s.deaths} died · most popular: ${top.name} (${this.friends(top).length}).`, [top.id], 0, 0);
  }

  /* ---------- government ---------- */
  election(first, exclude) {
    this.computeRep();
    const adults = this.dots.filter(d => !d.dead && d.adult && d.id !== exclude);
    const cands = adults.slice().sort((a, b) => this.rep[b.id] - this.rep[a.id]).slice(0, 3);
    if (!cands.length) return;
    const votes = new Map(cands.map(c => [c.id, 0]));
    for (const v of adults) {
      let bc = cands[0], bs = -1e9;
      for (const c of cands) { const sc = (v.aff.get(c.id) || 0) + rnd() * 25 + (v.thieves.has(c.id) ? -60 : 0); if (sc > bs) { bs = sc; bc = c; } }
      votes.set(bc.id, votes.get(bc.id) + 1);
    }
    const win = cands.slice().sort((a, b) => votes.get(b.id) - votes.get(a.id))[0], re = win.id === this.mayor;
    this.mayor = win.id; this.taxRate = win.traits.includes('ambitious') ? 8 : win.traits.includes('kind') ? 3 : 5; this.nextElection = this.day() + 6;
    if (!first) { this.ev('elect', `🗳️ Election! ${cands.map(c => `${c.name} (${votes.get(c.id)})`).join(' vs ')} — ${win.name} ${re ? 'is re-elected' : 'wins'} as mayor. Tax: ${this.taxRate}/day.`, [win.id], 0, 4); this.say(win, [C.ME, C.HAPPY]); }
  }
  mayorDawn() {
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
      const what = pick(['a new well', 'a clock tower', 'a town library', 'a bigger granary', 'a fountain in the square']);
      const cost = Math.round(this.treasury * 0.6); this.treasury -= cost;
      this.ev('project', `🏗️ Mayor ${m.name} funded ${what} (${cost} coins).`, [m.id], 0, 3);
      for (const o of this.dots) if (!o.dead && o.adult && rnd() < 0.5) o.aff.set(m.id, Math.min(100, (o.aff.get(m.id) || 0) + 4));
    }
    if (m.isThief && this.treasury > 80 && rnd() < 0.3) {
      const cut = Math.round(this.treasury * 0.4); this.treasury -= cut; m.coin += cut;
      this.ev('scandal', `📰 SCANDAL: Mayor ${m.name} skimmed ${cut} coins from the treasury!`, [m.id], 0, 4);
      for (const o of this.dots) if (!o.dead && o.adult && o.id !== m.id && rnd() < 0.5) o.aff.set(m.id, (o.aff.get(m.id) || 0) - 25);
      this.election(false, m.id); return;
    }
    if (this.treasury > 1500 && this.taxRate > 1) { this.taxRate--; this.ev('tax', `📉 Mayor ${m.name} cut the tax to ${this.taxRate}/day.`, [m.id], 0, 2); }
    else if (this.treasury < 80 && this.taxRate < 12) { this.taxRate++; this.ev('tax', `📈 Mayor ${m.name} raised the tax to ${this.taxRate}/day.`, [m.id], 0, 2); }
    if (this.day() >= this.nextElection) this.election();
  }

  /* ---------- viewer interaction ---------- */
  act(name, id) {
    const tk = this.tick, CD = 100;
    if (name === 'festival' && tk - this.cd.festival > 5 * 45) { this.cd.festival = tk; this.festival = tk + 5 * 60; this.ev('fest', '🎉 A viewer declared a festival! Everyone heads to the parks.', [], 0, 2); return true; }
    if (name === 'blight' && tk - this.cd.blight > 5 * 45) { this.cd.blight = tk; this.blightAt = tk; this.blight = tk + 5 * 40; this.ev('blight', '🥀 Blight strikes the fields. Farms produce nothing!', [], 0, 2); return true; }
    if (name === 'gift' || name === 'zap' || name === 'cupid') {
      const d = this.dots[id]; if (!d || d.dead || tk - this.cd[name] < CD) return false;
      if (name === 'gift') { d.coin += 30; this.say(d, [C.THANKS]); this.ev('gift', `🎁 A viewer gifted ${d.name} 30 coins.`, [d.id], 0, 2); }
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

  /* ---------- output ---------- */
  initMsg() {
    const m = this.map, el = new Uint8Array(W * H); for (let i = 0; i < el.length; i++) el[i] = Math.round(Math.min(1, m.h[i]) * 255);
    return { t: 'init', W, H, hz: TICK_HZ, tiles: Array.from(this.tiles).join(''), wk: Array.from(m.wk).join(''), el: b64(el), tick: this.tick,
      setts: this.S.map(s => ({ i: s.id, n: s.name, t: s.tier, x: s.x, y: s.y })),
      blds: this.buildings.map(b => this.bldMsg(b)),
      hist: this.hist.slice(-25), dots: this.dots.map(d => ({ n: d.name, f: d.fam, j: d.job, h: d.home, tr: d.traits })), lex: this.lex, jobs: JOBS, bt: BT_NAME };
  }
  actCode(d) {
    if (d.phase === 'chat') return 7; if (d.phase === 'walk' || !d.goal) return 1;
    switch (d.goal.k) { case 'sleep': return 2; case 'work': case 'deliver': case 'build': return 3; case 'eat': return 4; case 'social': return 5; case 'drink': return 6; default: return 0; }
  }
  frame() {
    const n = this.dots.length, nb = this.buildings.length, buf = new ArrayBuffer(15 + n * 5 + nb * 2), v = new DataView(buf);
    v.setUint8(0, 1); v.setUint32(1, this.tick, true); v.setFloat32(5, this.tod(), true); v.setUint16(9, this.day(), true); v.setUint16(11, n, true); v.setUint16(13, nb, true);
    let o = 15;
    for (const d of this.dots) {
      const px = d.x + (d.nx >= 0 ? (d.nx - d.x) * d.prog : 0), py = d.y + (d.ny >= 0 ? (d.ny - d.y) * d.prog : 0);
      v.setUint16(o, Math.round((px + 0.5) * 16), true); v.setUint16(o + 2, Math.round((py + 0.5) * 16), true);
      v.setUint8(o + 4, (d.inside ? 1 : 0) | (this.actCode(d) << 1) | (d.carry > 0 ? 16 : 0) | (d.fight ? 32 : 0) | (d.dead ? 64 : 0) | (d.adult ? 0 : 128)); o += 5;
    }
    for (const b of this.buildings) { v.setUint16(o, b.occ, true); o += 2; }
    return buf;
  }
  drain() { const o = this.out; this.out = []; return o; }
  computeRep() {
    const rep = new Float32Array(this.dots.length);
    for (const d of this.dots) { if (d.dead) continue; for (const [k, v] of d.aff) if (!this.dots[k].dead) rep[k] += v; }
    this.rep = rep;
  }
  statsMsg() {
    this.computeRep();
    const alive = this.dots.filter(d => !d.dead), n = alive.length || 1;
    let mood = 0, coin = 0; for (const d of alive) { mood += this.mood(d); coin += d.coin; }
    const top = (f, k = 3, desc = true) => alive.map(d => [d.id, Math.round(f(d))]).sort((a, b) => desc ? b[1] - a[1] : a[1] - b[1]).slice(0, k);
    const cdl = k => Math.max(0, (this.cd[k] + (k === 'festival' || k === 'blight' ? 225 : 100) - this.tick) / TICK_HZ | 0);
    return { t: 'stats', day: this.day(), pop: alive.length, food: this.markets.map(m => m.stock), mk: this.markets.map(m => this.S[m.sid].name),
      towns: this.S.map(s => [s.name, s.tier, this.sPop[s.id] || 0]), biz: { open: this.buildings.filter(b => b.state === 'ok' && this.isBiz(b)).length, built: this.biz.built, closed: this.biz.closed, sold: this.biz.sold, fires: this.biz.fires, arrived: this.biz.arrived, sites: this.sites.length, vacant: this.buildings.filter(b => b.state === 'vacant').length }, mood: Math.round(mood / n), coin: Math.round(coin / n),
      meals: this.stats.meals, chats: this.stats.chats, friends: this.stats.friends, births: this.stats.births, deaths: this.stats.deaths, thefts: this.stats.thefts, fights: this.stats.fights,
      couples: alive.filter(d => d.partner >= 0).length / 2,
      lead: { rich: top(d => d.coin), loved: top(d => this.rep[d.id]), hated: top(d => this.rep[d.id], 3, false), old: top(d => d.age) },
      cd: { festival: cdl('festival'), blight: cdl('blight'), gift: cdl('gift'), zap: cdl('zap'), cupid: cdl('cupid') },
      fest: this.tick < this.festival, blight: this.tick < this.blight,
      season: this.season(), year: this.year(), weather: this.weather, mayor: this.mayor, treasury: Math.round(this.treasury), tax: this.taxRate, nextElection: this.nextElection };
  }
  doingText(d) {
    const g = d.goal, b = g ? this.buildings[g.b] : null, nm = b ? (b.name ? `${b.name} ${BT_NAME[b.type]}` : 'home') : '';
    if (d.phase === 'chat') return 'chatting';
    if (!g) return 'thinking';
    const walk = d.phase === 'walk';
    switch (g.k) {
      case 'sleep': return walk ? 'heading home to sleep' : 'sleeping';
      case 'eat': return walk ? `walking to ${nm} for food` : 'eating';
      case 'work': return walk ? `heading to work at ${nm}` : `working at ${nm}`;
      case 'deliver': return walk ? `carrying crops to ${nm}` : `delivering crops`;
      case 'build': return walk ? `heading to the building site` : `building a ${BT_NAME[b.type].toLowerCase()}`;
      case 'social': return walk ? `heading to ${nm}` : `hanging out at ${nm}`;
      case 'drink': return walk ? `off to ${nm}` : `having a drink at ${nm}`;
      default: return 'wandering';
    }
  }
  thought(d) {
    const e = this.believedEmpty(d), tod = this.tod();
    if (this.tick < d.grief) return 'Missing someone.';
    if (d.thieves.size && rnd() < 0.5) return 'Watching out for thieves.';
    if (d.hunger > 85) return e >= this.markets.length ? 'Starving, and I heard every market is empty.' : 'So hungry I can barely think.';
    if (d.phase === 'do' && d.goal && d.goal.k === 'sleep') return 'zzz…';
    if (d.coin < 8) return 'Pockets are empty. I need to work.';
    if (e > 0 && d.hunger > 40) return 'Heard one market has no food. Trying another.';
    if (d.energy < 25) return 'Running on fumes.';
    if (d.social < 25) return 'Could really use some company.';
    if (d.invite && this.tick < d.invite.until) return 'Meeting a friend soon.';
    if (this.mood(d) > 75) return tod < 0.5 ? 'Nice morning.' : 'Good day so far.';
    return 'Just getting on with it.';
  }
  detail(id) {
    const d = this.dots[id]; if (!d) return null;
    const p = d.partner >= 0 ? this.dots[d.partner] : null;
    return { t: 'detail', id, name: d.name, fam: d.fam, mayor: id === this.mayor, dead: d.dead, job: d.adult ? JOBS[d.job] : 'child', age: Math.round(d.age), traits: d.traits,
      hunger: Math.round(d.hunger), energy: Math.round(d.energy), social: Math.round(d.social), coin: Math.round(d.coin),
      mood: this.mood(d), doing: d.dead ? 'passed away' : this.doingText(d), thought: this.thought(d), home: d.home,
      dream: DREAM_TXT[d.dream], partner: p ? p.name : null, pid: p ? p.id : -1, married: d.married, rep: Math.round(this.rep ? this.rep[id] : 0), kids: d.kids,
      thieves: [...d.thieves].filter(x => !this.dots[x].dead).slice(0, 3),
      friends: this.friends(d).slice(0, 6).map(([k, v]) => [k, Math.round(v)]) };
  }

  /* ---------- persistence ---------- */
  serialize() {
    const pl = this.map.plots;
    return { v: 3, civ: { mayor: this.mayor, treasury: this.treasury, tax: this.taxRate, next: this.nextElection, weather: this.weather, mcount: this.mcount }, tick: this.tick, stats: this.stats, biz: this.biz, pairs: [...this.pairs],
      tiles: Array.from(this.tiles).join(''),
      plots: pl.map(p => [p.x, p.y, p.dx, p.dy, p.sid, p.rural ? 1 : 0, p.used ? 1 : 0, p.bid, Math.round(p.dc * 10), Math.round(p.fert * 100), p.sq ? 1 : 0, p.quay ? 1 : 0]),
      blds: this.buildings.map(b => [b.type, b.x, b.y, b.door, b.open ? 1 : 0, b.sid, b.owner, Math.round(b.cash), b.state, b.name, b.fam || '', b.stock, b.w, b.h, b.plot, b.mi, b.born, b.sqPark ? 1 : 0, b.need || 0, b.prog || 0, b.escrow || 0, b.vac]),
      dots: this.dots.map(d => ({ n: d.name, fm: d.fam, j: d.job, h: d.home, w: d.work, f: d.future, tr: d.traits, dr: d.dream, a: d.age, l: d.life, p: d.partner, m: d.married ? 1 : 0, x: d.dead ? 1 : 0, s: d.since,
        e: [d.hunger, d.energy, d.social, d.coin], af: [...d.aff], th: [...d.thieves], kd: d.kids, drs: d.dreams, dn: [...d.done] })) };
  }
  load(s) {
    if (!s || s.v !== 3 || s.tiles.length !== W * H) return;
    this.tick = s.tick; this.lastSeason = this.season(); const c = s.civ; this.mayor = c.mayor; this.treasury = c.treasury; this.taxRate = c.tax; this.nextElection = c.next; this.weather = c.weather; this.mcount = c.mcount || 0;
    this.stats = Object.assign(this.stats, s.stats); this.biz = Object.assign(this.biz, s.biz || {}); this.pairs = new Set(s.pairs);
    for (let i = 0; i < s.tiles.length; i++) this.tiles[i] = +s.tiles[i];
    const map = this.map; map.plots.length = 0; map.pm.fill(-1);
    for (const q of this.S) { const [sw, sh] = Gen.SQ[q.tier], hw = sw >> 1, hh = sh >> 1; for (let b = -hh; b <= hh; b++) for (let a = -hw; a <= hw; a++) map.pm[(q.y + b) * W + q.x + a] = -2; q.plots = []; }
    s.plots.forEach((o, i) => { const p = { id: i, sid: o[4], x: o[0], y: o[1], dx: o[2], dy: o[3], rural: !!o[5], used: !!o[6], bid: o[7], dc: o[8] / 10, fert: o[9] / 100, sq: !!o[10], quay: !!o[11] }; map.plots.push(p); this.S[p.sid].plots.push(i); for (let b = 0; b < 3; b++) for (let a = 0; a < 3; a++) map.pm[(p.y + b) * W + p.x + a] = i; });
    this.buildings = s.blds.map((o, i) => { const b = { id: i, type: o[0], x: o[1], y: o[2], door: o[3], open: !!o[4], occ: 0, stock: o[11], inside: [], name: o[9], fam: o[10], flag: false, sid: o[5], owner: o[6], cash: o[7], rev: 0, wage: 0, state: o[8], born: o[16], visits: 0, hist: [], mi: o[15], vac: o[21] || 0, w: o[12], h: o[13], plot: o[14], sqPark: !!o[17], need: o[18], prog: o[19], escrow: o[20] };
      b.src = []; if (b.sqPark) { for (let q = 0; q < b.h; q++) for (let p = 0; p < b.w; p++) b.src.push((b.y + q) * W + b.x + p); } else if (b.open) { for (let q = 0; q < 3; q++) for (let p = 0; p < 3; p++) b.src.push((b.y + q) * W + b.x + p); } else b.src.push(b.door[1] * W + b.door[0]);
      return b; });
    this.sites = this.buildings.filter(b => b.state === 'build'); this.fgen++; this.rebuild();
    this.dots = []; this.names = [];
    s.dots.forEach((o, i) => {
      const d = this.makeDot(i, { name: o.n, fam: o.fm, job: o.j, home: o.h, work: o.w, future: o.f, traits: o.tr, age: o.a, life: o.l, hunger: o.e[0], energy: o.e[1], social: o.e[2], coin: o.e[3] }, rnd);
      d.dream = o.dr; d.partner = o.p; d.married = !!o.m; d.dead = !!o.x; d.since = o.s; d.aff = new Map(o.af); d.thieves = new Set(o.th); d.kids = o.kd; d.dreams = o.drs; d.done = new Set(o.dn || []);
      this.dots[i] = d; this.names[i] = d.name;
    });
    this.rep = new Float32Array(this.dots.length + 8);
  }
}
function b64(u8) { if (typeof Buffer !== 'undefined') return Buffer.from(u8).toString('base64'); let s = ''; for (let i = 0; i < u8.length; i += 8192) s += String.fromCharCode.apply(null, u8.subarray(i, i + 8192)); return btoa(s); }
function tkLess(tick, until) { return tick < until; }

const api = { World, get W() { return W; }, get H() { return H; }, TICK_HZ, DAY_TICKS, C, BT, BT_NAME, JOBS, TILE };
if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Sim = api;
})(typeof window !== 'undefined' ? window : globalThis);
