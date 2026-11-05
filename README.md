# Dotville

**A tiny country of dots that builds itself. You just watch.**

Dots farm, trade, fall in love, rob each other, start businesses, go bankrupt, elect mayors and die, all on a
generated island with a capital, towns, villages and countryside. They talk in plain English, generated from what is actually true about them. No LLM, no GPU: about 0.6 ms per 200 ms tick on one CPU core.

## The dream

One country. One persistent world. Always on. Anyone can drop in at any moment, watch for five minutes or an
hour, and leave. Nobody has a "save file" or a session; the world just keeps going, and what you see is whatever
is happening now. It's a window, not a game: slow, ambient and calming, closer to a living map than an arcade.

1. **Large and unhurried.** A big country (the long-term target is thousands of dots across many towns), with a
   slow pace: a dot's day takes minutes of real time, a year takes real days, and a town takes weeks to grow.
   Nothing is rushed or flashy. You can watch someone walk to the bakery.
2. **Alive when you're not looking.** Open it any time and something has changed: a new town grew, a bakery
   failed, a bridge got built, two families feuded. No catching up, no login, no waiting room.
3. **Stories nobody wrote.** Everything comes from simple rules colliding (hunger, money, jealousy, ambition).
   The feed and auto-camera surface the interesting moments gently; viewers pick a dot or a family and follow
   them over days.
4. **Light meddling only.** A viewer can gift a coin, nudge two dots together, or ask for a festival, all on long
   shared cooldowns. It's a nudge to fate, never control, and the world never depends on viewers to function.
5. **Brains trained from scratch, small enough to run anywhere.** Decisions move from hand-written utility AI to
   a custom-trained policy (imitation, then RL), exported as an int8 ONNX under ~100 MB of RAM, running on a
   cheap VPS.
6. **Speech that means something.** Dots talk in English built from real state (their thoughts, memories, job, family, grudges, the weather), in a voice shaped by their traits, with a verbal tic you learn to recognise. Later: lines that change what listeners believe, and slang that spreads between towns.
7. **History you can read.** Years, eras, a chronicle of the country, and an archive of every settlement that
   rose and fell.

## Try it
- **No server:** open `demo.html` in any browser (runs the sim locally; ⏩ speeds it up).
- **Server:** `npm install && npm start` → http://localhost:3000 (everyone watches the same world).
  `npm start` builds first; `demo.html` is rebuilt by `npm run build`.

## What exists today
- **A whole country:** a 320x240-tile continent (broad terrain, mountain range, big lakes, rivers) with 1 capital,
  9 towns, 26 villages and 40 hamlets spaced tens of tiles apart, linked by A* roads with fords and bridges. Each
  settlement gets a market square, ring road, quay, branch streets and burgage-style plots. About 1,800 dots at start.
- **Government at every level:** each settlement elects its own mayor (own tax rate, treasury, feasts, relief,
  public works, scandals). A national treasury takes 15% of local taxes and pays for bridges and emergency grants
  to towns whose markets run dry.
- **Self-growing economy:** farms, markets, taverns, workshops and docks plus offices, factories and stores sized to each
  town's population. Employers pay wages out of their own till: a firm that can't cover payroll sends workers home
  unpaid and loses them after three missed shifts, and towns pay unemployment benefit. Businesses with owners, cash, wages and upkeep. They fail (bankruptcy, vacancy, fires),
  get refit, sold or demolished. Entrepreneurs found new ones, builders construct on sites, people immigrate, and
  property is inherited.
- **People:** traits (thief, hothead, gossip, kind, romantic, jealous, coward, ambitious, lazy), dreams, friendships,
  marriage, births, aging and death. Seasons, weather, floating market prices.
- **Language:** English, no LLM. Systems say what they mean as a dialogue act; `src/sim/speech.ts` turns it into a sentence using variants picked by time of day, weather, mood, age, traits and how well speaker and listener know each other, plus a per-person verbal tic and no recent repeats. Chats are about something true: a fresh thought ("It's over between us"), a shared memory, work, family, a mutual acquaintance, the mayor's tax, the weather.
- **Viewer layer:** feed, auto-camera, followable dots, Town tab with per-settlement mayors and budgets.

## Roadmap
1. **Modern economy:** salaries paid by employers (so firms can fail to make payroll), rent and mortgages,
   supermarkets, offices, factories, a bank with loans, utilities, cars and buses, unemployment, a national budget.
2. **Storyteller:** a Rimworld-style director that watches the world and nudges it toward interesting arcs
   (rivalries, scandals, closures, floods, feuds, rags-to-riches), plus a chronicle of eras and a readable history.
3. **Balance:** keep the world stable for 100+ days (`npm run report`), tone down violence, no dawn hunger spikes.
4. **Pacing and scale:** slow the day/year clock for ambient viewing, grow toward thousands of dots.
5. **Data → imitation → RL:** log `(state, action)` from `World.decide()`, train a small policy in Python, export int8 ONNX.
6. **Learned speech**, **trade by road and sea**, **guilds, wars, disasters**, **replay and highlight clips**.

## Cheap VPS deploy (1 vCPU / 512 MB is plenty)
    git clone … && cd project-genesis && npm install && npm run build
    # systemd or pm2:  pm2 start dist/server.js --name dotville
    # TLS + websockets: Caddy →   yourdomain.com { reverse_proxy localhost:3000 }
State auto-saves to `data/state.json` every 60 s and on shutdown. Frames are interest-based: each viewer reports its viewport and gets only the dots on screen (about 1.3 KB/s zoomed in)
or a coarse density grid when zoomed out (about 6 KB/s), instead of every dot (about 50 KB/s). 100 viewers is well under 1 MB/s.

## How it's built
TypeScript for the sim, worldgen, server and client; Python for offline tuning and (later) model training.

    src/shared/    constants, types, seeded RNG, small utils
    src/worldgen/  terrain, hydrology, settlements, roads, town layout (seeded, deterministic)
    src/sim/       World + one module per system: people, buildings, economy, government, brain (decide),
                   activity, social, crime, lexicon, viewer actions, output/protocol, persistence, tick
    src/server/    websocket server (binary position frames + JSON events), static files, autosave
    src/client/    canvas client; demo.ts bundles the sim in for the no-server demo
    src/tools/     bench (headless run, JSONL log), map (worldgen PNG preview)
    ml/            Python: balance_report.py now; imitation/PPO training and ONNX export later
    tests/         node:test regression tests (determinism, invariants, save/load)

Commands: `npm run build` (client + demo.html + server bundle), `npm start`, `npm run dev`, `npm test`,
`npm run typecheck`, `npm run bench -- 40 --seed 7 --json ml/out/run.jsonl`, `npm run report ml/out/run.jsonl`,
`npm run map -- 1337 map.png`.
