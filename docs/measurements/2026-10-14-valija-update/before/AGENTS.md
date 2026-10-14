<!-- ctxmap:begin -->
# Repo context (ctxmap)
valija — local-first, end-to-end encrypted context vault that exposes AI context to MCP clients over stdio (`src/delivery/mcp/server.ts:buildMcpServer()`).

## Commands
- install: `npm ci` (package-lock.json)
- build: `npm run build` (package.json#scripts.build)
- test: `npm test` (package.json#scripts.test)
- lint: `npm run lint` (package.json#scripts.lint)
- format: `npm run format` (package.json#scripts.format)
- typecheck: `npm run typecheck` (package.json#scripts.typecheck)

## Where to look
- Architecture, components, data stores: `.context/overview.md`
- Invariants and traps: `.context/gotchas.md` (before changing code, read "Repo-wide" + the areas you touch)
- Flows (read only the one matching the task):
  - get-context: MCP `get_context` → open session (idle guard) → load project items → assemble budgeted pack → render markdown; no item writes → `.context/flows/get-context.md`
  - import-conversations: `valija import <file> -p <project>` → read zip/json → pick parser → select conversations → render chunks → one batched context write with deterministic ids → `.context/flows/import-conversations.md`
  - lock-vault: `valija lock` → best-effort lineage read → drop keychain key → inspect vault folder → report whether files are at rest → `.context/flows/lock-vault.md`
  - save-context: MCP `save_context` → validate input → open unlocked session → insert item (+ project if new) → lineage bump and last-seen in one commit → close → `.context/flows/save-context.md`
  - unlock-vault: `valija unlock` → derive key (Argon2id) or take recovery key → verify by opening db → key into OS keychain → lineage classification (fork warns, never blocks) → `.context/flows/unlock-vault.md`
- Existing docs (authoritative, not duplicated): `CONTRIBUTING.md`, `README.md`, `docs/SPEC.md`, `docs/sync.md`, `docs/vault-format.md`, `specs/README.md`
- Tool-specific instructions: `CLAUDE.md`
- Agents/skills/hooks: `.claude/agents/`, `.claude/hooks/`
- Before editing a module, read its flow doc if one exists.
- How to present answers: `.context/presentation.md`
<!-- ctxmap:end -->
