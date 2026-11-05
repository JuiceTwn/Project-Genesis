import type { Building } from '../shared/types';
/* The storyteller. A director that watches the world and nudges it toward stories, Rimworld-style.
   - Tension: recent drama (weighty events) raises it, time lowers it. The storyteller wants tension to follow a slow
     wave: when the country is calmer than the wave asks for, it starts a new story arc; when it is hotter, it lets things breathe.
   - Arcs: small state machines tied to specific dots (a rivalry, a love triangle, a family feud, a protégé, a drought, an investor).
     Each one sets conditions up by changing relationships, money and traits through the normal rules, then lets the sim play out
     and resolves according to the characters' personalities. Nothing is scripted: the same arc ends differently for different people.
   - Chronicle: every arc beat, character change and yearly review is recorded and streamed to the client. */
import { World } from './world';
import { DAY_TICKS, BT, YEAR_DAYS, C, TOK_PERSON } from '../shared/constants';
import { epithet, rollTraits, shiftTraits, TRAIT } from './personality';
import { KB, BUILD_COST, usd } from '../shared/reality';
import type { Dot } from '../shared/types';

import { newStory, type Arc, type ChronEntry } from './story-types';
export { newStory };
export type { Arc, ChronEntry };
const MAX_CHRON = 400;
/** The tension the storyteller aims for on a given day: a slow wave between calm and busy. */
export const targetTension = (day: number) => 4.5 + 2.5 * Math.sin((day / 9) * Math.PI * 2);

function chronicle(this: World, title: string, text: string, ids: number[] = [], big = true, arc = -1) {
  const e: ChronEntry = { day: this.day(), year: this.year(), title, text, ids, arc, big };
  this.story.chron.push(e); if (this.story.chron.length > MAX_CHRON) this.story.chron.shift();
  this.out.push({ t: 'chron', e });
}
const nm = (w: World, id: number) => w.dots[id]?.name ?? '?';
/** Record a beat of an arc: feed (weight 4 so the camera cuts to it) + chronicle. */
function beat(w: World, a: Arc, text: string, big = false) {
  a.beats.push({ day: w.day(), text }); w.ev('arc' + a.id + '.' + a.beats.length, text, a.ids.filter(i => w.dots[i] && !w.dots[i].dead).slice(0, 2), 0, 4);
  w.chronicle(a.title, text, a.ids, big, a.id); w.archiveStory(a);
}
function close(w: World, a: Arc, outcome: string) { a.done = true; a.outcome = outcome; w.story.closed++; w.story.cool[a.kind] = w.day(); w.archiveStory(a); }
const live = (w: World, ...ids: number[]) => ids.every(i => w.dots[i] && !w.dots[i].dead);
const hostile = (a: Dot, b: Dot, v: number) => { a.aff.set(b.id, Math.min(a.aff.get(b.id) || 0, 0) - v); b.aff.set(a.id, Math.min(b.aff.get(a.id) || 0, 0) - v); };
const warm = (a: Dot, b: Dot, v: number) => { a.aff.set(b.id, Math.max(a.aff.get(b.id) || 0, 0) + v); b.aff.set(a.id, Math.max(b.aff.get(a.id) || 0, 0) + v); };
const townsWithPeople = (w: World, min: number) => w.S.filter(s => (w.sPop[s.id] || 0) >= min);
const richer = (a: Dot, b: Dot) => (a.coin >= b.coin ? a : b);

interface Kind { kind: string; weight: (w: World) => number; launch: (w: World) => Arc | null; step: (w: World, a: Arc, d: number) => void }
const mkArc = (w: World, kind: string, title: string, sid: number, ids: number[], data: Record<string, any> = {}): Arc => {
  const a: Arc = { id: w.story.nextId++, kind, title, stage: 0, day0: w.day(), sid, ids, data, beats: [], done: false, outcome: '' }; w.story.arcs.push(a); return a;
};
const busy = (w: World, ids: number[]) => w.story.arcs.some(a => !a.done && a.ids.some(i => ids.includes(i)));

