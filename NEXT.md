# Dotville: what's next (handoff)

Read this first in a fresh session. It is the state of the project, the decisions made, what is verified, and the next steps in order.
Repo: `juicetwn/project-genesis`, branch `main`. Everything below is merged and the full test suite passes (23/23).

## The vision (from the owner)
A small country (about 1-5k people), fully simulated and **real in its numbers**, always on, free to watch, interactive, stream-friendly and memeable.
Realistic ratios and real USD scale; the entertainment comes from ordinary systems colliding. There should always be dozens of interesting
people and events on screen. No hybrid or million-person world is needed. Deep capitalism: companies and brands that rise and fall (a new firm can
become the next household name), banks that can fail, celebrities and influencers, rare "improbable" superheroes announced at birth.

## Clock and money (decided, in `src/shared/reality.ts`)
- 1 sim day = 15 real minutes (4,500 ticks at 5 Hz). 1 year = 60 days (15 real hours). Month = 5 days, season = 15 days. A life is ~80 years = ~50 real days.
- Median income $50k/yr = $833/sim day. Because a year is 6x shorter than a real one, day-sized amounts look ~6x inflated while annual and monthly
  figures are real (rent $1,400/month, house $275k, a median earner pays ~25% tax). Show money to viewers as monthly/annual figures where possible.
- `KB` scales old coin thresholds to dollars; `TS` (3.75) scales legacy per-tick rates and durations. Change the clock by editing `reality.ts` only.
- Money is **conserved**. It only moves between accounts, or crosses the border via `fromAbroad`/`toAbroad` (exports, imports, upkeep, goods, bills,
  maintenance, materials, migrants) or is printed by `mint()`. `tests/money.test.ts` asserts supply = start + minted + inflow - outflow.

## Layout
- `src/shared/`: constants, `reality.ts` (clock, prices, wages, costs), types, util (seeded RNG), `gazette.ts` (data types plus HTML/SVG renderers shared by server and client).
- `src/worldgen/`: terrain, rivers, settlements, roads (`@ts-nocheck`, to be typed). `src/sim/config.ts` sets the country size (320x240, 9 towns, 26 villages, 40 hamlets).
- `src/sim/`: `World` plus one module per system: people, buildings, economy (payroll, firms, founding, restock), government (mayors, national treasury, benefits),
  brain (decide), activity, social, crime, lexicon, viewer, output (protocol, viewport frames), persist, tick, helpers, money/ledger, personality (33 traits, conflicts,
  synergies), character (trait shifts), storyteller (arcs, tension, chronicle), gazette (daily newspaper), housing (rent, landlords, property tax), consumer (budgets, shopping).
- `src/server/`: websocket server, `archive.ts` (issues/stories on disk), `pages.ts` (permalinks, JSON, sitemap), `cards.ts` (PNG share cards via resvg + bundled fonts).
- `src/client/`: canvas client (`@ts-nocheck`) with Feed / Town / Stories / Gazette tabs; `demo.ts` bundles the sim for the no-server demo.
- `src/tools/`: `bench`, `map`, `gazette` (preview issues), `reality` (scorecard vs real benchmarks), `longrun` (multi-year sampler).
- `ml/`: `balance_report.py`, `long_report.py` (Python trend checks); later the imitation/PPO training pipeline. `tests/`: node:test suites.

## Commands
`npm run build | start | dev | typecheck | test` (test takes ~3-5 min; run it in the background).
`npm run reality -- 14 1800` (scorecard, ~5 min), `npm run longrun -- 2 1000 ml/out/long.jsonl` (2 sim years, ~18 min) then `npm run longreport ml/out/long.jsonl`,
`npm run gazette -- 8`, `npm run map -- 1337 map.png`. Env: `PUBLIC_URL` (absolute links in share tags), `DOTVILLE_ROOT`, `PORT`.

