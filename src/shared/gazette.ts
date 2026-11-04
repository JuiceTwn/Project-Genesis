/* The Dotville Gazette: data shapes plus pure renderers (HTML for permalink pages and the in-app tab, SVG for share cards).
   No dependencies, so the server and the browser client both use it. */

export interface GStory { kind: string; headline: string; deck: string; body: string[]; quote?: string; ids: number[]; town: string; arc?: number }
export interface Issue {
  n: number; day: number; year: number; season: string; weather: string; dateline: string;
  front: GStory; stories: GStory[]; briefs: { town: string; text: string }[];
  hearts: string[]; obits: string[]; business: string[]; market: string[];
  gossip: { by: string; items: string[] }; classifieds: string[]; numbers: { label: string; value: string }[];
}
export interface StoryDoc {
  id: number; kind: string; title: string; town: string; started: { day: number; year: number }; done: boolean; outcome: string;
  people: { id: number; name: string; epithet: string; line: string }[]; beats: { day: number; text: string }[];
}

export const esc = (t: unknown): string => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
/** 'WEDDING BELLS IN SEVI' -> 'Wedding Bells in Sevi' (capitalises every word, so place names keep their capital). */
export const titleCase = (t: string): string => String(t).toLowerCase().replace(/(^|[\s—–-])([a-z])/g, (m, a, b, off) => a + b.toUpperCase()).replace(/ (In|Of|To|A|The|And|For|At|On|As|Or|By|From|With) /g, x => x.toLowerCase());
/** Strip emoji for places that cannot draw them (share cards, plain text). */
export const plain = (t: string): string => String(t).replace(/[\p{Extended_Pictographic}️‍]/gu, '').replace(/\s{2,}/g, ' ').trim();

export const GAZETTE_CSS = `
.gz{font-family:Georgia,'Times New Roman',serif;color:#1d1a14;line-height:1.5}
.gz .mast{text-align:center;border-bottom:3px double #1d1a14;padding:6px 0 8px;margin-bottom:10px}
.gz .mast h1{font-size:34px;letter-spacing:.5px;margin:0;font-weight:700;font-variant:small-caps}
.gz .mast .dl{display:flex;justify-content:space-between;font-size:12px;border-top:1px solid #1d1a14;margin-top:6px;padding-top:3px;gap:8px;flex-wrap:wrap}
.gz h2.hl{font-size:30px;line-height:1.1;margin:8px 0 4px;font-weight:700}
.gz .deck{font-style:italic;font-size:16px;margin:0 0 8px;color:#3b362b}
.gz p{margin:0 0 8px;font-size:15px}
.gz blockquote{margin:8px 0;padding:4px 12px;border-left:3px solid #8a7b52;font-style:italic;color:#3b362b}
.gz .cols{column-count:2;column-gap:22px;column-rule:1px solid #cfc6aa}
.gz .story{break-inside:avoid;border-top:1px solid #cfc6aa;padding:8px 0}
.gz .story h3{font-size:19px;margin:0 0 2px;line-height:1.15}
.gz .sec{margin-top:14px;border-top:2px solid #1d1a14;padding-top:6px}
.gz .sec h4{margin:0 0 6px;font-size:13px;letter-spacing:1.5px;text-transform:uppercase;color:#6b5d36}
.gz ul{margin:0;padding-left:18px}.gz li{margin:0 0 5px;font-size:14px}
.gz .num{display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:8px}
.gz .num div{border:1px solid #cfc6aa;padding:6px 8px;text-align:center}.gz .num b{display:block;font-size:20px}.gz .num span{font-size:11px;color:#6b5d36}
.gz .share{margin-top:12px;font-size:13px}.gz .share a,.gz .share button{color:#6b3e1d;cursor:pointer;background:none;border:0;font:inherit;text-decoration:underline;padding:0;margin-right:12px}
.gz .ppl{margin:6px 0;font-size:14px}.gz .beat{border-left:3px solid #8a7b52;padding:2px 10px;margin:8px 0}.gz .beat small{display:block;color:#6b5d36}
@media(max-width:700px){.gz .cols{column-count:1}.gz h2.hl{font-size:25px}}`;

const paras = (a: string[]) => a.map(p => `<p>${esc(p)}</p>`).join('');
const list = (a: string[]) => a.length ? `<ul>${a.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : '<p><i>Nothing to report.</i></p>';
const sec = (t: string, inner: string) => `<div class="sec"><h4>${esc(t)}</h4>${inner}</div>`;

/** The whole issue as HTML (no <html> wrapper). `base` prefixes permalink URLs (e.g. '' on the server). */
export function renderIssue(i: Issue, base = ''): string {
  const f = i.front;
  const link = (s: GStory) => s.arc ? ` <a href="${base}/story/${s.arc}" style="font-size:12px">full story →</a>` : '';
  return `<div class="gz"><div class="mast"><h1>The Dotville Gazette</h1><div class="dl"><span>No. ${i.n}</span><span>${esc(i.dateline)}</span><span>${esc(i.weather)}</span></div></div>