/* ---------------- arcs ---------------- */
const rivalry: Kind = {
  kind: 'rivalry', weight: w => 1.0,
  launch(w) {
    const towns = townsWithPeople(w, 20); if (!towns.length) return null;
    const s = w.pick(towns), ad = w.townAdults(s.id).filter(d => !busy(w, [d.id]) && d.job !== 3);
    let best: [Dot, Dot] | null = null, bs = 0;
    for (let k = 0; k < 40 && ad.length > 1; k++) {
      const a = w.pick(ad), b = w.pick(ad); if (a === b || a.fam === b.fam || a.partner === b.id || (a.aff.get(b.id) || 0) >= 20) continue;
      const sc = (a.fx.ambition + a.fx.temper + (a.fx.forgive < 0.7 ? 1 : 0)) + (b.fx.ambition + b.fx.temper + (b.fx.forgive < 0.7 ? 1 : 0)) + (a.job === b.job ? 2 : 0) + w.rnd();
      if (sc > bs) { bs = sc; best = [a, b]; }
    }
    if (!best) return null;
    const [a, b] = best; hostile(a, b, 35);
    const why = a.job === b.job ? 'the same customers' : a.fx.temper > 1.5 || b.fx.temper > 1.5 ? 'a hot-tempered insult' : 'an old slight neither will drop';
    const arc = mkArc(w, 'rivalry', `${a.name} vs ${b.name}`, s.id, [a.id, b.id], { why });
    beat(w, arc, `⚔️ Bad blood in ${s.name}: ${a.name} ${epithet(a.traits)} and ${b.name} ${epithet(b.traits)} have fallen out over ${why}.`, true); return arc;
  },
  step(w, a, d) {
    const [x, y] = a.ids.map(i => w.dots[i]); if (!live(w, ...a.ids)) { beat(w, a, `The rivalry ended when one of them died.`); return close(w, a, 'death'); }
    if (a.stage === 0 && d >= 2) { a.stage = 1; beat(w, a, `😤 ${x.name} and ${y.name} are openly working against each other, and the town is taking sides.`); }
    if (a.stage === 1) {
      if (w.rnd() < 0.4) { const sp = w.rnd() < 0.5 ? x : y, tg = sp === x ? y : x; for (const t of w.townAdults(a.sid).slice(0, 40)) if (t.id !== sp.id && w.rnd() < 0.2) t.aff.set(tg.id, (t.aff.get(tg.id) || 0) - 4); w.say(sp, [TOK_PERSON + tg.id, C.BAD]); }
      if (d >= 6) {
        a.stage = 2; const calm = x.fx.forgive * y.fx.forgive >= 2.2, hot = Math.max(x.fx.temper, y.fx.temper) >= 1.5;
        if (calm) { warm(x, y, 45); beat(w, a, `🤝 ${x.name} and ${y.name} finally shook hands and buried their rivalry.`, true); close(w, a, 'peace'); }
        else if (hot) {
          w.fight(x, y, null); const win = richer(x, y), lose = win === x ? y : x; win.social = 100;
          beat(w, a, `🥊 The rivalry boiled over: ${x.name} and ${y.name} came to blows in ${w.S[a.sid].name}. ${win.name} came out on top.`, true);
          w.shiftTrait(lose, w.rnd() < 0.5 ? 'vengeful' : 'pessimist', `humiliated by ${win.name}`); close(w, a, 'brawl');
        } else { hostile(x, y, 10); beat(w, a, `🧊 ${x.name} and ${y.name} settled into a cold war — they cross the street rather than speak.`); close(w, a, 'cold war'); }
      }
    }
  },
};

