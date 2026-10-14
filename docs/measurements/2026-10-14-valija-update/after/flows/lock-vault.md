# Flow: lock-vault
Summary: `valija lock` → best-effort lineage read → drop keychain key → inspect vault folder → report whether files are at rest
Trigger: `src/delivery/cli/vault-commands.ts:lockCommand()` → `LockVault.execute()`
Path:
1. `src/vault/application/use-cases/lock-vault.use-case.ts:LockVault.execute()` — reads the header for the vault id.
2. `LockVault.currentLineage()` — if a key is present, reads lineage for the report; any failure only omits those fields.
3. `src/vault/infra/keyring.ts:OsKeychain.deleteKey()` — its return value becomes `wasUnlocked`.
4. `src/vault/infra/file-vault-folder.ts:FileVaultFolder.inspect()` — sidecars (`-wal`, `-shm`, `-journal`), conflicted copies, stale backups, cloud-looking path.
5. `src/delivery/cli/vault-commands.ts:lockCommand()` — prints the "single file" reassurance only when `sidecars` is empty; otherwise warns "NOT safely at rest".
Side effects: keychain entry removed. No db write, no `state.json` write.
Gotchas: the folder check is a directory listing; it never opens the db, so it cannot tell whether the db content is consistent.
Related: `docs/sync.md` "The ritual: lock, wait, unlock".
