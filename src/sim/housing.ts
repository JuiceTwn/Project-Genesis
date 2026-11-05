/* Housing costs. Some houses belong to landlords (concentrated in the wealthiest few); tenants pay rent every month (5 sim days) and every
   owner pays property tax to the town and maintenance to outside suppliers. This is the biggest everyday spending sink, and it is what lets
   capital income keep wealth concentrated. All of it is money moving between accounts or crossing the border through the ledger. */
import { World } from './world';
import * as R from '../shared/reality';
import type { Dot } from '../shared/types';

/** Give about LANDLORD_SHARE of the houses to the wealthiest adults (skewed so the very richest own several). */
function assignLandlords(this: World) {
  const investors = this.dots.filter(d => d.adult && !d.dead).sort((a, b) => b.coin - a.coin).slice(0, Math.max(5, Math.round(this.dots.length * 0.07)));
  const houses = this.buildings.filter(b => b.type === 0 && b.state === 'ok');
  if (!investors.length) return;
  let n = Math.round(houses.length * R.LANDLORD_SHARE);
  for (const h of houses.slice().sort(() => this.rnd() - 0.5)) {
    if (n <= 0) break;
    const inv = investors[Math.floor(Math.pow(this.rnd(), 2.5) * investors.length)];
    if (inv.home === h.id || h.owner === inv.id) continue;   // landlords rent out other people's homes, not their own
    h.owner = inv.id; n--;
  }
}

/** Monthly housing bills, at dawn on the first day of each month. */
function monthlyHousing(this: World) {
  const byHome = new Map<number, Dot[]>();
  for (const d of this.dots) if (!d.dead) (byHome.get(d.home) || byHome.set(d.home, []).get(d.home)!).push(d);
  const tax = R.HOUSE_VALUE * R.PROPERTY_TAX / 12, upkeep = R.HOUSE_VALUE * R.MAINTENANCE / 12;
  for (const b of this.buildings) {
    if (b.type !== 0 || b.state !== 'ok') continue;
    const town = this.gov(this.S[b.sid]), occ = byHome.get(b.id) || [], owner = b.owner >= 0 ? this.dots[b.owner] : null;
    const ownerLives = !!owner && !owner.dead && occ.includes(owner), payer = owner && !owner.dead ? owner : null;
    // rent: the adults living there pay a landlord (or the town, for a house nobody owns)
    if (!ownerLives && occ.length) {
      const adults = occ.filter(d => d.adult); let paid = 0;
      if (adults.length) {
        const share = R.RENT_MONTH / adults.length;
        for (const t of adults) { const p = Math.min(share, t.coin); t.coin -= p; paid += p; }
      }
      b.arrears = (b.arrears || 0) + (R.RENT_MONTH - paid);
      if (payer) { payer.coin += paid; payer.earn = (payer.earn || 0) + paid; } else town.treasury += paid;
    }
    // costs of owning: property tax to the town, maintenance to outside suppliers
    if (payer && occ.length) {
      const t = Math.min(tax, payer.coin); payer.coin -= t; town.treasury += t;
      this.toAbroad(payer, 'coin', upkeep, 'maintenance');
    }
  }
}

Object.assign(World.prototype, { assignLandlords, monthlyHousing });
declare module './world' { interface World { assignLandlords: typeof assignLandlords; monthlyHousing: typeof monthlyHousing } }
