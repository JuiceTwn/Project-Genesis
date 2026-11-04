/* Country scale. One tile is roughly 50 m; towns are tens of kilometres apart, as in a small real country. */
export const COUNTRY = {
  W: 320, H: 240,             // map size in tiles
  towns: 9, villages: 26, hamlets: 40,
  spacing: 2.4,               // multiplier on settlement spacing
  feature: 95, warp: 0.3,     // broad continental terrain
  lakeDepth: 0.012, rivers: 0.012,
};
export const DEFAULT_POP = 1800;
/** Memory budget for per-building distance fields (bytes). Fields are computed on demand and evicted LRU. */
export const FIELD_BUDGET = 96e6;
