# Flow: save-context
Trigger: MCP tools `save_context` / `save_handoff` (type forced to `handoff`); CLI has no save command.
Path:
1. `src/delivery/mcp/server.ts:buildMcpServer()` — zod schema; `source` = MCP client name.
2. `src/context/application/use-cases/save-context.use-case.ts:SaveContext.execute()` — `parseInput()`: project name, type (default `fact`), tags (≤10, `[a-z0-9-]`), content (trimmed, ≤32 KB). Fails before any I/O.
3. `src/context/infra/vault-sessions.ts:SqliteVaultSessions.open()` — read `vault.json` header → key from OS keychain (missing → `VAULT_LOCKED`) → `SessionGuard.guard()` idle TTL → `openVaultDb()` (SQLCipher, raw key) → `migrate()`.
4. `session.write()` → `commitWrite()` — one transaction: find-or-create project, `createContextItem()`, `SqliteContextItemRepository.save()` (upsert; tags stored as JSON; FTS5 updated by triggers), then `SqliteLineageStore.bump()`.
5. After commit: `FileDeviceIdentity.recordSeen()` stores new generation/stamp in `state.json`. Session always closed (`runWithSession` finally).
Side effects: rows in `projects`/`context_items`, FTS index, `meta.lineage_*`, `state.json`.
Encryption: whole db file encrypted by SQLCipher with the 32-byte key derived at unlock; no per-item crypto.
Gotchas: failed mutation rolls back the lineage bump too (`WriteFailedSentinel`). Stale key → keychain key deleted, reported as locked.
Related: `flows/unlock.md`, `flows/sync-handoff.md`
