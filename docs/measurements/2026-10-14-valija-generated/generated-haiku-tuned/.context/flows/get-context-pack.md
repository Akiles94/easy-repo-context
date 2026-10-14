# Flow: get-context-pack
Summary: MCP `get_context` → open session → load project items → budgeted pack (pinned, latest handoff, per-type sections) → markdown
Trigger: `src/delivery/mcp/server.ts:buildMcpServer()` (tool `get_context`, budget default 4000 tokens)
Path:
1. `src/context/application/use-cases/get-context-pack.use-case.ts:GetContextPack.execute()` — parses project name; absent project → `PROJECT_NOT_FOUND`.
2. `src/context/infra/vault-sessions.ts:SqliteVaultSessions.withSession()` — same open path as writes (key, guard, `migrate()`); no `commitWrite()`, so no lineage bump.
3. `src/context/domain/services/context-pack.ts:assembleContextPack()` — newest first, no item repeats; order: pinned → latest handoff → one section per type. Token cost ≈ chars/4 (`estimateTokens()`), not a tokenizer count.
4. `src/delivery/context-pack-markdown.ts:renderContextPackMarkdown()` — formatting lives here, not in the domain service.
Side effects: none (read-only).
Related: `flows/save-context.md`, `docs/SPEC.md` §5 ("Context pack assembly")
