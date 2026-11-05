import type { Building } from '../shared/types';
/* Money. The rules:
   - Coins only ever MOVE between accounts: people (coin), firm tills (cash), construction escrow, town treasuries
     and the national treasury. A transfer never creates or destroys anything.
   - Exactly two things change the total, and both are logged in the ledger and shown in the UI:
       1. The outside world: exports, imports and utilities, migrants' savings, fire repairs (fromAbroad / toAbroad).
       2. The government explicitly printing money (mint), e.g. to fund a regional grant the treasury cannot afford.
   tests/money.test.ts checks that supply(now) == supply(start) + minted + inflow - outflow at all times. */
import { World } from './world';
import { usd } from '../shared/reality';


type Acct = Record<string, any>;

/** Whose pocket a building's takings go into: the owner's firm till, or the town treasury for a public building. */
function till(this: World, b: Building): [Acct, string] { return b.owner >= 0 ? [b, 'cash'] : [this.gov(this.S[b.sid]), 'treasury']; }
function credit(this: World, b: Building, amt: number) { const [o, k] = this.till(b); o[k] += amt; }
/** Take up to `amt` from an account; returns what was actually available. */
function takeUpTo(this: World, o: Acct, k: string, amt: number): number { const p = Math.max(0, Math.min(amt, o[k])); o[k] -= p; return p; }

/** Money arriving from outside the country (counted as inflow). */
function fromAbroad(this: World, o: Acct, k: string, amt: number, why: string) { if (amt <= 0) return; o[k] += amt; this.ledger.inflow += amt; this.ledger.flow[why] = (this.ledger.flow[why] || 0) + amt; }
/** Money leaving the country, limited to what the account holds. Returns the amount paid. */
function toAbroad(this: World, o: Acct, k: string, amt: number, why: string): number {
  const p = this.takeUpTo(o, k, amt); if (p <= 0) return 0;
  this.ledger.outflow += p; this.ledger.flow[why] = (this.ledger.flow[why] || 0) - p; return p;
}
/** Foreign buyers pay a business (export revenue). */
function exportIn(this: World, b: Building, amt: number) { const [o, k] = this.till(b); this.fromAbroad(o, k, amt, 'exports'); b.rev += amt; }

/** The government explicitly creates new money. Always visible: it is announced and recorded. */
function mint(this: World, amt: number, why: string) {
  if (amt <= 0) return; this.nation.treasury += amt; this.ledger.minted += amt;
  this.ev('mint', `🖨️ The national bank issued ${usd(amt)} of new money (${why}).`, [], 0, 3);
}

/** Spend public money locally: split among a few random working-age residents (contractors, caterers, labour). */
function spendLocal(this: World, sid: number, amt: number) {
  if (amt <= 0) return;
  const pool = this.townAdults(sid); if (!pool.length) { this.ledger.outflow += amt; this.ledger.flow.contracts = (this.ledger.flow.contracts || 0) - amt; return; }
  const n = Math.min(12, pool.length), share = amt / n;
  for (let i = 0; i < n; i++) this.pick(pool).coin += share;
}

/** Return a building's till and unspent construction escrow to its owner (or the town) when it is closed down. */
function liquidate(this: World, b: Building) {
  const sum = Math.max(0, b.cash || 0) + Math.max(0, b.escrow || 0); b.cash = 0; b.escrow = 0; b.debt = 0;
  if (sum <= 0) return;
  const o = b.owner >= 0 ? this.dots[b.owner] : null;
  if (o && !o.dead) o.coin += sum; else this.gov(this.S[b.sid]).treasury += sum;
}

/** Everything that counts as money in the country. */
function moneySupply(this: World): number {
  let t = this.nation.treasury + (this.bank ? this.bank.cash : 0);
  for (const d of this.dots) t += d.coin;
  for (const b of this.buildings) t += (b.cash || 0) + (b.escrow || 0);
  for (const s of this.S) t += s.gov ? s.gov.treasury : 0;
  return t;
}

Object.assign(World.prototype, { till, credit, takeUpTo, fromAbroad, toAbroad, exportIn, mint, spendLocal, liquidate, moneySupply });
declare module './world' { interface World {
  till: typeof till; credit: typeof credit; takeUpTo: typeof takeUpTo; fromAbroad: typeof fromAbroad; toAbroad: typeof toAbroad;
  exportIn: typeof exportIn; mint: typeof mint; spendLocal: typeof spendLocal; liquidate: typeof liquidate; moneySupply: typeof moneySupply;
} }
