import type { Dot } from '../shared/types';
/* Legend: what makes a dot a character you remember. People earn nicknames from the big things that happen to them ("Pimbert “Ashes”" after the fire,
   "Moneybags" after getting rich, "Sticky Fingers" after a corruption scandal), keep memories of the moments that shaped them, and bring them up later
   in their own thoughts and in the cast page. Every event passes through here via World.ev. A nickname is part of the displayed name, so every story,
   headline and speech bubble picks it up automatically; clients are told with a `rename` message. */
import type { CastEntry } from '../shared/protocol';
import { World } from './world';
import { NAME } from './skills';
import * as K from '../shared/constants';

interface Nick { pri: number; nick: string | ((w: World, d: any) => string); who?: 'first' | 'last' }
const NICKS: Record<string, Nick> = {
  fire: { pri: 10, nick: 'Ashes' }, starve: { pri: 8, nick: 'Gaunt' }, hurt: { pri: 12, nick: 'Limp' }, mortgage: { pri: 12, nick: 'Homeowner' }, quit: { pri: 6, nick: 'Quitter' },
  bankrupt: { pri: 20, nick: 'Bust' }, found: { pri: 22, nick: 'Founder' }, foreclose: { pri: 25, nick: 'Evicted' }, payoff: { pri: 28, nick: 'Debt-Free' },
  rich: { pri: 30, nick: 'Moneybags' }, jail: { pri: 30, nick: 'Jailbird' }, deal: { pri: 30, nick: 'The Face' }, recall: { pri: 35, nick: 'Ex-Mayor' },
  viral: { pri: 45, nick: 'Famous' }, pile: { pri: 50, nick: 'Disgraced' }, gang: { pri: 55, nick: 'Boss' }, bust: { pri: 52, nick: 'Smashed' },
  corrupt: { pri: 60, nick: 'Sticky Fingers' }, embezzle: { pri: 60, nick: 'Vault Robber' }, arson: { pri: 58, nick: 'Torch' },
  master: { pri: 40, nick: (w, d) => 'Master ' + ((d.masters && NAME[d.masters[d.masters.length - 1] as keyof typeof NAME]) || 'Craftsman').replace(/^./, c => c.toUpperCase()) },
};
/** Kind -> first-person memory of it, and how strongly it sticks. */
const MEM: Record<string, [string, number]> = {
  fire: ['the night everything burned', 8], bankrupt: ['the day my business failed', 8], foreclose: ['losing the house', 9], rich: ['the day I got rich', 6], love: ['when I fell in love', 6],
  breakup: ['the break-up', 7], wedding: ['my wedding day', 8], birth: ['the day the baby came', 8], jail: ['my time locked up', 8], theft: ['being robbed', 5], burg: ['the break-in', 6],
  pile: ['when the whole country turned on me', 9], master: ['the day I mastered my trade', 7], mortgage: ['getting the keys to my own house', 7], payoff: ['paying off the mortgage', 6],
  found: ['starting my own business', 6], corrupt: ['the scandal', 9], recall: ['being thrown out of office', 8], viral: ['going viral', 6], elect: ['winning the election', 6], fight: ['that brawl', 4],
};
const strip = (n: string) => n.replace(/ “[^”]*”$/, '');

/** Give someone a nickname if it outranks the one they have. */
function giveNick(this: World, d: Dot, nick: string, pri: number) {
  if (!d || d.dead || (d.nickPri || 0) >= pri) return; const base = d.base || strip(d.name);
  d.base = base; d.nick = nick; d.nickPri = pri; d.name = `${base} “${nick}”`; this.names[d.id] = d.name;
  this.out.push({ t: 'rename', id: d.id, name: d.name });
  this.ev('nick', `🏷️ ${base} is now known as “${nick}”.`, [d.id], 20, 2);
}

function remember(this: World, d: Dot, text: string, w: number, withId = -1) {
  if (!d || d.dead) return; const m = d.mem || (d.mem = []);
  m.push({ t: this.tick, x: text, w, with: withId }); if (m.length > 7) { let i = 0; for (let k = 1; k < m.length; k++) if (m[k].w < m[i].w) i = k; m.splice(i, 1); }
}

