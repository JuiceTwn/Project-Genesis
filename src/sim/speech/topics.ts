/* Conversation: what two people talk about. A TOPIC is a small registered rule: how much does this speaker want to bring it up right now (weight), and
   what do they say and how does the listener answer (run). Topics only choose acts and arguments; the prose lives in the bank, so adding a topic is a
   few lines plus a few phrasings.

   The runner picks a topic by weight, then:
     - remembers it per pair, so the same two people do not rehash the same subject within days;
     - lets the listener answer through a REPLY kind (see defineReplyUpgrade: a kind listener turns "sympathy" into an offer of help, a rival into a jab);
     - sometimes lets the listener take a turn of their own ("Funny you should say that..."), up to three turns, so chats have a back and forth. */
import type { Dot } from '../../shared/types';
import { World } from '../world';
import * as K from '../../shared/constants';
import { render, tagsFor, mix, hstr, matches, type Act } from './engine';

export interface TCtx {
  w: World; s: Dot; l: Dot;                  // this turn's speaker and listener
  tags: Set<string>; ltags: Set<string>;     // tags from the speaker's and from the listener's point of view
  aff: number; laf: number;                  // how the speaker feels about the listener, and the reverse
  turn: number;
  /** The speaker says an act. */ say(act: Act, args?: Record<string, any>): void;
  /** The listener says an act of their own. */ answer(act: Act, args?: Record<string, any>): void;
  /** The listener replies with a reply kind ('SYMPATHY', 'CONGRATS', ...), possibly upgraded by who they are. */ reply(kind: string, args?: Record<string, any>): void;
  /** Do something when the chat ends (changes in liking, mood, beliefs). Never during speech: lines may never be spoken if someone dies first. */ fx(fn: () => void): void;
  rnd(): number; pick<T>(a: T[]): T;
}
export interface Topic { id: string; weight: (c: TCtx) => number; run: (c: TCtx) => boolean }
export interface Conv { lines: [Dot, string][]; fx: (() => void)[]; topics: string[] }

interface Upgrade { to: string; when: string; p: number }
const UPGRADES: Record<string, Upgrade[]> = {};
const TOPICS: Topic[] = [];
export function defineTopic(t: Topic): void { if (TOPICS.some(x => x.id === t.id)) throw new Error('duplicate topic ' + t.id); TOPICS.push(t); }
export const topicIds = () => TOPICS.map(t => t.id);
export const replyTargets = () => { const o = new Set<string>(); for (const k of Object.keys(UPGRADES)) { o.add(k); for (const u of UPGRADES[k]) o.add(u.to); } return [...o]; };
export const upgradeConditions = () => Object.values(UPGRADES).flat().map(u => u.when);

/** When a listener would give reply kind `from`, they may instead give `to` if the tag expression holds for the LISTENER (relative to the speaker), with probability p. */
export function defineReplyUpgrade(from: string, u: Upgrade): void { (UPGRADES[from] || (UPGRADES[from] = [])).push(u); }

/* ---------- what each pair has talked about lately ---------- */
const PAIRS = new WeakMap<World, Map<number, { id: string; at: number }[]>>();
const pairKey = (a: number, b: number) => Math.min(a, b) * 1000003 + Math.max(a, b);
function history(w: World, a: number, b: number) { let m = PAIRS.get(w); if (!m) PAIRS.set(w, m = new Map()); const k = pairKey(a, b); let h = m.get(k); if (!h) m.set(k, h = []); return h; }

function makeCtx(w: World, s: Dot, l: Dot, lines: [Dot, string][], fx: (() => void)[], turn: number): TCtx {
  const tags = tagsFor(w, s, l), ltags = tagsFor(w, l, s);
  const say = (who: Dot, to: Dot, act: Act, args: Record<string, any> = {}) => { lines.push([who, render(w, act, who, to, undefined, { ...args, tags: [...(args.tags || []), 'talk'] })]); };
  return {
    w, s, l, tags, ltags, aff: s.aff.get(l.id) || 0, laf: l.aff.get(s.id) || 0, turn,
    say: (act, args) => say(s, l, act, args), answer: (act, args) => say(l, s, act, args),
    reply: (kind, args) => {
      let k = kind; const ups = UPGRADES[kind];
      if (ups) for (const u of ups) if (matches(u.when, ltags) && (mix(w.tick, l.id, hstr(kind + u.to)) % 1000) / 1000 < u.p) { k = u.to; break; }
      say(l, s, 'R_' + k, args);
    },
    fx: f => { fx.push(f); }, rnd: () => w.rnd(), pick: a => a[Math.min(a.length - 1, (w.rnd() * a.length) | 0)],
  };
}

/** A real conversation between two people. Returns null if neither has anything to say beyond a greeting. */
export function conversation(w: World, s: Dot, l: Dot): Conv | null {
  const lines: [Dot, string][] = [], fx: (() => void)[] = [], used: string[] = [], hist = history(w, s.id, l.id);
  let speaker = s, listener = l, turn = 0, bridgeAt = -1;
  for (;;) {
    const c = makeCtx(w, speaker, listener, lines, fx, turn);
    const cands = TOPICS.map(t => ({ t, wt: t.weight(c) })).filter(x => x.wt > 0 && used.indexOf(x.t.id) < 0);
    for (const x of cands) { const last = hist.find(h => h.id === x.t.id); if (last) { const age = w.tick - last.at; if (age < K.DAY_TICKS) x.wt *= 0.1; else if (age < 3 * K.DAY_TICKS) x.wt *= 0.4; } }
    let done = false;
    for (let attempt = 0; attempt < 3 && cands.length && !done; attempt++) {
      let tot = 0; for (const x of cands) tot += x.wt; let roll = w.rnd() * tot, i = 0;
      for (; i < cands.length - 1; i++) { if (roll < cands[i].wt) break; roll -= cands[i].wt; }
      const [chosen] = cands.splice(i, 1), before = lines.length;
      if (chosen.t.run(c)) { done = true; used.push(chosen.t.id); hist.push({ id: chosen.t.id, at: w.tick }); if (hist.length > 8) hist.shift(); } else lines.length = before;
    }
    if (!done) { if (bridgeAt >= 0) lines.length = bridgeAt; break; }   // nothing to say after "funny you should say that": drop the bridge too
    turn++;
    /* does the listener take a turn? more likely between friends and sociable people, never past three turns or six lines */
    const fond = listener.aff.get(speaker.id) || 0, p = 0.1 + (fond >= 25 ? 0.22 : 0) + Math.max(0, listener.fx.soc) * 0.3 + (speaker.fx.gossip > 1.3 ? 0.08 : 0);
    if (turn >= 3 || lines.length > 6 || w.rnd() >= p) break;
    bridgeAt = lines.length; lines.push([listener, render(w, 'BRIDGE', listener, speaker)]);
    [speaker, listener] = [listener, speaker];
  }
  return used.length ? { lines, fx, topics: used } : null;
}
