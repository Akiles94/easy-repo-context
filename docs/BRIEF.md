# Brief: repo context tool (working name `ctxmap`)

Handoff from a planning chat. Build a tool that prepares lean, always-current, AI-readable context for any repository, so agents answer questions and implement features without re-mapping the whole codebase.

## Before writing code: ask the user
1. Implementation language: Python or Node/TypeScript.
2. LLM mode: direct API calls (bring your own key, any provider), packaged as an agent skill (Claude Code / Codex / Cursor / Gemini CLI run the prompts themselves, no key), or both. Recommended: both, sharing the same prompt files.
3. A real repo to test on (complex, existing docs preferred).

User preferences: ask before actions that weren't requested or that spend a lot of tokens; answer briefly first, detail after.

## Goals
- Works with any AI tool (AGENTS.md is the common entry point; others pointed to it).
- Documents flows that cross modules: entry point → steps → side effects, with `file:symbol` refs.
- Keeps itself up to date: cheap staleness detection + incremental regeneration.
- Easy for humans to read.
- Includes general, useful instructions on how the AI should present info to the user.
- Applies to any repo, including large existing ones.
- Saves tokens (main goal; see principles).
- Couples to existing docs, agents, skills and conventions; never clobbers them.

## Key finding that shapes the design
ETH Zurich research (cited in community AGENTS.md skills): auto-generated AGENTS.md files cut task success ~3% and raised cost 20%+ because they duplicated what agents can find by reading code. So:
- Document only what is NOT cheaply discoverable: cross-module flows, gotchas, rationale, invariants, "don't touch", where things live.
- Never include: directory listings, file-by-file summaries, code style the agent infers from code, copied code.
- Always-loaded context must be tiny. Everything else is loaded on demand.

## Token principles
- Root AGENTS.md: index only, target ≤ ~60 lines.
- Flow docs: one per flow, ~100–400 tokens, loaded only when relevant.
- Generated docs in English, telegraphic Markdown (English ≈20–30% fewer tokens than Spanish). Agent still replies in the user's language.
- Arrows + refs: `login: routes/auth.ts:login() → services/session.ts:create() → redis`.
- Refs instead of content. YAML/Markdown tables over JSON for structured data inside docs.
- No invented notations or abbreviations (tokenize worse, get misread).

## Existing tools reviewed (none covers everything)
- agentize (PyPI `agentize-cli`): AGENTS.md from real config, `--check` / `--check --update` managed block for CI, `--verify` commands. Commands/conventions only, no flows. Idea to reuse: every command sourced from a real file; managed block.
- agents-md-generator skill (buyoung): monorepo hierarchy; update mode refreshes standard sections, preserves custom ones. Reuse: section-splice update strategy.
- deepinit skill: per-directory AGENTS.md with parent links. Risk: verbose, duplicates code. Avoid that.
- DeepWiki Open / OpenDeepWiki: real flow docs + Mermaid, but a web wiki for humans, not in-repo agent context.
- Google Code Wiki: regenerates on every change; public repos only on its site.
Gap this tool fills: lean in-repo flow docs + hash-based incremental updates + coupling to existing docs.

## Output layout in target repo
```
AGENTS.md                 # root index (managed block only; rest is user's)
.context/
  manifest.yaml           # doc → source files + hashes
  overview.md             # architecture in ≤ 1 screen: components, boundaries, data stores
  flows/<flow>.md         # one per flow
  gotchas.md              # non-obvious traps, invariants, rationale
  presentation.md         # how to present answers to the user
<subdir>/AGENTS.md        # optional, only for large modules with real gotchas
```

