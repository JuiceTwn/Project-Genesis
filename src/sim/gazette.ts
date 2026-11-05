/* The Gazette writer. At every dawn it turns the previous day's events, story arcs and numbers into a newspaper issue:
   a front-page story chosen by newsworthiness, secondary stories, briefs by town, hearts & homes, obituaries, a business ledger,
   a market report, a gossip column written by the country's biggest gossip, classifieds and the day in numbers.
   Prose is templated (deterministic and free); every story is built from structured facts so names, towns and relationships are real. */
import { World } from './world';
import { usd } from '../shared/reality';
import * as K from '../shared/constants';
import { BT, BT_NAME, DAY_TICKS, SEASONS, STAFF, WAGE, DREAM_TXT, SEASON_DAYS } from '../shared/constants';
import { TRAIT, epithet } from './personality';
import { plain, type GStory, type Issue, type StoryDoc } from '../shared/gazette';
import type { Dot } from '../shared/types';
import type { Arc } from './story-types';

export interface LogEvent { k: string; x: string; ids: number[]; w: number; tick: number }
const base = (k: string) => k.replace(/[.\d]+$/, '');
const full = (d: Dot) => `${d.name} ${d.fam}`.trim();
const lc = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const up = (s: string) => s.toUpperCase();

function townOf(w: World, d?: Dot): string { return d ? w.S[w.buildings[d.home].sid].name : 'the country'; }
function jobPhrase(w: World, d: Dot): string {
  if (!d.adult) return 'a child';
  if (d.work >= 0 && w.buildings[d.work]) { const t = w.buildings[d.work].type; return t === BT.FARM ? 'a farmer' : t === BT.TAVERN ? 'a tavern keeper' : `${/^[AEIOU]/i.test(BT_NAME[t]) ? 'an' : 'a'} ${BT_NAME[t].toLowerCase()} worker`; }
  return d.job === 3 ? 'a jobseeker' : 'a local worker';
}
const topBlurb = (d: Dot) => { const t = d.traits.find(x => TRAIT[x]); return t ? TRAIT[t].blurb : 'a quiet presence'; };
/** One-line profile of a person, used in stories and archives. */
export function profile(w: World, d: Dot): string {
  if (!d.adult) return `${Math.round(d.age)}, a child of the ${d.fam} family in ${townOf(w, d)}.`;
  const p = d.partner >= 0 ? w.dots[d.partner] : null, fr = w.friends(d).length;
  return `${Math.round(d.age)}, ${jobPhrase(w, d)} from ${townOf(w, d)}, known as ${epithet(d.traits)} — ${topBlurb(d)}. ${p ? `Partnered with ${p.name}.` : 'Single.'} ${fr ? `${fr} friend${fr > 1 ? 's' : ''}.` : 'Few friends.'} Dreams of: ${DREAM_TXT[d.dream || 'content']}.`;
}

