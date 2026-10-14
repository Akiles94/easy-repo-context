# Flow: unlock
Trigger: `valija unlock [--recovery-key]` (`src/delivery/cli/vault-commands.ts:unlockCommand()`), desktop unlock screen.
Path:
1. `src/vault/application/use-cases/unlock-vault.use-case.ts:UnlockVault.execute()` — `FileVaultStore.readHeader()` (`vault.json`).
2. `src/vault/application/services/resolve-unlock-key.ts:resolveUnlockKey()` — recovery key used as-is; passphrase → `vault/infra/argon2.ts:Argon2VaultCrypto.deriveKey()` with header salt + KDF params.
3. `FileVaultStore.readSchemaVersion()` — no migrate. Behind `LATEST_SCHEMA_VERSION` and no `upgradeConfirmed` → `VAULT_UPGRADE_REQUIRED`.
4. `FileVaultStore.readLineage()` — opens db (wrong key → `WRONG_PASSPHRASE`), runs `migrate()`, reads `meta.lineage_*`.
5. `vault/infra/keyring.ts:OsKeychain.setKey()`; `recordActivity()`.
6. `vault/domain/services/vault-lineage.ts:classifyLineage()` vs `state.json` last-seen: in-sync / fast-forward → `recordSeen()`; fork → returns `fork` notice (`VAULT_FORK_DETECTED`), last-seen left untouched.
Side effects: key in OS keychain, possible schema migration (with `.pre-NNN.bak`), `state.json` updates.
Gotchas: fork still unlocks (inspection only, nothing deleted). Never-written vault (`lineage == null`) skips classification.
Related: `flows/sync-handoff.md`, `flows/schema-migration.md`
