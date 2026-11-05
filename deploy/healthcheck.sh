#!/bin/sh
# Cron it every minute; restarts the world if the tick loop has stalled (or the port is dead).
curl -fsS -m 5 http://127.0.0.1:${PORT:-3000}/health >/dev/null || systemctl restart dotville
