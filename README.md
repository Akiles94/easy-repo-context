# easy-repo-context

**Your AI agent reads the code. This tells it what the code doesn't say.**

`easy-repo-context` writes and maintains context **for AI coding agents**: how behavior flows across modules, the invariants that break silently, and where things live. It works with any agent that reads `AGENTS.md` (Codex, Cursor, Copilot, Gemini CLI, Claude Code…), and it checks that context against your code on every commit, without calling any model.

| | Proof of concept on two real repos |
|---|---|
| Feature plans that introduced a silent bug (valija) | **3 of 4 without context → 0 of 12 with it** |
| Tokens to answer "how does X work" on a documented flow | **−15% to −67%**, up to half the turns |
| Cost to generate the context (small model) | **$0.09–$0.22** per repo |
| Cost to keep it current across 150 real commits | **$0.018** |

## For agents, not for people
This is not a documentation generator. Tools like DeepWiki or Code Wiki write long, navigable docs for humans to read. This writes the opposite: a ~25-line index that is always loaded, plus short flow and gotcha files (~400 tokens each) that the agent opens only when relevant, with exact `file:symbol` references validated against the code.

You benefit indirectly: answers that are more often right, plans that respect your invariants, and fewer tokens per task. The files are readable, but they are written for agents.

| | Docs for humans (DeepWiki, Code Wiki…) | Generic `AGENTS.md` generators / `/init` | **easy-repo-context** |
|---|---|---|---|
| Reader | People | Agents | Agents |
| Content | Everything, explained | Structure, commands, style | Only what code doesn't reveal: cross-module flows, invariants, traps |
| Size in every session | n/a | Often hundreds of lines | ~25 lines; the rest on demand |
| Kept current | Regenerated | Rarely | Checked on every commit; patched from the git diff |
| Your existing docs and agent files | Separate | Often overwritten | Linked, never rewritten |

