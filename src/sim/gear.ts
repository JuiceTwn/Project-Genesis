/* Items and gear. Every adult can carry four things: clothes, a coat, a tool and a bag. Each has a quality (0-1), wear (0-1, 1 = worn out) and a brand
   (-1 = no-name). Dots buy gear at stores out of their spending budget (the money moves exactly like any other sale: till in, goods paid abroad), and
   gear wears out and gets replaced. Effects: a coat cuts winter illness, a bag limits what a pickpocket gets, a tool raises a farmer's harvest, and good
   clothes make a better first impression in a chat. */
import { World } from './world';
import * as R from '../shared/reality';

export const SLOTS = ['clothes', 'coat', 'tool', 'bag'] as const;
export type Slot = typeof SLOTS[number];
export interface Item { q: number; w: number; brand: number }
export type Gear = Partial<Record<Slot, Item>>;

/** Price as a share of a day's median wage, before the quality multiplier; and lifetime in sim days at wear rate 1. */
export const BASE: Record<Slot, { price: number; life: number }> = {
  clothes: { price: 0.5, life: 180 }, coat: { price: 0.8, life: 300 }, tool: { price: 0.6, life: 240 }, bag: { price: 0.3, life: 360 },
};

export const itemPrice = (slot: Slot, q: number) => BASE[slot].price * R.DAY_WAGE * (0.6 + 0.8 * q);
/** How well an item works right now: quality times the share of its life left. 0 when nothing is carried. */
export const eff = (d, slot: Slot): number => { const it = d.gear && d.gear[slot]; return it ? it.q * (1 - it.w) : 0; };

/** The slot a dot most wants to buy next, or null: an empty slot, or an item more than 80% worn. Winter makes the coat urgent. */
function wantedSlot(this: World, d): Slot | null {
  let best: Slot | null = null, bs = 0;
  for (const s of SLOTS) {
    const it = d.gear && d.gear[s];
    let need = !it ? 1 : it.w > 0.8 ? 0.8 : 0;
    if (!need) continue;
    if (s === 'coat') need += this.season() >= 2 ? 0.6 : 0; if (s === 'tool' && !(d.job === 0 || d.job === 1)) need *= 0.3; if (s === 'bag') need *= 0.6;
    if (need > bs) { bs = need; best = s; }
  }
  return best;
}

/** At a store with a budget: buy the wanted piece of gear if it is affordable. Returns the price paid (0 if nothing bought). Called before ordinary shopping. */
function buyGear(this: World, d, b): number {
  if (!d.adult || b.state !== 'ok') return 0;
  const slot = this.wantedSlot(d); if (!slot) return 0;
  const q = Math.max(0.2, Math.min(1, 0.35 + 0.5 * Math.min(1, (d.inc || 0) / (2 * R.DAY_WAGE)) + (this.rnd() - 0.5) * 0.3)), price = itemPrice(slot, q);
  if ((d.budget || 0) < price || d.coin < price) return 0;
  d.coin -= price; d.budget -= price; this.credit(b, price); b.rev += price; b.visits++;
  const [o, k] = this.till(b); this.toAbroad(o, k, price * R.COGS, 'goods');
  d.gear = d.gear || {}; d.gear[slot] = { q, w: 0, brand: -1 };
  this.stats.gear = (this.stats.gear || 0) + 1; this.stats.gearSpent = (this.stats.gearSpent || 0) + price;
  return price;
}

/** At dawn: everything carried wears a little (cheap, high-quality items last longer). */
function gearDawn(this: World) {
  for (const d of this.dots) {
    if (d.dead || !d.gear) continue;
    for (const s of SLOTS) { const it = d.gear[s]; if (it) it.w = Math.min(1, it.w + (1 / BASE[s].life) * (1.4 - 0.7 * it.q)); }
  }
}

Object.assign(World.prototype, { wantedSlot, buyGear, gearDawn });
declare module './world' { interface World { wantedSlot: typeof wantedSlot; buyGear: typeof buyGear; gearDawn: typeof gearDawn } }