## Where it stands (measured)
- Reality scorecard at the dollar-economy merge: 15 of 18 metrics in real-world ranges (lifespan 80, pay 0.89x of the $833 target day, 7.7 h worked,
  house = 6.2x yearly pay, tax 25%, wealth Gini 0.75, top 1% 30%, firms per 100 ~9, crime 1.2 per 100/yr). Real-world benchmark figures are **from memory**: verify before trusting.
- Long run, 2 sim years at 1,000 people (before the 10x founding change): money supply growth +11.5%/yr and slowing (it was +47%), firm failures 11.5%/yr (real 8-12%),
  births 10.5 per 1,000, population +1.9%/yr, Gini 0.76, top 1% 32%, zero starvation. Firm founding was only 0.8%/yr, so it was raised 10x (not yet re-measured).
- Gazette, permalinks, share cards, archive, storyteller (6 arc types), personality system, per-viewer viewport frames: all working and tested.

## Known gaps
- Re-run the long run to measure the 10x founding rate (firm count slid 205 to 164). Money growth is a little above the 8%/yr target. Unemployment ~0% (labour
  shortage; the target is 3-7%) and ~16-20 firms per 100 people against ~9 real. Deaths are low (young population); births were 9-10 per 1,000.
- One unexplained cluster of 13 starvation deaths at year 2.35 in an early long run (none in later runs). Investigate if it reappears.
- Not built: mortgages, evictions (arrears are tracked), internal migration (rural jobless moving to towns), taxes on crop income and dividends.
- Client and worldgen are `@ts-nocheck`; sim method types are loose (`any`). The server has only been tested with one viewer; not deployed.

## Next steps, in order
1. **Verify founding**: run the 2-year long run, check the firm count stabilises and failures stay ~8-12%. Tune `m` in `economy.ts entrepreneurs()` if needed.
2. **Items, gear, supply chain**: dots carry things (slots: clothes, coat, tool, bag; quality, wear, brand). Coat cuts winter illness, bag/money belt limits what thieves get, tools
   raise output, clothes affect standing. Factories produce goods, stores stock and sell at real prices, imports fill gaps. Extend `consumer.ts` (stores currently sell abstract goods).
3. **Companies and brands as entities** (not buildings): name, quality, price, cash, branches, marketing, founder. People choose by price, quality and awareness (word of mouth through
   the dialogue system plus advertising). Startups can overtake incumbents; incumbents decay (complacency, scandals, price wars). Mergers, acquisitions, bankruptcy. Gazette business pages.
4. **Bank**: takes savings and lends to firms and households; interest moves from borrowers to savers; defaults hit the bank; runs and failures. Must stay conserved (lend only what it holds).
5. **Lovable characters**: pronounceable and funnier names, nicknames earned from events, procedural faces, follow/adopt a dot with notifications, a "cast" page, memory and callbacks, more arc types.
6. **Social media, celebrities, influencers** (fame as a computed score, viral posts through the friend graph, in-world memes), and **superhero births** (extremely rare, announced
   nationally, 18 years to grow up; power plus personality gives hero or villain).
7. **Stream hooks**: Twitch/YouTube chat commands to name, vote, sponsor, nudge. Clips of key moments, time-lapse and history/graphs.
8. **World size and scale**: windowed local pathfinding plus routes between towns (full-map distance fields use too much memory above ~320x240), then a larger country.
9. **Deploy** at a real URL (needed for share cards): process manager plus reverse proxy on a cheap VPS. Then watch recorded sessions and critique them as a viewer would.

## Working rules and gotchas
- Typecheck (`npx tsc -p .`) before every commit. Run long jobs with `run_in_background`. Develop on a branch, fast-forward merge to `main` once the tests pass. A stop hook asks for commit and push each turn.
- **Never put a `//` comment mid-line in a long single-line statement**: it comments out the rest of the line (this broke thefts and wages; the scorecard caught both). Use `/* */` or a new line.
- Big heredoc shell commands were rejected once by the safety check: write files with the file tool instead.
- Save format is v4; older saves are ignored. Gazette and story archives live under `data/archive/` (gitignored). Determinism: pass `deterministic: true` and a seed to `World`.
