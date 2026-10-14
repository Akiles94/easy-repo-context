# Flow: save-context
Summary: MCP `save_context` → parse all input → open keyed session → one write tx (project find-or-create + item + lineage bump) → device last-seen
Trigger: `src/delivery/mcp/server.ts:buildMcpServer()` (tool `save_context`; `save_handoff` reuses the same use case with type `handoff`)
Path:
1. `src/delivery/mcp/server.ts:buildMcpServer()` — maps MCP client name to `source`, calls `container.saveContext`.
2. `src/context/application/use-cases/save-context.use-case.ts:SaveContext.execute()` — `parseInput()` validates project, type, tags, content before any session opens.
3. `src/context/infra/vault-sessions.ts:SqliteVaultSessions.withSession()` — reads header, requires key in keychain (absent → `VAULT_LOCKED`), runs idle guard, opens db, `migrate()`.
4. `src/context/application/use-cases/save-context.use-case.ts:SaveContext.findOrCreateProject()` — runs inside the write.
5. `src/context/infra/vault-sessions.ts:SqliteVaultSessions.commitWrite()` — mutation + `SqliteLineageStore.bump()` in one `db.transaction`; a failed mutation rolls back via sentinel.
6. `src/context/infra/vault-sessions.ts:SqliteVaultSessions.commitWrite()` — after commit only, `deviceIdentity.recordSeen()` stores the new stamp locally.
Side effects: `projects` and `context_items` rows; lineage keys in `meta`; per-device last-seen/activity in state dir (not in the vault). Session closed in `finally` (`src/context/infra/vault-sessions.ts:runWithSession()`).
Gotchas: see `gotchas.md` — every mutation goes through `session.write()`; `recordSeen` only after commit.
Related: `flows/unlock-vault.md`, `docs/vault-format.md` (§6 schema)
