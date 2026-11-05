# Dotville: what's next (handoff)

Read this first in a fresh session. It is the state of the project, the decisions made, what is verified, and the next steps in order.
Repo: `juicetwn/project-genesis`, branch `main` (the work was developed on `next-work` and fast-forwarded). 18 test files; every system has its own tests.
The full suite was re-run after the last merge only partly: re-run `npm test` first thing and fix anything it finds (see "Known gaps").

## The vision (from the owner)
A small country (about 1-5k people), fully simulated and **real in its numbers**, always on, free to watch, interactive, stream-friendly and memeable.
Think **Dwarf Fortress / RimWorld**: deep individual simulation (moods, skills, bodies, memories, relationships, objects) where ordinary systems collide and
produce stories nobody scripted. Realistic ratios and real USD scale. Always dozens of interesting people and events on screen. Deep capitalism: brands rise and
fall, banks can fail, celebrities and influencers, rare "improbable" superheroes announced at birth. The owner wants **more micro and less macro**: replace
aggregate shortcuts with individual agents and objects wherever the speed budget allows.

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
- `src/shared/`: constants, `reality.ts` (clock, prices, wages, costs), types, util (seeded RNG, `makeField` bucket-queue distance fields), `gazette.ts` (data types plus HTML/SVG renderers shared by server and client).
- `src/worldgen/`: terrain, rivers, settlements, roads (`@ts-nocheck`, to be typed). `src/sim/config.ts` sets the country size (320x240, 9 towns, 26 villages, 40 hamlets).
- `src/sim/` (one module per system, mixed into `World`; `World.ev` fans every event out to the `mediaHook` and `thoughtHook`):
  - core: `people`, `buildings` (sites, contractors, builders' crews), `economy` (payroll, firms, founding, restock), `government`, `brain` (decide), `activity`, `social`, `crime`, `lexicon`, `viewer`, `output`, `persist`, `tick`, `helpers`, `money/ledger`, `personality` (33 traits), `character`, `storyteller`, `gazette`, `housing`, `consumer`.
  - items and commerce: `gear` (clothes/coat/tool/bag with quality and wear; only clothiers, hardware and general stores sell gear), `brand` (brands as entities: awareness, quality, price, word of mouth, ads, acquisitions, scandals, collapse; store choice by appeal).
  - finance: `bank` (savings, firm loans, reserve ratio, leverage limit 8x equity, defaults, runs, failure, embezzlement), `mortgage` (house price index with bubble and crash, mortgages, foreclosure, repossession feeding bank losses).
  - society: `politics` (3 parties, platforms, corruption, recalls), `crime2` (burglary, gangs, extortion, arson, gang wars, police, prison, lawyers), `media` (fame and infamy, posts and rumours that spread, pile-ons, influencer sponsorships; rumours move bank fear, brand reputation and town unrest).
  - characters: `legend` (funnier pronounceable names from `lexicon`, nicknames earned from events and shown in the name itself, memories that come back as thoughts, procedural faces, the cast list; sends a `rename` message to clients).
  - the person: `thoughts` (dated thoughts feed mood; mental breaks driven by traits and willpower), `skills` (6 attributes, 18 skills with an exponential mastery curve, trait-driven learning, ~25 specialised firm types such as smithy, tailor, clinic, law firm, software studio, newspaper, clothier), `health` (flu spreads in chats, injuries, septic wounds, clinic treatment, bed rest, epidemics, deaths).
- `src/sim/tick.ts`: the **daily "dawn" jobs run one per tick** over the next ~12 ticks (a queue in `World.dawnQ`) so no single tick does a whole day's work.
- `src/server/`: websocket server, `archive.ts` (issues/stories on disk), `pages.ts` (permalinks, JSON, sitemap), `cards.ts` (PNG share cards via resvg + bundled fonts).
- `src/client/`: canvas client (`@ts-nocheck`) with Feed / Town / Stories / Gazette / **Cast** tabs (procedural faces, memories, thoughts, skills and attributes on the character card, a bell button to follow a character: the server pushes their news as notifications, and the watch list is kept in localStorage); `demo.ts` bundles the sim for the no-server demo.
- `src/tools/`: `bench`, `map`, `gazette` (preview issues), `reality` (scorecard vs real benchmarks), `longrun` (multi-year sampler).
- `ml/`: `balance_report.py`, `long_report.py` (Python trend checks); later the imitation/PPO training pipeline. `tests/`: node:test suites.

## Commands
`npm run build | start | dev | typecheck | test` (the full suite takes 5-10 min; run it in the background and **do not switch git branches while it runs**).
`npm run reality -- 14 1800` (scorecard), `npm run longrun -- 2 1000 ml/out/long.jsonl` (2 sim years, ~30 min) then `npm run longreport ml/out/long.jsonl`,
`npm run gazette -- 8`, `npm run map -- 1337 map.png`. Env: `PUBLIC_URL`, `DOTVILLE_ROOT`, `PORT`.

## Where it stands (measured)
- **Speed** (production bundle, 1,000 people, 5 sim days, measured before skills v2, health and thoughts): mean 1.8 ms per tick, p99 6 ms, worst ~42-55 ms (the dawn
  work), against the 200 ms tick budget at 5 Hz. Profiling under `tsx` looks worse (live-binding getters for `W`/`H`/constants) but production is an esbuild bundle where
  they are plain variables: **profile the bundle, not `tsx`**. Optimisations done: bucket-queue `makeField` (4.6x faster, identical output), chat grid scans only occupied cells (bit-identical results), dawn jobs staggered.
- **Long run** (2 sim years, 1,000 people, all systems up to health/thoughts, before skills v2): population +1.3%/yr, money supply +8.0%/yr with none minted, firm failures 8.5%/yr
  (real 8-12%), firms 205 -> 179 -> 183 (stabilising), Gini 0.85 -> 0.75, top 1% 45% -> 31%, unemployment ~0%.
- Reality scorecard (earlier, at the dollar-economy merge): 15 of 18 metrics in real-world ranges. Real-world benchmark figures are **from memory**: verify before trusting.
- Tests: arcs, bank, brand, builders, emergent (crime + politics), gazette, gear, health, legend, media, money, mortgage, personality, sim, skills, story, thoughts, trades.
- **Step 5 (lovable characters) is done**: names, nicknames, memories and callbacks, faces, cast tab, follow with notifications, and four new story arcs fed by the newer systems (comeback, run on the bank, gang rise and fall, public disgrace), all tested. The Gazette-style share cards do not yet show faces.

## Known gaps
- **Re-run `npm test` cleanly.** The last full run was polluted (a branch switch during the run broke one file's import; that file passes on its own). Nothing else is known to fail.
- **Re-measure speed** with skills v2, health and thoughts included, and re-run the long run (the one above predates skills v2).
- **Balance:** unemployment ~0% (target 3-7%; a labour shortage), firm founding only ~2.9%/yr, births 5.5 and deaths 2.5 per 1,000/yr (young population; real ~10 and ~9). 3 starvation deaths in the long run (cause not confirmed: may be the new malnutrition death path).
- Construction is a real job now: sites with a builders' firm pay it from escrow with a 20% margin; without one, sites hire a generic local crew. Check that builders' firms actually get founded and survive.
- Not built: mortgage-backed securities, evictions beyond foreclosure, internal migration, taxes on crop income and dividends, superheroes, stream hooks, a fuller UI for fame and health (the character card shows thoughts, skills, attributes, conditions and memories; the Cast tab shows fame).
- Client and worldgen are `@ts-nocheck`; sim method types are loose (`any`). Persistence is positional arrays (brittle). The server has only been tested with one viewer; not deployed.

## Next steps, in order
1. **Verify**: clean `npm test`, speed check, 2-year long run on the final code; fix the balance gaps above (unemployment, founding, births).
2. **Scale prep** (before adding more per-dot depth): index dots by town and by building once per dawn (many dawn jobs filter all dots); typed events instead of string-kind lookups (`EVENT_POST`, `MAP` in thoughts); versioned save records instead of positional arrays; type the sim.
3. **Micro layers, DF/RimWorld style** (the owner's priority): (a) **information held in individual heads** (rumours as items people carry, believe, doubt, distort and pass on; replaces the "share of the country reached" maths in `media.ts`), (b) **real goods and inventories** (stores stock items, factories turn inputs into outputs, prices follow supply and demand; replaces "stores pay abroad for abstract goods"), (c) **households and families** (kids, inheritance, shared budgets, feuds), (d) **relationships with history** (memories of specific events, debts, grudges, crushes), (e) body and needs depth.
4. **Superhero births** (the next unbuilt item from the original plan) (extremely rare, announced nationally, 18 years to grow up; power plus personality gives hero or villain; ties into fame, crime, politics). Also in-world memes.
5. **Stream hooks**: Twitch/YouTube chat commands to name, vote, sponsor, nudge. Clips of key moments, time-lapse and history/graphs. Storyteller **crisis detector**: promote several systems going wrong at once into a front-page arc.
6. **World size and scale**: hierarchical pathing (a graph of routes between towns plus small local fields; full-map distance fields do not scale past ~320x240), then a larger country. Language is not the bottleneck (JS has ~100x headroom at 1,000 dots); if ever needed, put Rust/WASM behind a hot loop, not a rewrite.
7. **Deploy** at a real URL (needed for share cards): process manager plus reverse proxy on a cheap VPS. Then watch recorded sessions and critique them as a viewer would. (The owner asked to leave deploy for last.)

## Working rules and gotchas
- Typecheck (`npx tsc -p .`) before every commit. Run long jobs in the background. Develop on a branch, fast-forward merge to `main` once tests pass. A stop hook asks for commit and push each turn. **Never switch branches while a background test run is going.**
- **Never put a `//` comment mid-line in a long single-line statement**: it comments out the rest of the line. Use `/* */` or a new line.
- **No wages from nowhere**: `payWage` pays nothing for a workplace that is not open for business (it used to pay a full shift from thin air, which leaked money once site crews existed). Site crews are paid from the site's escrow (`buildStep`).
- **Skills and specialisations can recurse**: reading someone's skills needs their workplace's specialisation, and choosing a specialisation must not call back into skills (`pickSpec` reads the founder's skills read-only).
- Tests that depend on a coin flip should retry (e.g. sponsorship deals). Tests that tamper with money must re-baseline.
- Big heredoc shell commands were rejected once by the safety check: write files with the file tool instead.
- Save format is v4; new per-dot fields are optional so old saves still load. Gazette and story archives live under `data/archive/` (gitignored). Determinism: pass `deterministic: true` and a seed to `World`.
