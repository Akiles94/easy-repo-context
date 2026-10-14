# Flow: get-context
Summary: MCP `get_context` → open session (idle guard) → load project items → assemble budgeted pack → render markdown; no item writes
Trigger: `src/delivery/mcp/server.ts:buildMcpServer()` (tool `get_context`); `valija export` reuses the same use case unbudgeted (`src/delivery/cli/content-commands.ts`)
Path:
1. `src/delivery/mcp/server.ts:buildMcpServer()` — optional `budget`, default 4000 tokens.
2. `src/context/application/use-cases/get-context-pack.use-case.ts:GetContextPack.execute()` — parses the project name; no write path.
3. `src/context/infra/vault-sessions.ts:SqliteVaultSessions.withSession()` — same open path as save; never calls `write()`, so lineage is not bumped.
4. `src/vault/application/policies/session-guard.ts:SessionGuard.guard()` — idle TTL check: expired → drops the keychain key and returns `VAULT_LOCKED`; otherwise refreshes last activity.
5. `GetContextPack.execute()` — `projects.findByName()` (`PROJECT_NOT_FOUND` if missing), then `items.findByProject()` (archived excluded, newest first).
6. `src/context/domain/services/context-pack.ts:assembleContextPack()` — sections in order: pinned, latest handoff, then one per type; no item repeats.
7. `src/delivery/context-pack-markdown.ts:renderContextPackMarkdown()` — formatting only.
Side effects: `state.json` last-activity timestamp; migrations may run on open; keychain key deleted if idle-expired.
Gotchas: every read counts as activity, so a client that polls `get_context` keeps an idle vault unlocked indefinitely.
Related: `flows/save-context.md`, `docs/vault-format.md` §14 (pack algorithm and renderer changes).
