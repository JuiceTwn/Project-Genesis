import { World } from './world';
import { makeField, b64, tkLess, mk } from '../shared/util';
import * as K from '../shared/constants';
import * as Gen from '../worldgen';
const { TS, YEAR_TICKS, HOUR_TICKS, KB, MEAL_UNIT, TICK_HZ, DAY_TICKS, INF, TILE, COST, BT, BT_NAME, BUILD_SHIFTS, UPKEEP, STAFF, MAXM, JOBS, FOOD_PRICE, DRINK_PRICE, STOCK_CAP, ADULT, YEAR_DAYS, SEASON_DAYS, SEASONS, YIELD, RAIN_P, CON, C, TRAITS, TRAIT_W, DREAMS, DREAM_TXT } = K;
import { W, H } from "../shared/dims";

function step(this: World) {
  const tk = ++this.tick, tod = this.tod();
  // time-of-day events
  const tIn = tk % DAY_TICKS;
  if (tIn === Math.floor(0.25 * DAY_TICKS)) this.dawn();
  if (tIn === Math.floor(0.88 * DAY_TICKS)) this.ev('night', '🌙 Night falls over the town.', [], 0);
  if (tk === this.festival) this.ev('fest', '🎈 The festival is winding down.', [], 0);
  if (tk === this.blight) this.ev('blight', '🌱 The blight has passed — crops recover.', [], 0);
  for (let q = 0; q < 2 && this.fq.length; q++) { const b = this.fq.shift(); b.fq = false; if (!b.field) continue; b.field = makeField(this.tiles, b.src); b.fgen = this.fgen; }
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
    d.hunger = Math.min(100, d.hunger + (asleep ? 0.035 : 0.12) * hr / TS);
    if (!asleep) d.energy = Math.max(0, d.energy - (0.075 + (d.phase === 'do' && d.goal && d.goal.k === 'work' ? 0.03 : 0)) / TS);
    d.social = Math.max(0, d.social - 0.07 / TS);
    if (d.chatCd > 0) d.chatCd--;
    if (d.hunger >= 99.5) d.starveT++; else d.starveT = 0;
    if (d.starveT > 900 * TS) { this.die(d, 'hunger'); continue; }
    if (d.age > d.life && this.rnd() < 1 / (DAY_TICKS * 2)) { this.die(d, 'age'); continue; }
    if (!d.adult && d.age >= ADULT) this.grow(d);
    if ((tk + d.id) % 25 === 0) this.dreamCheck(d);
    if (d.hunger >= 99.5 && d.starvedDay !== this.day()) { d.starvedDay = this.day(); this.ev('starve', `😵 ${d.name} is starving.`, [d.id], 400); }
    if (!d.rich && d.coin > K.RICH) { d.rich = true; this.ev('rich', `💰 ${d.name} is getting rich.`, [d.id], 60); }
    if (d.rich && d.coin < K.RICH * 0.4) d.rich = false;
    if (d.hunger > 85 && this.rnd() < 0.0015 && !d.inside) this.say(d, [C.ME, C.HUNGRY]);
    if (d.phase === 'chat') { if (d.hunger > 95) d.chatT = 0; if (--d.chatT <= 0) { d.phase = d.prev; d.fight = false; } continue; }
    if (d.hunger > 90 && d.goal && d.goal.k !== 'eat' && d.goal.k !== 'sleep' && !(d.goal.k === 'deliver' && d.hunger < 96)) { if (d.inside) this.leave(d); d.goal = null; d.phase = 'walk'; d.nx = -1; d.prog = 0; }   // starving: drop everything
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
            if (kn.fx.courage > -0.3 && this.rnd() < 0.001 * kn.fx.temper * (kn.fx.forgive < 0.5 ? 2 : 1)) { this.fight(kn, th, null); done = true; break; }
            continue;
          }
          const fr = (a.aff.get(b.id) || 0) >= 25;
          const p = 0.05 * (0.5 + (100 - a.social) / 100) * ((a.soc + b.soc) / 2) * (fr ? 2.5 : 1);
          if (this.rnd() < p) { this.startChat(a, b); done = true; break; }
        }
      }
    }
  }
  this.stealTick();
  if (tk % Math.round(50 * TS) === 0) this.couples();
  if (tk % Math.round(DAY_TICKS / 4) === 0) this.restockMarkets();
  // tavern chatter
  for (const b of this.taverns) if (b.occ > 0 && tk % 25 === b.id % 25) {
    const o = this.pick(b.inside), lines = [[C.ME, C.WANT, C.DRINK], [C.HELLO], [C.ME, C.HAPPY], [C.YOU, C.GOOD], [C.DRINK, C.GOOD], [C.ME, C.LIKE, C.FRIEND]];
    this.out.push({ t: 'say', b: b.id, k: this.pick(lines) });
  }
}

function dawn(this: World) {
  this.mortality(); this.retirement();
  if (this.day() % K.MONTH_DAYS === 0) this.monthlyHousing();
  this.budgetDawn(); this.gearDawn(); this.brandDawn();
  this.gazetteDawn();   // the paper goes to press with yesterday's news before today's begins
  const day = this.day();
  const alive = this.dots.filter(d => !d.dead);
  this.sPop = []; for (const d of alive) { const sid = this.buildings[d.home].sid; this.sPop[sid] = (this.sPop[sid] || 0) + 1; }
  this.collectTaxes();
  const se = this.season();
  if (se !== this.lastSeason) {
    this.lastSeason = se;
    const msg = ['🌱 Spring has arrived. Fields are planted.', '☀️ Summer is here. Long days, good growth.', '🍂 Autumn: harvest season!', `❄️ Winter has set in. Food will be scarce — Year ${this.year()}.`][se];
    this.ev('season', msg, [], 0, 3);
  }
  this.weather = this.rnd() < RAIN_P[se] ? (se === 3 ? 2 : 1) : 0;
  if (this.weather) this.ev('weather', this.weather === 2 ? '❄️ Snow falls on the town.' : '🌧️ It\'s raining today.', [], 0, 1);
  for (const s of this.S) this.mayorDawn(s);
  this.nationDawn(); this.economyDawn(); this.storyDawn();
  let mood = 0; for (const d of alive) mood += this.mood(d);
  const top = alive.reduce((a, b) => (this.friends(a).length >= this.friends(b).length ? a : b));
  const s = this.stats;
  this.ev('dawn', `☀️ Day ${day} begins. Mood ${Math.round(mood / alive.length)}/100 · ${alive.length} alive · ${s.births} born, ${s.deaths} died · most popular: ${top.name} (${this.friends(top).length}).`, [top.id], 0, 0);
}

Object.assign(World.prototype, { step, dawn });
declare module './world' { interface World {
  step: (...args: any[]) => any;
  dawn: (...args: any[]) => any;
} }
