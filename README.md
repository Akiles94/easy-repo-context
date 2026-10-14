# ctxmap

Lean, always-current, AI-readable context for any repository. It documents only what agents can't cheaply discover by reading code (cross-module flows, gotchas, rationale) and keeps it fresh with hash-based staleness checks.

Design and roadmap: [docs/BRIEF.md](docs/BRIEF.md).

## Status

Milestones 1–2: inventory/plan, and doc freshness (no LLM yet). See the roadmap in [docs/BRIEF.md](docs/BRIEF.md).

```
ctxmap plan [path]              # what init would write; existing docs, real commands, token estimate
ctxmap check [path]             # validate refs in .context/ docs + AGENTS.md block; exit 1 on broken refs
ctxmap check [path] --external  # also list broken file refs in existing docs (README, docs/, ...)
ctxmap stamp [path] [doc...]    # mark docs verified: record source hashes in .context/manifest.yaml
ctxmap hooks install [path]     # git pre-commit check + Claude Code edit hook
```

Refs are code spans in docs: `src/a.ts`, `src/a.ts:Class.method()`, `src/a.ts:42`, `package.json#scripts.test`. A doc is **broken** when a ref no longer resolves (fails `check`), **changed** when a referenced file changed since it was stamped (warning; fails with `--strict`), **unstamped** when it isn't in the manifest yet.

The Claude Code hook runs before Edit/Write: when the file is covered by a doc, the agent gets the covering docs and the gotchas that reference that file, once per file per session.

Measurement on a real repo (−21% tokens, fewer turns, gotchas prevented a real bug): [docs/measurements/2026-10-14-valija](docs/measurements/2026-10-14-valija/README.md).

During development: `npm run dev -- <command> ...`.

## Development

```
npm run typecheck
npm test
npm run build
```
