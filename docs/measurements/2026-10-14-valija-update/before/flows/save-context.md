# Flow: save-context
Summary: MCP `save_context` → validate input → open unlocked session → insert item (+ project if new) → lineage bump and last-seen in one commit → close
Trigger: `src/delivery/mcp/server.ts:buildMcpServer()` (tool `save_context`; `save_handoff` reuses the path with type `handoff`)
Path:
1. `src/delivery/mcp/server.ts:buildMcpServer()` — passes the MCP client name as `source`; errors come back as `isError` text.
2. `src/context/application/use-cases/save-context.use-case.ts:SaveContext.execute()` — parses project, type (default `fact`), tags, content before any session opens.
3. `src/context/infra/vault-sessions.ts:SqliteVaultSessions.withSession()` — reads header, requires the key in the keychain, runs the idle guard, opens SQLCipher db, runs migrations.
4. `SaveContext.execute()` callback inside `session.write()` — find-or-create project, `createContextItem()` with a ULID, `items.save()`.
5. `src/context/infra/vault-sessions.ts:SqliteVaultSessions.commitWrite()` — one `db.transaction`: mutation plus `lineageStore.bump()`; a failed Result throws a sentinel to roll back.
6. `src/context/infra/vault-sessions.ts:SqliteVaultSessions.commitWrite()` — after commit only, `deviceIdentity.recordSeen()` (device-local `state.json`).
7. `src/context/infra/vault-sessions.ts:runWithSession()` — `close()` runs in `finally`, even when the action throws.
Side effects: `context_items` row; `projects` row if new; `meta` lineage rows (generation, write stamp, writer, written_at); `state.json` last-seen for the vault.
Related: `flows/get-context.md`, `docs/SPEC.md` §7 (MCP surface), `README.md` "The MCP surface".
