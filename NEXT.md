# Dotville: what's next (handoff)

Read this first in a fresh session. It is the state of the project, the decisions made, what is verified, and the next steps in order.
Repo: `juicetwn/project-genesis`, branch `main` (everything below is merged; the feature branches on the remote are all merged and can be deleted).
18 test files, 48 tests, all passing at the last full run. `npm run typecheck` is clean.

## The vision (from the owner)
A small country (about 1-5k people), fully simulated and **real in its numbers**, always on, free to watch, interactive, stream-friendly and memeable.
Think **Dwarf Fortress / RimWorld**: deep individual simulation (moods, skills, bodies, memories, relationships, objects) where ordinary systems collide and
produce stories nobody scripted. Realistic ratios and real USD scale. Always dozens of interesting people and events on screen. Deep capitalism: brands rise and
fall, banks can fail, celebrities and influencers, rare "improbable" superheroes announced at birth. The owner wants **more micro and less macro**: replace
aggregate shortcuts with individual agents and objects wherever the speed budget allows.
It is meant to be **one persistent world on a VPS that anyone can open at any time** (a window, not a game: no sessions, no save files for viewers).

## Art direction (decided by the owner; not started)
- **WebGL** renderer (the Canvas 2D one stays as the fallback and as the reference for the visual tests).
- **Pixel art** for the whole world. Today's look is procedural placeholder art; the redo replaces it.
- **Dot sprites become real characters in the RimWorld / Prison Architect style** (small top-down people you can tell apart at a glance), not circles with rings.
- **Animation is minimal per sprite** (a few frames at most: idle, walk, maybe one action pose). The sim and the camera carry the motion, not the art.
- **A Low / High quality setting** exists (a toggle plus a frame-time readout), so a public site stays usable on weak phones.
- The owner will do this pass themselves, "at some point". Nothing in the engine blocks it; see "Visual pass" below for what is ready and what it will run into.

## Clock and money (decided, in `src/shared/reality.ts`)
- 1 sim day = 15 real minutes (4,500 ticks at 5 Hz). 1 year = 60 days (15 real hours). Month = 5 days, season = 15 days. A life is ~80 years = ~50 real days.
- Median income $50k/yr = $833/sim day. Because a year is 6x shorter than a real one, day-sized amounts look ~6x inflated while annual and monthly
  figures are real (rent $1,400/month, house $275k, a median earner pays ~25% tax). Show money to viewers as monthly/annual figures where possible.
- `KB` scales old coin thresholds to dollars; `TS` (3.75) scales legacy per-tick rates and durations. Change the clock by editing `reality.ts` only.
- **Money is conserved.** It only moves between accounts, or crosses the border via `fromAbroad`/`toAbroad` (exports, imports, upkeep, goods, bills, maintenance,
  materials, advertising, migrants) or is printed by `mint()`. Accounts: dot `coin`, firm `cash` and construction `escrow`, town and national treasuries, and the
  bank's `cash`. Deposits (`d.dep`) are *claims*, not money. `tests/money.test.ts` asserts supply = start + minted + inflow - outflow; every new system's test does too.
  **When a test hands out money, take the baseline after doing so** (or it looks like a leak).

## Layout
- `src/shared/`: constants, `reality.ts` (clock, prices, wages, costs), types, util (seeded RNG, `makeField` bucket-queue distance fields), `gazette.ts` (data types plus HTML/SVG renderers shared by server and client),
  **`protocol.ts`** (every server/client message type, plus `parseClientMsg` which validates untrusted client JSON), **`feed.ts`** (feed rollup: events that differ only by names/amounts merge with a count, used by server and client).