const triangle: Kind = {
  kind: 'triangle', weight: w => 0.8,
  launch(w) {
    const towns = townsWithPeople(w, 24); if (!towns.length) return null;
    const s = w.pick(towns), ad = w.townAdults(s.id).filter(d => !busy(w, [d.id]));
    const taken = ad.filter(d => d.partner >= 0 && live(w, d.partner)), single = ad.filter(d => d.partner < 0);
    if (!taken.length || !single.length) return null;
    const a = w.pick(taken), p = w.dots[a.partner]; if (busy(w, [p.id])) return null;
    const cands = single.filter(b => b.fam !== a.fam && b.home !== a.home).sort((u, v) => v.fx.romance - u.fx.romance); const b = cands[0] && w.rnd() < 0.8 ? cands[0] : w.pick(cands); if (!b) return null;
    b.aff.set(a.id, 60); a.aff.set(b.id, Math.max(a.aff.get(b.id) || 0, 35));
    const arc = mkArc(w, 'triangle', `${a.name}, ${p.name} & ${b.name}`, s.id, [a.id, p.id, b.id]);
    beat(w, arc, `💞 ${b.name} ${epithet(b.traits)} has fallen for ${a.name}, who is with ${p.name}. ${s.name} is watching.`, true); return arc;
  },
  step(w, a, d) {
    if (!live(w, ...a.ids)) { beat(w, a, `The triangle ended in tragedy.`); return close(w, a, 'death'); }
    const [x, p, b] = a.ids.map(i => w.dots[i]);
    if (x.partner !== p.id) { beat(w, a, `${x.name} and ${p.name} are no longer together.`); return close(w, a, 'moved on'); }
    if (a.stage === 0 && d >= 2) { a.stage = 1; p.aff.set(b.id, (p.aff.get(b.id) || 0) - 25); w.say(p, [TOK_PERSON + b.id, C.JEALOUS]); beat(w, a, `😠 Word reaches ${p.name} that ${b.name} has been seeing a lot of ${x.name}.`); }
    if (a.stage === 1 && d >= 5) {
      a.stage = 2; const loyal = x.fx.loyalty >= 1.5 && x.fx.romance < 2.2;
      if (loyal) { b.social = Math.max(0, b.social - 40); b.rejectCd = 1500; b.aff.set(x.id, 10); if (w.rnd() < 0.5) w.shiftTrait(b, w.rnd() < 0.5 ? 'loner' : 'pessimist', `heartbroken over ${x.name}`); beat(w, a, `💔 ${x.name} stayed loyal to ${p.name} and turned ${b.name} away.`, true); close(w, a, 'loyal'); }
      else { w.breakup(x, p); w.couple(x, b); w.shiftTrait(p, p.fx.temper > 1.2 ? 'vengeful' : 'loner', `left for ${b.name}`); beat(w, a, `💘 ${x.name} left ${p.name} for ${b.name}. ${p.name} ${epithet(p.traits)} is devastated.`, true); close(w, a, 'new couple'); }
    }
  },
};

const feud: Kind = {
  kind: 'feud', weight: w => 0.6,
  launch(w) {
    const towns = townsWithPeople(w, 28); if (!towns.length) return null;
    const s = w.pick(towns), by = new Map<string, Dot[]>(); for (const d of w.townAdults(s.id)) if (!busy(w, [d.id])) (by.get(d.fam) || by.set(d.fam, []).get(d.fam)!).push(d);
    const fams = [...by.entries()].filter(([, m]) => m.length >= 2); if (fams.length < 2) return null;
    const [[fa, ma], [fb, mb]] = [w.pick(fams), w.pick(fams)]; if (fa === fb) return null;
    for (const x of ma) for (const y of mb) hostile(x, y, 18);
    const arc = mkArc(w, 'feud', `The ${fa}–${fb} feud`, s.id, [ma[0].id, mb[0].id], { fa, fb, ma: ma.map(d => d.id), mb: mb.map(d => d.id) });
    beat(w, arc, `🏚️ The ${fa} and ${fb} families of ${s.name} are feuding after ${w.pick(['a boundary dispute', 'a broken promise', 'a harvest quarrel', 'a wedding snub'])}.`, true); return arc;
  },
  step(w, a, d) {
    const A: Dot[] = a.data.ma.map((i: number) => w.dots[i]).filter((x: Dot) => x && !x.dead), B: Dot[] = a.data.mb.map((i: number) => w.dots[i]).filter((x: Dot) => x && !x.dead);
    if (!A.length || !B.length) { beat(w, a, `The feud faded as one family dwindled.`); return close(w, a, 'faded'); }
    a.ids = [A[0].id, B[0].id];
    if (a.stage === 0 && d >= 2) a.stage = 1;
    if (a.stage === 1 && w.rnd() < 0.25) { const x = w.pick(A), y = w.pick(B); hostile(x, y, 4); w.say(x, [TOK_PERSON + y.id, C.BAD]); if (w.rnd() < 0.3) beat(w, a, `😡 Another flare-up between ${x.name} (${a.data.fa}) and ${y.name} (${a.data.fb}).`); }
    if (a.stage === 1 && d >= 8) {
      a.stage = 2; const cross = A.find(x => x.partner >= 0 && B.some(y => y.id === x.partner)), mayor = w.dots[w.gov(w.S[a.sid]).mayor];
      if (cross) { const y = w.dots[cross.partner]; for (const x of A) for (const z of B) warm(x, z, 40); w.gov(w.S[a.sid]).festival = w.tick + 250; beat(w, a, `🕊️ ${cross.name} (${a.data.fa}) and ${y.name} (${a.data.fb}) are in love — the families made peace and held a feast.`, true); close(w, a, 'love'); }
      else if (mayor && mayor.fx.forgive >= 1.3) { for (const x of A) for (const z of B) warm(x, z, 30); beat(w, a, `🏛️ Mayor ${mayor.name} brokered peace between the ${a.data.fa} and ${a.data.fb} families.`, true); close(w, a, 'mediated'); }
      else { const x = A.sort((u, v) => v.fx.temper - u.fx.temper)[0], y = B.sort((u, v) => v.fx.temper - u.fx.temper)[0]; w.fight(x, y, null); for (const u of A) for (const z of B) warm(u, z, 12); beat(w, a, `🥊 The feud climaxed in a brawl between ${x.name} and ${y.name}; afterwards both sides were too tired to carry on.`, true); close(w, a, 'brawl'); }
    }
  },
};

