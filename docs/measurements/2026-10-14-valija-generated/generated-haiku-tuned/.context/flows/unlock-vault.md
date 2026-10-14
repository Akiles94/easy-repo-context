# Flow: unlock-vault
Summary: `unlock` / `vault:unlock` → read header → resolve key → schema gate → lineage read (migrates) → keychain key + device activity → fork notice if diverged
Trigger: `src/delivery/cli/vault-commands.ts:unlockCommand()` (CLI); `desktop/src/main/ipc/handlers/vault-handlers.ts:createVaultHandlers()` (channel `vault:unlock`)
Path:
1. `src/vault/application/use-cases/unlock-vault.use-case.ts:UnlockVault.execute()` — reads header, resolves passphrase or recovery key via `resolveUnlockKey()`.
2. `src/vault/infra/file-vault-store.ts:FileVaultStore.readSchemaVersion()` — read-only check; behind latest and not `upgradeConfirmed` → `VAULT_UPGRADE_REQUIRED`, nothing written.
3. `src/vault/infra/file-vault-store.ts:FileVaultStore.readLineage()` — opens DB with key (mismatch → `WRONG_PASSPHRASE`), runs `migrate()`, reads lineage.
4. `src/vault/application/use-cases/unlock-vault.use-case.ts:UnlockVault.execute()` — `keychain.setKey()`, then `deviceIdentity.recordActivity()`.
5. `src/vault/domain/services/vault-lineage.ts:classifyLineage()` — `fork` → still unlocked, `fork` notice returned, last-seen left alone; otherwise `recordSeen()`.
Side effects: OS keychain entry for the vault id; schema migration with `vault.db.pre-NNN.bak` backup (`src/shared/infra/migrations.ts:applyMigration()`, removed on success); device state (activity, last-seen).
Gotchas: see `gotchas.md` → vault.
Related: `flows/save-context.md`, `docs/sync.md` (fork detection, upgrades), `docs/vault-format.md` §11 (read-only reader contract)
