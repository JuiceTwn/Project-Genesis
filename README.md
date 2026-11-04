# Dotville

**A tiny country of dots that builds itself. You just watch.**

Dots farm, trade, fall in love, rob each other, start businesses, go bankrupt, elect mayors and die, all on a
generated island with a capital, towns, villages and countryside. They talk in their own invented language
(with translations for viewers). No LLM, no GPU: about 0.6 ms per 200 ms tick on one CPU core.

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
6. **A language that grows.** Dots start with a grounded lexicon of about 40 concepts and invented words. Later
   they coin and spread their own, so towns develop dialects and viewers learn to read them.
7. **History you can read.** Years, eras, a chronicle of the country, and an archive of every settlement that
   rose and fell.

## Try it
- **No server:** open `demo.html` in any browser (runs the sim locally; ⏩ speeds it up).
- **Server:** `npm install && npm start` → http://localhost:3000 (everyone watches the same world).

## What exists today
- **Generated country:** simplex-noise island, rivers and lakes, a capital sited for trade (harbor, river mouth or
  confluence), towns, villages and hamlets spaced by central place theory, A* roads with fords and bridges.
  Each settlement gets a market square, ring road, quay, branch streets and burgage-style plots.
- **Self-growing economy:** businesses with owners, cash, wages and upkeep. They fail (bankruptcy, vacancy, fires),
  get refit, sold or demolished. Entrepreneurs found new ones, builders construct on sites, people immigrate, and
  property is inherited. Mayors tax and fund public works.
- **People:** traits (thief, hothead, gossip, kind, romantic, jealous, coward, ambitious, lazy), dreams, friendships,
  marriage, births, aging and death. Seasons, weather, floating market prices.
- **Language:** about 40 concept tokens mapped to invented words. Dots say true, useful things ("that market is
  empty") and listeners act on them.
- **Viewer layer:** feed, auto-camera, followable dots, Town tab with settlements and business stats.

## Roadmap
1. **Pacing and scale:** slow the day/year clock for ambient viewing, grow the map and population toward thousands of dots, keep the VPS budget.
2. **Balance pass:** hunger spikes at dawn, treasury hoarding, business-founding stats, long-run (100+ day) stability.
3. **Data:** log `(state, action)` from `World.decide()` to JSONL.
4. **Imitation:** train a small MLP on the log and run it behind the same `decide()` interface.
5. **RL:** PPO in a headless copy of the sim with a survive/thrive reward; export int8 ONNX.
6. **Learned speech:** a speech head that picks token sequences while the lexicon stays as grounding.
7. **Growth:** trade between towns by road and sea, guilds, a town-hall vote, regional rivalry, war and disaster.
8. **Chronicle and replay:** persistent history, era summaries, highlight clips.

## Cheap VPS deploy (1 vCPU / 512 MB is plenty)
    git clone … && cd project-genesis && npm install
    # systemd or pm2:  pm2 start server.js --name dotville
    # TLS + websockets: Caddy →   yourdomain.com { reverse_proxy localhost:3000 }
State auto-saves to `data/state.json` every 60 s and on shutdown. Bandwidth is about 8 KB/s per viewer
(binary positions at 5 Hz), so 100 viewers is roughly 1 MB/s.

## How it's built
- `public/worldgen.js`: terrain, hydrology, site scoring, settlement hierarchy, roads and town layout.
  `Gen.expand()` is reused at runtime so towns keep growing.
- `public/sim.js`: world, needs, economy, language, chat. Runs in Node and the browser.
  `World.decide()` is the brain: a utility AI today, the swap point for the trained policy.
- `server.js`: websocket server. Binary frames for positions (15-byte header), JSON deltas for events,
  buildings (`bld`) and tiles (`tiles`).
- `public/index.html`: canvas client (terrain, buildings, dots, bubbles, camera).
- `bench.js`: headless run for tuning (`node bench.js 40` for 40 days). `node build-demo.js` rebuilds `demo.html`.
