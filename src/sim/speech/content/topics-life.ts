/* Topics about my own life: thoughts, memories, dreams, work, family, the weather, the town. */
import * as K from '../../../shared/constants';
import { defineActs, first, BANK } from '../engine';
import { defineTopic } from '../topics';

/* what a person says about the thought that is weighing on them, keyed by the thought's kind (see thoughts.ts) */
defineActs({
  THOUGHT_love: ['I\'ve fallen for someone. I can\'t think straight.', 'I think I\'m in love. Is it supposed to feel like this?'],
  THOUGHT_breakup: ['It\'s over between us. I don\'t want to talk about it. Well, I do.', 'We\'re finished. I keep expecting them at the door.'],
  THOUGHT_wedding: ['I got married! Did I tell you? I got married!', 'Married life suits me so far. Give it a week.'],
  THOUGHT_birth: ['The baby kept me up all night. Worth it, though.', 'We have a new baby in the house. Nobody sleeps.'],
  THOUGHT_death: ['I still can\'t believe they\'re gone.', 'The house is so quiet since we lost them.'],
  THOUGHT_theft: ['Someone took my money. Right out of my pocket.', 'I got robbed. I never even felt it.'],
  THOUGHT_burg: ['Somebody broke into my house. I can\'t sleep.', 'I keep checking the lock since the break-in.'],
  THOUGHT_fight: ['I got into a scrap. Don\'t ask.', 'There was a bit of a brawl. I don\'t come out of it well.'],
  THOUGHT_bankrupt: ['The business is gone. All of it.', 'I put everything into that business, and now it\'s nothing.'],
  THOUGHT_foreclose: ['The bank took my house.', 'I lost my home. The bank didn\'t even blink.'],
  THOUGHT_fire: ['I lost everything in the fire.', 'It all burned. Everything I owned.'],
  THOUGHT_rich: ['Money\'s been good to me lately.', 'Funny. I never thought I\'d have money in the bank.'],
  THOUGHT_found: ['I\'m starting my own business. Terrifying.', 'I\'ve gone and started a business. Wish me luck.'],
  THOUGHT_sale: ['Closed a cracking deal today.', 'Had a good sale. Feeling pleased with myself.'],
  THOUGHT_quit: ['I quit my job. Just walked out.', 'I handed in my notice. Well, I just left.'],
  THOUGHT_unpaid: ['They didn\'t pay me. Again.', 'Another shift, no wages. How am I supposed to live?'],
  THOUGHT_pile: ['The whole country hates me, apparently.', 'Everyone\'s turned on me. Everyone.'],
  THOUGHT_deal: ['I\'ve landed a sponsorship!', 'A company wants to pay me to say nice things. Me!'],
  THOUGHT_jail: ['I\'ve done time. It changes you.', 'Locked up. I won\'t be doing that again.'],
  THOUGHT_starve: ['I haven\'t eaten properly in days.', 'I\'m wasting away.'],
  THOUGHT_elect: ['The town chose me! Me!', 'They made me mayor. What have I done?'],
  THOUGHT_recall: ['They threw me out of office.', 'Recalled. After all I did for this town.'],
  THOUGHT_corrupt: ['I\'m disgraced. Everyone knows.', 'Everyone knows what I did. I can\'t look anyone in the eye.'],
  THOUGHT_mortgage: ['I bought a place of my own!', 'I\'ve got the keys to my very own house.'],
  THOUGHT_payoff: ['The mortgage is paid off. Every penny!', 'I own my house outright. I keep saying it out loud.'],
  THOUGHT_default: ['I can\'t pay what I owe.', 'The debts are piling up and I can\'t see a way out.'],
  THOUGHT_embezzle: ['People are looking at me funny. I\'m under suspicion.', 'They think I took the money. I didn\'t. Not much.'],
  THOUGHT_arrest: ['They arrested me. Me!', 'I spent a night in the cells.'],
  THOUGHT_hangover: ['My head. Oh, my head.', 'Never drinking again. I mean it.'],
  THOUGHT_worry: ['I\'m worried about {x}. I can\'t help it.', 'I keep thinking about {x}. Something isn\'t right.'],
  THOUGHT_master: ['I finally mastered my trade. Took long enough.', 'A master at last. I could weep.'],
  R_ENCOURAGE: ['You\'ll get there.', 'I believe in you.', 'Stranger things have happened.', ['Never lose hope.', 'kind']],
});
const GOOD = new Set(['love', 'wedding', 'birth', 'rich', 'found', 'sale', 'deal', 'elect', 'mortgage', 'payoff', 'master']);
const base = (k: string) => k.replace(/\d+$/, '');

