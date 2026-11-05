import type { Fx } from '../sim/personality';
/* Core data shapes. Fields marked optional are attached lazily by systems. */
export interface Dot {
  id: number; name: string; fam: string; job: number; home: number; work: number; future: number;
  soc: number; dil: number; off: number; x: number; y: number; nx: number; ny: number; prog: number; speed: number;
  phase: string; prev: string; goal: any; timer: number; chatT: number; chatCd: number; inside: boolean; fight: boolean;
  hunger: number; energy: number; social: number; coin: number;
  aff: Map<number, number>; belief: Int32Array; carry: number; invite: any; starvedDay: number; rich: boolean; meals: number;
  traits: string[]; done: Set<string>; isThief: boolean; age: number; life: number; partner: number; married: boolean; since: number; thieves: Set<number>; dead: boolean;
  grief: number; starveT: number; theftCd: number; dream: string | null; dreams: number; adult: boolean; kids: number; rejectCd: number;
  shortAt?: number; unpaid?: number; shiftTicks?: number; paidH?: number; earn?: number; inc?: number; budget?: number; fx: Fx; th?: any[]; breakCd?: number; fame?: number; ire?: number; endorses?: number; cop?: boolean; jailUntil?: number; gang?: number; party?: string; fav?: number; dep?: number; gear?: Record<string, { q: number; w: number; brand: number }>; scars: Record<string, number>;
}
export interface Building {
  id: number; type: number; x: number; y: number; door: number[]; open: boolean; occ: number; stock: number; inside: Dot[]; name: string; flag: boolean; sid: number;
  owner: number; cash: number; rev: number; wage: number; state: string; born: number; visits: number; hist: number[]; mi: number; vac: number; w: number; h: number; plot: number;
  fam?: string; sqPark?: boolean; src?: number[]; [k: string]: any; field?: Uint16Array; fgen?: number; fq?: boolean; staff?: number; till?: number;
  need?: number; prog?: number; escrow?: number; started?: number;
}
export type Msg = { t: string; [k: string]: any };
