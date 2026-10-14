# Experiment: `ctxmap update` across 150 real commits of valija (2026-10-14)

1. Checked out valija at `02444fd` (2026-07-27) and generated docs there with Haiku via `ctxmap prompt init --auto` ($0.22, 9/9 fresh) → [`before/`](before/).
2. Moved the checkout to `f8ccee0` (2026-09-18): ~150 commits, 33 `src/` files changed (+2015 −216), including a new upgrade-confirmation gate in unlock, key resolution extracted to a service, vault relocation, diagnostics, and the whole desktop app.
3. `ctxmap update` (no LLM, 0.36 s): 1 broken doc (`UnlockVault.resolveKey()` no longer exists), 6 changed, 2 fresh; 2 uncovered entry points (desktop IPC, CLI program).
4. `ctxmap prompt update` run headless with Haiku: **$0.018, 55 s, 16 turns**, `ctxmap check` 9/9 fresh afterwards → [`after/`](after/), [`docs.diff`](docs.diff), [`update-report.md`](update-report.md).

## What changed in the docs (all verified against the current code)
| Doc | Edit |
|---|---|
| `flows/unlock-vault.md` | Broken ref fixed (`resolveKey` → `services/resolve-unlock-key.ts:resolveUnlockKey()`); new step `readSchemaVersion()` → `VAULT_UPGRADE_REQUIRED` placed before `readLineage()` (which migrates); CLI passes `upgradeConfirmed: true`. |
| `gotchas.md` | New invariant: never migrate a behind-schema vault without `upgradeConfirmed`. Approval gate extended to `desktop/**` (matches the updated guard hook). |
| `flows/get-context.md` | Export path now `context-pack-export.ts:exportProjectMarkdown()`, shared with desktop. |
| `flows/import-conversations.md` | Project name parsed before selection (new ordering). |
| `overview.md` | `desktop/` component added; plaintext boundary includes the desktop window. |
| `flows/lock-vault.md` | Correctly left unchanged (diff only touched `unlockCommand()`). |

New entry points (desktop IPC) were reported as `add-flow` candidates, not documented on the fly.

## Noise fixed during the experiment
The first `ctxmap update` also flagged docs whose only "sources" were prose (README, `docs/SPEC.md`) and the `AGENTS.md` block. Now prose files are links, not sources, and `AGENTS.md` is derived by `ctxmap index` (refs validated only). That removed `save-context.md` and `AGENTS.md` from the stale list.

## Takeaway
Keeping docs current is cheap: deterministic triage in milliseconds, then a cheap model reading only diffs. ~2 cents for two months of active development.
