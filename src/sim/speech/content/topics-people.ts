/* Topics about other people: gossip with real facts, the news, banter between friends, rows between rivals, compliments, bragging. */
import * as K from '../../../shared/constants';
import { plain } from '../../../shared/gazette';
import { first, BANK } from '../engine';
import { defineTopic, defineReplyUpgrade } from '../topics';
import { NAME } from '../../skills';

defineTopic({
  id: 'gossip',
  weight: c => c.s.adult && c.s.aff.size > 1 ? 3 * Math.pow(c.s.fx.gossip, 0.8) + (c.aff > 20 ? 1 : 0) : 0,
  run: c => {
    const { w, s, l } = c, who = [...s.aff.keys()].filter(k => k !== l.id && w.dots[k] && !w.dots[k].dead); if (!who.length) return false;
    const o = w.dots[who[Math.min(who.length - 1, (c.rnd() * who.length) | 0)]], ca = s.aff.get(o.id) || 0, cp = o.partner >= 0 ? w.dots[o.partner] : null, n = first(o);
    let act: string, args: Record<string, any> = { n }, judge = 0, reply = 'AGREE';
    if (s.thieves.has(o.id)) { act = 'GOSSIP_THIEF'; judge = -1; reply = 'CURIOUS'; }
    else if (o.nick && c.rnd() < 0.5) { act = 'GOSSIP_NICK'; args.x = o.nick; reply = 'CURIOUS'; }
    else if (cp && !cp.dead && c.rnd() < 0.6) { act = 'GOSSIP_COUPLE'; args.y = first(cp); reply = 'CURIOUS'; }
    else if (o.coin > 100 * K.KB && c.rnd() < 0.5) act = 'GOSSIP_RICH';
    else if (ca >= 10) { act = 'GOSSIP_GOOD'; judge = 1; } else { act = 'GOSSIP_BAD'; judge = -1; }
    c.say(act, { ...args, tags: ['gossipy'] });
    const la = l.aff.get(o.id) || 0;
    if (judge && Math.sign(la) === -judge && Math.abs(la) > 8) c.reply('DISAGREE'); else { c.reply(reply); if (judge) c.fx(() => w.addAff(l, o, judge * 3)); }
    return true;
  },
});

/* what people have been saying about real events: the last few feed items that involve neither of them */
const SKIP = new Set(['night', 'fest', 'blight', 'nick', 'kind', 'gift', 'zap']);
function newsFor(c: { w: any; s: any; l: any }): { x: string; w: number }[] {
  const out: { x: string; w: number }[] = [];
  for (const e of c.w.hist) {
    if (!e || SKIP.has(e.k.replace(/\d+$/, '')) || !e.ids || !e.ids.length || e.w < 2 || c.w.tick - e.tk > 2 * K.DAY_TICKS || e.ids.includes(c.s.id) || e.ids.includes(c.l.id)) continue;
    const x = plain(e.x); if (x.length < 90) out.push({ x, w: e.w });
  }
  return out;
}
defineTopic({
  id: 'news',
  weight: c => c.s.adult && c.l.adult ? (newsFor(c).length ? 1.5 + newsFor(c).length * 0.4 + (c.s.fx.gossip > 1.3 ? 2 : 0) : 0) : 0,
  run: c => {
    const n = newsFor(c); if (!n.length) return false;
    const e = n.sort((a, b) => b.w - a.w)[Math.min(n.length - 1, (c.rnd() * Math.min(3, n.length)) | 0)];
    c.say('NEWS', { x: e.x, tags: ['gossipy'] }); c.reply('NEWS'); return true;
  },
});

