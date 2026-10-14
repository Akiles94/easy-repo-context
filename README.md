# easy-repo-context

**Your AI agent reads the code. This tells it what the code doesn't say.**

`easy-repo-context` gives AI coding agents (Claude Code, Codex, Cursor, Gemini CLI, anything that reads `AGENTS.md`) the context they can't get cheaply from reading code: how behavior flows across modules, the invariants that break silently, and where things live. It keeps that context honest as the code changes, using git and no LLM for the checking.

## Why
Measured on a real TypeScript repo (16–30 headless agent runs per round, small samples, details in [`docs/measurements/`](docs/measurements/)):

- Asked to plan a small feature, the agent **without** context introduced the same silent sync-breaking bug in 3 of 4 plans. **With** context (hand-written or generated): **0 of 12**.
- "How does X work" questions: **26–49% fewer tokens**, about half the turns.
- Keeping docs current across 150 real commits: **$0.018** with a small model.

Generic, auto-generated docs that repeat what code already says make agents slower and more expensive. This tool documents only what isn't discoverable, keeps the always-loaded part to ~25 lines, and loads the rest on demand.

## What you get
```
AGENTS.md              # a managed index block (~25 lines); your own text is never touched
.context/
  overview.md          # architecture in one screen
  gotchas.md           # invariants and traps: repo-wide + by area
  flows/<name>.md      # one per cross-module flow, ~400 tokens each
  presentation.md      # how agents should present answers
  manifest.yaml        # doc → source hashes, for staleness checks
```
`CLAUDE.md` / `GEMINI.md`, if they exist, get a one-line pointer to `AGENTS.md`. Existing docs, agents and skills are linked, never rewritten.

## Quick start
```
npm i -g easy-repo-context            # or, in a Node project: npm i -D easy-repo-context
easy-repo-context skill install       # Claude Code skill for this repo (--global for all repos)
```
Then ask your agent: *"set up repo context with easy-repo-context"*. It shows you the plan, proposes flows for you to confirm, writes the docs, validates every reference and installs the hooks.

Other agents: ask them to run `easy-repo-context prompt init` and follow it.

## Day to day
- **Every commit:** the git pre-commit hook runs `easy-repo-context check` (milliseconds, no network). It fails only when a doc points to a file or symbol that no longer exists.
- **While your agent edits:** the Claude Code hook shows the covering flow and the gotchas for that exact file, once per session.
- **When docs drift:** `easy-repo-context update` fixes refs to renamed files and lists stale docs; then ask your agent to follow `easy-repo-context prompt update`, which patches only what the git diff made false. A small model is enough.

## Commands
| Command | LLM? | What it does |
|---|---|---|
| `plan [path]` | no | Existing docs, real commands, files it would write, token estimate |
| `candidates [path]` | no | Entry points ranked by modules reached × git churn; gotcha evidence from fix commits and warning comments |
| `prompt init [--auto]` | your agent | Generation instructions for your agent |
| `index [path]` | no | Writes the `AGENTS.md` block, pointers and `presentation.md` from real files |
| `check [path] [--strict] [--external]` | no | Validates refs (file, symbol, JSON key, line); `--external` also scans your existing docs |
| `stamp [path] [doc…]` | no | Marks docs as verified at the current commit |
| `update [path]` | no | Fixes renamed refs; lists stale docs with the commit to diff from |
| `prompt update` | your agent | Update instructions: patch docs from the diff |
| `hooks install [path]` | no | git pre-commit check + Claude Code edit hook (keeps your existing hooks) |
| `skill install [path] [--global]` | no | Installs the agent skill |

Refs are code spans in the docs: `src/a.ts`, `src/a.ts:Class.method()`, `src/a.ts:42`, `package.json#scripts.test`. Static analysis covers TypeScript/JavaScript, Python and Go.

## Status
`0.1.0`, early. Works end to end in agent ("skill") mode. Not yet: direct API mode (bring your own key, no agent), `add-flow`, `eval`. Design and roadmap: [`docs/BRIEF.md`](docs/BRIEF.md).

## Development
```
npm install
npm run typecheck && npm test && npm run build
npm run dev -- <command> [args]
```

## License
MIT © Oscar Vinueza
