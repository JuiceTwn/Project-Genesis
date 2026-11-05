/* The bank. One bank at a time takes savings from people and lends to struggling or growing firms. Interest moves from borrowers to savers; defaults
   hit the bank's equity; a loss of confidence causes a run; an insolvent bank fails and depositors only get back what is left. Money stays conserved:
   the bank's cash is counted in the money supply, deposits are *claims* (d.dep) not money, and a loan only moves cash the bank really holds.
   Lending is limited by a reserve ratio, so the bank can never lend out what depositors may ask for tomorrow. */
import { World } from './world';
import * as K from '../shared/constants';
import * as R from '../shared/reality';
const { KB, BT } = K;

export interface Loan { id: number; b: number; owner: number; left: number; rate: number; days: number; late: number; installment: number }
export interface Bank {
  name: string; owner: number; born: number; cash: number; loans: Loan[]; fear: number; nextLoan: number; paid: number; lost: number; interestIn: number;
  failedAt: number; runs: number; gen: number;
}

export const SAVE_RATE = 0.02, LOAN_RATE = 0.09, RESERVE = 0.15, LOAN_DAYS = 120;
const N1 = ['Dot', 'Thrift', 'First', 'Mutual', 'Ledger', 'Crown', 'Hearth', 'Anchor'], N2 = ['Savings', 'Bank', 'Trust', 'Credit', 'Building Society'];

/** Total deposit claims. */
function deposits(this: World): number { let t = 0; for (const d of this.dots) if (!d.dead) t += d.dep || 0; return t; }
/** What the loan book is worth (a stressed bank sells at a discount). */
function loanBook(this: World): number { return this.bank ? this.bank.loans.reduce((a, l) => a + l.left, 0) : 0; }
/** Equity: cash plus loans minus what is owed to depositors. */
function bankEquity(this: World): number { return this.bank ? this.bank.cash + this.loanBook() - this.deposits() : 0; }

/** Found a bank: the richest adult puts up the capital. */
function foundBank(this: World, gen = 1) {
  const rich = this.dots.filter(d => !d.dead && d.adult).sort((a, b) => b.coin - a.coin)[0]; if (!rich) return;
  const cap = Math.min(rich.coin * 0.4, 400 * KB * 5); if (cap < 15 * KB) return;
  rich.coin -= cap;
  this.bank = { name: `${this.pick(N1)} ${this.pick(N2)}`, owner: rich.id, born: this.tick, cash: cap, loans: [], fear: 0, nextLoan: 1, paid: 0, lost: 0, interestIn: 0, failedAt: -1, runs: 0, gen };
  this.ev('bank', `🏦 ${rich.name} opened ${this.bank.name} with ${R.usd(cap)} of capital. It takes savings at ${Math.round(SAVE_RATE * 100)}% and lends at ${Math.round(LOAN_RATE * 100)}%.`, [rich.id], 0, 4);
}

/** The bank collapses: depositors split what cash is left, the rest of their claims are wiped, the loan book is lost. */
function bankFail(this: World, why: string) {
  const bk = this.bank; if (!bk) return;
  const dep = this.deposits(), pay = Math.min(bk.cash, dep), share = dep > 0 ? pay / dep : 0;
  for (const d of this.dots) if (!d.dead && d.dep) { d.coin += d.dep * share; d.dep = 0; }
  bk.cash -= pay; const left = bk.cash; bk.cash = 0; if (left > 0) { const o = this.dots[bk.owner]; if (o && !o.dead) o.coin += left; else this.nation.treasury += left; }
  this.ev('bankfail', `💥 ${bk.name} has FAILED (${why}). Depositors got back ${Math.round(share * 100)} cents on the dollar; ${R.usd(dep * (1 - share))} of savings vanished.`, [bk.owner], 0, 5);
  this.stats.bankFails = (this.stats.bankFails || 0) + 1;
  this.bank = null; this.bankGone = this.tick;
}

