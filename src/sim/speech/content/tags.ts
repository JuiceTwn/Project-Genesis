/* Tags: facts about the speaker, the listener and the moment that phrasings can ask for. A new system that wants its state to colour speech adds a
   provider here or in its own content file:  defineTags('sailing', ['seasick'], ({ s }, add) => { if (s && s.seasick) add('seasick'); })  */
import * as K from '../../../shared/constants';
import { defineTags } from '../engine';

defineTags('time', ['night', 'morning', 'afternoon', 'evening'], ({ w }, add) => {
  const td = w.tod(); add(td < 0.25 ? 'night' : td < 0.45 ? 'morning' : td < 0.75 ? 'afternoon' : td < 0.88 ? 'evening' : 'night'); if (td > 0.88 || td < 0.22) add('night');
});
defineTags('weather', ['spring', 'summer', 'autumn', 'winter', 'rain', 'snow', 'cold', 'festival'], ({ w }, add) => {
  const sn = w.season(); add(['spring', 'summer', 'autumn', 'winter'][sn]); if (w.weather === 1) add('rain'); if (w.weather === 2) { add('snow'); add('winter'); } if (sn === 3) add('cold');
  if (w.festival > w.tick) add('festival');
});
defineTags('person', ['kid', 'elder', 'glad', 'sad', 'tired', 'hungryish', 'busy', 'jobless', 'partnered', 'newlywed', 'newparent', 'heartbroken', 'flush', 'broke', 'famous', 'infamous', 'mayor', 'master', 'flu', 'hurt', 'hungover', 'tipsy', 'angry'], ({ w, s }, add) => {
  if (!s) return;
  const m = w.mood(s); if (m > 65) add('glad'); if (m < 38) add('sad');
  if (!s.adult) add('kid'); else if (s.age > 62) add('elder');
  if (s.energy < 30) add('tired'); if (s.hunger > 60) add('hungryish');
  if (s.partner >= 0) add('partnered'); if (s.married && w.tick - s.since < 0.4 * K.YEAR_TICKS) add('newlywed');
  if (s.coin > 60 * K.KB) add('flush'); else if (s.coin < 12 * K.KB) add('broke');
  if (s.work >= 0) add('busy'); else if (s.adult && s.job === 3) add('jobless');
  if ((s.fame || 0) > 20) add('famous'); if ((s.ire || 0) > 20) add('infamous');
  if (w.isMayor(s.id)) add('mayor'); if (s.masters && s.masters.length) add('master');
  const hp = s.hp; if (hp) for (const c of hp) { if (c.k === 'flu') add('flu'); else if (c.k === 'injury' || c.k === 'infection') add('hurt'); }
  const th = s.th; if (th) for (const t of th) { if (t.until <= w.tick) continue; const k = t.k.replace(/\d+$/, ''); if (k === 'hangover') add('hungover'); else if (k === 'breakup') add('heartbroken'); else if (k === 'birth') add('newparent'); else if (k === 'fight' || k === 'theft' || k === 'burg') add('angry'); }
  if (s.inside && w.taverns.some((t: any) => t.inside.includes(s)) && (s.fx.spend > 1 || s.fx.soc > 0.1)) add('tipsy');
});
defineTags('traits', K.TRAITS.concat(['hothead', 'coward', 'brave', 'gossip', 'lazy', 'romantic', 'kind', 'ambitious', 'cruel', 'calm', 'shy', 'loner', 'charming', 'flirt', 'curious', 'honest', 'thief', 'pious', 'superstitious', 'optimistic', 'pessimist', 'greedy', 'generous', 'frugal', 'spendthrift', 'vengeful', 'forgiving', 'jealous', 'loyal', 'reckless', 'cautious', 'creative', 'workaholic']), ({ s }, add) => {
  if (!s) return; for (const t of s.traits) add(t);
  const fx = s.fx; if (!fx) return;
  if (fx.temper > 1.3) add('hothead'); if (fx.courage < -0.3) add('coward'); if (fx.courage > 0.3) add('brave'); if (fx.gossip > 1.3) add('gossip'); if (fx.dil < -0.15) add('lazy');
  if (fx.romance > 1.3) add('romantic'); if (fx.generosity > 1.3) add('kind'); if (fx.ambition > 1.3) add('ambitious');
});
defineTags('relationship', ['close', 'cool', 'stranger', 'familiar', 'kin'], ({ s, l }, add) => {
  if (!s || !l) return; const a = s.aff.get(l.id) || 0;
  if (a >= 40) add('close'); else if (a < -5) add('cool'); else if (a < 8) add('stranger'); else add('familiar');
  if (s.fam && s.fam === l.fam) add('kin');
});
/* tags a topic adds for one line only, through args.tags */
defineTags('line', ['gossipy', 'talk'], () => {});   // 'talk' is added automatically to anything said as part of a conversation topic
