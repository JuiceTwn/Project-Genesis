/* Character change: hardship and fortune can reshape a dot's personality, always through the conflict rules. */
import { World } from './world';
import { shiftTraits, fxOf, TRAIT, epithet } from './personality';
import type { Dot } from '../shared/types';

/** Give `d` a new trait (dropping any it conflicts with). Records a story beat. Returns true if anything changed. */
function shiftTrait(this: World, d: Dot, add: string, why: string): boolean {
  if (d.dead) return false;
  const r = shiftTraits(d.traits, add); if (!r) return false;
  d.traits = r.traits; d.fx = fxOf(d.traits); d.isThief = d.traits.includes('thief');
  const lost = r.dropped.length ? `, no longer ${r.dropped.map(t => t).join('/')}` : '';
  this.ev('shift', `${TRAIT[add].emoji} ${d.name} has become ${add}${lost} — ${why}.`, [d.id], 20, 3);
  this.chronicle(`${d.name} changed`, `${d.name} ${epithet(d.traits).replace('the ', 'the ')} became ${add}${lost}: ${why}.`, [d.id], false);
  return true;
}
/** Count a hardship against a dot; at `n` repeats it leaves a mark and the counter resets. */
function scar(this: World, d: Dot, kind: string, n: number): boolean { d.scars[kind] = (d.scars[kind] || 0) + 1; if (d.scars[kind] >= n) { d.scars[kind] = 0; return true; } return false; }

Object.assign(World.prototype, { shiftTrait, scar });
declare module './world' { interface World { shiftTrait: typeof shiftTrait; scar: typeof scar } }
