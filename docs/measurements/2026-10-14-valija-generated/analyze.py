import json, glob, os, sys, collections
S = os.path.dirname(os.path.abspath(__file__))
rows = []
for f in sorted(glob.glob(f"{S}/out/*.json")):
    c, q, r = os.path.basename(f)[:-5].split("-")
    try:
        d = json.load(open(f))
    except Exception as e:
        print("bad", f, e); continue
    mu = d.get("modelUsage", {})
    inp = sum(m.get("inputTokens", 0) + m.get("cacheReadInputTokens", 0) + m.get("cacheCreationInputTokens", 0) for m in mu.values())
    out = sum(m.get("outputTokens", 0) for m in mu.values())
    rows.append(dict(c=c, q=q, r=r, turns=d.get("num_turns"), cost=d.get("total_cost_usd", 0), inp=inp, out=out,
                     secs=d.get("duration_ms", 0) / 1000, err=d.get("is_error"), models=",".join(mu)))
print(f"{'run':10} {'turns':>5} {'in_tok':>9} {'out_tok':>7} {'cost$':>6} {'secs':>5}")
for x in rows:
    print(f"{x['c']}-{x['q']}-{x['r']:3} {x['turns']:>5} {x['inp']:>9} {x['out']:>7} {x['cost']:>6.3f} {x['secs']:>5.0f} {'ERR' if x['err'] else ''} {x['models']}")
print()
agg = collections.defaultdict(list)
for x in rows: agg[(x['q'], x['c'])].append(x)
avg = lambda xs, k: sum(x[k] for x in xs) / len(xs)
conds = sorted({x['c'] for x in rows})
qs = sorted({x['q'] for x in rows})
print("mean input tokens (k) / turns, and delta vs A")
print("q    " + "".join(f"{c:>20}" for c in conds))
tot = {c: 0 for c in conds}
for q in qs:
    base = agg.get((q, "A"))
    line = f"{q:4} "
    for c in conds:
        xs = agg.get((q, c))
        if not xs: line += f"{'-':>20}"; continue
        tot[c] += avg(xs, "inp")
        d = f"{(avg(xs,'inp')/avg(base,'inp')-1)*100:+.0f}%" if base and c != "A" else ""
        line += f"{avg(xs,'inp')/1000:>9.0f}k/{avg(xs,'turns'):<4.1f}{d:>6}"
    print(line)
print("total " + "".join(f"{tot[c]/1000:>13.0f}k{(tot[c]/tot['A']-1)*100:+5.0f}%" for c in conds))