/* banter between friends: a jab based on the listener's own character */
defineTopic({
  id: 'banter',
  weight: c => c.s.adult && c.l.adult && c.aff >= 25 ? 3 : 0,
  run: c => {
    const key = c.l.traits.map((t: string) => 'TEASE_' + t).filter((k: string) => BANK[k]); c.say(key.length && c.rnd() < 0.7 ? c.pick(key) : 'TEASE_GENERIC');
    c.reply(c.l.fx.temper > 1.3 && c.laf < 30 ? 'BACK' : 'LAUGH'); c.fx(() => { c.w.addAff(c.s, c.l, 2); c.w.addAff(c.l, c.s, 2); }); return true;
  },
});

/* a row between people who do not get on */
defineTopic({
  id: 'argue',
  weight: c => c.s.adult && c.l.adult && c.aff < -5 && (c.s.fx.temper > 1.1 || c.s.traits.includes('vengeful')) ? 2.5 : 0,
  run: c => {
    const key = c.l.traits.map((t: string) => 'ARGUE_' + t).filter((k: string) => BANK[k]); c.say(key.length && c.rnd() < 0.6 ? c.pick(key) : 'ARGUE_GENERIC');
    c.reply(c.l.fx.temper > 1.1 || c.l.fx.courage > 0.3 ? 'BACK' : 'SHRUG'); c.fx(() => { c.w.addAff(c.s, c.l, -2); c.w.addAff(c.l, c.s, -2); }); return true;
  },
});

defineTopic({
  id: 'praise',
  weight: c => c.s.adult && c.l.adult && c.aff >= 30 && (c.s.fx.romance > 1 || c.s.fx.generosity > 1.2) ? 2 : 0,
  run: c => {
    c.say('PRAISE'); c.reply(c.s.partner < 0 && c.l.partner < 0 && c.s.fx.romance > 1.2 ? 'FLIRT' : 'THANKS'); c.fx(() => c.w.addAff(c.l, c.s, 2)); return true;
  },
});

/* bragging: fame, infamy, a mastered trade */
defineTopic({
  id: 'brag',
  weight: c => !c.s.adult ? 0 : (c.tags.has('famous') ? 3 : 0) + (c.tags.has('infamous') ? 1.5 : 0) + (c.tags.has('master') ? 2.5 : 0) + (topSkill(c) ? 1.5 : 0),
  run: c => {
    const m = c.s.masters && c.s.masters.length ? c.s.masters[c.s.masters.length - 1] : null, sk = topSkill(c);
    const opts: [string, any][] = []; if (c.tags.has('famous')) opts.push(['FAME', {}], ['FAME', {}]); if (c.tags.has('infamous')) opts.push(['INFAMY', {}]);
    if (m) opts.push(['SKILL_MASTER', { skill: NAME[m as keyof typeof NAME] || m }], ['SKILL_MASTER', { skill: NAME[m as keyof typeof NAME] || m }]); if (sk) opts.push(['SKILL_PROUD', { skill: NAME[sk[0] as keyof typeof NAME] || sk[0] }]);
    if (!opts.length) return false; const [act, args] = c.pick(opts); c.say(act, args);
    c.reply(act === 'INFAMY' ? 'SYMPATHY' : c.l.traits.includes('ambitious') ? 'BRAG' : 'CONGRATS'); return true;
  },
});
function topSkill(c: { w: any; s: any }): [string, number] | null {
  let best: [string, number] | null = null; const sk = c.w.skills(c.s);
  for (const k of Object.keys(sk)) if (sk[k] >= 6 && (!best || sk[k] > best[1])) best = [k, sk[k]]; return best;
}

/* how a listener's character changes their answer */
defineReplyUpgrade('SYMPATHY', { to: 'HELP', when: 'kind|close', p: 0.45 });
defineReplyUpgrade('SYMPATHY', { to: 'TEASE', when: 'cool cruel|hothead', p: 0.4 });
defineReplyUpgrade('CONGRATS', { to: 'BRAG', when: 'ambitious cool', p: 0.35 });
defineReplyUpgrade('ENCOURAGE', { to: 'TEASE', when: 'cool', p: 0.4 });
defineReplyUpgrade('AGREE', { to: 'WARN', when: 'cautious|coward close', p: 0.12 });
