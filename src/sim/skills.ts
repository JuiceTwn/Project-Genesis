/* Skills. Everyone has six trades that improve with use and rust with disuse: farming, building, crafting, trading, fighting and social grace.
   Levels run 0-20. Adults start with a level that matches their age and work; practice adds a little each shift with diminishing returns.
   Skill matters: farmers harvest more, builders finish sites faster, good traders keep a shop's quality up, fighters win brawls, charmers make friends
   faster, and employers hire the best of the people available. A first-time master of a trade makes the news. */
import { World } from './world';
import * as K from '../shared/constants';
const { BT } = K;

export const SKILLS = ['farm', 'build', 'craft', 'trade', 'fight', 'social'] as const;
export type Skill = typeof SKILLS[number];
const NAME: Record<Skill, string> = { farm: 'farmer', build: 'builder', craft: 'craftsman', trade: 'trader', fight: 'fighter', social: 'charmer' };

/** Which skill a job in this kind of building trains. */
export function skillFor(type: number): Skill {
  switch (type) { case BT.FARM: return 'farm'; case BT.BUILDER: return 'build'; case BT.MARKET: case BT.STORE: case BT.TAVERN: case BT.DOCK: return 'trade'; default: return 'craft'; }
}

/** A person's skill levels; created lazily from age and current work so old saves and newborns need no migration. */
function skills(this: World, d): Record<string, number> {
  if (d.sk) return d.sk;
  const yrs = Math.max(0, d.age - K.ADULT), base = Math.min(10, yrs * 0.25), r = () => 0.4 + this.rnd() * 0.9;
  const sk: Record<string, number> = { farm: 0, build: 0, craft: 0, trade: 0, fight: 0, social: 0 };
  const own = d.job === 0 ? 'farm' : d.work >= 0 && this.buildings[d.work] ? skillFor(this.buildings[d.work].type) : null;
  if (own) sk[own] = Math.min(14, base * 1.4 * r());
  for (const k of SKILLS) if (k !== own) sk[k] = Math.min(6, base * 0.3 * r());
  sk.social = Math.min(14, (d.soc || 0.5) * 6 + base * 0.2); sk.fight = Math.min(12, sk.fight + (d.fx.courage > 0 ? 2 : 0) + (d.isThief ? 2 : 0));
  return (d.sk = sk);
}

const level = (w: World, d, k: Skill): number => w.skills(d)[k] || 0;

/** Practice: a little progress, slower as the person gets good. Reaching 15 for the first time earns the title of master. */
function trainSkill(this: World, d, k: Skill, amt: number) {
  if (!d || d.dead || !d.adult) return; const sk = this.skills(d), was = sk[k];
  sk[k] = Math.min(20, was + amt * (1 - was / 21));
  if (was < 15 && sk[k] >= 15 && !(d.masters || []).includes(k)) {
    (d.masters = d.masters || []).push(k); d.fame = (d.fame || 0) + 6; this.addThought(d, 'master' + k, 10, 30, `A master ${NAME[k]} at last.`);
    this.ev('master' + d.id + k, `🏅 ${d.name} has become a master ${NAME[k]} after years of practice.`, [d.id], 0, 3);
  }
}

/** Daily: unused skills rust a little (the main trade rusts least because it is used). */
function skillDay(this: World) {
  for (const d of this.dots) { if (d.dead || !d.sk) continue; for (const k of SKILLS) if (d.sk[k] > 2) d.sk[k] -= 0.0008 * d.sk[k]; }
}

/** The best of a few random candidates for a job, by the relevant skill. */
function bestOf(this: World, pool: any[], k: Skill) {
  let bi = (this.rnd() * pool.length) | 0;
  for (let t = 0; t < 3 && pool.length > 1; t++) { const i = (this.rnd() * pool.length) | 0; if (level(this, pool[i], k) > level(this, pool[bi], k)) bi = i; }
  return bi;
}

Object.assign(World.prototype, { skills, trainSkill, skillDay, bestOf, skillLevel: function (this: World, d, k: Skill) { return level(this, d, k); } });
declare module './world' { interface World { skills: typeof skills; trainSkill: typeof trainSkill; skillDay: typeof skillDay; bestOf: typeof bestOf; skillLevel: (d: any, k: Skill) => number } }
