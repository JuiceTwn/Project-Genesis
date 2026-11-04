# Dotville

A shared 2D world of 300 dots who sleep, farm, trade, drink, make friends and gossip — in their own
little language (with translations for viewers). No LLM, no GPU: the whole sim costs ~0.15 ms per
200 ms tick.

## Try it
- **No server:** open `demo.html` in any browser (runs the sim locally; ⏩ button speeds it up).
- **Server:** `npm install && npm start` → http://localhost:3000 (everyone watches the same world).

## Cheap VPS deploy (1 vCPU / 512 MB is plenty)
    git clone … && cd dotville && npm install
    # systemd or pm2:  pm2 start server.js --name dotville
    # TLS + websockets: Caddy →   yourdomain.com { reverse_proxy localhost:3000 }
State auto-saves to `data/state.json` every 60 s and on shutdown, so restarts keep the world alive.
Bandwidth: ~8 KB/s per viewer (binary positions, 5 Hz). 100 viewers ≈ 1 MB/s.

## What happens in town
Every dot has 1–2 traits (thief, hothead, gossip, kind, romantic, jealous, coward, ambitious, lazy) and a dream
(get rich, have 8 friends, find love). Thieves rob, witnesses gossip, victims fight back, known thieves get shunned.
Dots fall in love, get rejected, marry, get jealous, break up, have babies, grow up, and die (old age, or hunger
if the food runs out). A narrator feed logs it all, and the 🎥 auto-camera cuts to the juiciest moments.
Viewers can 🎁 gift, 💘 cupid, ⚡ zap the selected dot, or trigger a 🎉 festival / 🥀 blight (global cooldowns).

## Civilization layer
Four seasons (2 in-game days each): spring planting, summer growth, autumn harvest (big yields), winter scarcity (hungrier,
low yields). Rain and snow slow everyone down. Market prices float with stock, so farmers chase high prices and the poor
get squeezed. Families carry surnames; kids grow up, get jobs, marry, and eventually die. Every 6 days there's a mayor
election (rep + friendship decide it); the mayor sets taxes, buys emergency grain, hands out relief, funds feasts and
projects — and a thief-mayor might skim the treasury and cause a scandal.

## How it's built
- `public/sim.js` — world, needs, economy, language, chat. Runs in Node *and* the browser.
  `World.decide()` is the "brain": today a utility-AI; this is the function to replace with a trained policy.
- Language: ~40 concept tokens, each mapped to an invented word. Dots say things that are *true and useful*
  ("Zivo Market has no food" → listener avoids it; "you and me go park" → both go). The client shows the
  invented words with an English gloss.
- `server.js` — ws server; binary frames for positions, small JSON for events.
- `bench.js` — headless sim run for tuning (`npm run bench`).

## Next steps
1. Log `(state, action)` from `decide()` to JSONL → imitation-learn a small MLP → run it in `decide()`.
2. Then RL (PPO) in a headless copy of the sim with a survive/thrive reward.
3. Let dots pick their own word-token sequences (learned speech head) while the lexicon stays as the grounding.
4. Birth, aging, jobs changing, a town hall with votes, weather.


## v3: generated country + self-growing economy
- `public/worldgen.js`: simplex-fBm island → priority-flood rivers/lakes → site scoring (harbor, river mouth/confluence, ford, fertility, defensibility) → capital near trade water → Christaller towns/villages/hamlets (rank-size populations) → A* roads with ford/bridge crossings → per-settlement market square, ring road, quay, branch streets and burgage-style plots. `Gen.expand()` is reused at runtime so towns keep growing.
- `sim.js`: businesses have owners, cash, wages, upkeep; they fail (bankruptcy, vacancy, fires), get refit/sold/demolished; entrepreneurs found new ones; builders construct on sites; immigration, inheritance, mayor public works.
- Protocol: 15-byte frame header + `bld`/`tiles` JSON deltas; init carries terrain (wk, elevation).
- Build the single-file demo: `node build-demo.js`.
