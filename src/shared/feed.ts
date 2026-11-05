/* Feed rollup shared by server and client: events that differ only by names, amounts or party
   ("X gave Y $521") share a key and merge into one row with a count. Weight >= 4 never merges. */
export function rollKey(x: string): string {
  return x.replace(/ promising .*$/, '').replace(/\([^)]*\)/g, '').replace(/\$[\d.,]+[kKmM]?/g, '$').replace(/\b[A-Z][\w'-]*\b/g, '_').replace(/\d+/g, '#');
}

/** Collapse same-key events inside one batch. The merged event keeps the latest text and the first ids, and carries n = how many it stands for. */
export function coalesce<T extends { t?: string; x?: string; w?: number; n?: number; tk?: number; ids?: number[] }>(msgs: T[]): T[] {
  const out: T[] = [], seen = new Map<string, T>();
  for (const m of msgs) {
    if (m.t !== 'ev' || typeof m.x !== 'string' || (m.w || 1) >= 4) { out.push(m); continue; }
    const k = rollKey(m.x), prev = seen.get(k);
    if (prev) { prev.n = (prev.n || 1) + (m.n || 1); prev.x = m.x; if (m.tk !== undefined) prev.tk = m.tk; if ((m.w || 1) > (prev.w || 1)) prev.w = m.w; }
    else { const c = { ...m, n: m.n || 1 }; seen.set(k, c); out.push(c); }
  }
  return out;
}
