import type { World } from './world';
import * as R from '../shared/reality';
/** A tavern pays outside suppliers for the drink it sold. */
export function shareAbroad(w: World, tv: any, amt: number) { const [o, k] = w.till(tv); w.toAbroad(o, k, amt * R.COGS, 'goods'); }
