# Flow: schema-migration
Trigger: any db open on a vault behind `LATEST_SCHEMA_VERSION` (session open, `readLineage`, init).
Path:
1. `src/shared/infra/migrations.ts:migrate()` — ensures `meta`, reads `schema_version`, applies each pending entry of `MIGRATIONS`.
2. `applyMigration()` — if `backup: true` and existing vault: `backupCiphertext()` copies encrypted `vault.db` → `vault.db.pre-NNN.bak`; runs SQL + `setSchemaVersion()` in one transaction; deletes backup on success, keeps it on failure.
3. Gate for UI: `pendingMigrations()` + `vault/application/use-cases/check-vault-upgrade.use-case.ts:CheckVaultUpgrade`; `UnlockVault` requires `upgradeConfirmed`.
Adding a migration:
- New file `src/shared/infra/migrations/NNN-<name>.ts` exporting `MIGRATION_NNN` SQL; register it in `MIGRATIONS` (set `backup: true` if it rewrites data).
- Test next to it (`NNN-<name>.test.ts`): upgrade populated vault, no data loss, FTS still hits, idempotent, rollback keeps backup.
- Update `docs/vault-format.md` (§6 schema, §14 change control) and the golden fixture (`src/testing/golden-vault.ts`; regenerate with `VALIJA_WRITE_GOLDEN_VAULT=1 npm test`, see `src/delivery/vault-format-conformance.test.ts`).
Gotchas: table rebuilds must drop/recreate FTS triggers and run the FTS `rebuild`. Migrations are static SQL: no runtime device identity (see `003-lineage.ts`).
Related: `flows/unlock.md`
