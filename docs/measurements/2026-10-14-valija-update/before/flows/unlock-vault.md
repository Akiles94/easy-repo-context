# Flow: unlock-vault
Summary: `valija unlock` → derive key (Argon2id) or take recovery key → verify by opening db → key into OS keychain → lineage classification (fork warns, never blocks)
Trigger: `src/delivery/cli/vault-commands.ts:unlockCommand()` → `UnlockVault.execute()`
Path:
1. `src/delivery/cli/vault-commands.ts:unlockCommand()` — hidden passphrase prompt, or `--recovery-key`.
2. `src/vault/application/use-cases/unlock-vault.use-case.ts:UnlockVault.resolveKey()` — recovery key used as-is; passphrase goes through `src/vault/infra/argon2.ts:Argon2VaultCrypto.deriveKey()` with the header's salt and KDF params.
3. `src/vault/infra/file-vault-store.ts:FileVaultStore.readLineage()` — opens the db with the key (wrong key → `WRONG_PASSPHRASE`), runs migrations, reads lineage.
4. `src/vault/infra/keyring.ts:OsKeychain.setKey()` — the key is stored only after step 3 has verified it.
5. `src/vault/domain/services/vault-lineage.ts:classifyLineage()` — `in-sync`, `fast-forward`, or `fork`.
6. `UnlockVault.execute()` — fork returns ok with a `ForkNotice` (vault stays unlocked, last-seen untouched); otherwise `deviceIdentity.recordSeen()`.
Side effects: OS keychain entry; `state.json` activity and last-seen; a `vault.db.pre-NNN.bak` may be written during a migration and removed on success.
Related: `docs/sync.md` "If you skip the ritual: fork detection", `docs/vault-format.md`.
