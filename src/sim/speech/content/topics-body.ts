/* Topics about the body and belongings: illness and injury, a good coat or a ruined one. */
import { defineTopic, defineReplyUpgrade } from '../topics';
import { eff } from '../../gear';

defineTopic({
  id: 'sick',
  weight: c => c.s.adult && c.s.hp && c.s.hp.length ? 2 + 6 * Math.max(...c.s.hp.map((x: any) => x.sev)) : 0,
  run: c => {
    const worst = [...c.s.hp].sort((a: any, b: any) => b.sev - a.sev)[0]; if (!worst) return false;
    c.say('SICK_' + worst.k);
    c.reply(worst.k === 'flu' && (c.l.fx.courage < -0.2 || c.laf < 0) ? 'SCARED' : 'SYMPATHY'); return true;
  },
});

defineTopic({
  id: 'gear',
  weight: c => { if (!c.s.adult) return 0; const coat = eff(c.s, 'coat'), clothes = eff(c.s, 'clothes'); return (coat > 0.6 && c.tags.has('winter') ? 2 : 0) + (c.s.gear && clothes < 0.15 && coat < 0.15 ? 1.5 : 0); },
  run: c => {
    const coat = eff(c.s, 'coat'); if (coat > 0.6 && c.tags.has('winter')) { c.say('GEAR_COAT'); c.reply('AGREE'); return true; }
    c.say('GEAR_TATTERS'); c.reply('SYMPATHY'); return true;
  },
});

defineReplyUpgrade('SYMPATHY', { to: 'SCARED', when: 'coward cool', p: 0.15 });
