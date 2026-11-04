#!/usr/bin/env python3
"""Balance report for a Dotville bench run.

    npm run bench -- 60 --json ml/out/run.jsonl
    python3 ml/balance_report.py ml/out/run.jsonl

Reads the half-day samples written by the bench tool, prints trends and checks them
against stability targets. Standard library only; exits non-zero if a check fails so it
can gate CI or an automated tuning loop.
"""
import json, sys, statistics as st

# (name, extractor, predicate, human target)
CHECKS = [
    ("starvation rate (peak, % of pop)", lambda r: 100 * r["starving"] / max(1, r["pop"]), lambda v: v <= 8, "<= 8%"),
    ("mood (mean)", lambda r: r["mood"], lambda v: v >= 80, ">= 80"),
    ("food stock min (end)", lambda r: r["stockMin"], lambda v: v >= 20, ">= 20"),
    ("theft+fight per capita per day", None, None, "reported only"),
]

def load(path):
    with open(path) as f:
        return [json.loads(l) for l in f if l.strip()]

def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    rows = load(sys.argv[1])
    if not rows:
        sys.exit("no samples")
    first, last = rows[0], rows[-1]
    days = max(1, last["day"] - first["day"])
    print(f"{len(rows)} samples over {days} days; pop {first['pop']} -> {last['pop']}")
    for k in ("opened", "closed", "built", "sold", "fires", "arrived"):
        print(f"  biz.{k:8s} {last['biz'][k]}")
    print(f"  crime/capita/day: {(last['thefts'] + last['fights']) / max(1, last['pop']) / days:.3f}")
    print(f"  births/deaths: {last['born']}/{last['died']}")
    tre = [r["treasury"] for r in rows]
    print(f"  treasury min/median/max: {min(tre)}/{int(st.median(tre))}/{max(tre)}")
    bad = 0
    print("checks:")
    for name, fx, ok, target in CHECKS:
        if fx is None:
            continue
        vals = [fx(r) for r in rows]
        worst = max(vals) if "starvation" in name else min(vals)
        passed = ok(worst)
        bad += not passed
        print(f"  [{'ok' if passed else 'FAIL'}] {name}: worst {worst:.1f} (target {target})")
    sys.exit(1 if bad else 0)

if __name__ == "__main__":
    main()
