# Flow: sync-handoff
Trigger: user moves between devices; `VALIJA_HOME` points to a folder a third-party sync client replicates. valija itself never syncs (user guide: `docs/sync.md`).
Path:
1. Every write bumps lineage atomically: `context/infra/vault-sessions.ts:commitWrite()` → `vault/infra/sqlite-lineage-store.ts:SqliteLineageStore.bump()` (generation+1, new write stamp, writer deviceId, writtenAt in `meta`).
2. Device A `valija lock` → `vault/application/use-cases/lock-vault.use-case.ts:LockVault.execute()` — reads lineage, deletes keychain key, `FileVaultFolder.inspect()` reports `-wal/-shm/-journal` sidecars (must be none).
3. Sync client uploads `vault.db` + `vault.json` (single file at rest: `journal_mode=DELETE`, `shared/infra/sqlite.ts:openVaultDb()`).
4. Device B `valija unlock` → `UnlockVault.execute()` → `classifyLineage(current, lastSeen)`:
   - no last-seen or higher generation → fast-forward, adopt silently
   - same stamp → in-sync
   - same/lower generation, different stamp → fork: `VAULT_FORK_DETECTED`, vault still unlocks
5. `src/delivery/diagnostics.ts` (`valija doctor`) flags conflicted-copy files (Dropbox/iCloud/Syncthing names via `FileVaultFolder.inspect()`), stray sidecars, leftover `.pre-NNN.bak`.
State: `meta.lineage_*` inside the synced db; per-device `lastSeen*`, `deviceId` in `$VALIJA_STATE_HOME/state.json` (never synced).
Gotchas: no merge, ever; user picks a copy. OneDrive conflict names (`vault-<HOST>.db`) not detectable. Lineage data never reaches MCP/context packs.
Related: `flows/unlock.md`, `flows/save-context.md`
