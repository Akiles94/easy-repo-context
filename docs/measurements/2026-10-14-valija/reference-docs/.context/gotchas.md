# Gotchas

- Every mutation must go through `VaultSession.write()` (`context/infra/vault-sessions.ts:commitWrite()`). It bumps the lineage (generation + write stamp) in the same transaction. A write outside it breaks fork detection on other devices.
- Read-only use cases never call `write()`; they use `session.projects` / `session.items` directly.
- Parse all input before opening a session (`SaveContext.parseInput()` pattern): bad input must never touch the vault.
- Opening the db mutates it: `shared/infra/sqlite.ts:openVaultDb()` forces `journal_mode=DELETE` and folds WAL. Never switch to WAL: a synced folder must only ever see a single `vault.db`.
- `migrate()` runs on every session open and inside `FileVaultStore.readLineage()`. Anything that must not touch the schema (upgrade check) uses `readSchemaVersion()` instead.
- `UnlockVault` refuses a behind-schema vault unless `upgradeConfirmed: true`. CLI always passes true; desktop shows a confirmation screen first.
- Wrong/stale key → `SQLITE_NOTADB`. Sessions treat it as locked and delete the keychain key; unlock maps it to `WRONG_PASSPHRASE`.
- Auto-lock is lazy: `vault/application/policies/session-guard.ts:SessionGuard` checks idle TTL at each session open (no daemon). `VALIJA_AUTOLOCK_MINUTES` (default 15, `off`/0 disables).
- `state.json` lives outside `VALIJA_HOME` on purpose; never move device identity into the synced folder.
- Item types: `ITEM_TYPES` (5) is what users/MCP may save; `STORABLE_ITEM_TYPES` adds `imported`, minted only by importers. Don't expose `imported` on the save path.
- SQLite can't ALTER a CHECK constraint: changing one means a table rebuild migration, then `INSERT INTO context_items_fts(context_items_fts) VALUES('rebuild')` (FTS is keyed on rowid).
- `docs/vault-format.md` is a contract for a second implementation (valija-mobile). Schema or format changes need §14 change control and a conformance fixture update (`src/testing/golden-vault.ts`).
- MCP surface is intentionally small ("5 tools — resist adding more", `docs/SPEC.md` §7). Lineage/device data must never appear in MCP responses or context packs.
- Process: no edits to `src/**`, `desktop/**`, `package.json` or build config until `advances/<ADV>/plan.md` has an `Approved:` line (`.claude/hooks/guard-implementation.sh`). See `CLAUDE.md`.
