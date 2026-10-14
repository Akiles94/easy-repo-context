# Flow: unlock-vault
Summary: `valija unlock` / desktop `vault:unlock` → derive key (Argon2id or recovery key) → schema gate → lineage read → fork check → key into OS keychain
Trigger: `src/delivery/cli/vault-commands.ts:unlockCommand()` (CLI `unlock`, from `src/delivery/cli/program.ts`); `desktop/src/main/ipc/handlers/vault-handlers.ts` (`vault:unlock`)
Path:
1. `src/vault/application/use-cases/unlock-vault.use-case.ts:UnlockVault.execute()` — reads plaintext header (`docs/vault-format.md` §3).
2. `src/vault/application/services/resolve-unlock-key.ts:resolveUnlockKey()` — recovery key used as-is; passphrase via `src/vault/infra/argon2.ts:Argon2VaultCrypto.deriveKey()` with header salt and KDF params.
3. `src/vault/infra/file-vault-store.ts:FileVaultStore.readSchemaVersion()` — read-only, no migrate. Behind schema without `upgradeConfirmed` → `VAULT_UPGRADE_REQUIRED`.
4. `src/vault/infra/file-vault-store.ts:FileVaultStore.readLineage()` — opens db with key (mismatch → `WRONG_PASSPHRASE`), migrates, reads lineage stamp.
5. `src/vault/infra/keyring.ts:OsKeychain.setKey()` — key stored per vault id; this is what "unlocked" means.
6. `src/vault/domain/services/vault-lineage.ts:classifyLineage()` — compares stamp with device last-seen: in-sync, fast-forward, or fork.
7. Fork → returns `ForkNotice`, vault stays unlocked, last-seen untouched. Otherwise `FileDeviceIdentity.recordSeen()`.
Side effects: keychain entry; device activity timestamp (`recordActivity`); device last-seen (non-fork only). Argon2id cost on every passphrase unlock.
Gotchas: see `gotchas.md` — schema gate before `readLineage`; fork never auto-resolved.
Related: `flows/save-context.md`, `docs/sync.md` (fork ritual), `docs/vault-format.md` (§4 KDF)
