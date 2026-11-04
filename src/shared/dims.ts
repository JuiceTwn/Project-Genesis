/** Live map dimensions (set once a world is generated). ES live bindings keep every importer in sync. */
export let W = 144, H = 108;
export function setDims(w: number, h: number): void { W = w; H = h; }
