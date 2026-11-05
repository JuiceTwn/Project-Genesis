# Deploying Dotville on a VPS

1 vCPU / 1 GB RAM is plenty (measured: 150 viewers at a steady 5 Hz, ~50% of one core, ~270 MB).

```sh
# on the server (Debian/Ubuntu), as root
apt install -y nodejs npm caddy git
useradd -r -m -d /opt/dotville dotville
sudo -u dotville git clone https://github.com/juicetwn/project-genesis /opt/dotville
cd /opt/dotville && sudo -u dotville npm ci && sudo -u dotville npm run build
cp deploy/dotville.service /etc/systemd/system/    # edit PUBLIC_URL, paths
cp deploy/Caddyfile /etc/caddy/Caddyfile            # edit YOUR.DOMAIN
systemctl enable --now dotville caddy
echo '* * * * * root /opt/dotville/deploy/healthcheck.sh' > /etc/cron.d/dotville-health
```

First boot on a new world runs a headless warm-up (`WARMUP_DAYS`, default 3, about 30 s) so viewers never see the day-1 start-up flood. After that the world loads from `data/state.json`.

## Environment
| var | default | meaning |
|---|---|---|
| `PORT` | 3000 | listen port |
| `DOTVILLE_ROOT` | cwd | holds `public/` and `data/` |
| `PUBLIC_URL` | from request | absolute links in share cards |
| `TRUST_PROXY` | off | set behind Caddy/nginx so per-IP limits use `X-Forwarded-For` |
| `MAX_CLIENTS` / `MAX_PER_IP` | 400 / 12 | connection caps |
| `ACT_GAP_MS` | 4000 | min gap between one IP's viewer actions (gift, zap, cupid, festival) |
| `WARMUP_DAYS` | 3 | headless warm-up for a brand-new world (0 = none) |

## Saves and recovery
- Autosave every 60 s plus on shutdown; atomic (temp file, fsync, rename).
- A rotating backup is taken about every 10 minutes: `data/state.1.json` (newest) through `state.6.json`.
- On boot the newest valid file wins; a corrupt `state.json` falls back to the next backup automatically.
- Back up `data/` off-box nightly (the archive of issues and stories lives in `data/archive/`).
- If the sim throws repeatedly the process exits without saving (state may be half-updated) and systemd restarts it from the last good save.
- `/health` returns 503 if the tick loop has stalled for 10 s; `deploy/healthcheck.sh` acts on that.