type Tone = 'pos' | 'neg' | 'any';
const Q = (pos: string[], neg: string[], any: string[] = []): [string, Tone][] => [...pos.map(t => [t, 'pos'] as [string, Tone]), ...neg.map(t => [t, 'neg'] as [string, Tone]), ...any.map(t => [t, 'any'] as [string, Tone])];
const QUOTES: Record<string, [string, Tone][]> = {
  gossip: Q(["I said this would happen. Nobody ever listens to me."], ["Oh, I could tell you things about {n} that would curl your hair."], ["Well, you didn't hear it from me."]),
  hothead: Q(["About time something went right for {n}!"], ["Honestly? Not surprised. {n} always did have a temper.", "Someone was bound to snap sooner or later."]),
  kind: Q(["{n} deserves every bit of it. A better soul you'll not find."], ["I only hope everyone's alright. That's all that matters."], ["{n} would give you the shirt off their back. That's the truth."]),
  greedy: Q(["Well, good for them — I wonder what it cost."], ["Everything's about the money with that one."], ["Nobody does anything for nothing around here."]),
  shy: Q(["I'm glad for them. Truly."], ["I'd rather not say. It's not my business."], ["{n} never said much. You never know what's going on in there."]),
  loyal: Q(["{n}'s been good to me, whatever anyone else says."], ["Stand by your own. That's all there is to it."]),
  cruel: Q(["Enjoy it while it lasts, I say."], ["Serves them right, if you ask me.", "Some people just get what's coming."]),
  calm: Q(["Good. Let's enjoy it."], ["Let's not get carried away. These things pass."], ["Give it a week and nobody will remember."]),
  brave: Q(["Good for them. It takes nerve."], ["If it were me I'd have faced it head on."]),
  coward: Q(["I'd never have dared myself."], ["I'd have run for it, myself.", "I'm keeping my head down until this blows over."]),
  romantic: Q(["It's the most romantic thing I've ever heard.", "Love finds a way. It always does."], ["Such a pity. Some stories deserve a happier ending."]),
  pessimist: Q(["Enjoy it. It won't last."], ["Mark my words, this ends badly.", "Nothing lasts."]),
  optimistic: Q(["Things are looking up, I always said so."], ["Every town has its rough weeks. We'll be fine."], ["Things will look better in the spring."]),
  ambitious: Q(["{n} was always going places."], ["That one has big plans. This is a setback, nothing more."]),
  lazy: Q(["Lucky them. Some of us have to work for it."], ["Typical. Somebody else will have to sort it out."]),
  vengeful: Q(["Sweet — but I'd watch my back if I were them."], ["Some people don't forget. I should know.", "There'll be a reckoning. There always is."]),
  forgiving: Q(["Wonderful news. I'm happy for them."], ["People make mistakes. I hope they patch it up."]),
  honest: Q(["{n} has never told a lie in all the years I've known them. They've earned it."], ["You can say what you like — they were straight with everyone."]),
  thief: Q(["Lucky devil."], ["Count your coins around that one.", "I'm not saying anything. I'm just saying lock your door."]),
  generous: Q(["{n} has helped half this street. It's only fair."], ["They'll be the first to ask what they can do."]),
  charming: Q(["You couldn't help liking {n}. Everyone does."], ["Smile like that and you can get away with anything."]),
};
function quote(w: World, subject: Dot, tone: Tone = 'any'): string | undefined {
  const pool: Dot[] = w.friends(subject).map(f => w.dots[f[0]]).filter(Boolean).concat(w.townAdults(w.buildings[subject.home].sid).slice(0, 12)).filter(d => d && !d.dead && d.adult && d.id !== subject.id);
  if (!pool.length) return undefined;
  const wit = w.pick(pool);
  for (const t of wit.traits) {
    const lines = (QUOTES[t] || []).filter(([, k]) => k === tone || k === 'any' || tone === 'any'); if (!lines.length) continue;
    return `“${w.pick(lines)[0].replace(/\{n\}/g, subject.name)}” — ${full(wit)}, ${jobPhrase(w, wit)}`;
  }
  return undefined;
}
const toneOf = (k: string): Tone => (['wedding', 'love', 'opened', 'project', 'grant', 'elect'].includes(k) ? 'pos' : ['scandal', 'bankrupt', 'fire', 'death', 'breakup', 'fight', 'theft', 'shift'].includes(k) ? 'neg' : 'any');

