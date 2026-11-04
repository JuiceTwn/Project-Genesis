/* Share cards: the SVG from shared/gazette.ts rasterised to a 1200x630 PNG with resvg and the bundled fonts, cached in memory. */
import fs from 'node:fs';
import path from 'node:path';
import { Resvg } from '@resvg/resvg-js';

const cache = new Map<string, Buffer>();
let fontFiles: string[] | null = null;

export function renderPng(key: string, svg: string, root: string): Buffer {
  const hit = cache.get(key); if (hit) return hit;
  if (!fontFiles) { const d = path.join(root, 'assets', 'fonts'); fontFiles = fs.existsSync(d) ? fs.readdirSync(d).filter(f => f.endsWith('.ttf')).map(f => path.join(d, f)) : []; }
  const png = new Resvg(svg, { font: { fontFiles, loadSystemFonts: fontFiles.length === 0, defaultFontFamily: 'DejaVu Sans' }, fitTo: { mode: 'width', value: 1200 } }).render().asPng();
  cache.set(key, png); if (cache.size > 200) cache.delete(cache.keys().next().value!);
  return png;
}
