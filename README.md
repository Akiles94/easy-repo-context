# ctxmap

Lean, always-current, AI-readable context for any repository. It documents only what agents can't cheaply discover by reading code (cross-module flows, gotchas, rationale) and keeps it fresh with hash-based staleness checks.

Design and roadmap: [docs/BRIEF.md](docs/BRIEF.md).

## Status

Milestone 1: inventory and dry-run plan (no LLM, no writes).

```
npm install
npm run dev -- plan /path/to/repo        # or: init /path/to/repo --dry-run
npm run dev -- plan /path/to/repo --json
```

The plan shows existing agent/human docs (never rewritten), real commands with their source file, the files `init` would write (only inside `<!-- ctxmap:begin -->` / `<!-- ctxmap:end -->` blocks), always-loaded token cost before/after, and an LLM token estimate.

## Development

```
npm run typecheck
npm test
npm run build
```