/** Daily: deposits, interest, withdrawals, runs, new loans, repayments, defaults, failure. */
function bankDawn(this: World) {
  if (!this.bank) { if (this.tick > 3 * K.DAY_TICKS && (this.bankGone === undefined || this.tick - this.bankGone > 20 * K.DAY_TICKS)) this.foundBank((this.stats.bankFails || 0) + 1); return; }
  const bk: Bank = this.bank, dayRate = SAVE_RATE / K.YEAR_DAYS;
  bk.fear *= 0.9;
  // savers: interest accrues on claims; the careful put surplus cash in; those short of cash take it out
  const eq0 = Math.max(0, this.bankEquity());
  let room = 8 * eq0 - this.deposits();   // leverage limit: the bank only takes in what its capital can stand behind
  for (const d of this.dots) {
    if (d.dead || !d.adult) continue;
    if (d.dep) d.dep *= 1 + dayRate;
    const buffer = 12 * R.DAY_WAGE;
    if (d.coin > 3 * buffer && bk.fear < 0.3 && room > 0) { const amt = Math.min(room, (d.coin - 1.5 * buffer) * (d.traits.includes('frugal') ? 0.7 : 0.3)); room -= amt; d.coin -= amt; bk.cash += amt; d.dep = (d.dep || 0) + amt; }
    else if (d.dep && (d.coin < 2 * R.DAY_WAGE || (bk.fear > 0.3 && this.rnd() < bk.fear * 0.5))) {
      const want = bk.fear > 0.3 ? d.dep : Math.min(d.dep, 8 * R.DAY_WAGE), pay = Math.min(want, bk.cash);
      d.coin += pay; bk.cash -= pay; d.dep -= want; if (d.dep < 0.01) d.dep = 0;
      if (pay < want - 1) { bk.fear = Math.min(2, bk.fear + 0.4); }   // the teller says no
    }
  }
  const dep = this.deposits();
  // lending: a firm in debt with a record of earning something can borrow what it owes (never more than the bank can spare above its reserve)
  let spare = bk.cash - RESERVE * dep;
  if (bk.fear < 0.5) for (const b of this.buildings) {
    if (spare < 5 * KB) break;
    if (b.state !== 'ok' || b.owner < 0 || !this.isBiz(b) || (b.debt || 0) < 8 * KB || bk.loans.some(l => l.b === b.id)) continue;
    const hist = b.hist.slice(-3), good = hist.length ? hist.reduce((a, x) => a + x, 0) / hist.length > -2 * KB : true;
    if (!good || (this.dots[b.owner].coin > 3 * (b.debt || 0))) continue;
    const amt = Math.min(spare, Math.max(10 * KB, b.debt || 0) * 1.1, 80 * KB);
    bk.cash -= amt; b.cash += amt; spare -= amt;
    bk.loans.push({ id: bk.nextLoan++, b: b.id, owner: b.owner, left: amt, rate: LOAN_RATE, days: 0, late: 0, installment: amt / LOAN_DAYS });
  }
  // repayments, interest, defaults
  for (const l of bk.loans.slice()) {
    const b = this.buildings[l.b], o = this.dots[l.owner];
    l.days++; const interest = l.left * l.rate / K.YEAR_DAYS;
    const gone = !b || b.state !== 'ok' || b.owner !== l.owner || !o || o.dead;
    const due = l.installment + interest;
    if (!gone && b.cash >= due) { b.cash -= due; bk.cash += due; l.left -= l.installment; bk.paid += l.installment; bk.interestIn += interest; l.late = 0; }
    else if (!gone && o.coin > due * 3) { o.coin -= due; bk.cash += due; l.left -= l.installment; bk.paid += l.installment; bk.interestIn += interest; l.late = 0; }
    else l.late++;
    if (gone || l.late >= 30) { bk.lost += l.left; bk.fear = Math.min(2, bk.fear + (l.left > 25 * KB ? 0.5 : 0.15)); this.stats.defaults = (this.stats.defaults || 0) + 1;
      this.ev('default', `📉 ${o ? o.name : 'A borrower'} defaulted on a ${R.usd(l.left)} loan from ${bk.name}.`, o ? [o.id] : [], 0, 3); bk.loans.splice(bk.loans.indexOf(l), 1); continue; }
    if (l.left <= 1) bk.loans.splice(bk.loans.indexOf(l), 1);
  }
  // accrued interest is credited to depositors above; the owner takes surplus capital as a dividend
  const eq = this.bankEquity(), cap0 = 200 * KB;
  if (eq < 0) { this.bankFail('its losses exceed its capital'); return; }
  if (bk.fear > 1.2 && bk.cash < 0.02 * Math.max(dep, 1) && dep > 20 * KB) { bk.runs++; this.stats.runs = (this.stats.runs || 0) + 1; this.ev('run', `🏃 A run on ${bk.name}: crowds at the door, and the tellers are out of cash.`, [bk.owner], 0, 4); if (eq < 0.1 * dep) { this.bankFail('a run drained its vaults'); return; } }
  if (eq > 2 * cap0 && bk.cash > RESERVE * dep + (eq - cap0)) { const div = eq - cap0, o = this.dots[bk.owner]; if (o && !o.dead) { bk.cash -= div; o.coin += div; } }
}

/** One-line status for the gazette. */
function bankLines(this: World): string[] {
  const bk = this.bank; if (!bk) return ['The country has no bank at the moment.'];
  return [`${bk.name}: ${R.usd(this.deposits())} in savings, ${R.usd(this.loanBook())} lent to ${bk.loans.length} firm${bk.loans.length === 1 ? '' : 's'}, ${R.usd(this.bankEquity())} equity${bk.fear > 0.5 ? ' — customers are nervous' : ''}.`];
}

Object.assign(World.prototype, { deposits, loanBook, bankEquity, foundBank, bankFail, bankDawn, bankLines });
declare module './world' { interface World { deposits: typeof deposits; loanBook: typeof loanBook; bankEquity: typeof bankEquity; foundBank: typeof foundBank; bankFail: typeof bankFail; bankDawn: typeof bankDawn; bankLines: typeof bankLines } }
