/** Counters for the only ways the money supply may change (see money.ts). Kept free of imports so world.ts can use it. */
export interface Ledger { minted: number; inflow: number; outflow: number; flow: Record<string, number> }
export const newLedger = (): Ledger => ({ minted: 0, inflow: 0, outflow: 0, flow: {} });