<h2 class="hl">${esc(f.headline)}</h2><p class="deck">${esc(f.deck)}${link(f)}</p>${paras(f.body)}${f.quote ? `<blockquote>${esc(f.quote)}</blockquote>` : ''}
${i.stories.length ? `<div class="cols">${i.stories.map(s => `<div class="story"><h3>${esc(s.headline)}</h3><p class="deck" style="font-size:14px">${esc(s.deck)}${link(s)}</p>${paras(s.body)}${s.quote ? `<blockquote>${esc(s.quote)}</blockquote>` : ''}</div>`).join('')}</div>` : ''}
${i.briefs.length ? sec('Around the country', list(i.briefs.map(b => `${b.town}: ${b.text}`))) : ''}
${sec('Hearts & homes', list(i.hearts))}${sec('Obituaries', list(i.obits))}${sec('Business ledger', list(i.business))}${sec('Market report', list(i.market))}
${sec(`Gossip column — by ${i.gossip.by}`, list(i.gossip.items))}${sec('Classifieds', list(i.classifieds))}
${sec('The day in numbers', `<div class="num">${i.numbers.map(n => `<div><b>${esc(n.value)}</b><span>${esc(n.label)}</span></div>`).join('')}</div>`)}</div>`;
}

export function renderStory(s: StoryDoc): string {
  return `<div class="gz"><div class="mast"><h1>The Dotville Gazette</h1><div class="dl"><span>Special report</span><span>${esc(s.town)} · begun year ${s.started.year}, day ${s.started.day}</span><span>${s.done ? 'Concluded: ' + esc(s.outcome) : 'Developing story'}</span></div></div>
<h2 class="hl">${esc(s.title)}</h2>${s.people.map(p => `<div class="ppl"><b>${esc(p.name)}</b> <i>${esc(p.epithet)}</i> — ${esc(p.line)}</div>`).join('')}
<div class="sec"><h4>The story so far</h4>${s.beats.map(b => `<div class="beat"><small>Day ${b.day}</small>${esc(plain(b.text))}</div>`).join('') || '<p><i>Just beginning…</i></p>'}</div></div>`;
}

/** A standalone page with Open Graph / Twitter tags so shared links preview nicely. */
export function pageHtml(o: { title: string; desc: string; image: string; url: string; body: string }): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(o.title)}</title><meta name="description" content="${esc(o.desc)}">
<meta property="og:type" content="article"><meta property="og:site_name" content="Dotville"><meta property="og:title" content="${esc(o.title)}"><meta property="og:description" content="${esc(o.desc)}">
<meta property="og:image" content="${esc(o.image)}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:url" content="${esc(o.url)}">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${esc(o.title)}"><meta name="twitter:description" content="${esc(o.desc)}"><meta name="twitter:image" content="${esc(o.image)}">
<style>body{margin:0;background:#e9e2cc;padding:16px}.page{max-width:860px;margin:0 auto;background:#f6f0dc;padding:18px 24px 26px;box-shadow:0 2px 14px rgba(0,0,0,.25)}.nav{font:13px system-ui,sans-serif;margin-bottom:10px;display:flex;gap:14px;flex-wrap:wrap}.nav a{color:#6b3e1d}${GAZETTE_CSS}</style></head>
<body><div class="page"><div class="nav"><a href="/">▶ Watch Dotville live</a><a href="/gazette">Latest issue</a></div>${o.body}
<div class="gz"><div class="share"><button onclick="(navigator.share?navigator.share({title:document.title,url:location.href}):navigator.clipboard.writeText(location.href).then(()=>this.textContent='Link copied!'))">Share this page</button></div></div></div></body></html>`;
}

/** 1200x630 share card (SVG; the server rasterises it to PNG). Text is wrapped by character count. */
export function cardSvg(o: { kicker: string; title: string; sub: string; footer: string; extra?: string[] }): string {
  const wrap = (t: string, n: number, max: number) => { const w = plain(t).split(' '), out: string[] = []; let line = ''; for (const x of w) { if ((line + ' ' + x).trim().length > n) { out.push(line); line = x; } else line = (line + ' ' + x).trim(); } if (line) out.push(line); if (out.length > max) { out.length = max; out[max - 1] = out[max - 1].replace(/\s*\S*$/, '') + '…'; } return out; };
  const tl = wrap(o.title, 24, 3), sl = wrap(o.sub, 60, 3), ex = (o.extra || []).slice(0, 3), fs = tl.length > 2 ? 58 : 70;
  const t = tl.map((l, i) => `<text x="70" y="${232 + i * (fs + 10)}" font-size="${fs}" font-weight="700" font-family="DejaVu Serif" fill="#1d1a14">${esc(l)}</text>`).join('');
  const sy = 232 + (tl.length - 1) * (fs + 10) + 52, s = sl.map((l, i) => `<text x="70" y="${sy + i * 36}" font-size="28" font-style="italic" font-family="DejaVu Serif" fill="#4a4333">${esc(l)}</text>`).join('');
  const x = ex.map((l, i) => `<text x="70" y="${458 + i * 30}" font-size="22" font-family="DejaVu Sans" fill="#6b5d36">▪ ${esc(wrap(l, 78, 1)[0] || '')}</text>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630"><rect width="1200" height="630" fill="#f2ead2"/><rect x="24" y="24" width="1152" height="582" fill="none" stroke="#1d1a14" stroke-width="3"/><rect x="34" y="34" width="1132" height="562" fill="none" stroke="#1d1a14" stroke-width="1"/>
<text x="600" y="98" font-size="44" font-weight="700" font-family="DejaVu Serif" fill="#1d1a14" text-anchor="middle">THE DOTVILLE GAZETTE</text><line x1="70" y1="120" x2="1130" y2="120" stroke="#1d1a14" stroke-width="2"/>
<text x="70" y="156" font-size="21" font-family="DejaVu Sans" font-weight="700" fill="#8a4b1d" letter-spacing="3">${esc(plain(o.kicker).toUpperCase())}</text>${t}${s}${x}
<line x1="70" y1="548" x2="1130" y2="548" stroke="#1d1a14" stroke-width="1"/><text x="70" y="580" font-size="22" font-family="DejaVu Sans" fill="#4a4333">${esc(plain(o.footer))}</text><text x="1130" y="580" font-size="22" font-family="DejaVu Sans" font-weight="700" fill="#8a4b1d" text-anchor="end">a country that lives while you're away</text></svg>`;
}
