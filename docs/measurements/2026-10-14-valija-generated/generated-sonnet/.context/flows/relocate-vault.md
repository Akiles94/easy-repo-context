# Flow: relocate-vault
Summary: desktop "move vault" → lock → copy → byte-verify → delete source → save pref → rebuild container → re-point AI-client configs.
Trigger: `desktop/src/main/ipc/handlers/relocation-handlers.ts:createRelocationHandlers()` channel `relocation:move` (dry preview: `relocation:preflight`).
Path:
1. `relocation:move` — `container.lockVault.execute()` first, always.
2. `src/vault/application/use-cases/relocate-vault.use-case.ts:RelocateVault.execute()` — refuses if a keychain key exists (`VAULT_MUST_BE_LOCKED`); `refuseUnsafeRelocation()` in `src/vault/domain/services/vault-relocation.ts`.
3. `RelocateVault.moveVerifyAndRemoveSource()` — copy → `mover.matches()` byte compare → header readable → remove source; remove failure → `rollBack()` discards the destination.
4. Handler: `preferencesStore.write({vaultPath})`, then `rebuildContainer(root)`.
5. `relocation-handlers.ts:repointAllClients()` — via `installIntoClient()` (`src/delivery/cli/installer.ts`), strictly after the move; per-client failures are reported, never revert the vault.
Side effects: vault files moved, desktop prefs, third-party MCP config files (with backups).
Gotchas: the key is never needed or touched; two openable copies would be a fork, so the source stays authoritative on any failure.
Related: `flows/desktop-ipc-request.md`, `docs/sync.md`
