ctxmap is clean: 9 docs fresh, 0 broken. Four docs needed edits and the rest were already accurate.

- **`get-context.md`**: changed. The export path moved to `src/delivery/context-pack-export.ts:exportProjectMarkdown()`, which the desktop pack export now shares. Updated the trigger line to name it.
- **`import-conversations.md`**: changed. Added that the project name is parsed before selection. This is a new ordering rule in `ImportConversations.execute()`.
- **`lock-vault.md`**: unchanged. The diff to `vault-commands.ts` only touched `unlockCommand()`.
- **`unlock-vault.md`**: changed. The `UnlockVault.resolveKey()` ref was broken because key resolution moved to `resolveUnlockKey()`. Added the new upgrade gate: `readSchemaVersion()` runs first without migrating, and a behind-schema vault returns `VAULT_UPGRADE_REQUIRED` unless `upgradeConfirmed` is set. The CLI always passes it, so the step-by-step behaviour is otherwise unchanged.
- **`gotchas.md`**: changed in two places. The implementation-gate bullet now includes `desktop/**`, matching the updated `guard-implementation.sh`. The vault section has a new invariant: `UnlockVault` must not migrate a behind-schema vault without `upgradeConfirmed`.
- **`overview.md`**: changed. Added a `desktop/` component bullet, since the Electron app landed after the docs were verified. Also widened the plaintext-boundary line to include desktop-window output.

`ctxmap index` regenerated `AGENTS.md`. `ctxmap stamp` also re-stamped `save-context.md`, `presentation.md` and `CLAUDE.md`, which had no content edits; the stamp only records the verified commit.

Uncovered entry points worth an `add-flow`:
- `desktop/src/main/ipc/register-handlers.ts`: the desktop IPC channel layer is a whole new surface with no flow doc. This is the most useful one to add.
- `src/delivery/cli/program.ts`: the `init`, `unlock` and `lock` command wiring. Lower priority, since the unlock and lock flows already cover the use cases behind it.