/* ---------- headlines ---------- */
interface Ctx { w: World; e: LogEvent; d?: Dot; town: string; name: string; text: string }
const HEAD: Record<string, (c: Ctx) => [string, string][]> = {
  scandal: c => [[`SCANDAL AT ${up(c.town)} TOWN HALL`, `Mayor ${c.name} accused of dipping into the public purse`], [`MAYOR ${up(c.name)} IN HOT WATER`, `The treasury of ${c.town} is lighter than it should be`]],
  bankrupt: c => [[`${up(c.town)} FIRM COLLAPSES`, c.text], [`BANKRUPTCY HITS ${up(c.town)}`, c.text], [`${up(c.name)} CALLS IT A DAY`, c.text]],
  fire: c => [[`FIRE IN ${up(c.town)}`, `Flames tear through a building as neighbours look on`], [`BLAZE LEAVES ${up(c.town)} SHAKEN`, c.text]],
  elect: c => [[`${up(c.town)} HAS CHOSEN`, `${c.name} takes the mayor's chair`], [`NEW MAYOR, NEW MOOD IN ${up(c.town)}`, c.text]],
  death: c => [[`${up(c.town)} MOURNS ${up(c.name)}`, c.text], [`FAREWELL TO ${up(c.name)}`, c.text]],
  wedding: c => [[`WEDDING BELLS IN ${up(c.town)}`, c.text], [`${up(c.name)} TIES THE KNOT`, c.text]],
  love: c => [[`LOVE IS IN THE AIR IN ${up(c.town)}`, c.text]],
  breakup: c => [[`HEARTBREAK IN ${up(c.town)}`, c.text]],
  shift: c => [[`${up(c.name)}: A CHANGED PERSON`, c.text]],
  mint: c => [[`NATIONAL BANK PRINTS MONEY`, c.text]],
  grant: c => [[`CAPITAL STEPS IN TO SAVE ${up(c.town)}`, c.text]],
  fight: c => [[`BRAWL IN ${up(c.town)}`, c.text]],
  theft: c => [[`ROBBERY SHAKES ${up(c.town)}`, c.text]],
  opened: c => [[`NEW BUSINESS OPENS IN ${up(c.town)}`, c.text]],
  grain: c => [[`${up(c.town)} SCRAMBLES FOR GRAIN`, c.text]],
  project: c => [[`${up(c.town)} UNVEILS A NEW PROJECT`, c.text]],
};
const SCORE: Record<string, number> = { arc: 100, scandal: 90, fire: 70, bankrupt: 62, elect: 26, death: 40, wedding: 52, shift: 50, mint: 60, grant: 54, fight: 22, theft: 20, love: 38, breakup: 40, opened: 36, grain: 48, project: 34 };

/** Arc headlines depend on the kind, how far it has got and how it ended. */
function arcHeadline(w: World, a: Arc): [string, string] {
  const n = (i: number) => (w.dots[a.ids[i]] ? full(w.dots[a.ids[i]]) : '?'), T = up(a.data.town || w.S[a.sid]?.name || 'town'), last = a.beats[a.beats.length - 1]?.text ?? '', deck = plain(last);
  const o = a.outcome;
  switch (a.kind) {
    case 'rivalry': return a.done ? (o === 'brawl' ? [`RIVALS COME TO BLOWS IN ${T}`, deck] : o === 'peace' ? [`RIVALS MAKE PEACE IN ${T}`, deck] : [`COLD WAR BETWEEN ${up(n(0))} AND ${up(n(1))}`, deck]) : [a.stage ? `${T} TAKES SIDES IN BITTER RIVALRY` : `BAD BLOOD IN ${T}: ${up(n(0))} AND ${up(n(1))} AT ODDS`, deck];
    case 'triangle': return a.done ? (o === 'loyal' ? [`${up(n(0))} STAYS TRUE; SUITOR TURNED AWAY`, deck] : o === 'new couple' ? [`${up(n(0))} LEAVES ${up(n(1))} FOR ${up(n(2))}`, deck] : [`LOVE TRIANGLE ENDS IN ${T}`, deck]) : [a.stage ? `JEALOUSY SIMMERS IN ${T}` : `LOVE TRIANGLE ROCKS ${T}`, deck];
    case 'feud': return a.done ? (o === 'love' ? [`LOVE ENDS THE FEUD IN ${T}`, deck] : o === 'mediated' ? [`MAYOR BROKERS PEACE IN ${T}`, deck] : [`FEUD ENDS IN BRAWL IN ${T}`, deck]) : [`FAMILY FEUD DIVIDES ${T}`, deck];
    case 'protege': return a.done ? (o === 'success' ? [`FROM RAGS TO RICHES IN ${T}`, deck] : [`DREAM VENTURE COLLAPSES IN ${T}`, deck]) : [`${up(n(1))} BACKS ${up(n(0))} WITH 220 COINS`, deck];
    case 'drought': return a.done ? [`RAINS RETURN TO ${T}`, deck] : [`DROUGHT GRIPS ${T}`, deck];
    case 'investor': return a.done ? (o === 'success' ? [`INVESTOR'S GAMBLE PAYS OFF IN ${T}`, deck] : [`INVESTOR FALLS SHORT IN ${T}`, deck]) : [`INVESTOR ARRIVES IN ${T}`, deck];
  }
  return [up(a.title), deck];
}

