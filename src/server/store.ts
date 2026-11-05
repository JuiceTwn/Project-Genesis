/* Crash-safe world saves: write to a temp file, fsync, rename over state.json (atomic), and keep rotating
   backups (state.1.json is newest). Loading falls back through the backups if the newest file is missing or corrupt. */
import fs from 'node:fs';
import path from 'node:path';

const KEEP = 6;
const backupPath = (file: string, i: number) => file.replace(/\.json$/, `.${i}.json`);

export function loadState(file: string, valid: (s: any) => boolean): { state: any; from: string } | null {
  const candidates = [file, ...Array.from({ length: KEEP }, (_, i) => backupPath(file, i + 1))];
  for (const f of candidates) {
    try { const s = JSON.parse(fs.readFileSync(f, 'utf8')); if (valid(s)) return { state: s, from: f }; console.error(`save ${f} rejected (invalid shape)`); }
    catch (e: any) { if (e.code !== 'ENOENT') console.error(`save ${f} unreadable: ${e.message}`); }
  }
  return null;
}

export function saveState(file: string, data: any, rotate: boolean) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const json = JSON.stringify(data), tmp = file + '.tmp';
  const fd = fs.openSync(tmp, 'w'); try { fs.writeSync(fd, json); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  if (rotate && fs.existsSync(file)) {
    for (let i = KEEP; i >= 2; i--) { const a = backupPath(file, i - 1), b = backupPath(file, i); if (fs.existsSync(a)) fs.renameSync(a, b); }
    fs.copyFileSync(file, backupPath(file, 1));
  }
  fs.renameSync(tmp, file);
  return json.length;
}
