import type { Dot } from '../shared/types';
/* Mortgages and the housing market. Renters with a steady income and a deposit buy their home from its owner with a bank mortgage; investors buy
   extra houses the same way. A house price index (hpi) drifts with credit, momentum and jobs, and can bubble and burst. When prices fall below what is
   owed, or the borrower loses their income, they default: the bank forecloses, sells the house at a discount (or holds it) and eats the loss, which can
   bring the bank down and with it everyone's savings. Money is conserved: the down payment and the bank's loan go to the seller, repayments go back to
   the bank, and a foreclosure sale moves cash from the buyer to the bank. */
import { World } from './world';
import * as K from '../shared/constants';
import * as R from '../shared/reality';
import { RESERVE } from './bank';
const { KB, BT } = K;

export const MORT_RATE = 0.055, DOWN = 0.15, TERM_DAYS = 30 * R.YEAR_DAYS;
const price = (w: World) => R.HOUSE_VALUE * w.hpi;
const monthly = (principal: number, rate: number) => principal / (TERM_DAYS / R.MONTH_DAYS) + principal * rate / 12;

/** Daily: move the price index; maybe a couple of homes change hands. */
function mortgageDawn(this: World) {
  const ad = this.dots.filter(d => !d.dead && d.adult && d.age < d.life * K.RETIRE_FRAC), jl = ad.filter(d => d.job === 3 && d.work < 0).length / Math.max(1, ad.length);
  const bk = this.bank, lend = bk ? Math.min(1.5, bk.loans.reduce((a, l) => a + l.left, 0) / Math.max(1, this.deposits())) : 0;
  let g = 0.0006 + 0.5 * this.hpiMom + 0.0004 * (lend - 0.5) - 0.0015 * Math.max(0, jl - 0.06) / 0.06 + (this.rnd() - 0.5) * 0.0008;
  if (this.crashDays > 0) { g = -0.012 + (this.rnd() - 0.5) * 0.002; this.crashDays--; if (this.crashDays === 0) this.ev('hpiend', `🏚️ House prices have stopped falling at ${Math.round(this.hpi * 100)}% of their old level.`, [], 0, 3); }
  else if (this.hpi > 1.45 && this.rnd() < 0.006) { this.crashDays = 20 + ((this.rnd() * 20) | 0); this.ev('hpicrash', `💥 The housing bubble has burst! House prices are tumbling after rising ${Math.round((this.hpi - 1) * 100)}%.`, [], 0, 5); this.stats.crashes = (this.stats.crashes || 0) + 1; }
  this.hpiMom = 0.96 * this.hpiMom + 0.04 * g; this.hpi = Math.max(0.4, Math.min(3, this.hpi * (1 + g)));
  if (!bk) return;
  const spare0 = bk.cash - RESERVE * this.deposits(); let sold = 0;
  // a renter buys their own home; in a hot market investors pile in
  const p = price(this);
  for (const d of this.dots) {
    if (sold >= 2) break;
    if (d.dead || !d.adult || d.job === 3 || d.age > d.life * 0.6) continue;
    const h = this.buildings[d.home]; if (!h || h.state !== 'ok' || h.owner === d.id) continue;
    const speculating = d.coin > 600 * KB && this.hpiMom > 0.0004 && d.fx.risk > 1;
    const own = speculating ? this.buildings.filter(b => b.type === BT.HOUSE && b.owner === d.id).length : 0;
    if (own > 3) continue;
    const down = p * DOWN + 3 * KB, loan = p - p * DOWN, pay = monthly(loan, MORT_RATE);
    if (d.coin < down + 20 * KB || pay > 0.4 * (d.inc || 0) * R.MONTH_DAYS) continue;
    if (loan > spare0 - sold * loan) continue;
    if (this.rnd() > 0.01 * (1 + 40 * Math.max(0, this.hpiMom))) continue;
    const target = speculating ? this.houses.find(b => b.state === 'ok' && b.owner !== d.id && b.id !== d.home && this.residents(b.id) > 0 && !bk.loans.some(l => l.kind === 'm' && l.b === b.id)) : h;
    if (!target || bk.loans.some(l => l.kind === 'm' && l.b === target.id)) continue;
    this.buyHouse(d, target, p, loan); sold++;
  }
  // the bank sells repossessed houses to anyone with the cash
  if (bk.reo && bk.reo.length && this.rnd() < 0.2) {
    const hid = bk.reo[0], h = this.buildings[hid], pr = 0.8 * price(this), buyer = this.dots.filter(d => !d.dead && d.adult && d.coin > pr * 1.3).sort((a, b) => b.coin - a.coin)[0];
    if (buyer && h) { buyer.coin -= pr; bk.cash += pr; h.owner = buyer.id; bk.reo.shift(); this.ev('reosale', `🔑 ${buyer.name} snapped up a repossessed house in ${this.S[h.sid].name} for ${R.usd(pr)}.`, [buyer.id], 0, 2); }
  }
}

