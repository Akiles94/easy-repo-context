# Flow: relocate-vault
Summary: desktop "move vault" → lock → copy header + db → verify sha256 → remove source → rebuild container → re-point AI clients
Trigger: `desktop/src/main/ipc/handlers/relocation-handlers.ts:createRelocationHandlers()` (`relocation:move`)
Path:
1. `relocation-handlers.ts` (`relocation:move`) — destination from opaque file-picker handle; calls `container.lockVault.execute()` first.
2. `src/vault/application/use-cases/relocate-vault.use-case.ts:RelocateVault.execute()` — keychain still holding a key → `VAULT_MUST_BE_LOCKED`.
3. `src/vault/domain/services/vault-relocation.ts:refuseUnsafeRelocation()` — destination must be empty; nesting check.
4. `src/vault/infra/file-vault-mover.ts:FileVaultMover.copy()` — `copyFileSync`, never rename.
5. `src/vault/infra/file-vault-mover.ts:FileVaultMover.matches()` — sha256 of header and db; mismatch → discard copy.
6. `RelocateVault.moveVerifyAndRemoveSource()` — source removed only after verification; removal failure → `rollBack()` discards the copy.
7. `relocation-handlers.ts` (`relocation:move`) — only after `ok`: `rebuildContainer(root)`, then `repointAllClients(root)`.
Side effects: files in both folders until step 6; AI-client config files rewritten in step 7. Keychain untouched (vault stays locked).
Gotchas: see `gotchas.md` — lock check, verify-before-remove, and step order.
Related: `flows/unlock-vault.md`, `docs/sync.md`
