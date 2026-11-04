/* Permanent archive of Gazette issues and story arcs, as JSON files on disk, so permalinks outlive restarts and the in-memory window. */
import fs from 'node:fs';
import path from 'node:path';

export type Kind = 'issue' | 'story';

export class Archive {
  private latest = 0;
  private pending = new Map<string, { kind: Kind; id: number; data: unknown }>();
  private timer: NodeJS.Timeout | null = null;
  constructor(private dir: string) {
    for (const k of ['issue', 'story']) fs.mkdirSync(path.join(dir, k), { recursive: true });
    for (const f of fs.readdirSync(path.join(dir, 'issue'))) { const n = parseInt(f, 10); if (n > this.latest) this.latest = n; }
  }
  private file(kind: Kind, id: number) { return path.join(this.dir, kind, `${id}.json`); }
  /** Queue a write. Repeated puts of the same record (a story gains beats) are coalesced and flushed together. */
  put(kind: Kind, id: number, data: unknown): void {
    if (kind === 'issue' && id > this.latest) this.latest = id;
    this.pending.set(`${kind}:${id}`, { kind, id, data });
    if (!this.timer) this.timer = setTimeout(() => this.flush(), 500);
  }
  flush(): void {
    this.timer = null;
    for (const { kind, id, data } of this.pending.values()) {
      try { const f = this.file(kind, id); fs.writeFileSync(f + '.tmp', JSON.stringify(data)); fs.renameSync(f + '.tmp', f); } catch (e: any) { console.error('archive write failed', e.message); }
    }
    this.pending.clear();
  }
  get<T = any>(kind: Kind, id: number): T | null {
    const p = this.pending.get(`${kind}:${id}`); if (p) return p.data as T;
    try { return JSON.parse(fs.readFileSync(this.file(kind, id), 'utf8')) as T; } catch { return null; }
  }
  latestIssue(): number { return this.latest; }
  /** Newest-first list of issue numbers with their headlines, for the archive index. */
  issues(limit = 60): { n: number; headline: string; dateline: string }[] {
    const out: { n: number; headline: string; dateline: string }[] = [];
    for (let n = this.latest; n >= 1 && out.length < limit; n--) { const i = this.get<any>('issue', n); if (i) out.push({ n, headline: i.front.headline, dateline: i.dateline }); }
    return out;
  }
}
