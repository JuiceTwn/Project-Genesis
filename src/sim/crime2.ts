/* Organised crime and the law. Poverty and joblessness breed burglars; thieves band into gangs that shake down shops and torch the stubborn; a corrupt
   banker can run off with the vault. The police (paid from the town treasury, sized by the mayor's platform) clear cases with a probability that grows
   with officers per head; the guilty go to prison (they lose their job and sit in the town hall's cells). Money only moves between pockets. */
import { World } from './world';
import * as K from '../shared/constants';
import * as R from '../shared/reality';
import { eff, SLOTS } from './gear';
const { BT, KB, DAY_TICKS } = K;

export interface Gang { id: number; name: string; boss: number; members: number[]; sid: number; born: number; loot: number; active: boolean; busts: number }
const GA = ['Black', 'Red', 'Iron', 'Night', 'Broken', 'Rusty', 'Salt', 'Dead', 'Quiet', 'Knife'], GB = ['Hands', 'Crows', 'Dogs', 'Boys', 'Brothers', 'Rats', 'Hammers', 'Sparrows', 'Wolves'];

/** Officers per 100 residents in a town. */
const cops = (w: World, sid: number) => { let n = 0; for (const d of w.dots) if (d.cop && !d.dead && w.buildings[d.home].sid === sid) n++; return n * 100 / Math.max(10, w.sPop[sid] || 1); };
/** Chance the police solve a case in this town. */
const clearRate = (w: World, sid: number) => Math.min(0.85, 0.08 + 0.35 * cops(w, sid));

/** Send someone to prison: they lose their job, and sit in the cells for `days`. */
function sentence(this: World, d, crime: string, days: number) {
  if (d.dead) return; d.jailUntil = this.tick + days * DAY_TICKS; d.job = 3; d.work = -1; d.cop = false; d.social = Math.max(0, d.social - 20);
  this.stats.convictions = (this.stats.convictions || 0) + 1;
  this.ev('jail' + d.id, `⛓️ ${d.name} was sentenced to ${days} days in prison for ${crime}.`, [d.id], 0, 3);
  if (this.scar(d, 'jailed', 2)) this.shiftTrait(d, 'thief', 'a hard stretch inside');
}

/** Monthly: staff the police force to the mayor's platform and pay it from the treasury. */
function policeMonth(this: World) {
  for (const s of this.S) {
    const g = this.gov(s), P = this.sPop[s.id] || 0; if (!P) continue;
    const want = Math.round((g.police || 1) * P / 220), mine = this.dots.filter(d => d.cop && !d.dead && this.buildings[d.home].sid === s.id);
    if (mine.length > want) for (const d of mine.slice(want)) d.cop = false;
    else if (mine.length < want) {
      const pool = this.dots.filter(d => !d.dead && d.adult && !d.cop && d.job === 3 && d.work < 0 && (d.jailUntil || 0) < this.tick && d.age < d.life * K.RETIRE_FRAC && this.buildings[d.home].sid === s.id && !d.thieves.size).slice(0, want - mine.length);
      for (const d of pool) d.cop = true;
    }
    const pay = R.DAY_WAGE * R.MONTH_DAYS * 0.8;
    for (const d of this.dots) if (d.cop && !d.dead && this.buildings[d.home].sid === s.id && g.treasury >= pay) { g.treasury -= pay; d.coin += pay; d.earn = (d.earn || 0) + pay; }
  }
}

function newGang(this: World, boss, members, sid: number): Gang {
  const g: Gang = { id: this.gangs.length, name: `The ${this.pick(GA)} ${this.pick(GB)}`, boss: boss.id, members: members.map(m => m.id), sid, born: this.tick, loot: 0, active: true, busts: 0 };
  this.gangs.push(g); for (const m of members) { m.gang = g.id; } boss.gang = g.id;
  this.ev('gang' + g.id, `🐺 A street gang calling itself ${g.name} has formed in ${this.S[sid].name}, led by ${boss.name}.`, [boss.id], 0, 4); return g;
}

