/* Fame, social media and influencers. One currency, attention, links the whole simulation.
   - Fame is computed: notable events ping the people in them; it decays about 1% a day. Infamy (`ire`) is the angry kind and has its own consequences.
   - Posts travel through the population (the friend graph, summarised as reach). Bad news about the bank raises its fear (so rumours cause runs), bad news
     about a brand costs it reputation, a scandal about a mayor builds unrest, and an angry crowd can pile on a person: fired, dropped by friends, brand dragged down.
   - Rumours can be false, and are sometimes debunked too late.
   - Famous people (influencers) take sponsorship money from brands, paid from the brand's own till, and turn their followers into customers.
   Money only moves between tills and pockets. Reach is a share of the adult population, so cost is bounded by the (small) number of live posts. */
import { World } from './world';
import * as K from '../shared/constants';
import * as R from '../shared/reality';
const { KB, DAY_TICKS } = K;

export interface Post { id: number; topic: string; charge: number; about: number; target: number; author: number; reach: number; born: number; truth: boolean; done: boolean; text: string; piled: boolean; viral: boolean; applied: number; steps: number }
export interface Deal { brand: number; dot: number; until: number; fee: number }
export const INFLUENCER = 30;

const EVENT_POST: Record<string, [string, number]> = {
  bankfail: ['bank', -1], run: ['bank', -0.9], embezzle: ['bank', -0.95], default: ['bank', -0.35], foreclose: ['bank', -0.4], hpicrash: ['bank', -0.5],
  scandal: ['brand', -0.8], brand: ['brand', 0.5], acquire: ['brand', 0.3],
  corrupt: ['mayor', -0.9], recall: ['mayor', -0.7],
  gang: ['crime', -0.6], gangwar: ['crime', -0.9], burg: ['crime', -0.5], arson: ['crime', -0.8], extort: ['crime', -0.5],
  jail: ['person', -0.6], rich: ['person', 0.5], bankrupt: ['person', -0.4], found: ['person', 0.3],
};
const BASEKIND = (k: string) => k.replace(/\d+$/, '');
const share = (w: World) => Math.max(1, w.dots.filter(d => !d.dead && d.adult).length);

/** Notable events make the people in them famous, and may become posts. Called from World.ev. */
function mediaHook(this: World, kind: string, text: string, ids: number[], w: number) {
  if (/^(viral|debunk|pile|dropped|deal|trend)/.test(kind)) return;
  if (w >= 3) for (const id of ids || []) { const d = this.dots[id]; if (d && !d.dead) d.fame = (d.fame || 0) + 0.8 * w * w * (EVENT_POST[BASEKIND(kind)] && EVENT_POST[BASEKIND(kind)][1] < 0 ? 0.7 : 1); }
  const map = EVENT_POST[BASEKIND(kind)]; if (!map || w < 2 || this.posts.length > 80) return;
  const [topic, charge] = map, a = this.dots[ids && ids[0]]; if (!a) return;
  const sid = this.buildings[a.home].sid;
  let target = topic === 'brand' ? (this.brands.find(b => b.founder === a.id && !b.dead) || { id: -1 }).id : topic === 'bank' ? 0 : sid;
  if (topic === 'brand' && target < 0) return;
  this.addPost({ topic, charge, about: topic === 'person' || topic === 'mayor' ? a.id : -1, target, author: this.influentialNear(sid).id, truth: true, text });
}

/** The best-known adult in a town (or anyone, if nobody is): the one who spreads it. */
function influentialNear(this: World, sid: number) {
  let best = null, bf = -1; for (const d of this.dots) if (!d.dead && d.adult && this.buildings[d.home].sid === sid) { const f = (d.fame || 0) + d.soc * 3 + (d.traits.includes('gossip') ? 5 : 0); if (f > bf) { bf = f; best = d; } }
  return best || this.dots.find(d => !d.dead && d.adult);
}

function addPost(this: World, p: Partial<Post> & { topic: string; charge: number; text: string; target: number; about: number; author: number; truth: boolean }) {
  const a = this.dots[p.author]; let foll = 3 + (a ? (a.fame || 0) * 2 : 0); if (a) for (const v of a.aff.values()) if (v >= 25) foll++;
  const post: Post = { id: this.postSeq++, reach: Math.max(2, foll), born: this.tick, done: false, piled: false, viral: false, applied: 0, steps: 0, ...p } as Post;
  this.posts.push(post); return post;
}

