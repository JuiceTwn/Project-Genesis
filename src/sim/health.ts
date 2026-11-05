/* Health. People catch the flu (more in winter, more when hungry or coatless, and from each other in conversation), get hurt in fights and at work,
   and can be malnourished. Injuries left untreated turn septic. Everything has a severity that recovers with rest and, much faster, with treatment at
   the town clinic (a fee paid to the town treasury), which the poor often cannot afford. Severe untreated conditions kill. Sick people stay home and
   rest, which keeps them from work: a winter epidemic in a town can empty its shops. Money only moves from patients to the town. */
import { World } from './world';
import * as K from '../shared/constants';
import * as R from '../shared/reality';
import { eff } from './gear';

export interface Cond { k: string; sev: number; since: number; treated: boolean }
const LABEL: Record<string, string> = { flu: 'the flu', injury: 'an injury', infection: 'a septic wound', malnutrition: 'malnutrition' };
const DAY = K.DAY_TICKS;

const conds = (d): Cond[] => d.hp || (d.hp = []);
/** The worst severity among a person's conditions (0 = healthy). */
function sickLevel(this: World, d): number { const c = d.hp; if (!c || !c.length) return 0; let m = 0; for (const x of c) if (x.sev > m) m = x.sev; return m; }

function hurt(this: World, d, kind: string, sev: number, why: string) {
  if (!d || d.dead) return; const c = conds(d), cur = c.find(x => x.k === kind);
  if (cur) { cur.sev = Math.min(1, Math.max(cur.sev, sev)); return; }
  c.push({ k: kind, sev: Math.min(1, sev), since: this.tick, treated: false }); this.stats.ailments = (this.stats.ailments || 0) + 1;
  this.addThought(d, 'ill' + kind, -8 * Math.min(1, sev + 0.3), 6, kind === 'flu' ? 'Down with the flu.' : kind === 'injury' ? 'Everything hurts.' : kind === 'infection' ? 'The wound is getting worse.' : 'So weak from hunger.');
  if (sev >= 0.6 && kind !== 'flu') this.ev('hurt' + d.id, `🩹 ${d.name} was badly hurt (${why}).`, [d.id], 0, 3);
}

/** Called when two people talk: the flu travels (a coat helps in winter). */
function catchFrom(this: World, a, b) {
  for (const [s, t] of [[a, b], [b, a]]) {
    const f = s.hp && s.hp.find((x: Cond) => x.k === 'flu'); if (!f || t.hp?.some((x: Cond) => x.k === 'flu')) continue;
    if (this.rnd() < 0.2 * (this.season() === 3 ? 1.5 : 1) * (1 - 0.4 * eff(t, 'coat'))) this.hurt(t, 'flu', 0.3 + this.rnd() * 0.3, 'caught it from ' + s.name);
  }
}

/** Daily: new illnesses, recovery, treatment, complications, deaths. */
function healthDay(this: World) {
  const winter = this.season() === 3 ? 3 : this.season() === 2 ? 1.5 : 1, sick: Record<number, number> = {};
  for (const d of this.dots) {
    if (d.dead) continue;
    // new illness
    if (!(d.hp || []).some((x: Cond) => x.k === 'flu') && this.rnd() < 0.0012 * winter * (1 - 0.5 * eff(d, 'coat')) * (d.hunger > 70 ? 2 : 1) * (d.age < 4 || d.age > d.life * 0.8 ? 1.8 : 1))
      this.hurt(d, 'flu', 0.25 + this.rnd() * 0.35, 'winter fever');
    if (d.hunger > 90) this.hurt(d, 'malnutrition', 0.5, 'starvation'); else if (d.hunger < 50) { const m = (d.hp || []).find((x: Cond) => x.k === 'malnutrition'); if (m) m.sev -= 0.1; }
    if (d.adult && (d.job === 0 || d.job === 1) && d.phase === 'do' && this.rnd() < 0.00025 * d.fx.risk) this.hurt(d, 'injury', 0.2 + this.rnd() * 0.5, d.job === 0 ? 'a farming accident' : 'an accident at work');
    const c = d.hp; if (!c || !c.length) continue;
    const town = this.buildings[d.home].sid; sick[town] = (sick[town] || 0) + 1;
    const worst = this.sickLevel(d);
    // treatment at the town clinic: the sick who can pay go
    const open = c.some((x: Cond) => !x.treated && x.sev >= 0.35);
    if (open && d.adult) {
      const fee = 0.3 * R.DAY_WAGE, g = this.gov(this.S[town]);
      if (d.coin >= fee * 1.5 && this.rnd() < 0.6) { d.coin -= fee; g.treasury += fee; for (const x of c) x.treated = true; this.stats.treated = (this.stats.treated || 0) + 1; }
    }
    const rested = d.phase === 'do' && d.goal && d.goal.k === 'sleep';
    for (const x of c.slice()) {
      const heal = (x.treated ? 0.18 : 0.06) * (rested ? 1.4 : 1) * (d.hunger < 60 ? 1 : 0.4) * (x.k === 'flu' ? 1.3 : 1);
      x.sev -= heal;
      if (x.k === 'injury' && !x.treated && this.tick - x.since > 5 * DAY && this.rnd() < 0.12) { c.splice(c.indexOf(x), 1); this.hurt(d, 'infection', Math.max(0.5, x.sev + 0.25), 'a wound gone septic'); continue; }
      if (x.sev <= 0) { c.splice(c.indexOf(x), 1); if (x.k !== 'malnutrition') this.addThought(d, 'well', 5, 5, 'Back on my feet.'); continue; }
      // the severe and untreated can die
      if (!x.treated && x.sev > 0.7 && this.rnd() < 0.05 * x.sev) { this.stats.sickDeaths = (this.stats.sickDeaths || 0) + 1; this.die(d, x.k === 'infection' ? 'infection' : x.k === 'malnutrition' ? 'hunger' : 'illness'); break; }
    }
  }
  for (const s of this.S) { const P = this.sPop[s.id] || 0, n = sick[s.id] || 0; if (P >= 12 && n >= Math.max(5, 0.12 * P)) this.ev('epidemic' + s.id, `🤒 EPIDEMIC in ${s.name}: ${n} of its ${P} people are sick. The clinic is overrun.`, [], 40, 4); }
}

function healthLines(this: World): string[] {
  let n = 0; for (const d of this.dots) if (!d.dead && d.hp && d.hp.length && this.sickLevel(d) >= 0.3) n++;
  return n ? [`${n} people are ill or injured (${this.stats.treated || 0} treated so far this history, ${this.stats.sickDeaths || 0} died of untreated illness).`] : [];
}

Object.assign(World.prototype, { sickLevel, hurt, catchFrom, healthDay, healthLines });
declare module './world' { interface World { sickLevel: typeof sickLevel; hurt: typeof hurt; catchFrom: typeof catchFrom; healthDay: typeof healthDay; healthLines: typeof healthLines } }
