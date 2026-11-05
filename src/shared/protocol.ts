/* The wire protocol between server and client: one place that says what every message looks like.
   Change a message here and the compiler points at every producer and consumer that needs updating.

   Transport:
   - text frames: JSON, one `ServerMsg` (or a `batch` of them)
   - binary frames: first byte is the type. 1 = world frame (see sim/output.ts `frame`), 2 = gzip-compressed JSON `InitMsg`
   Client -> server is always a JSON `ClientMsg`. */

/* ---- messages the sim pushes into `world.out` (they go out inside a `batch`) ---- */

/** A feed event. `tk` = sim tick it happened; `n` = how many identical-looking events it stands for (see shared/feed.ts). */
export interface EvMsg { t: 'ev'; k: string; x: string; ids: number[]; w: number; tk?: number; n?: number }
/** A dot (d) or a building (b) says something, in English (see sim/speech.ts). `k` is only used inside the sim before the line is rendered. */
export interface SayMsg { t: 'say'; d?: number; b?: number; s: string; k?: number[] }
export interface BornMsg { t: 'born'; id: number; name: string; f: string; j: number; h: number; tr: string[] }
/** Building view. st: 0 ok, 1 under construction, 2 vacant, 3 gone. */
export interface BldView { i: number; ty: number; x: number; y: number; n: string; d: number[]; w: number; h: number; st: 0 | 1 | 2 | 3; o: number; s: number; f: string; ow: string }
export interface BldMsg { t: 'bld'; op: 'add' | 'upd' | 'del'; b: BldView }
/** Changed terrain tiles: [tile index, tile type]. */
export interface TilesMsg { t: 'tiles'; c: [number, number][] }
export interface ChronEntry { day: number; year: number; title: string; text: string; ids: number[]; arc: number; big: boolean }
export interface ChronMsg { t: 'chron'; e: ChronEntry }
export interface RenameMsg { t: 'rename'; id: number; name: string }
/** The daily gazette issue (shape owned by shared/gazette.ts). */
export interface IssueMsg { t: 'issue'; issue: any }

export type SimMsg = EvMsg | SayMsg | BornMsg | BldMsg | TilesMsg | ChronMsg | RenameMsg | IssueMsg;

/* ---- messages the server builds directly ---- */

export interface ArcView { i: number; k: string; t: string; s: number; ids: number[]; d: number; b: string }
export interface SettView { i: number; n: string; t: number; x: number; y: number }
export interface InitMsg {
  t: 'init'; W: number; H: number; hz: number; tick: number;
  tiles: string; wk: string; el: string;
  setts: SettView[]; blds: BldView[];
  hist: EvMsg[]; chron: ChronEntry[]; issue: any | null; arcs: ArcView[];
  dots: { n: string; f: string; j: number; h: number; tr: string[] }[];
  jobs: string[]; bt: string[];
}
export interface StatsMsg {
  t: 'stats'; arcs: ArcView[]; tension: number; day: number; pop: number;
  food: number[]; mk: string[];
  /** [name, tier, population, mayor id, treasury, tax, next election] */
  towns: [string, number, number, number, number, number, number][];
  biz: Record<string, number>;
  mood: number; coin: number; couples: number;
  meals: number; chats: number; friends: number; births: number; deaths: number; thefts: number; fights: number;
  lead: { rich: [number, number][]; loved: [number, number][]; hated: [number, number][]; old: [number, number][] };
  cd: { festival: number; blight: number; gift: number; zap: number; cupid: number };
  fest: boolean; blight: boolean; season: number; year: number; weather: number;
  money: { supply: number; minted: number; inflow: number; outflow: number; flow: Record<string, number> };
  nation: number; treasury: number;
  /** Added by the server: how many viewers are connected. */
  viewers?: number;
  [extra: string]: any;
}
export interface DetailMsg {
  t: 'detail'; id: number; name: string; fam: string; mayor: boolean; dead: boolean; job: string; age: number; traits: string[];
  hunger: number; energy: number; social: number; coin: number; mood: number; doing: string; thought: string; home: number;
  dream: string; partner: string | null; pid: number; married: boolean; rep: number; kids: number;
  thieves: number[]; friends: [number, number][]; nick: string | null; face: any; fame: number; mem: string[];
  attrs: number[]; skills: [string, number][]; ill: string[]; thoughts: [string, number][];
  [extra: string]: any;
}
export interface CastEntry { id: number; name: string; nick: string | null; age: number; job: string; town: string; fame: number; mood: number; line: string; face: any }
export interface CastMsg { t: 'cast'; list: CastEntry[] }
/** Notifications for dots a viewer is following. */
export interface NoteMsg { t: 'note'; notes: { id: number; text: string }[] }
export interface BatchMsg { t: 'batch'; m: SimMsg[] }

export type ServerMsg = SimMsg | InitMsg | StatsMsg | DetailMsg | CastMsg | NoteMsg | BatchMsg;

/* ---- client -> server ---- */

export interface ViewRect { x0: number; y0: number; x1: number; y1: number }
export type ClientMsg =
  | { t: 'sel'; id: number }
  | { t: 'view'; x0: number; y0: number; x1: number; y1: number }
  | { t: 'cast' }
  | { t: 'watch'; id: number; on?: boolean }
  | { t: 'act'; n: string; id?: number };

/** Validate untrusted client JSON. Returns null for anything malformed (the server drops it). `nDots` bounds dot ids. */
export function parseClientMsg(raw: string, nDots: number): ClientMsg | null {
  let m: any; try { m = JSON.parse(raw); } catch { return null; }
  if (!m || typeof m !== 'object') return null;
  const id = (v: any) => Number.isInteger(v) && v >= 0 && v < nDots;
  switch (m.t) {
    case 'sel': return { t: 'sel', id: id(m.id) ? m.id : -1 };
    case 'view': { const n = [m.x0, m.y0, m.x1, m.y1]; return n.every(Number.isFinite) ? { t: 'view', x0: n[0], y0: n[1], x1: n[2], y1: n[3] } : { t: 'view', x0: NaN, y0: NaN, x1: NaN, y1: NaN }; }
    case 'cast': return { t: 'cast' };
    case 'watch': return id(m.id) ? { t: 'watch', id: m.id, on: m.on !== false } : null;
    case 'act': return typeof m.n === 'string' && m.n.length < 32 ? { t: 'act', n: m.n, id: Number.isInteger(m.id) ? m.id : -1 } : null;
    default: return null;
  }
}