## Coupling to existing docs (init phase 0, read-only)
Detect and inventory: README*, docs/, CONTRIBUTING, ARCHITECTURE*, ADRs, AGENTS.md (any level), CLAUDE.md, GEMINI.md, .cursorrules, .cursor/rules/*, .github/copilot-instructions.md, .windsurfrules, .clinerules, .claude/ (agents, skills, commands), .codex/, skills/ folders, existing llms.txt.
Rules:
- Never overwrite or delete user content. Only write inside markers:
  `<!-- ctxmap:begin -->` … `<!-- ctxmap:end -->`.
- If info already exists in a doc, link to it; don't duplicate.
- If AGENTS.md doesn't exist, create it. If CLAUDE.md / GEMINI.md exist, add a short managed pointer to AGENTS.md (don't merge content). If they don't exist, create nothing unless a flag asks for it.
- Show a plan (files to create/modify, estimated tokens/cost) and ask for confirmation before writing or calling an LLM at scale. Support `--dry-run`.

## Commands
- `ctxmap init` — inventory → static analysis → flow discovery → plan + estimate → confirm → generate → write manifest.
- `ctxmap check` — no LLM, free. Recompute hashes for files referenced in manifest; list stale docs and refs that no longer resolve (file/symbol gone). Exit non-zero when stale. For pre-commit/CI.
- `ctxmap update` — regenerate only stale docs (diff-aware: give the LLM the old doc + git diff of the changed files, not the whole repo). `--all` to force.
- `ctxmap add-flow "<name or entry point>"` — document one flow on demand.
- Optional: `ctxmap hooks install` (pre-commit runs `check`), CI snippet for GitHub Actions.

## Flow discovery (static first, LLM second)
- Static, cheap: find entry points (HTTP routes, CLI commands, queue/cron consumers, event handlers, main(), exported public API) via tree-sitter or per-language heuristics; build a lightweight symbol/import graph.
- Rank candidate flows by fan-out across modules; propose a list; user picks or accepts defaults.
- LLM pass per flow: given entry point + only the files on its call path (bounded), produce the flow doc in the template.

## Flow doc template
```
# Flow: <name>
Trigger: <route / command / event>
Path:
1. routes/auth.ts:login() — validates input
2. services/session.ts:create() — writes session to redis
3. ...
Side effects: <db writes, queues, external calls>
Gotchas: <non-obvious only>
Related: flows/<other>.md
```

## Root AGENTS.md managed block (shape)
- 1–2 line purpose of the repo.
- Real commands (build, test, lint, run), each sourced from a real file.
- Where to look: overview, flows index (name → file, one line each), gotchas.
- Pointers to existing docs/agents/skills found in inventory.
- "Before editing a module, read its flow doc / subdir AGENTS.md if present."
- Link to presentation.md.

## presentation.md (general, useful defaults)
- Lead with the answer; then where in code (`file:symbol`).
- For "how does X work": short step list following the flow, not a code dump.
- For changes: list files to touch and why before editing; ask before large or destructive changes.
- Quote minimal code; prefer refs.
- Say when docs may be stale (if `ctxmap check` reports it) and verify against code.
- Match the user's language; keep docs themselves in English.

## Manifest (manifest.yaml)
```
version: 1
docs:
  flows/login.md:
    sources:
      routes/auth.ts: <sha256>
      services/session.ts: <sha256>
    symbols: [routes/auth.ts:login, services/session.ts:create]
    generated: 2026-10-14
```
Staleness = any source hash changed OR any symbol missing. Optionally hash only the referenced symbol's body to cut false positives.

## Non-goals
- Not a hosted wiki, not RAG/embeddings (can be added later as optional).
- Not documenting every file or function.

## Suggested milestones
1. Inventory + `--dry-run` plan (no LLM).
2. Manifest + `check` (no LLM) + pre-commit hook.
3. Static entry-point/flow discovery for 2–3 common stacks (e.g. TS/Node, Python).
4. LLM generation (`init`, `add-flow`) with prompt files shared by API mode and skill mode.
5. Diff-aware `update`.
6. Package as skill (SKILL.md) for agent-run mode.
7. Measure: tokens and turns to answer a few fixed questions with vs without ctxmap on the test repo.

## Acceptance
- Running `init` twice changes nothing outside managed blocks.
- `check` runs in seconds with no network.
- Root managed block ≤ ~60 lines; each flow doc ≤ ~400 tokens.
- On the test repo, answering "how does <flow> work" uses measurably fewer tokens than without.

## Decisions (2026-10-14)
- Language: TypeScript, Node ≥ 22, no runtime deps where avoidable.
- LLM mode: skill first (agent runs the prompts), API mode later; both share `prompts/`.
- Test repo: `Akiles94/valija` (TS, layered modules, existing CLAUDE.md + `.claude/` agents/hooks + `docs/`).
- Measure early: hand-write 2–3 flow docs for valija and compare tokens/turns before building generation.
- Staleness has two levels: **broken** (file/symbol gone → `check` exits non-zero) and **changed** (referenced symbol body changed → warning; non-zero only with `--strict`).
- Manifest stores the git commit each doc was generated at (needed for diff-aware `update`), not only the date.
- Flow discovery: the agent proposes flows in skill mode; static analysis is used first to validate refs, automatic discovery later.
- Acceptance reworded: `init` does not regenerate docs whose hashes are unchanged (LLM output is not deterministic).
- Large flows split into sub-flows linked via `Related:` instead of exceeding ~400 tokens.
- Output folder configurable (`--context-dir`, default `.context`).
- Model guidance: `init` (flow discovery, gotchas) with a mid/high-tier model; `update` (old doc + diff) with a cheap model; `check` uses none. Ship as defaults in API-mode config and as advice in SKILL.md. Verify by comparing generated docs against `docs/measurements/2026-10-14-valija/reference-docs/`.
- Measured on valija (see `docs/measurements/2026-10-14-valija/`): −21% input tokens overall, −26/−45% on flow questions, +5% on an uncovered question; gotchas prevented a real bug in 2/2 feature plans. Priority: gotchas quality, ref validation in `check`.

## Large existing repos (the main use case)
Value must not depend on documenting the whole repo. Strategy:
- **Coverage by priority, not completeness.** Rank areas by git churn (last ~90 days) × cross-module fan-out; propose flows only for the hot spots (default budget ~6–10 flows). Most changes touch a small part of a large repo.
- **Grow on demand.** `add-flow` when a task needs it; later, propose a flow doc when a session spent many turns exploring one area.
- **Mine gotchas from history** (fix/revert commits, PR review comments, ADRs/`advances/`-style records, "must/never/always" comments). Old repos have the richest history, so this gets better with size. Each gotcha cites its evidence (commit/PR).
- **Edit-time injection** (Claude Code PreToolUse hook, `ctxmap hook claude`): the manifest maps file → docs/gotchas, so the agent gets the relevant invariant when it edits the file. The always-loaded index can stay tiny no matter how big the repo is.
- **Immediate value with zero LLM:** `ctxmap check --external` finds broken file refs in the repo's existing docs (README, docs/, CLAUDE.md…). Large repos have plenty.
- **Bounded cost:** per-flow input capped to files on the path; plan + estimate + confirmation before spending; nested `AGENTS.md` only for packages with real gotchas.
- **Prove it on their repo:** `ctxmap eval` replays recent merged PRs as planning tasks ("plan this change") with vs without docs and compares against the files the PR actually touched — ground truth for free.
- **Performance:** `check` and the hook only hash files referenced in the manifest; a `git ls-files` listing is the only repo-wide step.

## Roadmap (updated 2026-10-14)
1. ✅ Inventory + dry-run plan.
2. ✅ Manifest + `check` (ref validation: file, symbol, json key, line) + `stamp` + git pre-commit + Claude Code edit hook (verified end-to-end with a real headless session).
3. Flow candidates by churn × fan-out (static, no LLM) + gotcha mining from git history (candidates with evidence).
4. LLM generation (`init`, `add-flow`) via shared prompts; skill mode first. Gold reference: `docs/measurements/2026-10-14-valija/reference-docs/`.
5. Diff-aware `update` (cheap model).
6. `eval` (PR replay) on a large real repo.
7. Later: suggest turning verifiable gotchas into tests/lint rules; symbol-body hashing to cut "changed" noise.
