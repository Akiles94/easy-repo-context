# Flow: mcp-save-context
Summary: MCP `save_context`/`save_handoff` → parse input → keychain-gated session → one write tx (project + item + lineage bump).
Trigger: `src/delivery/mcp/server.ts:buildMcpServer()` tool `save_context` (`save_handoff` = same use case, `type:"handoff"`); started by `valija mcp` in `src/delivery/cli/program.ts`.
Path:
1. `src/delivery/mcp/server.ts:buildMcpServer()` — `source` = MCP client name; zod enum limits `type` to `ITEM_TYPES`.
2. `src/context/application/use-cases/save-context.use-case.ts:SaveContext.execute()` — parses project/type/tags/content before any session opens.
3. `src/context/infra/vault-sessions.ts:SqliteVaultSessions.withSession()` — header → keychain key (absent → `VAULT_LOCKED`) → `SessionGuard.guard()` → `openVaultDb` + `migrate`.
4. `src/vault/application/policies/session-guard.ts:SessionGuard.guard()` — idle TTL; expired → deletes keychain key, `VAULT_LOCKED`; else records activity.
5. `src/context/infra/vault-sessions.ts:SqliteVaultSessions.commitWrite()` — find-or-create project + `items.save` + `lineageStore.bump()` in one tx; `recordSeen` after commit.
6. `src/delivery/mcp/server.ts:buildMcpServer()` — domain error → `isError` text `"msg [CODE]"`.
Side effects: projects, context_items (+FTS), lineage generation/stamp, device activity/last-seen file. Session closed in `finally` (`runWithSession`).
Gotchas: no daemon; every tool call re-opens the DB, and "unlocked" just means a key is in the keychain.
Related: `flows/vault-unlock-and-session.md`, `docs/SPEC.md`
