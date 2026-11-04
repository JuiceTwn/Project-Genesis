/* Permalink pages and JSON API for the Gazette. Pure routing: (path, host info, archive) -> response, so it is easy to test. */
import { renderIssue, renderStory, pageHtml, cardSvg, esc, plain, titleCase, type Issue, type StoryDoc } from '../shared/gazette';
import { renderPng } from './cards';
import type { Archive } from './archive';

export interface Res { status: number; type: string; body: string | Buffer; headers?: Record<string, string> }
export interface Ctx { archive: Archive; origin: string; root: string }

const html = (status: number, body: string, headers?: Record<string, string>): Res => ({ status, type: 'text/html; charset=utf-8', body, headers });
const notFound = (what: string): Res => html(404, pageHtml({ title: 'Not found — The Dotville Gazette', desc: '', image: '', url: '', body: `<div class="gz"><div class="mast"><h1>The Dotville Gazette</h1></div><h2 class="hl">No such ${esc(what)}</h2><p>That page is not in our archive (yet). <a href="/archive">Browse the archive</a> or <a href="/">watch the country live</a>.</p></div>` }));
const cap = titleCase;

export async function route(p: string, c: Ctx): Promise<Res | null> {
  const A = c.archive;
  if (p === '/gazette') { const n = A.latestIssue(); return n ? { status: 302, type: 'text/plain', body: '', headers: { Location: `/issue/${n}` } } : html(200, pageHtml({ title: 'The Dotville Gazette', desc: 'Dotville has not gone to press yet.', image: '', url: c.origin + p, body: '<div class="gz"><div class="mast"><h1>The Dotville Gazette</h1></div><p>The first issue goes to press at dawn of day 2. Check back soon.</p></div>' })); }
  if (p === '/archive') {
    const L = A.issues(120);
    return html(200, pageHtml({ title: 'Archive — The Dotville Gazette', desc: 'Every issue of the Dotville Gazette.', image: `${c.origin}/card/home.png`, url: c.origin + p, body: `<div class="gz"><div class="mast"><h1>The Dotville Gazette</h1><div class="dl"><span>Archive</span><span>${L.length} recent issues</span></div></div><ul>${L.map(i => `<li><a href="/issue/${i.n}">No. ${i.n}</a> — ${esc(cap(plain(i.headline)))} <small>(${esc(i.dateline)})</small></li>`).join('')}</ul></div>` }));
  }
  let m = /^\/issue\/(\d{1,7})$/.exec(p);
  if (m) {
    const n = +m[1], is = A.get<Issue>('issue', n); if (!is) return notFound('issue');
    return html(200, pageHtml({ title: `${cap(plain(is.front.headline))} — The Dotville Gazette No. ${n}`, desc: plain(is.front.deck), image: `${c.origin}/card/issue/${n}.png`, url: `${c.origin}/issue/${n}`, body: renderIssue(is) + `<div class="gz"><div class="share">${n > 1 ? `<a href="/issue/${n - 1}">← Previous issue</a>` : ''}${n < A.latestIssue() ? `<a href="/issue/${n + 1}">Next issue →</a>` : ''}<a href="/archive">Archive</a></div></div>` }), { 'Cache-Control': n < A.latestIssue() ? 'public, max-age=3600' : 'no-cache' });
  }
  m = /^\/story\/(\d{1,7})$/.exec(p);
  if (m) {
    const id = +m[1], s = A.get<StoryDoc>('story', id); if (!s) return notFound('story');
    return html(200, pageHtml({ title: `${s.title} — The Dotville Gazette`, desc: plain(s.beats[s.beats.length - 1]?.text || s.title), image: `${c.origin}/card/story/${id}.png`, url: `${c.origin}/story/${id}`, body: renderStory(s) }), { 'Cache-Control': s.done ? 'public, max-age=3600' : 'no-cache' });
  }
  m = /^\/card\/(issue|story)\/(\d{1,7})\.png$/.exec(p);
  if (m) {
    const id = +m[2]; let svg: string, key: string;
    if (m[1] === 'issue') { const is = A.get<Issue>('issue', id); if (!is) return notFound('card'); key = `i${id}`; svg = cardSvg({ kicker: `No. ${id} · ${is.season}, year ${is.year}`, title: cap(plain(is.front.headline)), sub: plain(is.front.deck), footer: `${is.dateline}`, extra: is.stories.slice(0, 3).map(x => cap(plain(x.headline))) }); }
    else { const s = A.get<StoryDoc>('story', id); if (!s) return notFound('card'); key = `s${id}:${s.beats.length}:${s.done}`; svg = cardSvg({ kicker: s.done ? `Concluded · ${s.outcome}` : 'Developing story', title: s.title, sub: plain(s.beats[s.beats.length - 1]?.text || ''), extra: s.people.slice(0, 3).map(p => `${p.name} ${p.epithet}`), footer: `${s.town} · year ${s.started.year}, day ${s.started.day}` }); }
    return { status: 200, type: 'image/png', body: renderPng(key, svg, c.root), headers: { 'Cache-Control': 'public, max-age=3600' } };
  }
  if (p === '/card/home.png') return { status: 200, type: 'image/png', body: renderPng('home', cardSvg({ kicker: 'A country that lives while you are away', title: 'Dotville', sub: 'Thousands of dots farm, trade, fall in love, feud and vote on a generated island. Nobody is in charge. You just watch.', footer: 'Watch live · read the Gazette' }), c.root), headers: { 'Cache-Control': 'public, max-age=86400' } };
  m = /^\/api\/(issue|story)\/(\d{1,7})\.json$/.exec(p);
  if (m) { const d = A.get(m[1] as 'issue' | 'story', +m[2]); return d ? { status: 200, type: 'application/json', body: JSON.stringify(d), headers: { 'Access-Control-Allow-Origin': '*' } } : { status: 404, type: 'application/json', body: '{"error":"not found"}' }; }
  if (p === '/sitemap.xml') { const L = A.issues(500); return { status: 200, type: 'application/xml', body: `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${c.origin}/</loc></url><url><loc>${c.origin}/archive</loc></url>${L.map(i => `<url><loc>${c.origin}/issue/${i.n}</loc></url>`).join('')}</urlset>` }; }
  return null;
}