/** Build the issue for the day that just ended. */
function writeIssue(w: World, log: LogEvent[], snap: Record<string, number>): Issue {
  const day = w.day(), season = w.season(), alive = w.dots.filter(d => !d.dead);
  const cnt = (k: string) => log.filter(e => base(e.k) === k).length;
  const dot = (id: number) => w.dots[id];
  const stories: (GStory & { score: number })[] = [];

  // arcs that moved today
  const todays = w.story.arcs.filter(a => a.beats.some(b => b.day >= day - 1));
  for (const a of todays) {
    const [h, deck] = arcHeadline(w, a), recent = a.beats.filter(b => b.day >= day - 1).map(b => plain(b.text));
    const body = recent.filter(t => t !== deck).slice(0, 3); const pr = a.ids.map(dot).filter(Boolean).slice(0, 2);
    for (const d of pr) body.push(`${full(d)} is ${profile(w, d)}`);
    stories.push({ kind: 'arc:' + a.kind, headline: h, deck, body, quote: pr[0] ? quote(w, pr[0], a.done ? (['success', 'peace', 'love', 'mediated', 'new couple', 'survived'].includes(a.outcome) ? 'pos' : 'neg') : 'any') : undefined, ids: a.ids, town: w.S[a.sid]?.name || '', arc: a.id, score: SCORE.arc + (a.done ? 6 : 0) + a.beats.length });
  }
  // other newsworthy events
  const used = new Set<string>();
  for (const e of log.slice().sort((p, q) => (SCORE[base(q.k)] || 0) - (SCORE[base(p.k)] || 0))) {
    const k = base(e.k), mk = HEAD[k]; if (!mk || k === 'arc') continue;
    const d = e.ids[0] !== undefined ? dot(e.ids[0]) : undefined, key = k + ':' + (e.ids[0] ?? '');
    if (used.has(key) || stories.filter(s => s.kind === k).length >= 1) continue; used.add(key);
    const c: Ctx = { w, e, d, town: townOf(w, d), name: d ? full(d) : 'Someone', text: plain(e.x) }, [h, deck] = w.pick(mk(c)), big = d ? w.S[w.buildings[d.home].sid].tier <= 1 : false;
    const body: string[] = []; if (deck !== c.text) body.push(c.text); if (d && !['mint', 'grant'].includes(k)) body.push(`${full(d)}, ${profile(w, d)}`); else if (!body.length) body.push(c.text);
    stories.push({ kind: k, headline: h, deck, body, quote: d ? quote(w, d, toneOf(k)) : undefined, ids: e.ids, town: c.town, score: (SCORE[k] || 20) + e.w + w.rnd() * 6 + (k === 'elect' && big ? 30 : 0) });
  }
  stories.sort((a, b) => b.score - a.score);
  let front: GStory;
  if (stories.length) front = stories.shift()!;
  else {
    const star = alive.slice().sort((a, b) => w.friends(b).length - w.friends(a).length)[0];
    front = { kind: 'quiet', headline: 'A QUIET DAY IN DOTVILLE', deck: `${alive.length} residents go about their business under a ${w.weather ? (w.weather === 2 ? 'snowy' : 'rainy') : 'clear'} sky`, ids: star ? [star.id] : [], town: '',
      body: [`No scandals, no fires, no feuds — the kind of day the ${SEASONS[season].toLowerCase()} is made for.`, star ? `Our resident to watch: ${full(star)}, ${profile(w, star)}` : 'Check back tomorrow.'], quote: star ? quote(w, star) : undefined };
  }
  const second = stories.slice(0, 4);

  // briefs by town
  const BR = ['tax', 'welfare', 'feast', 'civic', 'bridge', 'road', 'ship', 'house', 'moveout', 'arrive', 'grain', 'grant', 'project', 'elect'];
  const wf = log.filter(e => base(e.k) === 'welfare'), wtowns = [...new Set(wf.map(e => (e.ids[0] !== undefined && dot(e.ids[0]) ? townOf(w, dot(e.ids[0])) : '')).filter(Boolean))];
  const briefs0 = log.filter(e => BR.includes(base(e.k)) && base(e.k) !== 'welfare').filter(e => !([front] as GStory[]).concat(second).some(s => s.body[0] === plain(e.x))).slice(0, 7).map(e => ({ town: e.ids[0] !== undefined && dot(e.ids[0]) ? townOf(w, dot(e.ids[0])) : 'National', text: plain(e.x) }));
  const briefs = wtowns.length ? briefs0.concat([{ town: 'Relief', text: `councils paid out relief to the poorest households in ${wtowns.slice(0, 6).join(', ')}${wtowns.length > 6 ? ` and ${wtowns.length - 6} more` : ''}.` }]) : briefs0;
  const lines = (kinds: string[], max: number) => { const L = log.filter(e => kinds.includes(base(e.k))).map(e => plain(e.x)); return L.length > max ? L.slice(0, max).concat([`…and ${L.length - max} more.`]) : L; };
  const hearts = lines(['love', 'wedding', 'breakup', 'reject', 'birth'], 7), obits = lines(['death'], 6);

  // business ledger
  const open = w.buildings.filter(b => b.state === 'ok' && w.isBiz(b)), jobless = alive.filter(d => d.adult && d.job === 3 && d.work < 0).length, adults = alive.filter(d => d.adult).length;
  const business = [`${open.length} businesses open · ${cnt('opened')} opened, ${cnt('bankrupt')} failed, ${cnt('sale')} sold, ${cnt('fire')} fires today.`, `Jobless adults: ${jobless} (${Math.round(100 * jobless / Math.max(1, adults))}%). Missed payrolls today: ${w.biz.unpaid - (snap.unpaid || 0)}; ${w.biz.quit - (snap.quit || 0)} people quit over unpaid wages.`, ...lines(['bankrupt', 'opened', 'found', 'refit', 'sale', 'quit'], 4)];

  // market report
  const mk = w.markets.filter(m => m.state === 'ok'), avgStock = mk.length ? Math.round(mk.reduce((a, m) => a + m.stock, 0) / mk.length) : 0, low = mk.slice().sort((a, b) => a.stock - b.stock)[0];
  const prices = mk.map(m => w.mprice(m)), taxes = w.S.map(s => w.gov(s).tax), supply = w.moneySupply(), dSupply = supply - (snap.supply || supply);
  const market = [`Food stocks average ${avgStock} units across ${mk.length} markets${low ? `; thinnest at ${w.S[low.sid].name} (${Math.round(low.stock)})` : ''}.`, prices.length ? `A meal costs ${usd(Math.min(...prices))}–${usd(Math.max(...prices))} depending on the market.` : '', `Money supply: ${usd(supply)} (${dSupply >= 0 ? '+' : '−'}${Math.abs(Math.round(dSupply)).toLocaleString('en')} on the day); the national bank has printed ${Math.round(w.ledger.minted)} in total.`, `Local income taxes run ${Math.min(...taxes)}–${Math.max(...taxes)}% on top of the national ${Math.round(K.NATION_TAX * 100)}%; the national treasury holds ${Math.round(w.nation.treasury).toLocaleString('en')}.`].filter(Boolean);

  // gossip column, by the country's biggest gossip
  const col = alive.filter(d => d.adult).sort((a, b) => b.fx.gossip - a.fx.gossip || a.id - b.id)[0];
  const GK = ['jealous', 'friend', 'reject', 'kind', 'theft0', 'rich', 'dream', 'breakup', 'love', 'starve', 'shift', 'scandal'];
  const PRE = ['Hear it from me first: ', 'Not that I listen to rumours, but ', 'A little bird tells me that ', 'Overheard at the market — ', 'Between us: ', 'I shouldn\'t say, but '];
  const gossip = { by: col ? full(col) : 'a well-informed source', items: log.filter(e => GK.includes(base(e.k))).slice(0, 5).map(e => w.pick(PRE) + plain(e.x)) };
  if (!gossip.items.length) gossip.items.push('Nothing to dish today — which is itself suspicious.');

  // classifieds
  const jobsOpen = open.filter(b => STAFF[b.type] && (b.staff || 0) < STAFF[b.type]).sort((a, b) => (STAFF[b.type] - (b.staff || 0)) - (STAFF[a.type] - (a.staff || 0))).slice(0, 4);
  const classifieds = [...jobsOpen.map(b => `WANTED: ${STAFF[b.type] - (b.staff || 0)} hand${STAFF[b.type] - (b.staff || 0) > 1 ? 's' : ''} at ${b.name} ${BT_NAME[b.type]}, ${w.S[b.sid].name}. ${usd(WAGE[b.type] || 9)} a day.`), ...w.buildings.filter(b => b.state === 'vacant').slice(0, 2).map(b => `FOR SALE: vacant ${BT_NAME[b.type].toLowerCase()} in ${w.S[b.sid].name}. Enquire within.`)];
  if (!classifieds.length) classifieds.push('No notices today.');

  const mood = alive.length ? Math.round(alive.reduce((a, d) => a + w.mood(d), 0) / alive.length) : 0;
  const numbers = [{ label: 'residents', value: String(alive.length) }, { label: 'born today', value: String(cnt('birth')) }, { label: 'died today', value: String(cnt('death')) }, { label: 'weddings', value: String(cnt('wedding')) }, { label: 'robberies', value: String(cnt('theft')) }, { label: 'mood', value: `${mood}/100` }, { label: 'jobless', value: `${Math.round(100 * jobless / Math.max(1, adults))}%` }];
  const dayInSeason = ((day - 1) % SEASON_DAYS) + 1;
  return { n: day, day, year: w.year(), season: SEASONS[season], weather: w.weather === 2 ? 'Snow' : w.weather === 1 ? 'Rain' : 'Fair', dateline: `Year ${w.year()} · ${SEASONS[season]}, day ${dayInSeason} · issue day ${day}`,
    front, stories: second, briefs, hearts, obits, business, market, gossip, classifieds, numbers };
}

