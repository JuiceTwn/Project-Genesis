import { mk } from '../shared/util';
import { DAY_TICKS } from '../shared/constants';
import { DEFAULT_POP } from './config';
import { newLedger, type Ledger } from './ledger';
import { newStory, type Story } from './story-types';
import type { Issue } from '../shared/gazette';
import type { Building, Dot, Msg } from '../shared/types';

export interface WorldOptions { seed?: number; pop?: number; maxPop?: number; state?: any; deterministic?: boolean; }

/** The simulated country. Behaviour is added by the system modules (people, economy, social, ...) via prototype mixins. */
export class World {
  rnd: () => number; pick = <T>(a: T[]): T => a[(this.rnd() * a.length) | 0];
  seed: number; R: () => number; pop: number; maxPop: number;
  dayLog: any[] = []; issues: Issue[] = []; archive: { kind: string; id: number; data: any }[] = []; gazetteSnap: Record<string, number> = {}; ledger: Ledger = newLedger(); story: Story = newStory(); idxTick = -1; buckets: number[][] = []; dens: Uint8Array = new Uint8Array(0); denseW = 0; denseH = 0;
  fieldHolders: Building[] = []; sites: Building[] = []; fq: Building[] = []; fgen = 0; biz: any; blightAt = -1e9; lastTheftTick = -1e9; sPop: number[] = []; sbl: Building[][] = [];
  tick = 0; out: Msg[] = []; pending: { at: number; m: any }[] = []; stats: any; pairs = new Set<number>(); festival = 0; blight = 0;
  weather = 0; nation = { treasury: 0 }; cd: any; rep: Float32Array | null = null; lastEv: Record<string, number> = {};
  posts: any[] = []; deals: any[] = []; postSeq = 1; gangs: any[] = []; hpi = 1; hpiMom = 0; crashDays = 0; bank: any = null; bankGone?: number; brands: any[] = []; grid: Dot[][] = []; gridUsed: number[] = []; hist: Msg[] = [];
  map: any; tiles: Uint8Array = new Uint8Array(0); buildings: Building[] = [];
  stores: Building[] = []; markets: Building[] = []; taverns: Building[] = []; workshops: Building[] = []; parks: Building[] = []; farms: Building[] = []; houses: Building[] = []; halls: Building[] = []; docks: Building[] = [];
  mcount = 0; S: any[] = []; lex: any; names: string[] = []; word: any; nameGen: any; famGen: any; dots: Dot[] = []; lastSeason = 0;

  constructor(o: WorldOptions = {}) {
    this.rnd = o.deterministic ? mk((o.seed || 1337) ^ 0x9e3779b9) : Math.random;
    this.seed = o.seed || 1337; this.R = mk(this.seed); this.pop = o.pop || DEFAULT_POP; this.maxPop = o.maxPop || Math.round(this.pop * 1.7);
    this.sites = []; this.fq = []; this.fgen = 0; this.biz = { opened: 0, closed: 0, built: 0, sold: 0, fires: 0, arrived: 0, unpaid: 0, quit: 0, benefits: 0 }; this.blightAt = -1e9; this.lastTheftTick = -1e9; this.sPop = []; this.sbl = [];
    this.tick = Math.floor(0.3 * DAY_TICKS); this.out = []; this.pending = [];
    this.stats = { meals: 0, chats: 0, friends: 0, deliveries: 0, wasted: 0, thefts: 0, fights: 0, births: 0, deaths: 0 };
    this.pairs = new Set(); this.festival = 0; this.blight = 0;
    this.weather = 0; this.nation = { treasury: 0 }; this.cd = { festival: -1e9, blight: -1e9, gift: -1e9, zap: -1e9, cupid: -1e9 }; this.rep = null; this.lastEv = {};
    this.grid = []; this.hist = [];
    this.buildMap(); this.makeLexicon(); this.makeDots(); this.assignLandlords(); this.rep = new Float32Array(this.dots.length); this.lastSeason = this.season(); this.sPop = []; for (const d of this.dots) { const sid = this.buildings[d.home].sid; this.sPop[sid] = (this.sPop[sid] || 0) + 1; }
    this.electAll(true);
    this.rebuild();   // distance fields are built lazily (see F())
    if (o.state) this.load(o.state);
  }
}
