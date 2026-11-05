/* Flourishes: the little touches that make a line sound like a person. Register more with defineFlourish() (see ../voice.ts and ../README.md).
   slot 'swap' rewrites the sentence, 'open' goes in front, 'close' goes behind; at most one per slot, two in all, and never on greetings or replies.
   `when` is a tag expression, `chance` is before the speaker's expressiveness (hotheads, gossips and romantics colour things more; the shy and calm less). */
import { defineFlourish, type FCtx } from '../voice';
import { lcfirst } from '../engine';
import { NAME } from '../../skills';

const lastWord = (t: string) => { const m = /(\S+?)([.!?…]*)$/.exec(t); return m ? { w: m[1], end: m[2], at: t.length - m[0].length } : null; };
const short = (n: number) => (t: string) => t.length < n;
const prefix = (id: string, when: string, chance: number, text: string | ((c: FCtx) => string), max = 70, weight = 0) => defineFlourish({ id, slot: 'open', when, chance, weight, fits: short(max), apply: (t, c) => `${typeof text === 'function' ? text(c) : text} ${lcAfterPrefix(t, c)}` });
const suffix = (id: string, when: string, chance: number, text: string | ((c: FCtx) => string), max = 70, weight = 0) => defineFlourish({ id, slot: 'close', when, chance, weight, fits: short(max), apply: (t, c) => `${t.replace(/\s+$/, '')} ${typeof text === 'function' ? text(c) : text}` });
/** After a prefix the sentence continues in lowercase, except for "I" and names (the engine tells us which words are names). */
const lcAfterPrefix = (t: string, c: FCtx) => { const w0 = t.split(/[\s,.!?'-]/)[0]; return w0 === 'I' || c.names.has(w0) || /^[A-Z]{2,}/.test(w0) ? t : lcfirst(t); };

/* ---- swap: rewrite the sentence ---- */
defineFlourish({ id: 'shout', slot: 'swap', when: 'hothead', chance: 0.32, fits: t => t.length < 55 && !/\?$/.test(t), apply: t => { const lw = lastWord(t); return lw ? t.slice(0, lw.at) + lw.w.toUpperCase() + '!' : t; } });
defineFlourish({ id: 'stutter', slot: 'swap', when: 'coward', chance: 0.22, fits: t => /^[A-Za-z]/.test(t) && t.length < 60, apply: t => { const m = /^(\S+)(.*)$/.exec(t); if (!m) return t; const w0 = m[1]; return `${w0[0]}-${/^I/.test(w0) ? w0 : lcfirst(w0)}${m[2]}`; } });
defineFlourish({ id: 'trail-off', slot: 'swap', when: 'lazy|sad', chance: 0.2, fits: t => /[.]$/.test(t) && t.length < 60, apply: t => t.replace(/\.$/, '…') });
defineFlourish({ id: 'sigh-dots', slot: 'swap', when: 'romantic', chance: 0.16, fits: t => /\.$/.test(t) && t.length < 50, apply: t => t.replace(/\.$/, '...') });
defineFlourish({ id: 'kid-excited', slot: 'swap', when: 'kid', chance: 0.5, fits: t => /[.]$/.test(t), apply: t => t.replace(/\.$/, '!!') });
defineFlourish({ id: 'hic', slot: 'swap', when: 'tipsy', chance: 0.55, weight: 3, fits: t => t.split(' ').length > 1, apply: t => { const i = t.indexOf(' '); return `${t.slice(0, i)} *hic*${t.slice(i)}`; } });
defineFlourish({
  id: 'third-person', slot: 'swap', when: 'busy|jobless|glad|sad|hungryish|tired !kid', chance: 0.7, weight: 5, who: (_d, c) => c.p.quirk === 'third',
  apply: (t, c) => t.replace(/\bI'm\b/g, `${c.me} is`).replace(/\bI'd\b/g, `${c.me} would`).replace(/\bI've\b/g, `${c.me} has`).replace(/\bI'll\b/g, `${c.me} will`).replace(/\bI\b/g, c.me).replace(/\bmy\b/gi, `${c.me}'s`).replace(/\bme\b/g, c.me),
});

/* ---- open: in front ---- */
prefix('tic', '!kid', 0.12, c => `${c.p.tic},`, 70, 1);
prefix('oath', 'glad|sad|angry|hungover', 0.07, c => c.p.oath, 60, 0);
prefix('cough', 'flu', 0.28, '*cough*', 70, 4);
prefix('ow', 'hurt', 0.4, 'Ow,', 70, 4);
prefix('winces', 'hungover', 0.5, '*winces*', 70, 4);
prefix('um', 'coward', 0.22, 'Um,', 60, 1);
prefix('ugh', 'lazy', 0.2, 'Ugh.', 50, 1);
prefix('yawn', 'tired', 0.3, '*yawns*', 70, 2);
prefix('yawn-parent', 'newparent', 0.35, '*yawns*', 70, 3);
prefix('beams', 'newlywed', 0.3, '*beams*', 70, 3);
prefix('sniff', 'heartbroken', 0.3, '*sniffs*', 70, 3);
prefix('growl', 'hungryish', 0.2, '*stomach growls*', 70, 2);
prefix('whisper', 'gossipy gossip', 0.5, '*lowers voice*', 80, 3);
prefix('as-famous', 'famous', 0.1, 'As you may have heard,', 60, 2);
prefix('as-mayor', 'mayor', 0.14, 'As mayor,', 60, 2);
prefix('as-master', 'master', 0.1, c => { const m = c.d.masters && c.d.masters[c.d.masters.length - 1]; return `As a master ${(NAME as any)[m] || 'craftsperson'},`; }, 60, 2);
prefix('elder-day', 'elder', 0.16, 'Back in my day,', 55, 1);
prefix('shy-er', 'shy', 0.2, 'Er...', 60, 1);
prefix('curious-oh', 'curious', 0.1, 'Oh!', 60, 0);
prefix('festive', 'festival glad', 0.2, '*raises a cup*', 60, 2);

/* ---- close: behind ---- */
suffix('signoff', '!kid', 0.1, c => c.p.signoff, 60, 1);
suffix('between-us', 'gossip gossipy', 0.4, 'Between us.', 90, 3);
suffix('not-that', 'gossip', 0.07, 'Not that I\'d say anything.', 70, 0);
suffix('bless-you', 'kind talk', 0.12, 'Bless you.', 60, 0);
suffix('kids-today', 'elder talk', 0.14, 'Kids these days.', 60, 0);
suffix('sighs', 'romantic', 0.12, '*sighs*', 70, 0);
suffix('gods-willing', 'pious talk', 0.15, 'God willing.', 70, 0);
suffix('knock-wood', 'superstitious talk', 0.15, '*knocks on wood*', 70, 0);
suffix('all-fine', 'optimistic talk', 0.1, 'It\'ll all work out.', 55, 0);
suffix('wont-last', 'pessimist talk', 0.12, 'Not that it\'ll last.', 55, 0);
suffix('honest-add', 'honest talk', 0.08, 'I\'m only being honest.', 55, 0);
suffix('big-plans', 'ambitious talk', 0.09, 'Big things coming.', 55, 0);
suffix('hmph', 'cool', 0.18, 'Hmph.', 70, 0);
suffix('wink', 'flirt close', 0.2, '*winks*', 70, 1);
suffix('snort', 'cruel talk', 0.1, '*snorts*', 70, 0);
defineFlourish({ id: 'quirk-eh', slot: 'close', when: '!kid', chance: 0.4, weight: 2, who: (_d, c) => c.p.quirk === 'eh', fits: t => t.length < 55 && /\.$/.test(t), apply: (t, c) => `${t} ${c.p.eh}` });
defineFlourish({ id: 'quirk-proverb', slot: 'close', when: '!kid', chance: 0.22, weight: 2, who: (_d, c) => c.p.quirk === 'proverb', fits: t => t.length < 45, apply: (t, c) => `${t} ${c.p.proverb}` });
defineFlourish({ id: 'pet-name', slot: 'close', when: 'close', chance: 0.14, weight: 1, fits: t => /\.$/.test(t) && t.length < 60 && !/\?$/.test(t), apply: (t, c) => `${t.replace(/\.$/, '')}, ${c.tags.has('elder') ? 'dear' : c.p.pet}.` });
