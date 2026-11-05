/* What people tell each other about who did what: wrongs they lived, things they saw, and things they were told. Each retelling goes into the
   listener's ledger (see ../../bonds.ts) a little less certain, so a story is a chain of heads and a reputation is what the town has heard. */
import { first, defineActs } from '../engine';
import { defineTopic } from '../topics';
import { KIND, type Bond } from '../../bonds';

defineActs({
  // the speaker lived it
  TELL_robbed: ['{n} robbed me. I haven\'t forgotten.', 'You know {n} lifted my money? I know it was them.', ['{n} had their hand in my pocket. Thief.', 'hothead']],
  TELL_burgled: ['{n} broke into my home. I\'m certain of it.', 'Somebody got into my house, and I know it was {n}.'],
  TELL_beaten: ['{n} beat me black and blue. I won\'t forget it.', '{n} put me on the ground once. Once.', ['One day I\'ll pay {n} back.', 'hothead']],
  TELL_brawl: ['{n} and I came to blows once.', 'I had a scrap with {n}. Never really settled.'],
  TELL_jilted: ['{n} broke my heart.', 'I loved {n}. That\'s all I\'ll say.'],
  TELL_spurned: ['{n} turned me down flat.', 'I told {n} how I felt. Mistake.'],
  TELL_rival: ['{n} has been making eyes at my partner.', 'Keep {n} away from my partner.'],
  TELL_witnessed: ['I saw {n} hurt {y} with my own eyes.', '{n} did {y} wrong. I was there.'],
  TELL_stiffed: ['{n} borrowed money from me and never paid it back.', '{n} owes me, and has the cheek to look me in the eye.'],
  TELL_killed: ['{n} took someone I loved from me.', 'I will never forgive {n}.'],
  TELL_feud: ['My family has a score to settle with {n}.', '{n} wronged my people. We remember.'],
  TELL_kind: ['{n} was good to me when I needed it.', 'Do you know {n}? Salt of the earth. Helped me out once.'],
  TELL_repaid: ['{n} paid me back every cent. Honest as the day.', 'You can trust {n}. They repaid me to the penny.'],
  // the speaker was told, or is passing on what they saw of someone else's trouble
  HEARD_robbed: ['They say {n} robbed {y}.', 'I heard {n} picked {y}\'s pocket.'],
  HEARD_burgled: ['I heard {n} broke into {y}\'s house.', 'Word is {n} burgled {y}.'],
  HEARD_beaten: ['I heard {n} beat {y} half to death.', 'They say {n} gave {y} a terrible beating.'],
  HEARD_brawl: ['I heard {n} and {y} came to blows.', 'There was a brawl between {n} and {y}, they say.'],
  HEARD_jilted: ['I heard {n} broke {y}\'s heart.', 'They say {n} left {y} in pieces.'],
  HEARD_spurned: ['I heard {n} turned {y} down.', 'They say {y} confessed to {n} and got nowhere.'],
  HEARD_rival: ['They say {n} has an eye on {y}\'s partner.', 'Mind {n}. {y} says they\'re after their partner.'],
  HEARD_witnessed: ['I heard {n} did {y} wrong.', 'They say {n} did something awful to {y}.'],
  HEARD_stiffed: ['I heard {n} never paid {y} back.', 'They say {n} owes {y} money and won\'t pay.'],
  HEARD_killed: ['They say {n} killed someone {y} loved.', 'I heard {n} is why {y} is in mourning.'],
  HEARD_feud: ['There\'s bad blood between {n} and {y}\'s family.', 'They say {y}\'s people will never forgive {n}.'],
  HEARD_kind: ['I heard {n} helped {y} out.', 'They say {n} is good people. Ask {y}.'],
  HEARD_repaid: ['I heard {n} paid {y} back to the penny.', 'They say {n} is honest. Ask {y}.'],
  // a witness tells the victim
  TELL_VICTIM: ['I saw {n} do you wrong. I thought you ought to know.', 'Watch {n}. I saw what they did to you.', ['I shouldn\'t say, but I saw {n} going through your things.', 'shy|cautious']],
});

defineTopic({
  id: 'wrongs',
  weight: c => {
    if (!c.s.adult || !c.l.adult) return 0; const b = c.w.tellable(c.s, c.l, false); if (!b) return 0;
    return 2.5 + Math.min(3, c.s.fx.gossip * 1.2) + (b.to === c.l.id ? 6 : 0) + (Math.abs(b.v) > 25 ? 2 : 0) + (c.aff > 20 ? 1 : 0);
  },
  run: c => {
    const { w, s, l } = c, b: Bond | null = w.tellable(s, l, true); if (!b) return false;
    const o = w.dots[b.o], third = b.to >= 0 && w.dots[b.to] ? w.dots[b.to] : s, victimIsListener = b.to === l.id;
    const firsthand = b.via < 0, args: Record<string, any> = { n: first(o), y: first(third), tags: ['gossipy'] };
    const act = victimIsListener ? 'TELL_VICTIM' : (firsthand ? 'TELL_' : 'HEARD_') + b.k;
    c.say(act, args);
    const la = l.aff.get(o.id) || 0, good = KIND[b.k].v > 0;
    if (victimIsListener) c.reply('THANKS');
    else if (good) c.reply(la < -8 ? 'DISAGREE' : 'AGREE');
    else if (firsthand && c.laf >= 25) c.reply('SYMPATHY');
    else if (la < -8) c.reply('AGREE'); else if (la > 15) c.reply('DISAGREE'); else c.reply('CURIOUS');
    const r = c.rnd(); c.fx(() => w.hear(s, l, b, r));
    return true;
  },
});
