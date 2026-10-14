# Measurement: generated docs on outline/outline (2026-10-14)

Second repo, chosen to check that valija wasn't a tailored case: [outline/outline](https://github.com/outline/outline) at `83a94a2`, ~1,900 TypeScript source files, someone else's code, and it **already ships a good 223-line `AGENTS.md`** (transactions, validation, presenters, policies). So the baseline is a well-maintained agent setup, and the question is what easy-repo-context adds on top.

## Method
- Questions and the grading key for the feature question were written **before** generating docs ([`questions/`](questions/), [`KEY.md`](questions/KEY.md)).
- Generation: `easy-repo-context prompt init --auto` with Haiku → **$0.087**, 2.6 min, 5 flows (document update, document list, comment create, attachment upload, share create), 14 gotchas, `check` 9/9 fresh. Visual fix hotspots were skipped as intended. Output: [`generated/`](generated/). Outline's own `AGENTS.md` text is untouched; the tool appended its managed block.
- Answering: Claude Code headless, Sonnet 5.5, read-only. **OA** = outline as is (with its own AGENTS.md, auto-loaded), **OG** = OA + generated docs. 2 runs per question, 4 for the feature question. Cost: $3.02.

## Results
| Question | OA (own AGENTS.md) | OG (+ easy-repo-context) | Quality |
|---|---|---|---|
| q1 How does `documents.update` work (documented flow) | 445k tokens / 20 turns | 147k / 8 (**−67%**) | Same key points (updater command, lock/transaction, policy, presenter, collaboration state, events) in ~30% less text; one OG run didn't mention the websocket broadcast |
| q2 How are public shares protected (partly documented) | 247k / 11.5 | 210k / 11.5 (**−15%**) | Equivalent |
| q3 Plan `comments.pin`, visible in real time (n=4) | 163k / 6.2 | 170k / 5.2 (**+4%**) | **4/4 vs 4/4**: both found `saveWithCtx` → event → `WebsocketsProcessor` |
| q4 Theme switching (not documented) | 135k / 7.0 | 140k / 7.5 (**+4%**) | Equivalent |
| **Total** | 990k | 668k (**−33%**) | |

## Findings
1. **Big savings on documented flows** (−67% on q1), as on valija.
2. **No quality gain on the feature question here.** The invariant chosen in advance (persist through `saveWithCtx` so the event reaches websockets) is visible in every neighbouring handler, so agents found it without help; the generated gotchas didn't even cover it. Unlike valija, where the rule lived in one place and agents missed it 3/4 times. Takeaway: the quality win shows up when an invariant is **not** locally visible; when the code repeats the pattern, docs add tokens (+4%), not correctness.
3. **Overhead when docs don't apply stays small** (+4%), consistent with valija.
4. A good existing `AGENTS.md` is complementary, not a substitute: outline's covers conventions; the generated docs cover flows and repo-specific traps (row lock before anchoring comments, draft visibility clauses, S3 presigned signatures).

## Caveats
Small samples (n=2–4), one answering model, questions written by the tool's author (before generation). Directional, not a benchmark.
