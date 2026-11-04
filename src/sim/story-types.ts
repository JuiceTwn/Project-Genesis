/* Story data shapes (import-free so world.ts can use them). */
export interface Beat { day: number; text: string }
export interface Arc { id: number; kind: string; title: string; stage: number; day0: number; sid: number; ids: number[]; data: Record<string, any>; beats: Beat[]; done: boolean; outcome: string }
export interface ChronEntry { day: number; year: number; title: string; text: string; ids: number[]; arc: number; big: boolean }
export interface Story {
  arcs: Arc[]; nextId: number; tension: number; heat: number; lastLaunch: number; chron: ChronEntry[]; lastYear: number; snap: Record<string, number>; cool: Record<string, number>; closed: number;
}
export const newStory = (): Story => ({ arcs: [], nextId: 1, tension: 1, heat: 0, lastLaunch: -1e9, chron: [], lastYear: 1, snap: {}, cool: {}, closed: 0 });

