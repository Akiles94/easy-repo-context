# Gotchas
## Repo-wide
- No edits to `src/**`, `package.json`, `tsup.config.ts`, or `tsconfig*.json` until the advance's `plan.md` has an `Approved:` line; agents never write that line. Enforced by `.claude/hooks/guard-implementation.sh`; process in `CLAUDE.md`.
- Push and merge are blocked unless `advances/<ADV>/review.md` starts with `Verdict: PASS`, and the reviewer may write only `review.md`. Enforced by `.claude/hooks/guard-git-ops.sh` and `.claude/hooks/guard-review-writes.sh`.
- At rest the vault is one encrypted `vault.db` in a rollback-journal mode. Never enable WAL: a synced folder would upload `-wal`/`-shm` out of step with the db. See `src/shared/infra/sqlite.ts:openVaultDb()`; the lock warning came from `2fcf51f`.
- Every mutation goes through `VaultSession.write()`: it is the only path that bumps lineage (generation and write stamp), atomically with the change. A direct `items.save()` leaves other devices blind to the change; a read that calls `write()` makes every reader look like a writer. See `src/context/infra/vault-sessions.ts:SqliteVaultSessions.commitWrite()`.
- The session key lives only in the OS keychain (`src/vault/infra/keyring.ts:OsKeychain`); "locked" means "no key present". Never cache it in a file, env var, or `state.json`. `OsKeychain.getKey()` also maps any keychain error to null, so a broken keychain reads as locked.
- Device-local state (`state.json`: device id, last-seen lineage, activity) must resolve through `src/shared/infra/state-paths.ts:resolveStatePaths()`, outside `VALIJA_HOME`, which BYO-cloud setups point at a synced folder.
- Schema changes are append-only entries in `src/shared/infra/migrations.ts:MIGRATIONS`, applied on every session open. Table rebuilds must set `backup: true`, which keeps a ciphertext copy `vault.db.pre-NNN.bak` until success. Doctor flags leftovers (`src/vault/infra/file-vault-folder.ts`).
## By area
### vault
- `UnlockVault.execute()` must not advance last-seen on a fork: the warning would vanish without any resolution. Fork still returns ok, so the vault stays unlocked for inspection. See `src/vault/application/use-cases/unlock-vault.use-case.ts:UnlockVault.execute()`.
- Fork detection is generation-based. `classifyLineage()` calls a copy a fork only when its generation is not ahead of this device's last-seen; a divergent copy that has written past it is classified as fast-forward and adopted silently. Read from code and the test names in `src/vault/domain/services/vault-lineage.test.ts`; not reproduced.
- A `SQLITE_NOTADB` on open is a stale key, not a storage error: it is mapped to `VAULT_LOCKED` and the keychain entry is deleted (`src/context/infra/vault-sessions.ts:SqliteVaultSessions.openRepositories()`). Keep that mapping, or the stale key stays and every call fails.
- `state.json` is written write-then-rename (`src/vault/infra/file-device-identity.ts:FileDeviceIdentity.writeState()`). `readState()` turns a truncated file into `{}`, which mints a new device id and forgets last-seen, so the next divergent copy looks like a clean fast-forward.
- `lock` and `status` must warn when sidecars exist and never print the "single file … safe" line unconditionally. Evidence: `2fcf51f` (review C2); see `src/delivery/cli/vault-commands.ts:lockCommand()`.
### context
- `imported` is storable but never creatable by a user or model: it lives in `STORABLE_ITEM_TYPES`, not `ITEM_TYPES`. Keep it out of `ITEM_TYPES`, which feeds the MCP `save_context` enum. See `src/context/domain/values/item-type.ts`.
- Imported ids are a hash of `projectId`, source, conversation id, and chunk index (`src/context/domain/entities/context-item.ts:importedItemId()`). Re-import upserts only into the same project; changing any input, including the hash format, makes re-imports duplicate.
- User search text never reaches FTS5 unquoted: `src/context/infra/item-repo.ts:toFtsQuery()` quotes each term. Bypassing it lets input like `AND` or a stray `"` become query syntax.
### importers
- `generic` is absent from `autodetect` (`src/importers/infra/parser-registry.ts`): a permissive envelope match could swallow a malformed official export. A new provider joins `autodetect` only with a specific `detect()`.
- Zip size caps are checked in the `unzipSync` filter, from the declared entry size, before inflation (`src/importers/infra/file-export-reader.ts:FileExportReader.readZip()`). Do not move the check to after inflation.