const protege: Kind = {
  kind: 'protege', weight: w => 0.8,
  launch(w) {
    const towns = townsWithPeople(w, 20); if (!towns.length) return null;
    const s = w.pick(towns), ad = w.townAdults(s.id).filter(d => !busy(w, [d.id]));
    const rich = ad.filter(d => d.coin > BUILD_COST[4] * 0.6 && d.fx.generosity >= 1.5).sort((u, v) => v.coin - u.coin)[0];
    const poor = ad.filter(d => d.job === 3 && d.coin < 40 * KB && d.fx.ambition >= 1.4 && !w.ownedBy(d.id).length)[0];
    if (!rich || !poor || rich === poor) return null;
    const loan = Math.round(BUILD_COST[4] * 0.3); rich.coin -= loan; poor.coin += loan; warm(poor, rich, 40);
    const arc = mkArc(w, 'protege', `${poor.name}'s big chance`, s.id, [poor.id, rich.id], { loan });
    beat(w, arc, `🌱 ${rich.name} ${epithet(rich.traits)} staked ${poor.name} ${epithet(poor.traits)} ${usd(loan)} to start a business in ${s.name}.`, true); return arc;
  },
  step(w, a, d) {
    if (!live(w, ...a.ids)) { beat(w, a, `The venture ended with the death of one of its partners.`); return close(w, a, 'death'); }
    const [p, r] = a.ids.map(i => w.dots[i]);
    if (a.stage === 0) { if (w.tryFound(p)) { a.stage = 1; a.data.since = d; beat(w, a, `🏗️ ${p.name} broke ground on a new business.`); } else if (d >= 4) { beat(w, a, `${p.name} never found a viable opening and returned the money.`); const back = Math.min(p.coin, a.data.loan); p.coin -= back; r.coin += back; return close(w, a, 'no site'); } }
    else if (a.stage === 1 && d - a.data.since >= 10) {
      const biz = w.ownedBy(p.id).find((b: Building) => b.state === 'ok');
      if (biz) { const back = Math.min(p.coin * 0.5, a.data.loan); p.coin -= back; r.coin += back; warm(p, r, 40); beat(w, a, `🌟 ${p.name}'s ${biz.name} is thriving. They repaid ${r.name} ${usd(back)} and the town calls it a rags-to-riches story.`, true); close(w, a, 'success'); }
      else { r.aff.set(p.id, (r.aff.get(p.id) || 0) - 25); w.shiftTrait(p, 'cautious', 'the venture failed'); beat(w, a, `📉 ${p.name}'s venture collapsed. ${r.name} lost faith.`, true); close(w, a, 'failure'); }
    }
  },
};

const drought: Kind = {
  kind: 'drought', weight: w => (w.season() === 1 ? 1.2 : w.season() === 2 ? 0.2 : 0.5),
  launch(w) {
    const towns = w.S.filter(s => (w.sPop[s.id] || 0) >= 14 && (w.sbl[s.id] || []).some(b => b.type === BT.FARM) && !(s.drought > w.tick) && w.day() - (s.droughtEnd || -99) > 12); if (!towns.length) return null;
    const s = w.pick(towns), len = 3 + ((w.rnd() * 3) | 0); s.drought = w.tick + len * DAY_TICKS; s.droughtEnd = w.day() + len;
    const arc = mkArc(w, 'drought', `Drought in ${s.name}`, s.id, [w.gov(s).mayor].filter(i => i >= 0), { len });
    beat(w, arc, `☀️ A drought grips ${s.name}: the fields will yield nothing for about ${len} days.`, true); return arc;
  },
  step(w, a, d) {
    const s = w.S[a.sid], g = w.gov(s);
    if (a.stage === 0 && d >= 1 && g.mayor >= 0) { a.stage = 1; a.ids = [g.mayor]; const m = w.dots[g.mayor], mk = (w.sbl[s.id] || []).filter(b => b.type === BT.MARKET), low = mk.length ? Math.min(...mk.map(b => b.stock)) : 0; beat(w, a, low < 150 ? `🌾 ${s.name}'s markets are running low; Mayor ${m.name} is scrambling for grain.` : `🌾 ${s.name}'s granaries are holding for now.`); }
    if (d >= a.data.len) { const mk = (w.sbl[s.id] || []).filter(b => b.type === BT.MARKET), low = mk.length ? Math.min(...mk.map(b => b.stock)) : 0; beat(w, a, `🌧️ The rains returned to ${s.name}. ${low < 40 ? 'It was close — the markets nearly emptied.' : 'The town came through in good order.'}`, true); close(w, a, low < 40 ? 'hard' : 'survived'); }
  },
};

