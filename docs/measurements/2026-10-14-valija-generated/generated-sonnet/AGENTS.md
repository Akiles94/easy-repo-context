<!-- ctxmap:begin -->
# Repo context (ctxmap)
local-first E2E-encrypted context vault (SQLCipher) exposed to AI tools via a local stdio MCP server, a CLI, and an Electron companion app. Spec: `docs/SPEC.md`; on-disk contract: `docs/vault-format.md`; sync: `docs/sync.md`; GUI: `docs/gui.md`; process: `CLAUDE.md`.

## Commands
- install: `npm ci` (package-lock.json)
- build: `npm run build` (package.json#scripts.build)
- test: `npm test` (package.json#scripts.test)
- lint: `npm run lint` (package.json#scripts.lint)
- format: `npm run format` (package.json#scripts.format)
- typecheck: `npm run typecheck` (package.json#scripts.typecheck)

## Where to look
- Architecture, components, data stores: `.context/overview.md`
- Invariants and traps (read before changing code): `.context/gotchas.md`
- Flows (read only the one matching the task):
  - desktop-ipc-request: renderer bridge call → preload `invoke` → zod-validated channel → handler → use case → `{ok, error:{code}}` wire result. → `.context/flows/desktop-ipc-request.md`
  - import-conversations: `valija import <file>` / desktop import → read export → detect parser → select → chunk → single-session upsert of `imported` items. → `.context/flows/import-conversations.md`
  - mcp-save-context: MCP `save_context`/`save_handoff` → parse input → keychain-gated session → one write tx (project + item + lineage bump). → `.context/flows/mcp-save-context.md`
  - relocate-vault: desktop "move vault" → lock → copy → byte-verify → delete source → save pref → rebuild container → re-point AI-client configs. → `.context/flows/relocate-vault.md`
  - vault-unlock-and-session: `valija unlock` → derive key → schema gate → verify via lineage read → key to keychain → fork classification. → `.context/flows/vault-unlock-and-session.md`
- Existing docs (authoritative, not duplicated): `CONTRIBUTING.md`, `README.md`, `docs/SPEC.md`, `docs/gui.md`, `docs/sync.md`, `docs/vault-format.md`, `specs/README.md`
- Tool-specific instructions: `CLAUDE.md`
- Agents/skills/hooks: `.claude/agents/`, `.claude/hooks/`
- Before editing a module, read its flow doc if one exists.
- How to present answers: `.context/presentation.md`
<!-- ctxmap:end -->
