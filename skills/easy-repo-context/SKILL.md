---
name: easy-repo-context
description: Create, check and update lean context docs for AI agents in this repository (.context/ flows and gotchas, AGENTS.md index) with the easy-repo-context CLI. Use when the user asks to set up or generate repo context, AGENTS.md or "docs for AI", when context docs may be stale, or when `easy-repo-context check` reports changed or broken docs.
---

# easy-repo-context

Context docs tell AI agents what reading code doesn't: flows across modules, invariants that break silently, where things live. The CLI does everything deterministic (inventory, ref validation, hashes, the AGENTS.md index); you do the judgment parts by following the prompts it prints.

Run the tool as `easy-repo-context <command>`; if it isn't found, use `npx easy-repo-context <command>`.

## Set up context for a repo (first time)
1. Run `easy-repo-context plan` and show the user the summary: existing docs it will link (never rewrite), files it will write, the token estimate. Ask before continuing — generation reads a fair amount of code.
2. Run `easy-repo-context prompt init` and follow it exactly. It asks you to propose flows and confirm them with the user before writing.
3. Offer `easy-repo-context hooks install`: a git pre-commit check for broken refs, and a Claude Code hook that shows the relevant gotchas when a covered file is edited.

## Docs are stale (check reports "changed" or "broken")
1. Run `easy-repo-context prompt update` and follow it. It works from the git diff since each doc was verified; most docs need no edit or a one-line fix.
2. This is cheap and mechanical: if your tool lets you hand it to a smaller, faster model (e.g. a subagent on a lightweight model), do that.

## While working on code in a repo that has these docs
- Read `AGENTS.md` first; open only the flow doc and the gotchas sections for the area you're changing.
- If your change makes a doc false, update that doc in the same change and run `easy-repo-context check`.

## Model advice
- `init`: a fast, cheap model works well (measured: same invariants found as a larger model at ~1/5 of the cost); use a stronger one for very large or unusual repos.
- `update`: a cheap model is enough.
- `check`, `plan`, `index`, `stamp`, `update` (without the prompt) use no model at all.