const investor: Kind = {
  kind: 'investor', weight: w => 0.5,
  launch(w) {
    const towns = townsWithPeople(w, 24).filter(s => w.unemployed(s.id) >= 4 && s.tier <= 1); if (!towns.length) return null;
    const s = w.pick(towns), houses = (w.sbl[s.id] || []).filter(b => b.type === BT.HOUSE).sort((u, v) => w.residents(u.id) - w.residents(v.id)); if (!houses.length) return null;
    let traits = rollTraits(w.rnd); const sh = shiftTraits(traits, 'ambitious'); if (sh) traits = sh.traits;
    const d = w.addDot({ name: w.newName(), fam: w.famGen(), job: 3, home: houses[0].id, work: -1, traits, age: 24 + w.rnd() * 14, life: 55 + w.rnd() * 20, coin: 0 }); if (!d) return null;
    w.fromAbroad(d, 'coin', 400_000, 'investors'); w.biz.arrived++;
    const arc = mkArc(w, 'investor', `${d.name} the investor`, s.id, [d.id]);
    beat(w, arc, `💼 ${d.name} ${epithet(d.traits)} arrives in ${s.name} from abroad with ${usd(400_000)} to invest.`, true); return arc;
  },
  step(w, a, d) {
    if (!live(w, ...a.ids)) return close(w, a, 'death'); const p = w.dots[a.ids[0]];
    if (a.stage === 0) { if (w.tryFound(p)) { a.stage = 1; a.data.since = d; beat(w, a, `🏢 ${p.name} began building in ${w.S[a.sid].name} — new jobs are coming.`); } else if (d >= 4) { beat(w, a, `${p.name} could not find a suitable site and settled in as an ordinary resident.`); close(w, a, 'settled'); } }
    else if (a.stage === 1 && d - a.data.since >= 10) { const biz = w.ownedBy(p.id).find((b: Building) => b.state === 'ok'); beat(w, a, biz ? `📈 ${p.name}'s ${biz.name} ${['', 'Farm', 'Market', 'Tavern', 'Workshop', '', '', 'Dock', 'Office', 'Factory', 'Store'][biz.type]} now employs ${biz.staff || 0} people.` : `📉 ${p.name}'s investment came to nothing.`, true); close(w, a, biz ? 'success' : 'failure'); }
  },
};