defineTopic({
  id: 'thought',
  weight: c => { const t = vivid(c); return t ? 3 + t.v * 0.6 + (c.aff > 25 ? 3 : 0) : 0; },
  run: c => {
    const t = vivid(c)!, bk = base(t.k), good = GOOD.has(bk);
    if (bk === 'worry') { const who = /about (.+?)\.?$/.exec(t.txt); c.say('THOUGHT_worry', { x: who ? who[1] : 'someone' }); } else c.say('THOUGHT_' + bk);
    c.reply(bk === 'worry' ? 'SYMPATHY' : good ? 'CONGRATS' : bk === 'fight' || bk === 'hangover' ? 'SHRUG' : 'SYMPATHY');
    if (c.laf >= 15 || c.l.fx.generosity > 1.2) c.fx(() => { c.w.addAff(c.s, c.l, 2); c.w.addThought(c.s, 'talked', 3, 2, 'Got it off my chest.'); });
    return true;
  },
});
function vivid(c: { w: any; s: any }): { k: string; v: number; txt: string } | null {
  const th: any[] = c.s.th || []; let best: any = null, bv = 0;
  for (const t of th) { const left = t.until - c.w.tick; if (left <= 0) continue; const v = Math.abs(t.v) * Math.min(1, left / Math.max(1, t.until - t.from)); if (v > bv) { bv = v; best = t; } }
  if (!best || bv <= 3) return null; const bk = base(best.k);
  return bk === 'worry' || BANK['THOUGHT_' + bk] ? { k: best.k, v: bv, txt: best.txt } : null;
}

defineTopic({
  id: 'memory',
  weight: c => (c.s.adult && c.s.mem && c.s.mem.length) ? (c.s.mem.some((m: any) => m.with === c.l.id) ? 7 : 1.5) : 0,
  run: c => {
    const mem: any[] = c.s.mem, shared = mem.filter(m => m.with === c.l.id), m = shared.length ? shared[0] : mem[Math.min(mem.length - 1, (c.rnd() * mem.length) | 0)];
    if (shared.length) { c.say('MEMORY_SHARED', { x: m.x }); c.reply('REMEMBER'); c.fx(() => { c.w.addAff(c.s, c.l, 3); c.w.addAff(c.l, c.s, 3); }); }
    else { c.say('MEMORY_OWN', { x: m.x }); c.reply(c.rnd() < 0.5 ? 'SYMPATHY' : 'CURIOUS'); }
    return true;
  },
});

defineTopic({
  id: 'dream',
  weight: c => c.s.adult && c.s.dream ? 1.2 : 0,
  run: c => { c.say('DREAM_' + c.s.dream); c.reply('ENCOURAGE'); return true; },
});

