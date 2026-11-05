/* Design tokens for the map renderer. Change the look of the world here: colours per building type, job rings, season and night tints, labels.
   (UI colours live in the :root CSS variables at the top of index.html. Terrain colours are in the terrain painter, which a renderer can replace.)
   Sprites: a building type or job can name a sprite; if the atlas has it, it is drawn instead of the procedural shape. */
import type { BldView } from '../../shared/protocol';

export interface Theme {
  /** Ocean colour beyond the coast. */
  sea: string;
  /** Ring colour around a dot, by job index (see JOBS in the init message). */
  jobRing: string[];
  /** Houses pick one of these at random (stable per building). */
  houses: string[];
  /** Body colour by building type; types not listed use `buildingDefault`. */
  buildingBody: Record<number, string>;
  buildingDefault: string;
  /** Emoji icon by building type, shown when zoomed in. */
  buildingIcon: string[];
  /** Overlay tint by season (0 spring .. 3 winter); null = none. */
  seasonTint: (string | null)[];
  /** Night shade as "r,g,b" (alpha comes from the time of day). */
  nightRGB: string;
  label: { capital: string; other: string; halo: string };
  /** Optional sprite names (looked up in the atlas). Return null to use the procedural drawing. */
  sprites: {
    building(b: BldView): string | null;
    dot(job: number): string | null;
  };
}

export const THEME: Theme = {
  sea: '#0a1c2c',
  jobRing: ['#7bd36b', '#f0a74a', '#b98cf0', '#59b6ee'],
  houses: ['#d98f7a', '#d9b56e', '#8ec0d9', '#b49ad9', '#d97a9b', '#9ed99e'],
  buildingBody: { 2: '#d98a3a', 3: '#b04a42', 6: '#c9c2b0', 8: '#7e97b8', 9: '#8d8d92', 10: '#e0c25a', 11: '#d9792f' },
  buildingDefault: '#6f86a6',
  buildingIcon: ['🏠', '🌾', '🧺', '🍺', '🔨', '🌳', '🏛️', '⚓', '🏢', '🏭', '🛍️'],
  seasonTint: [null, 'rgba(255,215,120,.07)', 'rgba(225,120,40,.16)', 'rgba(225,238,255,.24)'],
  nightRGB: '8,12,42',
  label: { capital: '#ffe58a', other: '#f2f5fb', halo: 'rgba(10,14,22,.8)' },
  /* No sprites yet: everything is drawn procedurally. An art pass fills these in, e.g.
       building: b => b.st === 0 ? `bld_${b.ty}` : null,   dot: job => `dot_${job}` */
  sprites: { building: () => null, dot: () => null },
};