/* ---- arcs fed by the newer systems: a comeback, a run on the bank, a gang's rise and fall, a public disgrace ---- */
const LOW_NICKS = ['Bust', 'Evicted', 'Jailbird', 'Disgraced', 'Smashed'];
const comeback: Kind = {
  kind: 'comeback', weight: w => (w.dots.some(d => !d.dead && d.adult && LOW_NICKS.includes(d.nick || '') && !busy(w, [d.id])) ? 1.1 : 0),
  launch(w) {
    const c = w.dots.filter(d => !d.dead && d.adult && LOW_NICKS.includes(d.nick || '') && !busy(w, [d.id]) && d.age < d.life * 0.75); if (!c.length) return null;
    const d = w.pick(c), s = w.S[w.buildings[d.home].sid], arc = mkArc(w, 'comeback', `${d.name}'s comeback`, s.id, [d.id], { c0: d.coin, nick: d.nick });
    beat(w, arc, `🌅 ${d.name} refuses to stay down in ${s.name}${d.mem && d.mem.length ? ', still haunted by ' + d.mem.slice().sort((x: any, y: any) => y.w - x.w)[0].x : ''}. Everyone is watching to see if they can turn it around.`, true); return arc;
  },
  step(w, a, d) {
    if (!live(w, ...a.ids)) return close(w, a, 'death'); const p = w.dots[a.ids[0]];
    const owns = w.ownedBy(p.id).some((b: Building) => b.state === 'ok'), up = p.coin - a.data.c0;
    if (a.stage === 0 && d >= 6 && (p.job !== 3 || owns)) { a.stage = 1; beat(w, a, `🔨 ${p.name} found work${owns ? ' in their own business' : ''}. A first foothold.`); }
    if (a.stage === 1 && d >= 14 && (up > 60 * KB * 10 || owns)) { beat(w, a, `🏆 ${p.name} is back on top: from “${a.data.nick}” to someone the town respects again.`, true); w.giveNick(p, 'Comeback Kid', 65); p.fame = (p.fame || 0) + 10; w.addThought(p, 'comeback', 15, 40, 'Proved them all wrong.'); return close(w, a, 'success'); }
    if (w.mood(p) < 20 && a.stage < 2 && d >= 4) { a.stage = Math.max(a.stage, 1); a.data.low = (a.data.low || 0) + 1; if (a.data.low === 1) beat(w, a, `😔 ${p.name} came close to giving up for good.`); }
    if (d >= 45) { beat(w, a, `${p.name} never quite got back on their feet.`); close(w, a, 'failed'); }
  },
};
const panic: Kind = {
  kind: 'panic', weight: w => (w.bank && w.bank.fear > 0.6 ? 2 : 0),
  launch(w) {
    const bk = w.bank; if (!bk || bk.fear <= 0.6 || busy(w, [bk.owner])) return null; const o = w.dots[bk.owner]; if (!o || o.dead) return null;
    const arc = mkArc(w, 'panic', `The run on ${bk.name}`, w.buildings[o.home].sid, [o.id], { top: bk.fear, gen: bk.gen });
    beat(w, arc, `🏦 Whispers are spreading: customers are queuing outside ${bk.name} to pull out their savings.`, true); return arc;
  },
  step(w, a, d) {
    const bk = w.bank, o = w.dots[a.ids[0]];
    if (!bk || bk.gen !== a.data.gen) { beat(w, a, `💥 ${a.data.gen ? 'The bank is gone.' : ''} Depositors lost savings in the collapse of the bank.`, true); return close(w, a, 'collapsed'); }
    a.data.top = Math.max(a.data.top, bk.fear);
    if (a.stage === 0 && bk.fear > 1.2) { a.stage = 1; beat(w, a, `🚪 Tellers are turning people away at the door. ${o ? o.name : 'The owner'} insists the money is safe.`); }
    if (bk.fear < 0.2 && d >= 3) { beat(w, a, `😮‍💨 Confidence returns. ${bk.name} survived the run${a.stage ? ' by the skin of its teeth' : ''}.`, true); if (o) { o.fame = (o.fame || 0) + 5; } return close(w, a, 'calmed'); }
    if (d >= 30) close(w, a, 'faded');
  },
};
const gangster: Kind = {
  kind: 'gangster', weight: w => (w.gangs.some((g: any) => g.active && !busy(w, [g.boss])) ? 1.6 : 0),
  launch(w) {
    const g = w.gangs.find((x: any) => x.active && !busy(w, [x.boss])); if (!g) return null; const boss = w.dots[g.boss]; if (!boss || boss.dead) return null;
    const arc = mkArc(w, 'gangster', `${g.name} of ${w.S[g.sid].name}`, g.sid, [g.boss, ...g.members.slice(0, 1)], { gid: g.id, loot: g.loot });
    beat(w, arc, `🐺 ${g.name} have the shopkeepers of ${w.S[g.sid].name} looking over their shoulders. ${boss.name} runs the street.`, true); return arc;
  },
  step(w, a, d) {
    const g = w.gangs[a.data.gid]; if (!g) return close(w, a, 'gone');
    if (!g.active) { const boss = w.dots[g.boss]; beat(w, a, `🚔 ${g.name} are finished: ${boss && (boss.jailUntil || 0) > w.tick ? boss.name + ' is behind bars' : 'the gang has scattered'}. ${w.S[g.sid].name} breathes again.`, true); return close(w, a, 'busted'); }
    if (a.stage === 0 && g.loot > 3000) { a.stage = 1; beat(w, a, `💰 ${g.name} have taken ${usd(g.loot)} in protection money so far.`); }
    if (a.stage === 1 && g.loot > 15000) { a.stage = 2; beat(w, a, `😨 ${w.S[g.sid].name} lives in fear: ${usd(g.loot)} extorted and the police still have no case.`, true); }
    if (d >= 40) close(w, a, 'endured');
  },
};
const disgrace: Kind = {
  kind: 'disgrace', weight: w => (w.dots.some(d => !d.dead && d.adult && (d.ire || 0) > 25 && !busy(w, [d.id])) ? 1.4 : 0),
  launch(w) {
    const c = w.dots.filter(d => !d.dead && d.adult && (d.ire || 0) > 25 && !busy(w, [d.id])).sort((x, y) => (y.ire || 0) - (x.ire || 0)); if (!c.length) return null;
    const d = c[0], s = w.S[w.buildings[d.home].sid], arc = mkArc(w, 'disgrace', `The fall of ${d.name}`, s.id, [d.id], { job0: d.job, work0: d.work });
    beat(w, arc, `🔥 ${d.name} of ${s.name} is the most hated person in the country right now. The question is whether there is a way back.`, true); return arc;
  },
  step(w, a, d) {
    if (!live(w, ...a.ids)) return close(w, a, 'death'); const p = w.dots[a.ids[0]];
    if (a.stage === 0 && d >= 4 && p.work < 0 && a.data.work0 >= 0) { a.stage = 1; beat(w, a, `📦 ${p.name} cleared out their desk. Nobody will hire them.`); }
    if ((p.ire || 0) < 8 && d >= 8) { beat(w, a, `🕊️ The storm has passed. People have mostly forgotten what ${p.name} did, and ${p.name} is trying to start over.`, true); w.addThought(p, 'forgiven', 8, 30, 'The worst is behind me.'); return close(w, a, 'forgotten'); }
    if (a.stage === 1 && p.coin < 8 * KB && d >= 12) { beat(w, a, `🥀 ${p.name} is broke and alone. The pile-on cost them everything.`, true); return close(w, a, 'ruined'); }
    if (d >= 35) close(w, a, 'faded');
  },
};

