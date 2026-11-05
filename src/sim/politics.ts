/* Politics. Three parties with different platforms compete for every mayoralty. Voters choose by personal affinity, party loyalty and the issues
   (jobs, crime, the state of the budget). The winner's platform sets taxes, police and benefits. Mayors can be corrupt (skimming the treasury, getting
   caught, being removed and jailed), populists can promise what the treasury cannot pay and get recalled when it runs dry. */
import { World } from './world';
import * as K from '../shared/constants';
import * as R from '../shared/reality';
import { reserve } from './government';

export const PARTIES = ['Progress', 'Order', 'Commons'] as const;
const PLATFORM: Record<string, { tax: number; police: number; benefit: number; line: string }> = {
  Progress: { tax: 1, police: 1, benefit: 1.6, line: 'more welfare, higher taxes' },
  Order: { tax: -1, police: 3, benefit: 0.7, line: 'law and order, lower taxes' },
  Commons: { tax: -2, police: 1, benefit: 2, line: 'tax cuts AND bigger benefits' },
};

/** A person's party, decided once from their circumstances and temperament. */
function partyOf(this: World, d): string {
  if (d.party) return d.party;
  const r = this.rnd(), rich = d.coin > 200 * R.KB, poor = d.job === 3 || d.coin < 20 * R.KB;
  d.party = (rich ? r < 0.6 : r < 0.15) ? 'Order' : (poor ? r < 0.55 : r < 0.3) ? 'Progress' : (d.fx.temper > 1.4 || r > 0.8) ? 'Commons' : this.pick(PARTIES as any);
  return d.party;
}

/** How much a voter likes a candidate beyond personal feeling: party loyalty, the issues and a dislike of failing incumbents. */
function voteBias(this: World, v, c, g): number {
  let b = this.partyOf(v) === this.partyOf(c) ? 30 : 0;
  if (v.job === 3 && v.work < 0 && this.partyOf(c) === 'Progress') b += 14;
  if ((g.crime || 0) > 2 && this.partyOf(c) === 'Order') b += 18;
  if (v.coin > 150 * R.KB && PLATFORM[this.partyOf(c)].tax < 0) b += 10;
  b += Math.min(15, (c.fame || 0) * 0.15) - Math.min(25, (c.ire || 0) * 0.5);
  if (c.id === g.mayor && (g.unrest || 0) > 0) b -= 18 * Math.min(3, g.unrest);
  return b;
}

/** The winner's platform takes effect. */
function applyPlatform(this: World, s, win) {
  const g = this.gov(s), p = PLATFORM[this.partyOf(win)];
  g.party = this.partyOf(win); g.tax = Math.max(1, Math.min(8, g.tax + p.tax)); g.police = p.police; g.benefitMult = p.benefit; g.unrest = 0; g.skim = 0;
  if (g.party && this.day() > 0) this.ev('platform' + s.id, `🏛️ ${win.name} (${g.party}) takes office in ${s.name} promising ${p.line}.`, [win.id], 0, 3);
}

/** Monthly: crime and budget pressure build unrest; corrupt mayors skim; scandals and recalls. */
function politicsMonth(this: World) {
  for (const s of this.S) {
    const g = this.gov(s), P = this.sPop[s.id] || 0; if (!P || g.mayor < 0) continue;
    const m = this.dots[g.mayor]; if (!m || m.dead) { this.election(s); continue; }
    const res = reserve(P);
    g.unrest = Math.max(0, (g.unrest || 0) * 0.8 + (g.treasury < 0.25 * res ? 1 : 0) + ((g.crime || 0) > 3 ? 0.5 : 0) - (g.treasury > res ? 0.5 : 0));
    g.crime = (g.crime || 0) * 0.5;
    // policing is paid from the treasury to the town's officers (see crime2)
    // corruption
    const greedy = m.fx.ambition > 1.3 || m.dream === 'rich' || m.traits.includes('thief');
    if (greedy && g.treasury > 0.8 * res && this.rnd() < 0.25) {
      const take = g.treasury * 0.05; g.treasury -= take; m.coin += take; g.skim = (g.skim || 0) + take;
      if (this.rnd() < 0.03 + 0.4 * (g.skim / Math.max(1, g.treasury + g.skim)) + (g.unrest || 0) * 0.02) {
        const back = Math.min(m.coin, g.skim * 0.6); m.coin -= back; g.treasury += back;
        this.ev('corrupt' + s.id, `🕵️ SCANDAL: ${m.name}, mayor of ${s.name}, caught skimming ${R.usd(g.skim)} from the town treasury! Removed from office.`, [m.id], 0, 5);
        this.stats.corrupt = (this.stats.corrupt || 0) + 1; m.party = m.party; this.sentence(m, 'embezzlement', 6 + ((this.rnd() * 10) | 0));
        this.election(s, false, m.id); continue;
      }
    }
    if ((g.unrest || 0) >= 3) {
      this.ev('recall' + s.id, `📣 ${s.name} recalls Mayor ${m.name}: ${g.treasury < 0.25 * res ? 'the town is broke' : 'the people have had enough'}.`, [m.id], 0, 4);
      this.stats.recalls = (this.stats.recalls || 0) + 1; this.election(s, false, m.id);
    }
  }
}

function politicsLine(this: World): string[] {
  const cnt: Record<string, number> = {}; for (const s of this.S) { const p = this.gov(s).party; if (p) cnt[p] = (cnt[p] || 0) + 1; }
  const parts = Object.entries(cnt).sort((a, b) => b[1] - a[1]).map(([p, n]) => `${p} ${n}`).join(', ');
  return parts ? [`Mayoralties by party: ${parts}.`] : [];
}

Object.assign(World.prototype, { partyOf, voteBias, applyPlatform, politicsMonth, politicsLine });
declare module './world' { interface World { partyOf: typeof partyOf; voteBias: typeof voteBias; applyPlatform: typeof applyPlatform; politicsMonth: typeof politicsMonth; politicsLine: typeof politicsLine } }
