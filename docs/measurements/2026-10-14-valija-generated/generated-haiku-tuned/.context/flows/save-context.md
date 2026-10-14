# Flow: save-context
Summary: MCP `save_context` → parse input → open session (key from keychain) → one write transaction (find-or-create project, insert item, lineage bump) → device last-seen
Trigger: `src/delivery/mcp/server.ts:buildMcpServer()` (tools `save_context`, `save_handoff`)
Path:
1. `src/delivery/mcp/server.ts:buildMcpServer()` — passes MCP client name as `source`; `save_handoff` is the same use case with `type: "handoff"`.
2. `src/context/application/use-cases/save-context.use-case.ts:SaveContext.parseInput()` — project name, type, tags, content parsed before any session opens.
3. `src/context/infra/vault-sessions.ts:SqliteVaultSessions.withSession()` — header → key in keychain (missing → `VAULT_LOCKED`) → guard → open DB → `migrate()`; `runWithSession()` always closes.
4. `src/context/infra/vault-sessions.ts:SqliteVaultSessions.commitWrite()` — mutation and `lineageStore.bump()` in one transaction; a failed mutation rolls back via sentinel throw.
5. `src/context/application/use-cases/save-context.use-case.ts:SaveContext.findOrCreateProject()` — creates the project inside the same write when missing.
6. `src/vault/application/ports/device-identity.ts:DeviceIdentity` — `recordSeen()` called by `commitWrite()` only after commit.
Side effects: project and context item rows; lineage stamp in `meta`; device last-seen state.
Gotchas: see `gotchas.md` → context, vault.
Related: `flows/get-context-pack.md`, `docs/SPEC.md` §7 (MCP tool surface)