/* A vendetta is not authored: it is noticed. When one dot's ledger holds a big grudge against someone in town and they are the type to act on it, the
   storyteller starts following them. It never forces a fight; it narrates what the bond system does (fights, forgiveness, a death). */
const grudgeHolders = (w: World) => w.dots.filter(d => !d.dead && d.adult && d.foes && d.foes.size && !busy(w, [d.id])).map(d => { let o = -1, g = 0; for (const [id, v] of d.foes) { const t = w.dots[id]; if (t && !t.dead && !busy(w, [id]) && v > g && w.buildings[t.home].sid === w.buildings[d.home].sid) { g = v; o = id; } } return { d, o, g }; }).filter(x => x.o >= 0 && x.g >= 28);
const vendetta: Kind = {
  kind: 'vendetta', weight: w => (grudgeHolders(w).length ? 1.8 : 0),
  launch(w) {
    const c = grudgeHolders(w).sort((x, y) => y.g - x.g)[0]; if (!c) return null;
    const why = (c.d.bonds || []).filter((b: any) => b.o === c.o && b.v < 0).sort((x: any, y: any) => x.v - y.v)[0], t = w.dots[c.o];
    const arc = mkArc(w, 'vendetta', `${c.d.name} and ${t.name}`, w.buildings[c.d.home].sid, [c.d.id, c.o], { g0: c.g, fights0: w.stats.fights, why: why ? why.k : 'robbed' });
    const txt: Record<string, string> = { robbed: 'was robbed by', burgled: 'was burgled by', beaten: 'was beaten up by', stiffed: 'was never repaid by', jilted: 'was left heartbroken by', killed: 'lost someone to', feud: 'inherited a family feud with', witnessed: 'saw too much of', brawl: 'came to blows with', rival: 'is eaten up with jealousy over' };
    beat(w, arc, `🗡️ ${c.d.name} ${txt[arc.data.why] || 'holds a grudge against'} ${t.name}, and has not let it go.`, true); return arc;
  },
  step(w, a, d) {
    if (!live(w, ...a.ids)) { beat(w, a, `The grudge ended with a funeral.`, true); return close(w, a, 'death'); }
    const h = w.dots[a.ids[0]], t = w.dots[a.ids[1]], g = w.grudge(h, t.id);
    if (g < 12) { beat(w, a, `🕊️ ${h.name} has finally let go of what ${t.name} did.`, true); return close(w, a, 'forgiven'); }
    if (a.stage === 0 && (h.revCd || 0) > w.tick - 2 * DAY_TICKS) { a.stage = 1; beat(w, a, `🔥 ${h.name} went looking for ${t.name}.`); }
    if (a.stage === 1 && (h.revCd || 0) < w.tick - 4 * DAY_TICKS && g < 30) { beat(w, a, `${h.name} and ${t.name} have done with each other, for now.`); return close(w, a, 'settled'); }
    if (d >= 30) close(w, a, 'faded');
  },
};

