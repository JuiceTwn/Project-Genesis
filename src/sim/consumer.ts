/* Consumers. Every adult has a daily spending budget (a share of recent net income plus a sliver of their wealth). When it is big enough they
   walk to a store and spend it; the store keeps the margin and pays the supplier abroad for the goods. This is how household money gets back to
   firms, so firms live (or die) on customers instead of fixed export income. */
import { World } from './world';
import * as R from '../shared/reality';

/** At dawn: refresh each adult's income estimate and add to their spending budget. */
function budgetDawn(this: World) {
  for (const d of this.dots) {
    if (d.dead || !d.adult) continue;
    d.inc = 0.8 * (d.inc || 0) + 0.2 * (d.earn || 0); d.earn = 0;
    const add = R.CONSUME_SHARE * (d.inc || 0) + R.WEALTH_SPEND * d.coin;
    d.budget = Math.min(d.coin, 20 * R.DAY_WAGE, (d.budget || 0) + add);
  }
}

/** On arrival at a store: spend the budget (up to a cap), the store books the sale and pays for its goods. */
function shopAt(this: World, d, b) {
  const amt = Math.min(d.budget || 0, d.coin, 3 * R.DAY_WAGE);
  if (amt < 0.05 * R.DAY_WAGE) return 0;
  d.coin -= amt; d.budget = (d.budget || 0) - amt;
  this.credit(b, amt); b.rev += amt; b.visits++;
  const [o, k] = this.till(b); this.toAbroad(o, k, amt * R.COGS, 'goods');
  this.stats.purchases = (this.stats.purchases || 0) + 1; this.stats.spent = (this.stats.spent || 0) + amt;
  return amt;
}

Object.assign(World.prototype, { budgetDawn, shopAt });
declare module './world' { interface World { budgetDawn: typeof budgetDawn; shopAt: typeof shopAt } }
