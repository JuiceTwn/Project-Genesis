import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { World, DAY_TICKS } from '../src/sim';
import { renderIssue, renderStory, pageHtml, plain, type Issue } from '../src/shared/gazette';
import { Archive } from '../src/server/archive';
import { route } from '../src/server/pages';

let w: World, root: string, archive: Archive;
before(() => {
  w = new World({ seed: 41, deterministic: true, pop: 300 });
  for (let i = 0; i < 4 * DAY_TICKS; i++) { w.step(); w.drain(); }
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'dv-'));
  fs.cpSync(path.join(process.cwd(), 'assets'), path.join(root, 'assets'), { recursive: true });
  archive = new Archive(path.join(root, 'data', 'archive'));
  for (const a of w.archive) archive.put(a.kind as 'issue' | 'story', a.id, a.data);
  archive.flush();
});

test('an issue goes to press every dawn with every section filled and no broken text', () => {
  assert.ok(w.issues.length >= 3, `issues: ${w.issues.length}`);
  for (const is of w.issues) {
    assert.ok(is.front.headline.length > 5 && is.front.deck.length > 5 && is.front.body.length >= 1);
    assert.ok(is.numbers.length >= 6 && is.market.length >= 3 && is.classifieds.length >= 1 && is.gossip.items.length >= 1);
    const html = renderIssue(is);
    for (const bad of ['undefined', 'NaN', '[object', 'null']) assert.ok(!html.includes(bad), `issue ${is.n} contains "${bad}"`);
    for (const s of [is.front, ...is.stories]) assert.ok(s.body.every(p => p.trim().length), 'no empty paragraphs');
    assert.notEqual(is.front.deck, is.front.body[0], 'the deck is not repeated as the first paragraph');
  }
  assert.equal(new Set(w.issues.map(i => i.n)).size, w.issues.length, 'issue numbers are unique');
});

test('rendering escapes HTML so names can never inject markup', () => {
  const evil = '<script>alert(1)</script>';
  const is: Issue = { ...w.issues[0], front: { ...w.issues[0].front, headline: evil, deck: evil, body: [evil], quote: evil } };
  const html = pageHtml({ title: evil, desc: evil, image: evil, url: evil, body: renderIssue(is) });
  assert.ok(!html.includes('<script>alert(1)'), 'raw script tag must not appear');
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(!renderStory({ id: 1, kind: 'x', title: evil, town: evil, started: { day: 1, year: 1 }, done: true, outcome: evil, people: [{ id: 1, name: evil, epithet: evil, line: evil }], beats: [{ day: 1, text: evil }] }).includes('<script>alert'));
});

test('permalink pages, JSON, share cards and 404s', async () => {
  const ctx = { archive, origin: 'https://dotville.example', root }, n = archive.latestIssue();
  const page = (await route(`/issue/${n}`, ctx))!;
  assert.equal(page.status, 200); const body = String(page.body);
  assert.ok(body.includes(`og:image" content="https://dotville.example/card/issue/${n}.png"`) && body.includes('twitter:card'), 'share tags present');
  assert.ok(body.includes('The Dotville Gazette'));
  const png = (await route(`/card/issue/${n}.png`, ctx))!; const b = png.body as Buffer;
  assert.equal(png.type, 'image/png'); assert.deepEqual([...b.subarray(0, 4)], [0x89, 0x50, 0x4e, 0x47], 'is a PNG'); assert.ok(b.length > 8000, `card has content (${b.length} bytes)`);
  const home = (await route('/card/home.png', ctx))!; assert.equal(home.type, 'image/png');
  const redirect = (await route('/gazette', ctx))!; assert.equal(redirect.status, 302); assert.equal(redirect.headers!.Location, `/issue/${n}`);
  assert.equal((await route('/issue/99999', ctx))!.status, 404);
  assert.equal((await route('/issue/abc', ctx)), null); assert.equal(await route('/issue/../etc/passwd', ctx), null); assert.equal(await route('/story/1/../../x', ctx), null);
  const j = (await route(`/api/issue/${n}.json`, ctx))!; assert.equal(JSON.parse(String(j.body)).n, n);
  assert.ok(String((await route('/sitemap.xml', ctx))!.body).includes(`/issue/${n}`));
  assert.ok(String((await route('/archive', ctx))!.body).includes(`/issue/${n}`));
});

test('story arcs get permalinks that update with each beat', async () => {
  const stories = w.archive.filter(a => a.kind === 'story'); if (!stories.length) return;   // arcs depend on the seed; covered by story.test
  const id = stories[0].id, res = (await route(`/story/${id}`, { archive, origin: 'http://x', root }))!;
  assert.equal(res.status, 200); assert.ok(String(res.body).includes('The story so far'));
  assert.equal((await route(`/card/story/${id}.png`, { archive, origin: 'http://x', root }))!.type, 'image/png');
});

test('plain() strips emoji for cards', () => { assert.equal(plain('🔥 Fire in Tani! ❤️'), 'Fire in Tani!'); });