/** Called from World.ev. */
function legendHook(this: World, kind: string, text: string, ids: number[], w: number) {
  if (kind === 'nick') return; const base = kind.replace(/\d+$/, '');
  const n = NICKS[base], mem = MEM[base];
  if (base === 'break' && /snapped/.test(text)) this.giveNick(this.dots[ids[0]], 'Firecracker', 33);
  else if (n && ids && ids.length && w >= 2) { const d = this.dots[n.who === 'last' ? ids[ids.length - 1] : ids[0]]; if (d) this.giveNick(d, typeof n.nick === 'function' ? n.nick(this, d) : n.nick, n.pri); }
  if (mem && ids && ids.length) {
    const who = base === 'death' ? ids.slice(1) : base === 'theft' || base === 'burg' ? [ids[ids.length - 1]] : base === 'love' || base === 'breakup' || base === 'wedding' || base === 'fight' ? ids : [ids[0]];
    for (const id of who) { const d = this.dots[id]; if (!d) continue; const other = ids.find(i => i !== id); this.remember(d, other !== undefined && (base === 'love' || base === 'breakup' || base === 'wedding') ? mem[0].replace(/^(when I fell in love|the break-up|my wedding day)$/, m => m + ' with ' + strip(this.dots[other].name)) : mem[0], mem[1], other ?? -1); }
  }
  if (base === 'death' && ids && ids.length > 1) { const dead = this.dots[ids[0]]; if (dead) for (const id of ids.slice(1)) this.remember(this.dots[id], `the day ${strip(dead.name)} died`, 9, dead.id); }
}

/** A line a person might think about their past, or null. */
function callback(this: World, d: Dot): string | null {
  const m = d.mem; if (!m || !m.length || this.rnd() > 0.3) return null;
  const x = m[(this.rnd() * m.length) | 0], yrs = Math.round((this.tick - x.t) / (K.DAY_TICKS * K.YEAR_DAYS)), when = yrs >= 1 ? ` (${yrs} years ago)` : '';
  return this.pick([`Still thinking about ${x.x}${when}.`, `I keep coming back to ${x.x}.`, `${x.x[0].toUpperCase() + x.x.slice(1)}. I'll never forget it.`]);
}

/** The cast: the characters worth following right now. */
function cast(this: World, n = 12): CastEntry[] {
  const score = (d: any) => (d.fame || 0) + (d.ire || 0) * 0.5 + (d.nick ? 6 : 0) + (d.mem ? d.mem.length : 0) * 1.5 + (d.masters ? d.masters.length * 4 : 0) + (this.isMayor(d.id) ? 8 : 0);
  return this.dots.filter(d => !d.dead && d.adult).sort((a, b) => score(b) - score(a)).slice(0, n).map(d => ({
    id: d.id, name: d.name, nick: d.nick || null, age: Math.round(d.age), job: this.kindOrJob(d), town: this.S[this.buildings[d.home].sid].name, fame: Math.round(d.fame || 0), mood: this.mood(d),
    line: (d.mem && d.mem.length ? d.mem.slice().sort((a: any, b: any) => b.w - a.w)[0].x : ''), face: this.faceOf(d),
  }));
}
function kindOrJob(this: World, d: Dot): string { const b = d.work >= 0 ? this.buildings[d.work] : null; return b && b.state === 'ok' ? `${this.kindName(b)} worker` : 'between jobs'; }

/** A face from the person's id and family: skin, hair, eyes, mouth, brow, accessory. Same person, same face, on every client. */
function faceOf(this: World, d: Dot): number[] {
  let h = (d.id * 2654435761) >>> 0; for (const c of d.fam || '') h = (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0;
  const nx = () => { h = (Math.imul(h ^ (h >>> 15), 2246822519) + 0x6D2B79F5) >>> 0; return h; };
  return [nx() % 6, nx() % 8, nx() % 5, nx() % 5, nx() % 4, nx() % (d.traits.includes('creative') ? 3 : 6) === 0 ? 1 + (nx() % 3) : 0];
}

Object.assign(World.prototype, { giveNick, remember, legendHook, callback, cast, kindOrJob, faceOf });
declare module './world' { interface World { giveNick: typeof giveNick; remember: typeof remember; legendHook: typeof legendHook; callback: typeof callback; cast: typeof cast; kindOrJob: typeof kindOrJob; faceOf: typeof faceOf } }