/** Four times a day: every live post reaches more people (outrage and famous authors travel furthest) and its effects land in proportion. */
function mediaSpread(this: World) {
  const A = share(this), bk = this.bank;
  for (const p of this.posts) {
    if (p.done) continue; p.steps++;
    const a = this.dots[p.author], vir = 0.22 + 0.75 * Math.abs(p.charge) + Math.min(0.6, ((a && a.fame) || 0) / 80) - 0.03 * p.steps;
    if (vir <= 0 || p.reach >= A) { p.done = true; continue; }
    const nr = Math.min(A, p.reach * (1 + vir)), s = (nr - p.reach) / A, ch = p.charge; p.reach = nr; p.applied += s;
    switch (p.topic) {
      case 'bank': if (bk) bk.fear = Math.max(0, Math.min(2, bk.fear - ch * s * 1.8)); break;
      case 'brand': { const br = this.brands[p.target]; if (br && !br.dead) { br.rep = Math.max(-1, Math.min(1, br.rep + ch * s * 0.8)); br.awareness = Math.min(1, br.awareness + 0.15 * s); } break; }
      case 'mayor': case 'crime': { const g = this.gov(this.S[p.target]); g.unrest = Math.max(0, (g.unrest || 0) - ch * s * 2.5); break; }
      case 'person': { const t = this.dots[p.about]; if (!t || t.dead) break; if (ch > 0) t.fame = (t.fame || 0) + 10 * s; else { t.ire = (t.ire || 0) + 40 * s; t.fame = (t.fame || 0) + 6 * s; } break; }
    }
    if (!p.viral && p.reach / A > 0.45) { p.viral = true; this.stats.viral = (this.stats.viral || 0) + 1; const au = this.dots[p.author]; this.ev('viral' + p.id, `📱 GOING VIRAL: ${p.text.replace(/^[^\w"']+/, '')} — half the country has seen it.`, au ? [au.id] : [], 0, 4); }
    if (!p.piled && p.topic === 'person' && ch < 0 && p.applied > 0.12) { p.piled = true; this.pileOn(this.dots[p.about], p); }
    // a rumour that is not true may be debunked, but only after it has done its work
    if (!p.truth && p.steps >= 6 && this.rnd() < 0.18) { p.done = true; this.debunk(p); }
  }
  this.posts = this.posts.filter(p => !p.done || this.tick - p.born < 6 * DAY_TICKS);
}

function debunk(this: World, p: Post) {
  const bk = this.bank;
  if (p.topic === 'bank' && bk) bk.fear = Math.max(0, bk.fear - 0.8 * p.applied * 2);
  if (p.topic === 'brand') { const br = this.brands[p.target]; if (br) br.rep = Math.min(1, br.rep - p.charge * p.applied * 0.5); }
  if (p.reach / share(this) > 0.2) this.ev('debunk' + p.id, `✅ It was a lie: the rumour "${p.text.replace(/^[^\w"']+/, '').slice(0, 70)}" was false.`, [], 0, 3);
}

/** An angry crowd turns on someone: they lose their job, friends cut them off, and anything tied to their name suffers. */
function pileOn(this: World, t, p: Post) {
  if (!t || t.dead) return; t.ire = (t.ire || 0) + 25; t.fame = (t.fame || 0) + 12; this.stats.pileons = (this.stats.pileons || 0) + 1;
  const eff: string[] = [];
  if (t.work >= 0 && t.job <= 2 && this.buildings[t.work] && this.buildings[t.work].owner !== t.id) { this.unstaffDot(t); eff.push('lost their job'); }
  let dropped = 0; for (const f of this.dots) if (!f.dead && f.id !== t.id && (f.aff.get(t.id) || 0) >= 25 && this.rnd() < 0.5) { f.aff.set(t.id, -20); dropped++; }
  if (dropped) eff.push(`was dropped by ${dropped} friend${dropped === 1 ? '' : 's'}`);
  for (const br of this.brands) if (!br.dead && br.founder === t.id) { br.rep = Math.max(-1, br.rep - 0.6); br.awareness = Math.max(0.01, br.awareness * 0.8); eff.push(`saw ${br.name} boycotted`); }
  for (const dl of this.deals.filter(x => x.dot === t.id)) { const br = this.brands[dl.brand]; if (br) { br.rep = Math.max(-1, br.rep - 0.4); eff.push(`was dropped by ${br.name}`); } this.deals.splice(this.deals.indexOf(dl), 1); t.endorses = -1; }
  if (this.S.some(s => this.gov(s).mayor === t.id)) { const s = this.S.find(s => this.gov(s).mayor === t.id); this.gov(s).unrest = (this.gov(s).unrest || 0) + 2; eff.push('faces calls to resign'); }
  this.ev('pile' + t.id, `🔥 The internet turned on ${t.name}: ${eff.length ? t.name + ' ' + eff.join(', ') : 'a storm of outrage'}.`, [t.id], 0, 5);
}

/** Take a worker off their job. */
function unstaffDot(this: World, d) { const b = this.buildings[d.work]; d.job = 3; d.work = -1; if (b) b.staff = Math.max(0, (b.staff || 1) - 1); }