function bust(this: World, gg: Gang, why: string) {
  gg.active = false; gg.busts++;
  for (const id of gg.members.concat(gg.boss)) { const m = this.dots[id]; if (m && !m.dead) { m.gang = undefined; this.sentence(m, 'gang activity', id === gg.boss ? 60 + ((this.rnd() * 60) | 0) : 15 + ((this.rnd() * 30) | 0)); } }
  this.ev('bust' + gg.id, `🚔 Police smashed ${gg.name} in ${this.S[gg.sid].name} (${why}).`, [gg.boss], 0, 5); this.stats.busts = (this.stats.busts || 0) + 1;
}

/** Daily crime: burglary, gangs forming and extorting, a gang war, arson by a jealous rival, an embezzling banker. */
function crimeDawn(this: World) {
  for (const s of this.S) {
    const P = this.sPop[s.id] || 0; if (P < 6) continue;
    const g = this.gov(s), adults = this.townAdults(s.id).filter(d => !d.cop && (d.jailUntil || 0) < this.tick);
    const poor = adults.filter(d => d.job === 3 && d.work < 0 && d.coin < 12 * KB), poverty = poor.length / Math.max(1, adults.length), clr = clearRate(this, s.id);
    // burglary
    if (poor.length && this.rnd() < 0.015 * (1 + 10 * poverty) * Math.min(3, P / 60)) {
      const b = this.pick(poor.concat(adults.filter(d => d.isThief))), rich = adults.filter(d => d.id !== b.id && d.coin > 80 * KB);
      if (rich.length && b.fx.courage > -0.5) {
        const v = this.pick(rich), loot = Math.min(v.coin * 0.2, 2500 * (1 + this.rnd()));
        v.coin -= loot; b.coin += loot; g.crime = (g.crime || 0) + 1; this.stats.burglaries = (this.stats.burglaries || 0) + 1;
        const slots = SLOTS.filter(k => v.gear && v.gear[k]); if (slots.length && this.rnd() < 0.5) { const k = this.pick(slots); b.gear = b.gear || {}; b.gear[k] = v.gear![k]; delete v.gear![k]; }
        if (this.rnd() < clr) { const back = Math.min(b.coin, loot); b.coin -= back; v.coin += back; this.ev('burg' + s.id, `🚨 ${b.name} burgled ${v.name}'s home in ${s.name} — and was arrested.`, [b.id, v.id], 0, 4); this.sentence(b, 'burglary', 5 + ((this.rnd() * 20) | 0)); }
        else { this.ev('burg' + s.id, `🏚️ ${v.name} was burgled in ${s.name}: ${R.usd(loot)} gone. The police have no leads.`, [v.id], 20, 3); this.scar(v, 'robbed', 2); }
      }
    }
    // a gang forms where there are poor, angry thieves
    const gangs = this.gangs.filter(x => x.active && x.sid === s.id);
    if (!gangs.length && poverty > 0.06 && this.rnd() < 0.01 * (1 + 8 * poverty)) {
      const raw = adults.filter(d => !d.gang && (d.isThief || (d.job === 3 && d.fx.temper > 1.2))).sort((a, b) => (b.fx.ambition + b.fx.temper) - (a.fx.ambition + a.fx.temper));
      if (raw.length >= 3) this.newGang(raw[0], raw.slice(1, 5), s.id);
    }
    // extortion: protection money every five days
    if (this.day() % R.MONTH_DAYS === 0) for (const gg of gangs) {
      const boss = this.dots[gg.boss]; if (!boss || boss.dead) { gg.active = false; continue; }
      const marks = this.sbl[s.id].filter(b => b.state === 'ok' && b.owner >= 0 && this.isBiz(b) && b.cash > 20 * KB);
      for (const b of marks.slice(0, 2)) {
        const o = this.dots[b.owner], dem = Math.min(b.cash * 0.12, 6000);
        if (o.fx.courage > 0.6 && this.rnd() < 0.4) { if (this.rnd() < 0.5) { this.ev('arson' + b.id, `🔥 ${gg.name} torched ${b.name} in ${s.name} after ${o.name} refused to pay.`, [o.id, boss.id], 0, 5); this.burn(b); } continue; }
        b.cash -= dem; const cut = dem * 0.6; boss.coin += cut; gg.loot += dem; const rest = (dem - cut) / Math.max(1, gg.members.length);
        for (const id of gg.members) { const m = this.dots[id]; if (m && !m.dead) m.coin += rest; else boss.coin += rest; }
        g.crime = (g.crime || 0) + 1; this.stats.extorted = (this.stats.extorted || 0) + dem;
        if (this.rnd() < 0.25) this.ev('extort' + b.id, `💼 ${o.name} is quietly paying ${gg.name} ${R.usd(dem)} a month to keep ${b.name} safe.`, [o.id], 40, 3);
      }
      if (this.rnd() < clr * 0.5) this.bust(gg, 'a tip-off from a shopkeeper');
    }
    // two gangs in one town: a war
    if (gangs.length >= 2 && this.rnd() < 0.02) {
      const [a, b] = gangs, x = this.dots[a.boss], y = this.dots[b.boss];
      if (x && y && !x.dead && !y.dead) { this.ev('gangwar' + s.id, `🔫 Gang war in ${s.name}: ${a.name} and ${b.name} fought in the street.`, [x.id, y.id], 0, 5); const v = this.rnd() < 0.5 ? x : y; if (this.rnd() < 0.35) { this.die(v, 'violence'); } else this.fight(x, y, null); g.crime = (g.crime || 0) + 2; }
    }
    // arson by a jealous rival
    if (this.rnd() < 0.0004 * Math.min(4, P / 40)) {
      const firms = this.sbl[s.id].filter(b => b.state === 'ok' && b.owner >= 0 && this.isBiz(b) && b.type !== BT.FARM);
      const riv = firms.find(a => { const o = this.dots[a.owner]; return o && !o.dead && o.traits.includes('jealous') && firms.some(f => f !== a && f.type === a.type && f.owner !== a.owner && f.rev > a.rev); });
      if (riv) { const o = this.dots[riv.owner], tgt = firms.filter(f => f !== riv && f.type === riv.type && f.owner !== riv.owner)[0];
        this.burn(tgt); g.crime = (g.crime || 0) + 2;
        if (this.rnd() < clr) { this.ev('arson' + tgt.id, `🔥 ARSON: ${tgt.name} in ${s.name} burned down — ${o.name}, a jealous rival, was arrested.`, [o.id], 0, 5); this.sentence(o, 'arson', 40 + ((this.rnd() * 60) | 0)); } else this.ev('arson' + tgt.id, `🔥 ${tgt.name} in ${s.name} burned down. Police suspect arson but have no suspect.`, [], 0, 4); }
    }
  }
  // the banker with sticky fingers
  const bk = this.bank;
  if (bk && bk.cash > 100 * KB) { const o = this.dots[bk.owner]; if (o && !o.dead && (o.isThief || o.fx.ambition > 1.5) && this.rnd() < 0.0006) {
    const take = bk.cash * 0.3; bk.cash -= take; o.coin += take; bk.fear = Math.min(2, bk.fear + 1);
    this.ev('embezzle', `🕵️ ${bk.name} is missing ${R.usd(take)}! Its owner ${o.name} is accused of looting the vault.`, [o.id], 0, 5); this.stats.embezzled = (this.stats.embezzled || 0) + take;
    if (this.rnd() < 0.6) { const back = Math.min(o.coin, take * 0.7); o.coin -= back; bk.cash += back; this.sentence(o, 'embezzling bank funds', 120); }
  } }
}

function crimeLines(this: World): string[] {
  const act = this.gangs.filter(g => g.active); const out: string[] = [];
  if (act.length) out.push(`Active gangs: ${act.map(g => `${g.name} (${this.S[g.sid].name})`).join(', ')}.`);
  const jailed = this.dots.filter(d => !d.dead && (d.jailUntil || 0) > this.tick).length; if (jailed) out.push(`${jailed} people are currently in prison.`);
  return out;
}

Object.assign(World.prototype, { sentence, policeMonth, newGang, bust, crimeDawn, crimeLines });
declare module './world' { interface World { sentence: typeof sentence; policeMonth: typeof policeMonth; newGang: typeof newGang; bust: typeof bust; crimeDawn: typeof crimeDawn; crimeLines: typeof crimeLines } }