A 2026 study of repository context files ([Gloaguen et al., *Evaluating AGENTS.md*](https://arxiv.org/abs/2602.11988)) found that they do not generally improve coding agents' task success, whether LLM-generated or written by developers, and raise inference cost by over 20% on average. That's why this tool documents less, not more: only what code doesn't reveal, with most of it loaded only when relevant.

## Proof of concept
Two TypeScript repos, Claude Code in headless mode answering the same questions with and without the generated context. Small samples (2–4 runs per question), one answering model, questions written by the author. Directional results, not a benchmark. Everything (questions, answers, generated docs, scripts) is in [`docs/measurements/`](docs/measurements/).

**[valija](https://github.com/Akiles94/valija)**: ~5,600 lines, CLI + MCP server + desktop app, encrypted vault with multi-device sync.

| | No context | Hand-written context | Generated (Haiku) |
|---|---|---|---|
| Plans that avoid the sync bug | 1/4 | 2/2 | 10/10 |
| "How does X work" (2 questions) | baseline | −26% / −45% | −29% / −34% |
| Planning a feature | baseline | −12% | +13% |
| Question the docs don't cover | baseline | +5% | +4% / +5% |
| Total tokens | baseline | −21% | −12% |

**[outline](https://github.com/outline/outline)**: ~1,900 source files, someone else's code, already has a good 223-line `AGENTS.md` (the baseline here).

| | Its own `AGENTS.md` | + easy-repo-context |
|---|---|---|
| "How does `documents.update` work" | 445k tokens, 20 turns | **−67%**, 8 turns |
| "How are public shares protected" | baseline | −15% |
| Planning a real-time feature | 4/4 correct | 4/4 correct, +4% tokens |
| Question the docs don't cover | baseline | +4% |
| Total tokens | baseline | **−33%** |

**What the bug looks like.** Asked to plan an `archive_context` tool for valija, an agent without context wrote: *"open a session with `withSession` and call `session.items.archive(id)`"*. That compiles and passes a quick test, but it skips the lineage bump, so the other devices never notice the change. With context, every plan said: *"the mutation goes inside `session.write()`; without it the archive commits without `lineageStore.bump()` and fork detection breaks"*, and several added a test for it.

**Where it helps, and where it doesn't.** The quality win appears when an invariant lives in one place and isn't visible from the code you're touching (valija). When the code repeats the pattern everywhere, agents find it alone, and the docs only save tokens on flow questions (outline). Questions the docs don't cover cost about 4–5% more.

## Docs never go stale silently
- **Every commit:** a git hook runs `easy-repo-context check` (milliseconds, no model, no network). If a doc points to a file or symbol that no longer exists, the commit is blocked.
- **Renamed files:** refs are fixed automatically, no model needed.
- **While an agent edits:** `easy-repo-context context <file>` shows the flow docs and gotchas covering that file, and asks the agent to update them if its change makes them false. In Claude Code this happens automatically through a hook.
- **The rest:** `easy-repo-context update` lists the docs whose code changed, with the commit to diff from; your agent follows `easy-repo-context prompt update` and patches only what the diff made false. Measured: two months of active development (150 commits) for $0.018.

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
If `CLAUDE.md` or `GEMINI.md` exist, they get a one-line pointer to `AGENTS.md`.

## Quick start
```
npm i -g easy-repo-context            # or, in a Node project: npm i -D easy-repo-context
```
- **Claude Code:** `easy-repo-context skill install`, then ask *"set up repo context with easy-repo-context"*.
- **Any other agent:** ask it to run `easy-repo-context prompt init` and follow it.

The agent shows you the plan and the cost, proposes flows for you to confirm, writes the docs, validates every reference, and offers to install the hooks. `erctx` is a short alias for `easy-repo-context`.

## Models
The CLI itself never calls a model; your agent does the writing. A small, fast model is enough for both generation and updates:

| Provider | Small tier (examples) |
|---|---|
| Anthropic | Haiku |
| OpenAI | a "mini" model |
| Google | a Flash model |

Measured with Claude Haiku (same invariants found as Sonnet at ~1/5 of the cost). Other providers' small models should behave similarly but haven't been measured. Use a stronger model for very large or unusual repos.

## Integrations
| | Works with | Status |
|---|---|---|
| `AGENTS.md` index + `.context/` docs | Any agent that reads `AGENTS.md` | ✅ |
| `prompt init` / `prompt update` | Any agent that can run shell commands | ✅ tested with Claude Code |
| `context <file>` before editing | Any agent | ✅ |
| Git pre-commit check | Any workflow | ✅ |
| Automatic edit-time context | Claude Code (hook) | ✅ tested |
| Automatic edit-time context | Other agents with hook systems | Not yet |
| Agent skill | Claude Code | ✅ tested |

## Commands
| Command | Model? | What it does |
|---|---|---|
| `plan [path]` | no | Existing docs, real commands, files it would write, token estimate |
| `candidates [path]` | no | Entry points ranked by modules reached × git churn; gotcha evidence from fix commits and warning comments |
| `prompt init [--auto]` | your agent | Generation instructions |
| `index [path]` | no | Writes the `AGENTS.md` block, pointers and `presentation.md` from real files |
| `check [path] [--strict] [--external]` | no | Validates refs (file, symbol, JSON key, line); `--external` also scans your existing docs |
| `stamp [path] [doc…]` | no | Marks docs as verified at the current commit |
| `context <file…>` | no | Flow docs and gotchas covering a file |
| `update [path]` | no | Fixes renamed refs; lists stale docs with the commit to diff from |
| `prompt update` | your agent | Patch stale docs from the diff |
| `hooks install [path]` | no | Git pre-commit check (+ Claude Code edit hook where Claude Code is used); keeps your existing hooks |
| `skill install [path] [--global]` | no | Installs the Claude Code skill |

Refs are code spans in the docs: `src/a.ts`, `src/a.ts:Class.method()`, `src/a.ts:42`, `package.json#scripts.test`. Static analysis covers TypeScript/JavaScript, Python and Go.

## Status
`0.1.0`, early. Not yet: direct API mode (your own key, no agent), `add-flow`, an `eval` command to measure the effect on your own repo. Design notes and roadmap: [`docs/BRIEF.md`](docs/BRIEF.md).

## Development
```
npm install
npm run typecheck && npm test && npm run build
npm run dev -- <command> [args]
```
Publishing: `npm publish` from the root (runs typecheck, tests and build first), then `npm publish` in `packages/erctx`, which only reserves the short name and runs this package.

## License
MIT © Oscar Vinueza
