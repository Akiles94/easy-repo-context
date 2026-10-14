# Gotchas
## Repo-wide
- Implementation edits are gated: `.claude/hooks/guard-implementation.sh` blocks changes to `src/**`, `package.json` and build config until `advances/<ADV>/plan.md` has an `Approved:` line. Only Oscar's explicit approval adds it; never write it on your own initiative. Bypassing the hook invents consent.
- Push and merge are gated on review: `.claude/hooks/guard-git-ops.sh` denies both unless `advances/<ADV>/review.md` starts with `Verdict: PASS`.
- Desktop ships no network surface or telemetry. `desktop/src/main/index.ts` never starts a crash reporter; a new telemetry or network import fails `desktop/src/main/infra/no-network-surface.test.ts` and breaks the privacy claim.
- Desktop main imports root `src/` directly (`desktop/src/main/index.ts` → `src/delivery/container.ts`), so root `npm ci` must run before desktop typecheck. Without it CI fails on every run. Evidence: cb6145f.
- Every vault write goes through `session.write()` (`src/context/infra/vault-sessions.ts:SqliteVaultSessions.commitWrite()`). It bumps the lineage stamp in the same transaction. A direct DB write skips the bump, so sync fork detection (`src/vault/domain/services/vault-lineage.ts:classifyLineage()`) cannot see the change.
## By area
### vault
- Behind-schema vaults must not be migrated before the user confirms. `FileVaultStore.readSchemaVersion()` must stay non-migrating; `FileVaultStore.readLineage()` migrates. Breaking this upgrades silently and skips the confirm screen. Evidence: `src/vault/application/use-cases/unlock-vault.use-case.ts:UnlockVault.execute()` (D-J(b)).
- On a fork, do not call `recordSeen()`. The warning must persist until the user resolves it. Evidence: comment "Leave last-seen untouched" in `unlock-vault.use-case.ts:UnlockVault.execute()`.
- A wrong-key error on open deletes the keychain entry and reports locked (`src/context/infra/vault-sessions.ts:SqliteVaultSessions.openRepositories()`). Do not treat it as a transient failure to retry.
### context
- Parse all input before `sessions.withSession()` opens. A bad project, type, tag or content must never open the vault or create a project. Evidence: comment "bad input never touches the vault" in `src/context/application/use-cases/save-context.use-case.ts:SaveContext.execute()`.
- Imported item ids are derived from project, source, conversation and chunk index (`src/context/domain/entities/context-item.ts:createImportedContextItem()`). Re-import upserts only while those inputs stay stable. Changing chunking or source naming duplicates history.
### desktop
- Screens call only the bridge (`desktop/src/renderer/state/bridge.ts:ValijaBridge`), never `window.valija` directly. Tests fake that interface. Evidence: comment at `bridge.ts` line 47.
- A new channel needs four edits: `desktop/src/shared/ipc/channels.ts`, `desktop/src/main/ipc/schemas.ts`, a handler in `desktop/src/main/ipc/handlers/`, and a hand-written method in `desktop/src/preload/index.ts`. A channel with no handler throws at `desktop/src/main/ipc/register-handlers.ts:registerHandlers()`; a missing preload method is unreachable from the renderer.
- IPC errors cross as `{ code }` only (`desktop/src/main/ipc/to-ipc-result.ts:toIpcResult()`). Never render a raw `DomainError.message` in the UI; the renderer shows localized copy keyed by code. Evidence: comments in `desktop/src/shared/ipc/messages.ts`.
- The recovery kit is handed to the renderer once. `vault:readRecoveryKit` clears the slot, so a second read returns `null` (`desktop/src/main/ipc/handlers/vault-handlers.ts:createVaultHandlers()`).
- Leaving "unlocked" must reset the workspace view, paired with the state transition (`desktop/src/renderer/state/workspace-nav.ts:resetWorkspaceView()`). Otherwise the next unlock lands back in the relocation wizard. Evidence: 200f432 (C2).
- Only the recovery-kit screen's `onAcknowledged` may leave `kit-pending` (`desktop/src/renderer/app.tsx:Router()`).
- `finishTour()` closes the overlay in a `finally`, so a failed preferences write cannot trap the user in the tour (`desktop/src/renderer/app.tsx:App()`). Evidence: 200f432 (W2).