/** Buyer gets the house with a mortgage; the seller (landlord or town) is paid in full. */
function buyHouse(this: World, d: Dot, h, p: number, loan: number) {
  const bk = this.bank, down = p - loan, seller = h.owner >= 0 ? this.dots[h.owner] : null;
  d.coin -= down; bk.cash -= loan;
  if (seller && !seller.dead) seller.coin += p; else this.gov(this.S[h.sid]).treasury += p;
  h.owner = d.id;
  bk.loans.push({ id: bk.nextLoan++, b: h.id, owner: d.id, left: loan, rate: MORT_RATE, days: 0, late: 0, installment: loan / (TERM_DAYS / R.MONTH_DAYS), kind: 'm' } as any);
  this.stats.mortgages = (this.stats.mortgages || 0) + 1;
  this.ev('mortgage', `🏡 ${d.name} bought ${h.id === d.home ? 'their home' : 'an investment house'} in ${this.S[h.sid].name} for ${R.usd(p)} with a ${R.usd(loan)} mortgage.`, [d.id], 0, 2);
}

/** Monthly: mortgage payments; late payers, strategic defaults and foreclosures. */
function mortgageMonth(this: World) {
  const bk = this.bank; if (!bk) return;
  const value = price(this);
  for (const l of bk.loans.slice()) {
    if ((l as any).kind !== 'm') continue;
    const h = this.buildings[l.b], o = this.dots[l.owner];
    if (!h || !o || o.dead || h.owner !== l.owner) {   // the borrower died or lost title: the estate sells and clears the debt, the bank eats any shortfall
      const back = Math.min(l.left, value * 0.8); if (o && !o.dead) {} else { bk.cash += back; bk.lost += Math.max(0, l.left - back); }
      bk.loans.splice(bk.loans.indexOf(l), 1); continue;
    }
    const interest = l.left * l.rate / 12, due = l.installment + interest;
    const underwater = value * 0.85 < l.left && (l as any).late >= 1 && o.fx.risk > 0.8;
    if (!underwater && o.coin >= due) { o.coin -= due; bk.cash += due; l.left -= l.installment; bk.paid += l.installment; bk.interestIn += interest; (l as any).late = 0; }
    else (l as any).late++;
    if (l.left <= 1) { bk.loans.splice(bk.loans.indexOf(l), 1); this.ev('payoff', `🎉 ${o.name} paid off their mortgage!`, [o.id], 0, 2); continue; }
    if ((l as any).late >= 3 || (underwater && (l as any).late >= 2)) {
      // foreclosure
      bk.loans.splice(bk.loans.indexOf(l), 1); h.owner = -1; this.stats.foreclosures = (this.stats.foreclosures || 0) + 1;
      const pr = 0.8 * value, buyer = this.dots.filter(d => !d.dead && d.adult && d.id !== o.id && d.coin > pr * 1.3).sort((a, b) => b.coin - a.coin)[0];
      let got = 0; if (buyer) { buyer.coin -= pr; bk.cash += pr; h.owner = buyer.id; got = pr; } else { (bk.reo = bk.reo || []).push(h.id); got = 0.6 * value; }
      bk.lost += Math.max(0, l.left - got); bk.fear = Math.min(2, bk.fear + 0.2);
      o.social = Math.max(0, o.social - 30); this.say(o, [K.C.ME, K.C.BROKE]);
      this.ev('foreclose', `🔨 ${o.name} lost their house in ${this.S[h.sid].name} to foreclosure. ${bk.name} is owed ${R.usd(l.left)}${underwater ? ' — the house is worth less than the debt' : ''}.`, [o.id], 0, 4);
    }
  }
}

function hpiLine(this: World): string[] { return [`House prices: ${Math.round(this.hpi * 100)}% of the base level (${this.hpiMom > 0.0003 ? 'rising' : this.hpiMom < -0.0003 ? 'falling' : 'flat'}). ${this.bank ? this.bank.loans.filter((l: any) => l.kind === 'm').length : 0} mortgages outstanding.`]; }

Object.assign(World.prototype, { mortgageDawn, mortgageMonth, buyHouse, hpiLine });
declare module './world' { interface World { mortgageDawn: typeof mortgageDawn; mortgageMonth: typeof mortgageMonth; buyHouse: typeof buyHouse; hpiLine: typeof hpiLine } }