export const KINDS: Kind[] = [rivalry, triangle, feud, protege, drought, investor, comeback, panic, gangster, disgrace, vendetta];

/* ---------------- the director ---------------- */
/** Called once per dawn. */
function storyDawn(this: World) {
  const st = this.story, day = this.day();
  const pop = Math.max(1, this.sPop.reduce((s, v) => s + (v || 0), 0));
  st.tension = 0.6 * st.tension + 0.4 * (st.heat * 150 / pop); st.heat = 0;   // normalised: a bigger country is not automatically 'more dramatic'
  for (const a of st.arcs) if (!a.done) { try { KINDS.find(k => k.kind === a.kind)!.step(this, a, day - a.day0); } catch (e) { a.done = true; a.outcome = 'error'; } }
  st.arcs = st.arcs.filter(a => !a.done || day - a.day0 < 30);
  const active = st.arcs.filter(a => !a.done).length, cap = Math.max(2, Math.round((this.sPop.reduce((s, v) => s + (v || 0), 0)) / 150));
  // how many stories to start today: more when the country is calmer than the wave asks for, and more for a bigger country
  const regions = Math.max(1, Math.round(pop / 700)), want = Math.ceil((targetTension(day) - st.tension) / 1.5);
  const slots = Math.min(cap - active, regions * Math.max(0, want));
  for (let n = 0; n < slots && this.rnd() < 0.85; n++) {
    const opts = KINDS.map(k => ({ k, w: k.weight(this) * (day - (st.cool[k.kind] || -99) > 3 ? 1 : 0.15) * (st.arcs.filter(a => !a.done && a.kind === k.kind).length >= 3 * regions ? 0.1 : 1) }));
    // try kinds in weighted random order until one finds a setting it can use (many need specific people to exist)
    let launched = false;
    for (let attempt = 0; attempt < KINDS.length && opts.length && !launched; attempt++) {
      let r = this.rnd() * opts.reduce((s, o) => s + o.w, 0), pick = opts.length - 1;
      for (let i = 0; i < opts.length; i++) { r -= opts[i].w; if (r <= 0) { pick = i; break; } }
      launched = !!opts.splice(pick, 1)[0].k.launch(this);
    }
    if (!launched) break;
    st.lastLaunch = this.tick; st.tension += 2.5 / regions;
  }
  if (this.year() !== st.lastYear) this.yearReview();
}

/** End-of-year entry in the chronicle. */
function yearReview(this: World) {
  const st = this.story, yr = st.lastYear, s = this.stats, snap = st.snap, alive = this.dots.filter(d => !d.dead);
  const born = s.births - (snap.births || 0), died = s.deaths - (snap.deaths || 0), thefts = s.thefts - (snap.thefts || 0), arcs = st.closed - (snap.closed || 0);
  const richest = alive.slice().sort((a, b) => b.coin - a.coin)[0], big = this.S.filter(x => (this.sPop[x.id] || 0) > 0).sort((a, b) => (this.sPop[b.id] || 0) - (this.sPop[a.id] || 0))[0];
  this.chronicle(`Year ${yr} in review`, `Population ${alive.length} (${born} born, ${died} died). ${arcs} stories played out. ${big ? `${big.name} remains the largest settlement (${this.sPop[big.id]}). ` : ''}${richest ? `${richest.name} ${epithet(richest.traits)} is the wealthiest at ${usd(richest.coin)}. ` : ''}${thefts} robberies. ${this.biz.closed} businesses have failed so far, ${this.biz.built} built.`, [], true);
  st.lastYear = this.year(); st.snap = { births: s.births, deaths: s.deaths, thefts: s.thefts, closed: st.closed };
}

/** Compact view of the active arcs for the client. */
function arcsMsg(this: World) {
  return this.story.arcs.filter(a => !a.done).map(a => ({ i: a.id, k: a.kind, t: a.title, s: a.stage, ids: a.ids, d: this.day() - a.day0, b: a.beats.length ? a.beats[a.beats.length - 1].text : '' }));
}

Object.assign(World.prototype, { chronicle, storyDawn, yearReview, arcsMsg });
declare module './world' { interface World { chronicle: typeof chronicle; storyDawn: typeof storyDawn; yearReview: typeof yearReview; arcsMsg: typeof arcsMsg } }
export const STORY_KINDS = KINDS.map(k => k.kind);
void TRAIT; void YEAR_DAYS;
