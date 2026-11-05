import type { Dot, Building } from '../shared/types';
import { World } from './world';
import { eff } from './gear';
import { makeField, b64, tkLess, mk } from '../shared/util';
import * as K from '../shared/constants';
import * as Gen from '../worldgen';
const { TS, YEAR_TICKS, HOUR_TICKS, KB, MEAL_UNIT, TICK_HZ, DAY_TICKS, INF, TILE, COST, BT, BT_NAME, BUILD_SHIFTS, UPKEEP, STAFF, MAXM, JOBS, FOOD_PRICE, DRINK_PRICE, STOCK_CAP, ADULT, YEAR_DAYS, SEASON_DAYS, SEASONS, YIELD, RAIN_P, CON, C, TRAITS, TRAIT_W, DREAMS, DREAM_TXT } = K;
import { W, H } from "../shared/dims";

function stealTick(this: World) {
  for (const t of this.dots) {
    if (!t.isThief || t.dead || t.inside || (t.jailUntil || 0) > this.tick || t.phase === 'chat' || t.theftCd > 0 || !t.adult || this.rnd() > 0.08 * t.fx.crime / 3) continue;
    let vic = null;
    for (const v of this.dots) {
      if (v === t || v.dead || v.inside || v.coin < 15 * KB || v.phase === 'chat') continue;
      const dx = v.x - t.x, dy = v.y - t.y; if (dx * dx + dy * dy > 4 || (t.aff.get(v.id) || 0) >= 25) continue;
      vic = v; break;
    }
    if (vic) this.steal(t, vic);
  }
}

function steal(this: World, t, v) {
  const amt = Math.min(v.coin * 0.5, (8 + this.rnd() * 14) * KB * 0.15 * (1 - 0.6 * eff(v, 'bag'))); /* a pickpocket's haul: $100-300 */ v.coin -= amt; t.coin += amt; t.theftCd = Math.round(YEAR_TICKS * (0.6 + this.rnd() * 1.2));   // a thief strikes roughly once a year or two
  const wit = [];
  for (const o of this.dots) { if (o === t || o === v || o.dead || o.inside) continue; const dx = o.x - t.x, dy = o.y - t.y; if (dx * dx + dy * dy <= 36 && this.rnd() < 0.5) wit.push(o); }
  const noticed = this.rnd() < 0.45;
  if (!noticed && !wit.length) { this.ev('theft0', `🥷 ${t.name} picked ${v.name}'s pocket (${K.usd(amt)}). Nobody noticed.`, [t.id, v.id], 25, 2); return; }
  const knowers = wit.slice(0, 4).concat(noticed ? [v] : []);
  for (const k of knowers) { k.thieves.add(t.id); k.aff.set(t.id, Math.min(k.aff.get(t.id) || 0, 0) - 30); }
  this.stats.thefts++;
  if (this.scar(v, 'robbed', 3)) this.shiftTrait(v, v.fx.temper > 1.2 ? 'vengeful' : 'cautious', 'robbed once too often');
  this.ev('theft', `🚨 ${t.name} robbed ${v.name}${noticed ? '' : ' unnoticed'}!${wit[0] ? ` ${wit[0].name} saw it.` : ''}`, [t.id, v.id], 0, 3);
  for (const k of knowers) { if (k.fx.courage < -0.3) this.say(k, [C.AFRAID]); else if (k !== v) this.say(k, [K.TOK_PERSON + t.id, C.THIEF]); }
  if (noticed && v.fx.courage > -0.3 && this.rnd() < Math.min(0.97, 0.45 + 0.2 * v.fx.temper)) this.fight(v, t, { amt });
  else if (noticed) this.say(v, [C.ME, C.ANGRY]);
}

function fight(this: World, a: Dot, b: Dot, ctx) {
  if (a.phase === 'chat' || b.phase === 'chat' || a.inside || b.inside || a.dead || b.dead) return;
  for (const d of [a, b]) { d.prev = d.phase; d.phase = 'chat'; d.chatT = 18; d.fight = true; d.chatCd = 250; }
  this.say(a, [C.STOP, C.THIEF]); this.later(4, { t: 'say', d: b.id, k: [ctx ? C.SORRY : C.NO] }); this.later(9, { t: 'say', d: a.id, k: [C.ANGRY] });
  this.later(18, { fn: () => this.resolveFight(a, b, ctx) });
}

function resolveFight(this: World, a: Dot, b: Dot, ctx) {
  if (a.dead || b.dead) return;
  const pw = (d: Dot) => this.skillLevel(d, 'fight') * 1.5 + (this.attr(d, 'str') - 10) * 1.2 + d.energy * 0.3 + (d.fx.temper > 1.5 ? 25 : 0) + d.fx.courage * 15 + this.rnd() * 40 + (d.isThief ? 8 : 0);
  const aw = pw(a) >= pw(b), w = aw ? a : b, l = aw ? b : a;
  this.trainSkill(w, 'fight', 0.4); this.trainSkill(l, 'fight', 0.15);
  this.hurt(l, 'injury', 0.25 + this.rnd() * 0.5, 'a fight with ' + w.name); if (this.rnd() < 0.5) this.hurt(w, 'injury', 0.1 + this.rnd() * 0.25, 'a fight with ' + l.name);
  w.energy = Math.max(0, w.energy - 6); l.energy = Math.max(0, l.energy - 16);
  this.addAff(a, b, -15); this.addAff(b, a, -15); this.stats.fights++;
  if (ctx) {
    if (aw) { const back = Math.round(Math.min(b.coin, ctx.amt + 5 * KB * 0.15)); b.coin -= back; a.coin += back; this.ev('fight', `💥 ${a.name} caught ${b.name} red-handed and took ${K.usd(back)} back.`, [a.id, b.id], 0, 3); }
    else this.ev('fight', `🏃 ${b.name} beat ${a.name} in a scuffle and kept the loot.`, [b.id, a.id], 0, 3);
  } else this.ev('fight', `🥊 ${a.name} confronted known thief ${b.name} — ${w.name} won the brawl.`, [a.id, b.id], 0, 3);
}

Object.assign(World.prototype, { stealTick, steal, fight, resolveFight });
declare module './world' { interface World {
  stealTick: (...args: any[]) => any;
  steal: (...args: any[]) => any;
  fight: (...args: any[]) => any;
  resolveFight: (...args: any[]) => any;
} }
