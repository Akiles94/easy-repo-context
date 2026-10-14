# easy-repo-context init — write lean context docs for AI agents

Run the tool as `easy-repo-context <command>`. If that command is not found, use `npx easy-repo-context <command>` instead (same tool, fetched from npm).

You are generating context docs under `.context/` for this repository. Future AI agents will read them before answering questions or changing code. Your job is to write down what an agent **cannot cheaply learn by reading the code**: how behavior flows across modules, the invariants that silently break when violated, and where things live.

Measured on a real repo: docs like these cut tokens 20–45% on "how does X work" questions, and the gotchas file prevented a real bug that agents introduced 2 out of 2 times without it. Generic or duplicated content does the opposite: it costs tokens on every task and helps nothing. Be selective.

## Hard rules
- Write only under `.context/` (`overview.md`, `gotchas.md`, `flows/<name>.md`). Never edit code, never edit files outside `.context/`. `easy-repo-context index` writes `AGENTS.md` and pointers for you.
- Never document what reading one file reveals: directory listings, file-by-file summaries, code style, lint rules, type definitions, copied code.
- Don't duplicate existing docs (README, docs/, CLAUDE.md, AGENTS.md, ADRs). Link them by path instead.
- English, telegraphic Markdown, even if the repo or the user uses another language.
- Every code reference is a code span: `path/to/file.ts`, `path/to/file.ts:Class.method()`, `path/to/file.ts:functionName()`, `package.json#scripts.test`. Use paths from the repo root. Every ref must exist: `easy-repo-context check` validates them and you must fix every broken one.
- Don't invent. If you didn't read it, don't claim it. Uncertain → leave it out.
- Size limits: each flow ≤ ~25 lines; `overview.md` ≤ ~40 lines; `gotchas.md` 6–20 bullets (≤ 8 repo-wide).

## Steps

1. **Orient (cheap).** Run `easy-repo-context plan --json` for existing docs and real commands, and skim the root agent instructions and any architecture doc it lists. Note what they already cover.

2. **Get candidates.** Run `easy-repo-context candidates --json --limit 12`. It ranks entry points (routes, RPC/MCP tools, CLI commands, queues, cron, IPC) by modules reached × recent churn, and lists gotcha evidence: files with repeated fix commits, warning comments in hot code, decision records.

3. **Choose flows** ({{FLOW_COUNT}} by default). A flow is a *behavior* that crosses modules (e.g. "create document", "user signs in", "nightly export"), not a whole router file. Prefer: high-ranked candidates, distinct mechanisms (skip a second CRUD route that works exactly like the first), and behaviors with side effects (writes, queues, external calls, crypto, sync).
   {{CHOOSE_MODE}}

4. **Trace each flow.** Start at the trigger and follow the call path, reading only files on that path. Write `.context/flows/<kebab-name>.md`:

   ```
   # Flow: <name>
   Summary: <one line: trigger → key steps → main effect>
   Trigger: <route / command / tool / event, with ref>
   Path:
   1. `path/file.ts:fn()` — <what happens here that matters>
   2. ...
   Side effects: <db writes, queues, external calls, files, caches>
   Gotchas: <only non-obvious, flow-specific traps; omit the line if none>
   Related: `flows/<other>.md`, existing docs by path
   ```

5. **Write `gotchas.md` — the most valuable file. Spend most of your effort here.** A gotcha is a rule whose violation compiles, passes a quick test, and still breaks something. Find them in:
   - fix hotspots from step 2: run `git show --stat <hash>` / `git show <hash>` on the top examples to learn *what* broke and *which rule* the fix restored;
   - warning comments from step 2 (open the file at that line, read the surrounding code);
   - decision records / review notes listed in step 2;
   - what you saw while tracing: "every X must go through Y", work that must happen in the same transaction, ordering that matters, state kept in two places, values that must never reach some output, process rules (approval gates, generated files you must not hand-edit).

   Each bullet: **the rule**, **why / what breaks**, a **ref** to where it's enforced or where it bites, and the **evidence** when you have it (commit hash, comment ref). One or two sentences; no sub-bullets. Skip: generic advice ("handle errors", "write tests"), anything types/lint/tests already enforce, purely visual or styling fixes, one-off bugs that can't recur.

   Structure it in two levels so agents read only what applies:
   ```
   # Gotchas
   ## Repo-wide
   - <≤ 8 bullets: rules any change anywhere can break, most damaging first>
   ## By area
   ### <module or area name>
   - <rules that only matter when touching this area>
   ```
   Put a rule in exactly one place. Process rules (approval gates, generated files) are repo-wide.

6. **Write `overview.md`:**
   ```
   # Overview
   Purpose: <one line: what this repo is>
   ## Components
   - `<dir or module>` — <responsibility; key entry ref>   (one line each, only real boundaries)
   ## Data stores
   | Store | Where | Holds |
   ## Boundaries
   - <how components talk; what is shared; what never crosses>
   ```

7. **Validate and finish.** Run `easy-repo-context check`, fix every broken ref by correcting the doc (never by editing code), and repeat until it passes. Then run `easy-repo-context index` (writes the `AGENTS.md` block, tool pointers and `presentation.md`) and `easy-repo-context stamp`.

8. **Report** in a few lines: files written, flows chosen and why, gotchas you were unsure about and left out.

## Example of the expected density (a fictional billing app — do not copy its content)

`flows/charge-invoice.md`:
```
# Flow: charge-invoice
Summary: POST /invoices/:id/charge → lock invoice → PSP charge → ledger entry → receipt email
Trigger: `api/routes/invoices.ts:chargeInvoice()`
Path:
1. `api/routes/invoices.ts:chargeInvoice()` — auth + loads invoice with `SELECT … FOR UPDATE`.
2. `billing/charge.ts:ChargeService.charge()` — idempotency key = invoice id; calls `psp/stripe.ts:createPaymentIntent()`.
3. `ledger/post.ts:postEntry()` — double-entry rows in the same transaction as the invoice status change.
4. `jobs/receipts.ts:enqueueReceipt()` — enqueued after commit, never inside the transaction.
Side effects: invoices.status, ledger_entries, PSP charge, receipts queue.
Gotchas: retries reuse the idempotency key; a new key double-charges.
Related: `flows/refund.md`, `docs/billing.md`
```

`gotchas.md`:
```
# Gotchas
## Repo-wide
- Money is integer cents everywhere (`billing/money.ts:Money`). Floats round differently in the ledger and the PSP; reconciliation fails days later. Evidence: a1b2c3d "fix: off-by-one cent in VAT".
- Jobs are enqueued after commit (`db/tx.ts:afterCommit()`), never inside a transaction: a rolled-back tx would still send the email.
## By area
### ledger
- `ledger_entries` is append-only; corrections are new reversing entries (`ledger/post.ts:reverse()`). Updating a row breaks the audit export.
```
