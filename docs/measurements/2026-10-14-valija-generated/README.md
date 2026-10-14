# Measurement: generated docs vs hand-written vs none, on valija (2026-10-14)

Follow-up to [the hand-written measurement](../2026-10-14-valija/README.md). Question: do docs **generated** by `ctxmap prompt init` keep the value of hand-written ones?

## Generation
`ctxmap prompt init --auto` run headless on a fresh valija copy with git history ([`run-gen.sh`](run-gen.sh)). The prompt's examples are fictional (billing app) so nothing about valija leaks in.

| Model | Cost | Time | Turns | `ctxmap check` | Output |
|---|---|---|---|---|---|
| Sonnet 5.5 | $0.77 | 2.4 min | 26 | 9/9 fresh, 0 broken | 5 flows, 15 gotchas → [`generated-sonnet/`](generated-sonnet/) |
| Haiku 5.5 | $0.14 | 3.1 min | 27 | 9/9 fresh, 0 broken | 5 flows, 16 gotchas → [`generated-haiku/`](generated-haiku/) |

Both wrote only `.context/`, `AGENTS.md` (27 lines, ~550 tokens always loaded) and a pointer block in `CLAUDE.md`. Flows are 310–440 tokens each. **Both found the critical invariant** (every mutation through `session.write()`, or the lineage bump is skipped and fork detection goes blind), plus several the hand-written docs missed (IPC error contract, copy-verify-then-delete on relocation, `imported` type never saveable, deterministic import ids).

## Answering (same 4 questions, Sonnet 5.5, 2 runs each; A and B from the first measurement)
A = no docs · B = hand-written · S = Sonnet-generated · H = Haiku-generated

| Q | A | B | S | H |
|---|---|---|---|---|
| q1 save flow | 236k / 12.5 turns | 130k / 4.5 (−45%) | 120k / 6.5 (**−49%**) | 161k / 7.5 (−32%) |
| q2 sync/fork | 178k / 8.0 | 131k / 4.5 (−26%) | 118k / 5.0 (**−33%**) | 118k / 5.0 (**−34%**) |
| q3 feature plan | 191k / 5.0 | 165k / 5.0 (−14%) | 279k / 13.5 (**+46%**) | 225k / 12.5 (**+18%**) |
| q4 control (not covered) | 190k / 6.5 | 199k / 8.0 (+5%) | 198k / 9.0 (+4%) | 197k / 8.5 (+4%) |
| **Total input tokens** | 795k | 625k (−21%) | 716k (−10%) | 699k (−12%) |
| **q3 plans using `session.write()`** | **0/2** | 2/2 | **2/2** | **2/2** |

Cost of this round: $0.91 generation + $2.18 answering.

## Findings
1. **Quality holds with generated docs.** Every plan with docs (hand-written or generated, Sonnet or Haiku) avoided the bug that both no-docs plans introduced. Generated plans cited the gotcha explicitly ("Es el gotcha nº 1 de `.context/gotchas.md`") and added a lineage test.
2. **Flow questions are as cheap or cheaper** than with hand-written docs (−32% to −49%).
3. **Feature planning got more expensive (+18% / +46%, ~2.5× turns).** With richer gotchas (15–16 bullets with many refs), the agent verified more of them against code and wrote longer, more thorough plans. Better answers, more tokens. This is the main thing to tune.
4. **Haiku is good enough for generation**: same invariants found, 5.5× cheaper, similar answering results. Default for `init` can be the cheap model, with the stronger model optional.
5. Control question overhead stays small (+4%).

## Next tuning ideas (not yet tested)
- Rank gotchas by impact and cap the always-relevant section; move module-specific ones next to their flow, so the edit hook delivers them at the right time instead of the agent reading all of them up front.
- In `presentation.md`, say "verify only the gotchas relevant to the files you'll touch".

## Caveats
n=2 per cell, one repo, one answering model; q3's extra tokens come with a qualitatively more thorough plan, which this setup doesn't score. Directional, not a benchmark.

## Round 2: two-level gotchas (2026-10-14)
Change: `gotchas.md` split into "Repo-wide" (≤ 8) and "By area"; the AGENTS.md index line and `presentation.md` tell agents to read Repo-wide + only the areas they touch, and to keep plans tight. Regenerated with Haiku ($0.12, 0 broken refs) → [`generated-haiku-tuned/`](generated-haiku-tuned/). q3 re-run to n=4 for A, S and T to reduce noise.

| Q | A | S (Sonnet, flat gotchas) | **T (Haiku, two-level)** |
|---|---|---|---|
| q1 | 236k / 12.5 | 120k / 6.5 (−49%) | 167k / 8.5 (−29%) |
| q2 | 178k / 8.0 | 118k / 5.0 (−33%) | 117k / 4.5 (−34%) |
| q3 (n=4) | 187k / 5.0 | 254k / 12.5 (+36%) | **212k / 9.5 (+13%)** |
| q4 | 190k / 6.5 | 198k / 9.0 (+4%) | 200k / 6.5 (+5%) |
| Total | 791k | 691k (−13%) | 695k (−12%) |

q3 plans using `session.write()` across both rounds: **no docs 1/4**, hand-written 2/2, Sonnet 4/4, Haiku 2/2, Haiku two-level 4/4 → **12/12 with docs**.

Findings: the two-level structure cut the feature-planning overhead from +36% to +13% (turns 12.5 → 9.5) without losing the invariant; q1 varies a lot between runs and doc sets (−29% to −49%). Remaining overhead on q3 is extra exploration that produces longer, more complete plans. Cost of this round: $0.12 generation + ~$1.95 answering.
