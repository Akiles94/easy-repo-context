# Measurement: hand-written ctxmap docs on valija (2026-10-14)

Goal: check the core hypothesis before building generation. Do lean flow docs + gotchas reduce tokens/turns **without hurting answer quality**?

## Setup
- Repo: `Akiles94/valija` (~5.6k lines TS without tests, 308 source files), shallow clone at the commit of 2026-10-14.
- **A** = repo as-is (already has a 97-line `CLAUDE.md`, `.claude/` agents/hooks, `docs/`).
- **B** = A + hand-written docs in [`reference-docs/`](reference-docs/): `AGENTS.md` (managed block), `.context/overview.md`, `gotchas.md`, `presentation.md`, 4 flows, plus a managed pointer `@AGENTS.md` appended to `CLAUDE.md`. Total ≈3.1k tokens; always loaded ≈600 tokens.
- Agent: Claude Code headless (`claude -p`), Sonnet 5.5, read-only tools, isolated session ([`run.sh`](run.sh)). 4 questions × 2 conditions × 2 repetitions = 16 runs ([`batch.sh`](batch.sh)).
- Questions ([`questions/`](questions/)), in Spanish:
  1. How saving context from an MCP client works and when data is encrypted (covered by `flows/save-context.md`).
  2. How a two-device conflict is detected and handled (covered by `flows/sync-handoff.md`).
  3. Plan an `archive_context` MCP tool, no edits (feature planning; relies on gotchas).
  4. Control: how the recovery kit is generated at `valija init` (**not** covered by the docs).
- Metrics: total input tokens (incl. cache reads/writes, all models), turns, cost, wall time. Answers in [`answers/`](answers/), raw table in [`raw-results.txt`](raw-results.txt).

## Results (mean of 2 runs)

| Q | Turns A → B | Input tokens A → B | Δ tokens | Quality A | Quality B |
|---|---|---|---|---|---|
| q1 save flow | 12.5 → 4.5 | 236k → 130k | **−45%** | correct | correct, more concise |
| q2 sync/fork | 8.0 → 4.5 | 178k → 131k | **−26%** | correct (1 run missed device-local state) | correct, complete |
| q3 feature plan | 5.0 → 5.0 | 191k → 165k | −14% | **2/2 plans skip `session.write()`** → no lineage bump → breaks fork detection | **2/2 plans use `session.write()`**, test lineage bump, flag the "5 tools" spec limit |
| q4 control | 6.5 → 8.0 | 190k → 199k | **+5%** | correct | correct |
| **Total** | | 795k → 625k | **−21%** | | |

Cost moved less (−17%) and is noisy: it depends on prompt-cache hits, not only on volume.

## Findings
1. **The biggest win is quality, not tokens.** Without `gotchas.md`, both baseline plans for q3 would have introduced a real bug (mutation outside `session.write()` skips the lineage bump; sync fork detection silently breaks). Code reading alone did not surface the invariant; the doc did.
2. **Flow questions get cheaper and faster:** −26% to −45% tokens, roughly half the turns.
3. **When docs don't help, they cost a little** (+5% tokens, +1.5 turns on q4) — the agent reads the index and sometimes a doc before going to code. Consistent with the ETH finding: keep the always-loaded part tiny.
4. **Hand-writing produced one wrong ref** (`VALIJA_WRITE_GOLDEN_VAULT` attributed to the wrong file). Generated docs will do worse; `check` must validate refs (file + symbol) from day one.
5. With docs present, the agent proposed updating `.context/` as part of the change. Good for freshness; `presentation.md`/AGENTS block should say so explicitly.

## Implications for ctxmap
- `gotchas.md` is the highest-value artifact: the init prompt must hunt for invariants (write paths, transactions, things "every X must go through Y", spec limits), not just describe flows.
- Keep the AGENTS block as an index only; flows loaded on demand.
- `check` validates refs (milestone 2) before any LLM generation work.
- Use [`reference-docs/`](reference-docs/) as the gold example in generation prompts and as the target to compare generated docs against (e.g. Haiku vs Sonnet for `init`).

## Caveats
n=2 per cell, one repo, one model, questions written by the person who wrote the docs. Directionally clear on q1–q3; not a benchmark. To reproduce: copy the repo to `A/` and `B/` next to the scripts, add `reference-docs/` to `B/`, run `batch.sh`, then `analyze.py` (reads `out/*.json`).
