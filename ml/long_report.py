#!/usr/bin/env python3
"""Trend report for a long Dotville run (see src/tools/longrun.ts).

    python3 ml/long_report.py ml/out/long.jsonl

Prints yearly checkpoints and flags drift: population, money supply growth (inflation), unemployment,
inequality, firm churn, starvation. Standard library only; exit code 1 if a stability check fails.
"""
import json
import statistics as st
import sys


def load(path):
    with open(path) as f:
        return [json.loads(line) for line in f if line.strip()]


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    rows = load(sys.argv[1])
    if len(rows) < 3:
        sys.exit("need at least 3 samples")
    span = rows[1]["year"] - rows[0]["year"]
    years = rows[-1]["year"] - rows[0]["year"] + span
    print(f"{len(rows)} samples over {years:.2f} sim years\n")
    print(f"{'year':>5} {'pop':>6} {'jobless%':>8} {'supply$M':>9} {'meal$':>6} {'firms':>6} {'founded':>8} {'failed':>7} {'gini':>5} {'top1%':>6} {'births':>7} {'deaths':>7}")
    step = max(1, len(rows) // 10)
    shown = rows[::step]
    if shown[-1] is not rows[-1]:
        shown.append(rows[-1])
    for r in shown:
        print(f"{r['year']:>5} {r['pop']:>6} {r['jobless']:>8} {r['supply'] / 1e6:>9.1f} {r['meal']:>6} {r['firms']:>6} {r['founded']:>8} {r['failed']:>7} {r['gini']:>5} {r['top1']:>6} {r['births']:>7} {r['deaths']:>7}")
    first, last = rows[0], rows[-1]
    yrs = max(0.01, last["year"] - first["year"])
    pop_g = (last["pop"] / first["pop"]) ** (1 / yrs) - 1
    sup_g = (last["supply"] / first["supply"]) ** (1 / yrs) - 1
    births = sum(r["births"] for r in rows)
    deaths = sum(r["deaths"] for r in rows)
    starved = sum(r["starved"] for r in rows)
    failed = sum(r["failed"] for r in rows)
    founded = sum(r["founded"] for r in rows)
    avg_firms = st.mean(r["firms"] for r in rows)
    avg_pop = st.mean(r["pop"] for r in rows)
    print(f"\npopulation growth/yr: {100 * pop_g:+.1f}%   money supply growth/yr: {100 * sup_g:+.1f}%   (minted by govt: {last['minted']})")
    print(f"births {1000 * births / years / avg_pop:.1f}/1000/yr, deaths {1000 * deaths / years / avg_pop:.1f}/1000/yr, starvation deaths {starved}")
    print(f"firms: founded {founded}, failed {failed} => failure rate {100 * failed / years / avg_firms:.1f}%/yr (real ~8-12%), founding {100 * founded / years / avg_firms:.1f}%/yr")
    print(f"unemployment: first {first['jobless']}% -> last {last['jobless']}% (mean {st.mean(r['jobless'] for r in rows):.1f}%)")
    print(f"inequality: gini {first['gini']} -> {last['gini']}, top1% {first['top1']} -> {last['top1']}")
    print(f"national treasury ${last['nation']:,}   trade flows: {last['flow']}")
    checks = [
        ("population stays within -3%..+4% a year", -0.03 <= pop_g <= 0.04),
        ("money supply grows < 8% a year (no runaway inflation)", sup_g < 0.08),
        ("no starvation deaths", starved == 0),
        ("unemployment stays under 15%", max(r["jobless"] for r in rows) < 15),
        ("firms are both founded and failing", failed > 0 and founded > 0),
        ("food never fully runs out (min stock > 0 in 90% of samples)", sum(r["stockMin"] > 0 for r in rows) >= 0.9 * len(rows)),
    ]
    print("\nchecks:")
    bad = 0
    for name, ok in checks:
        bad += not ok
        print(f"  [{'ok' if ok else 'FAIL'}] {name}")
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