defineTopic({
  id: 'work',
  weight: c => !c.s.adult ? 0 : c.tags.has('busy') && c.w.buildings[c.s.work] && c.w.buildings[c.s.work].state === 'ok' ? 2.5 : c.tags.has('jobless') ? 1.5 : 0,
  run: c => {
    const { w, s, l } = c;
    if (s.work < 0) { c.say('WORK_JOBLESS'); c.reply('SYMPATHY'); return true; }
    const b = w.buildings[s.work], p = `${b.name} ${w.kindName(b).toLowerCase()}`, boss = b.owner >= 0 ? w.dots[b.owner] : null, opts: [string, any][] = [['WORK_GENERIC', { p }], ['WORK_GENERIC', { p }]];
    if (b.type === K.BT.FARM) opts.push(['WORK_FARM', {}], ['WORK_FARM', {}]);
    if (b.type === K.BT.TAVERN) opts.push([b.occ > 3 ? 'WORK_TAVERN_BUSY' : 'WORK_TAVERN_QUIET', {}], [b.occ > 3 ? 'WORK_TAVERN_BUSY' : 'WORK_TAVERN_QUIET', {}]);
    if ((s.unpaid || 0) > 0) opts.push(['WORK_UNPAID', { p }], ['WORK_UNPAID', { p }], ['WORK_UNPAID', { p }]);
    if (boss && boss.id !== s.id) opts.push(['WORK_BOSS', { x: first(boss), p }]);
    const [act, args] = c.pick(opts); c.say(act, args);
    c.reply(l.work === s.work ? 'WORKER' : c.rnd() < 0.5 ? 'AGREE' : 'SHRUG'); return true;
  },
});

defineTopic({
  id: 'family',
  weight: c => !c.s.adult ? 0 : (c.s.partner >= 0 && c.w.dots[c.s.partner] && !c.w.dots[c.s.partner].dead) ? 2 : c.s.kids > 0 ? 1.5 : 0,
  run: c => {
    const { w, s } = c, p = s.partner >= 0 ? w.dots[s.partner] : null;
    if (p && !p.dead) {
      const pa = s.aff.get(p.id) || 0, kind = s.married ? c.pick(['spouse', 'other half', 'better half']) : c.pick(['sweetheart', 'partner']);
      if (pa > 60) c.say('FAMILY_GOOD', { x: first(p) }); else if (pa < 20) c.say('FAMILY_STRAINED', { x: first(p) });
      else if (s.kids) c.say(s.kids === 1 ? 'FAMILY_ONEKID' : 'FAMILY_KIDS', { num: s.kids }); else c.say('FAMILY_PARTNER', { x: first(p), kind });
      c.reply(pa < 20 ? 'SYMPATHY' : 'CONGRATS');
    } else { c.say(s.kids === 1 ? 'FAMILY_ONEKID' : 'FAMILY_KIDS', { num: s.kids }); c.reply('CONGRATS'); }
    return true;
  },
});

defineTopic({ id: 'weather', weight: () => 2, run: c => { c.say('WEATHER'); c.reply('AGREE'); return true; } });
defineTopic({ id: 'festival', weight: c => c.tags.has('festival') ? 7 : 0, run: c => { c.say('FESTIVAL'); c.reply('AGREE'); return true; } });

defineTopic({
  id: 'town',
  weight: c => c.s.adult ? 1 : 0,
  run: c => {
    const { w, s } = c, g = w.gov(w.S[w.buildings[s.home].sid]), mayor = g.mayor >= 0 ? w.dots[g.mayor] : null, r = c.rnd();
    if (mayor && mayor.id !== s.id && r < 0.4) c.say('TAX_MAYOR', { x: first(mayor), num: g.tax });
    else if (r < 0.6) c.say('PARTY', { x: w.partyOf(s) });
    else c.say(g.tax >= 5 ? 'TAX_HIGH' : 'TAX_LOW');
    c.reply('AGREE'); return true;
  },
});

defineTopic({
  id: 'food',
  weight: c => c.s.adult ? 1.2 : 0,
  run: c => {
    const { w, s } = c, sid = w.buildings[s.home].sid, ms = w.markets.filter((m: any) => m.sid === sid && m.state === 'ok'); if (!ms.length) return false;
    const avg = ms.reduce((a: number, m: any) => a + m.stock, 0) / ms.length;
    if (avg < 60) c.say('FOOD_DEAR'); else if (avg > 150) c.say('FOOD_CHEAP'); else return false;
    c.reply('AGREE'); return true;
  },
});
