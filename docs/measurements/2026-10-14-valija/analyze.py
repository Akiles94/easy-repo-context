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
print(f"{'q':4} {'A turns':>8} {'B turns':>8} {'A in':>9} {'B in':>9} {'Δin':>6} {'A $':>6} {'B $':>6} {'Δ$':>6} {'A s':>5} {'B s':>5}")
tot = {"A": [0, 0], "B": [0, 0]}
for q in sorted({x['q'] for x in rows}):
    a, b = agg.get((q, "A"), []), agg.get((q, "B"), [])
    if not a or not b: continue
    for c, xs in (("A", a), ("B", b)): tot[c][0] += avg(xs, "inp"); tot[c][1] += avg(xs, "cost")
    d = lambda k: (avg(b, k) - avg(a, k)) / avg(a, k) * 100
    print(f"{q:4} {avg(a,'turns'):>8.1f} {avg(b,'turns'):>8.1f} {avg(a,'inp'):>9.0f} {avg(b,'inp'):>9.0f} {d('inp'):>5.0f}% {avg(a,'cost'):>6.3f} {avg(b,'cost'):>6.3f} {d('cost'):>5.0f}% {avg(a,'secs'):>5.0f} {avg(b,'secs'):>5.0f}")
if tot["A"][0]:
    print(f"total in_tok A={tot['A'][0]:.0f} B={tot['B'][0]:.0f} ({(tot['B'][0]/tot['A'][0]-1)*100:+.0f}%), cost A=${tot['A'][1]:.2f} B=${tot['B'][1]:.2f} ({(tot['B'][1]/tot['A'][1]-1)*100:+.0f}%)")