/** Called at the start of every dawn, before the new day's decisions. */
function gazetteDawn(this: World) {
  const log = this.dayLog; this.dayLog = [];
  if (this.day() > 1 || log.length) {
    const issue = writeIssue(this, log, this.gazetteSnap);
    this.issues.push(issue); if (this.issues.length > 14) this.issues.shift();
    this.out.push({ t: 'issue', issue }); this.archive.push({ kind: 'issue', id: issue.n, data: issue });
  }
  this.gazetteSnap = { unpaid: this.biz.unpaid, quit: this.biz.quit, supply: this.moneySupply() };
}

/** Queue a permanent, shareable record of a story arc (rewritten on every beat). */
function archiveStory(this: World, a: Arc) {
  const ids: number[] = [...new Set<number>(a.ids.concat(a.data.ma?.slice(0, 2) || [], a.data.mb?.slice(0, 2) || []))], people = ids.map(i => this.dots[i]).filter(Boolean).slice(0, 6).map(d => ({ id: d.id, name: full(d), epithet: epithet(d.traits), line: profile(this, d) }));
  const doc: StoryDoc = { id: a.id, kind: a.kind, title: a.title, town: this.S[a.sid]?.name || '', started: { day: a.day0, year: Math.floor((a.day0 - 1) / (SEASON_DAYS * 4)) + 1 }, done: a.done, outcome: a.outcome, people, beats: a.beats.slice() };
  this.archive.push({ kind: 'story', id: a.id, data: doc });
}

Object.assign(World.prototype, { gazetteDawn, archiveStory });
declare module './world' { interface World { gazetteDawn: typeof gazetteDawn; archiveStory: typeof archiveStory } }
void DAY_TICKS;