/** Daily: fame decays, rumours start, endorsement deals pay and work. */
function mediaDay(this: World) {
  for (const d of this.dots) { if (d.dead) continue; if (d.fame) d.fame *= 0.99; if (d.ire) d.ire *= 0.97; }
  for (const s of this.S) if (this.gov(s).mayor >= 0) { const m = this.dots[this.gov(s).mayor]; if (m && !m.dead) m.fame = (m.fame || 0) + 0.05; }
  // a gossip starts a rumour (most are false)
  if (this.rnd() < 0.5 && this.posts.length < 30) {
    const g = this.dots.filter(d => !d.dead && d.adult && d.traits.includes('gossip')); if (g.length) {
      const a = this.pick(g), sid = this.buildings[a.home].sid, r = this.rnd(), live = this.brands.filter(b => !b.dead), truth = this.rnd() < 0.3;
      if (r < 0.34 && this.bank) this.addPost({ topic: 'bank', charge: -0.8, about: -1, target: 0, author: a.id, truth, text: `Rumour: "${this.bank.name} is about to run out of money!"` });
      else if (r < 0.67 && live.length) { const br = this.pick(live); this.addPost({ topic: 'brand', charge: -0.7, about: -1, target: br.id, author: a.id, truth, text: `Rumour: "${br.name} sells spoiled goods."` }); }
      else { const g2 = this.gov(this.S[sid]); if (g2.mayor >= 0 && g2.mayor !== a.id) this.addPost({ topic: 'mayor', charge: -0.7, about: g2.mayor, target: sid, author: a.id, truth, text: `Rumour: "Mayor ${this.dots[g2.mayor].name} is on the take."` }); }
    }
  }
  // endorsement deals
  for (const dl of this.deals.slice()) {
    const inf = this.dots[dl.dot], br = this.brands[dl.brand];
    if (!inf || inf.dead || !br || br.dead || this.tick > dl.until || (inf.ire || 0) > 30) { if (inf) inf.endorses = -1; if (br && inf && !inf.dead && (inf.ire || 0) > 30) this.ev('dropped' + dl.brand, `📉 ${br.name} cut ties with ${inf.name} as the backlash grew.`, [inf.id], 0, 3); this.deals.splice(this.deals.indexOf(dl), 1); continue; }
    br.awareness = Math.min(1, br.awareness + 0.0012 * Math.min(4, (inf.fame || 0) / 30));
    const home = this.buildings[inf.home].sid;
    for (let i = 0; i < 6; i++) { const f = this.dots[(this.rnd() * this.dots.length) | 0]; if (f && !f.dead && f.adult && (f.fav === undefined || f.fav < 0) && this.buildings[f.home].sid === home) f.fav = br.id; }
  }
  if (this.day() % R.MONTH_DAYS === 0) this.newDeals();
}

/** Monthly: brands with spare cash hire a famous face; the fee comes out of a branch's till and into the influencer's pocket. */
function newDeals(this: World) {
  const stars = this.dots.filter(d => !d.dead && d.adult && (d.fame || 0) >= INFLUENCER && (d.ire || 0) < 15 && !(d.endorses >= 0)).sort((a, b) => (b.fame || 0) - (a.fame || 0));
  for (const br of this.brands) {
    if (br.dead || !stars.length || this.deals.some(x => x.brand === br.id)) continue;
    const bs = this.branchesOf(br.id).filter(b => b.cash > 40 * KB); if (!bs.length || this.rnd() > 0.5) continue;
    const inf = stars.shift()!, b = bs[0], fee = Math.min(b.cash * 0.1, 2500 * (1 + (inf.fame || 0) / 60));
    b.cash -= fee; inf.coin += fee; inf.earn = (inf.earn || 0) + fee; inf.endorses = br.id; this.deals.push({ brand: br.id, dot: inf.id, until: this.tick + 30 * DAY_TICKS, fee });
    this.stats.deals = (this.stats.deals || 0) + 1;
    this.ev('deal' + br.id, `🤝 ${inf.name} signed a ${R.usd(fee)} sponsorship deal to front ${br.name}.`, [inf.id], 0, 3);
  }
}

function mediaLines(this: World): string[] {
  const out: string[] = [], fam = this.dots.filter(d => !d.dead && (d.fame || 0) >= 12).sort((a, b) => (b.fame || 0) - (a.fame || 0)).slice(0, 3);
  if (fam.length) out.push(`Most talked-about: ${fam.map(d => `${d.name} (${Math.round(d.fame || 0)}${(d.ire || 0) > 20 ? ', in disgrace' : ''})`).join(', ')}.`);
  const A = share(this), tr = this.posts.filter(p => !p.done && p.reach / A > 0.1).sort((a, b) => b.reach - a.reach).slice(0, 2);
  for (const p of tr) out.push(`Trending: ${p.text.replace(/^[^\w"']+/, '').slice(0, 90)} — seen by ${Math.round(100 * p.reach / A)}%.`);
  if (this.deals.length) out.push(`${this.deals.length} influencer sponsorship deal${this.deals.length === 1 ? '' : 's'} running.`);
  return out;
}

Object.assign(World.prototype, { mediaHook, influentialNear, addPost, mediaSpread, debunk, pileOn, unstaffDot, mediaDay, newDeals, mediaLines });
declare module './world' { interface World { mediaHook: typeof mediaHook; influentialNear: typeof influentialNear; addPost: typeof addPost; mediaSpread: typeof mediaSpread; debunk: typeof debunk; pileOn: typeof pileOn; unstaffDot: typeof unstaffDot; mediaDay: typeof mediaDay; newDeals: typeof newDeals; mediaLines: typeof mediaLines } }
