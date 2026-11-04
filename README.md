# Dotville

**A tiny country of dots that builds itself. You just watch.**

Dots farm, trade, fall in love, rob each other, start businesses, go bankrupt, elect mayors and die, all on a
generated island with a capital, towns, villages and countryside. They talk in their own invented language
(with translations for viewers). No LLM, no GPU: about 0.6 ms per 200 ms tick on one CPU core.

## The dream

Dotville should feel like a small real civilization that never stops, something you leave open on a second
monitor the way you'd watch an aquarium, except the fish have grudges, mortgages and dreams.

1. **A world that's alive when you're not looking.** One persistent country on a cheap VPS. Open it any time
   and something has changed: a new town grew, a bakery failed, a bridge got built, two families feuded.
2. **Stories nobody wrote.** Every event comes from simple rules colliding (hunger, money, jealousy, ambition),
   not scripts. The feed and auto-camera surface the juiciest ones; viewers pick favorites and follow them for weeks.
3. **Brains trained from scratch, small enough to run anywhere.** The dots' decisions move from hand-written
   utility AI to a custom-trained policy (imitation, then RL), exported as an int8 ONNX under ~100 MB of RAM.
   Different "minds" can compete: which town thrives under which kind of dot?
4. **A language that grows.** Dots start with a grounded lexicon of about 40 concepts and invented words. Later they
   coin and spread their own words, so towns develop dialects. Viewers learn to read it.
5. **Light viewer meddling, never control.** Gifts, matchmaking, festivals, blight. You nudge fate; the dots
   decide what to do about it.
6. **History you can read.** Years, eras, dynasties, a wiki-style chronicle of the country, replays of famous
   moments, and an archive of every settlement that rose and fell.

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
1. **Balance pass:** hunger spikes at dawn, treasury hoarding, business-founding stats, long-run (100+ day) stability.
2. **Data:** log `(state, action)` from `World.decide()` to JSONL.
3. **Imitation:** train a small MLP on the log and run it behind the same `decide()` interface.
4. **RL:** PPO in a headless copy of the sim with a survive/thrive reward; export int8 ONNX.
5. **Learned speech:** a speech head that picks token sequences while the lexicon stays as grounding.
6. **Growth:** trade between towns by road and sea, guilds, a town-hall vote, regional rivalry, war and disaster.
7. **Chronicle and replay:** persistent history, era summaries, highlight clips.

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
