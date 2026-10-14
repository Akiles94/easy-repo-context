<!-- ctxmap:begin -->
# Repo context (ctxmap)
valija — local-first, end-to-end encrypted context vault; exposes AI context to Claude/ChatGPT/Cursor via a local MCP server (CLI + Electron desktop app).

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
  - desktop-ipc-call: renderer → lock-aware bridge → preload `ipcRenderer.invoke` → main `ipcMain.handle` → zod schema → handler → `toIpcResult` (code only) → `.context/flows/desktop-ipc-call.md`
  - import-conversations: `valija import <file>` → read export (zip under size cap) → detect/parse → select → chunk → one write session → upsert imported items → `.context/flows/import-conversations.md`
  - relocate-vault: desktop "move vault" → lock → copy header + db → verify sha256 → remove source → rebuild container → re-point AI clients → `.context/flows/relocate-vault.md`
  - save-context: MCP `save_context` → parse all input → open keyed session → one write tx (project find-or-create + item + lineage bump) → device last-seen → `.context/flows/save-context.md`
  - unlock-vault: `valija unlock` / desktop `vault:unlock` → derive key (Argon2id or recovery key) → schema gate → lineage read → fork check → key into OS keychain → `.context/flows/unlock-vault.md`
- Existing docs (authoritative, not duplicated): `CONTRIBUTING.md`, `README.md`, `docs/SPEC.md`, `docs/gui.md`, `docs/sync.md`, `docs/vault-format.md`, `specs/README.md`
- Tool-specific instructions: `CLAUDE.md`
- Agents/skills/hooks: `.claude/agents/`, `.claude/hooks/`
- Before editing a module, read its flow doc if one exists.
- How to present answers: `.context/presentation.md`
<!-- ctxmap:end -->