- `src/worldgen/`: terrain, rivers, settlements, roads (`@ts-nocheck` on purpose: it is being rewritten for the larger map). `src/sim/config.ts` sets the country size (320x240, 9 towns, 26 villages, 40 hamlets).
- `src/sim/` (one module per system, mixed into `World`; `World.ev` fans every event out to the `mediaHook` and `thoughtHook`; every event carries `tk`, the sim tick):
  - core: `people`, `buildings` (sites, contractors, builders' crews), `economy` (payroll, firms, founding, restock), `government`, `brain` (decide), `activity`, `social`, `crime`, `lexicon`, `viewer`, `output`, `persist`, `tick`, `helpers`, `money/ledger`, `personality` (33 traits), `character`, `storyteller`, `gazette`, `housing`, `consumer`.
  - items and commerce: `gear` (clothes/coat/tool/bag with quality and wear), `brand` (brands as entities: awareness, quality, price, word of mouth, ads, acquisitions, scandals, collapse).
  - finance: `bank` (savings, firm loans, reserve ratio, leverage limit 8x equity, dividends keep equity >= deposits/6, runs, failure, embezzlement), `mortgage` (house price index with bubble and crash, foreclosure feeding bank losses).
  - society: `politics` (3 parties, platforms, corruption, recalls), `crime2` (burglary, gangs, extortion, arson, police, prison, lawyers), `media` (fame, posts and rumours that spread, pile-ons, influencer sponsorships; rumours move bank fear, brand reputation, town unrest).
  - characters: `legend` (names, nicknames, memories, faces, the cast list), `thoughts` (dated thoughts feed mood; mental breaks), `skills` (6 attributes, 18 skills, ~25 specialised firm types), `health` (flu, injuries, clinics, epidemics).
  - `tick.ts`: the daily "dawn" jobs run one per tick over ~12 ticks (`World.dawnQ`) so no single tick does a whole day's work.
- `src/server/`: websocket server (`main.ts`), `store.ts` (atomic saves + rotating backups), `archive.ts`, `pages.ts` (permalinks, JSON, sitemap), `cards.ts` (PNG share cards via resvg + bundled fonts; they do not show faces and will not match the pixel-art look).
- `src/client/`: `main.ts` (state, input, UI, camera updates), `index.html` (all CSS; tokens in `:root`), `render/` (see below), `demo.ts` (bundles the sim for the no-server `demo.html`).
- `src/client/render/`: `camera.ts`, `theme.ts` (design tokens + sprite names), `sprites.ts` (atlas with procedural fallback), `types.ts` (`RenderView` / `Renderer` interfaces), `canvas2d.ts` (the current look), `face.ts` (procedural portraits), `README.md` (how to restyle).
- `deploy/`: systemd unit, Caddyfile, healthcheck, step-by-step README for a VPS. `tests/visual/`: visual regression tools. `src/tools/`: `bench`, `map`, `gazette`, `reality`, `longrun`, `loadtest`. `ml/`: Python trend checks. `scripts/`: build, typing ratchet.

## Commands
`npm run build | start | dev | typecheck | test` (`typecheck` = `tsc` plus the typing ratchet; the full suite takes ~10 min: run it in the background and **do not switch git branches or edit files while it runs**).
`npm run reality -- 14 1800` (scorecard), `npm run longrun -- 2 1000 ml/out/long.jsonl` (2 sim years, ~30 min) then `npm run longreport ml/out/long.jsonl`, `npm run gazette -- 8`, `npm run map -- 1337 map.png`.
`npm run loadtest -- 200 15 ws://localhost:3000` (viewers, seconds, url). `npm run visual:baseline | visual:check | visual:seams` (see "Visual pass").
Env: `PORT`, `DOTVILLE_ROOT`, `PUBLIC_URL`, `TRUST_PROXY`, `MAX_CLIENTS`, `MAX_PER_IP`, `ACT_GAP_MS`, `WARMUP_DAYS` (details in `deploy/README.md`).

## What is built and verified
- **Server (hardened, not yet deployed):** feed rollup server-side and client-side; the join message is built fresh per joiner and gzip-compressed (475 KB -> 104 KB); a new world warms up headless (`WARMUP_DAYS`, default 3, ~30 s) so viewers never see the day-1 flood; saves are atomic with 6 rotating backups and boot falls back through them; sim errors are caught (5 in a row exit without saving, so the supervisor restarts from the last good save); `/health` returns 503 on a stalled loop; per-IP connection and action limits; validated client input. **Load test: 200 viewers held 5.00 Hz, ~3.6 MB/s out, ~50% of one core, ~270 MB.**
- **Tests:** 48/48. Two earlier failures were fixed: a real bank bug (a same-day dividend stripped capital to ~80x leverage; unpaid claims were wiped when the vault ran short) and a coin-flip test (a mental break could be "quit" instead of "drink").
- **Typing:** the wire protocol, the client and the sim's message builders are typed. A **ratchet** (`scripts/typing-ratchet.mjs`, baseline `typing-baseline.json`) fails if any file gets more implicit-any spots; **291 remain** (the big ones are in `sim/buildings.ts`, `sim/people.ts`, `sim/social.ts`, `client/main.ts`). After cleaning some, `node scripts/typing-ratchet.mjs --update` locks it in. `Dot` and `Building` still have `[k: string]: any` escape hatches (systems attach fields lazily), so a wrong label will not error: review annotations by hand. **Do not pipe `npm run typecheck` into `tail` before `&&`: the pipe hides the failure.**
- **UX ("Dotville Live", a broadcast on a living country):** full-bleed map with glass panels over it; HUD with a LIVE badge and a drama meter (storyteller tension); a **lower third** saying who the camera is on and why; **story chips** (the storyteller's active arcs, tappable); a collapsible drawer on desktop and a three-position bottom sheet on phones (44 px touch targets); tabs Wire / Country / Stories / Gazette / Cast; per-screen close-up zoom; the camera waits for a dot's position before following it. The camera centres on the area the panels leave free (`Camera.inset`).
- **Rendering behind an interface** (`client/render/`), verified **pixel-identical** to the old look across 16 deterministic scenes (desktop and phone: overview, region, town labels, street, selected dot, night, rain, snow at dusk). Seams proven by `visual:seams`: theme tokens recolour the world, a sprite atlas replaces a building, a **missing sprite falls back to the procedural drawing pixel-for-pixel**, a custom terrain painter replaces the ground.
- Earlier measurements (stale, re-measure): speed at 1,000 people was mean 1.8 ms/tick, p99 6 ms, worst ~42-55 ms (dawn work) against a 200 ms budget; a 2-year long run gave money supply +8.0%/yr with none minted, firm failures 8.5%/yr, Gini 0.85 -> 0.75, unemployment ~0%. **Profile the esbuild bundle, not `tsx`** (tsx looks much slower than production).

## Known gaps
- **Re-measure the economy and speed** on the final code. The bank fix changed how much capital banks keep, and nothing since skills v2, health, thoughts and the bank fix has been re-run through `reality` or `longrun`.
- **Balance:** unemployment ~0% (target 3-7%; a labour shortage), firm founding only ~2.9%/yr, births 5.5 and deaths 2.5 per 1,000/yr (young population; real ~10 and ~9), 3 starvation deaths in the last long run (cause unconfirmed; may be the malnutrition death path). Check that builders' firms get founded and survive.
- **The suite is slow** (~10 min) because every test builds a full world; a small test world would cut it to a minute or two.
- `demo.html` is a **cold start** (the warm-up only runs on the server): Town shows $0 treasuries and the Gazette says the first issue is at dawn of day 2. Ship a pre-warmed snapshot or a loading screen.
- Not built: mortgage-backed securities, evictions beyond foreclosure, internal migration, taxes on crop income and dividends, superheroes, stream hooks, a fuller UI for fame and health. No sound, no minimap, phone landscape untested. The server has only been load-tested synthetically (no real viewers). Persistence is positional arrays (brittle).

## Next steps, in order
1. **Verify the economy** (background jobs, no code): `npm run longrun -- 2 1000 ml/out/long.jsonl` and `npm run reality -- 14 1800` on the current code, plus a speed check of the production bundle. Then fix the balance gaps above (unemployment, founding, births, starvation).
2. **Fast tests:** a small test world (few settlements, a few hundred dots) so the suite runs in minutes. It also makes the economy tuner below practical.
3. **Telemetry hooks, before launch** (it cannot be collected retroactively): anonymous, no IPs. Log which feed rows are clicked, camera shot dwell time, follows, session length. This is the data any future learned feature needs.
4. **Deploy** (needs the owner's VPS and domain; everything is in `deploy/`, nothing blocks it). The owner earlier asked to leave deploy for last; deploying before the art pass would show how real viewers behave, which is why it is listed here, but it is the owner's call. First deploy: set `PUBLIC_URL` and `TRUST_PROXY`, copy `deploy/healthcheck.sh` to cron, back up `data/` off-box.
5. **Visual pass (owner-led, when ready; see the next section).**
6. **ML that makes it feel better**, in this order: (a) an offline **economy auto-tuner** (black-box optimiser such as CMA-ES over the dozens of tuning constants against the `reality` scorecard; replaces hand-tuning, needs step 2), (b) an **interestingness ranker** for the feed, Cast list and camera (small model; bootstrap labels offline, refine from step 3's telemetry), (c) a **camera bandit** that learns shot choice from viewer dwell time. **Skipped on purpose:** imitation then RL to replace the hand-written dot brains (opaque, hard to keep conserved and balanced, no visible gain at this scale).
7. **Scale prep, then micro layers (DF/RimWorld style, the owner's priority):** first index dots by town and building once per dawn, typed events instead of string-kind lookups (`EVENT_POST`, `MAP` in thoughts), versioned save records instead of positional arrays, clear the remaining implicit-any spots. Then (a) **information held in individual heads** (rumours as items people carry, believe, doubt and pass on; replaces the "share of the country reached" maths in `media.ts`), (b) **real goods and inventories** (stores stock items, factories turn inputs into outputs, prices follow supply and demand), (c) **households and families**, (d) **relationships with history** (debts, grudges, crushes), (e) body and needs depth.
8. **Superhero births** (extremely rare, announced nationally, 18 years to grow up; power plus personality gives hero or villain; ties into fame, crime, politics) and in-world memes. **Stream hooks:** Twitch/YouTube chat commands to name, vote, sponsor, nudge; clips of key moments, time-lapse and history graphs; a storyteller **crisis detector** (several systems going wrong at once become a front-page arc).
9. **World size and scale:** hierarchical pathing (full-map distance fields do not scale past ~320x240), then a larger country, then the worldgen rewrite (typed layers). JS has ~100x headroom at 1,000 dots; if ever needed, put Rust/WASM behind a hot loop, not a rewrite.

## Visual pass: what is ready and what it will run into
**Ready (all merged):** the `Renderer` interface; `Theme` tokens (`theme.ts`); a `SpriteAtlas` with procedural fallback (`sprites.ts`: one image plus a JSON of named rectangles; a missing name is not an error, so art can land piece by piece); a replaceable terrain painter; `face.ts` for portraits; and a safety net:
- `npm run visual:baseline` captures 16 deterministic frames as the "before"; `npm run visual:check` captures again and pixel-diffs (a refactor must say "all scenes match"; an intentional restyle shows exactly which scenes changed, then re-baseline); `npm run visual:seams` proves the theme / sprite / fallback / terrain seams.
- The frames come from the `__dvTest` hook in `main.ts`, which only exists when a page sets `__DV_TEST__` before loading: it never starts the sim timer or the draw loop, steps the sim a fixed number of times and renders one frame from an explicit camera. (Lesson: a real-time timer firing before the freeze once made two builds start from different sim ticks. `data/visual/golden` is gitignored: capture a baseline before any visual change.)
- `client/render/README.md` has a "I want to change X, edit Y" table.

**Suggested order for the pass (owner-led):**
1. Write down the pixel-art spec before drawing anything: tile size in pixels, palette, character size (RimWorld/Prison Architect pawns are tiny: decide how many pixels tall), and the sprite list (building types by state, terrain tiles, per-job or per-body character variants, props).
2. Build the **WebGL renderer** behind the existing `Renderer` interface (PixiJS is the usual choice; evaluate it first). Keep `canvas2d.ts` as the fallback and as the reference.
3. Sprite pipeline: pack sprites into an atlas (`SpriteAtlas.load`), name them to match `Theme.sprites.building(b)` / `.dot(job)`, and replace art piece by piece (the fallback keeps unfinished pieces drawing).
4. Characters: RimWorld/Prison Architect-style dot sprites, **minimal animation** (idle plus walk, one action pose at most), driven by the existing dot flags (`fl`: moving, chatting, sleeping, fighting). Decide whether the procedural faces in the dossier, cast list and lower third are replaced by sprite portraits (`face.ts`) or dropped.
5. **Low / High quality** setting plus a frame-time readout; High adds lighting, glow, weather particles and colour grading, Low is flat sprites and no post effects.
6. Re-baseline the visual goldens once the new look is approved, and update `cards.ts` (share cards) to match.

**Things the pass will run into:**
- **Pixel art wants integer scaling and nearest-neighbour sampling.** The camera currently zooms continuously (`cam.z`, fractional pixels per tile) and the terrain layer is scaled with smoothing on. Decide between snapped zoom steps (crisp) and a hybrid before drawing the art.
- **The visual test tools assume a Canvas 2D context.** `capture.cjs` and `seams.cjs` read `getContext('2d')` and `canvas.toDataURL()`, and the `restyle` hook builds a Canvas 2D renderer. A WebGL canvas needs `preserveDrawingBuffer` (or `readPixels`), and headless Chromium renders WebGL in software, so check that captures are still deterministic before trusting the diff. The tools will need updating when the WebGL renderer lands.
- **Per-dot cost:** ~1,800 dots with sprites and animation frames is fine for WebGL batching, but the zoomed-out overview draws a density glow (no individual dots) and the server only sends dots in the viewport. Keep both behaviours.
- **The UI is separate:** HUD, panels and tabs are CSS in `index.html` (tokens in `:root`); restyle them to match the pixel look there, not in the renderer.

## Working rules and gotchas
- Typecheck before every commit (`npm run typecheck`). Run long jobs in the background. Develop on a branch, fast-forward merge to `main` once tests pass. A stop hook asks for commit and push each turn. **Never switch branches or edit files while a background test run is going.**
- **Never put a `//` comment mid-line in a long single-line statement**: it comments out the rest of the line. Use `/* */` or a new line.
- **No wages from nowhere**: `payWage` pays nothing for a workplace that is not open for business (it once leaked money). Site crews are paid from the site's escrow (`buildStep`).
- **Skills and specialisations can recurse**: reading someone's skills needs their workplace's specialisation, and choosing a specialisation must not call back into skills (`pickSpec` reads the founder's skills read-only).
- Tests that depend on a coin flip should retry or remove the randomness (e.g. sponsorship deals; the mental-break test removes the job so "quit" is impossible). Tests that tamper with money must re-baseline.
- Wire protocol changes go in `shared/protocol.ts` first; the compiler then lists every producer and consumer. Binary frames: type byte 1 = world frame, 2 = gzip-compressed JSON init.
- `World.hist` holds only `EvMsg`; `Msg` is the union of messages the sim pushes (`SimMsg`).
- Big heredoc shell commands were rejected once by the safety check: write files with the file tool instead.
- Save format is v4; new per-dot fields are optional so old saves still load. Gazette and story archives live under `data/archive/` (gitignored, along with all of `data/`). Determinism: pass `deterministic: true` and a seed to `World`.
