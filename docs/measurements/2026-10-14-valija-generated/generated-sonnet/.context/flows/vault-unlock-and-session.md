# Flow: vault-unlock-and-session
Summary: `valija unlock` → derive key → schema gate → verify via lineage read → key to keychain → fork classification.
Trigger: `src/delivery/cli/program.ts` command `unlock` → `src/delivery/cli/vault-commands.ts:unlockCommand()`; desktop `vault:unlock` in `desktop/src/main/ipc/handlers/vault-handlers.ts`.
Path:
1. `src/vault/application/services/resolve-unlock-key.ts:resolveUnlockKey()` — recovery key used raw; passphrase → Argon2id with the header's salt + KDF params.
2. `src/vault/application/use-cases/unlock-vault.use-case.ts:UnlockVault.execute()` — `readSchemaVersion` first (does not migrate); behind-schema without `upgradeConfirmed` → `VAULT_UPGRADE_REQUIRED`.
3. `src/vault/infra/file-vault-store.ts:FileVaultStore.readLineage()` — opens + migrates; this is the key verification (wrong key → `WRONG_PASSPHRASE`).
4. `UnlockVault.execute()` — `keychain.setKey`, `recordActivity`, then `classifyLineage()` (`src/vault/domain/services/vault-lineage.ts`).
5. Fork → ok **with** `fork` notice, still unlocked, last-seen NOT updated; otherwise `recordSeen`.
Lock: `src/vault/application/use-cases/lock-vault.use-case.ts:LockVault.execute()` reads lineage best-effort, deletes key, reports leftover sidecars via `VaultFolder`.
Side effects: OS keychain, device-state file; possible schema migration with `*.pre-NNN.bak` ciphertext copy (`src/shared/infra/migrations.ts:migrate()`).
Gotchas: CLI passes `upgradeConfirmed:true` (silent migrate); desktop must show its confirm screen first (`vault:upgradeCheck`).
Related: `flows/mcp-save-context.md`, `docs/sync.md`
