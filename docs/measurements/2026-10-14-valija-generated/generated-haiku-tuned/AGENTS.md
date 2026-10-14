<!-- ctxmap:begin -->
# Repo context (ctxmap)
Valija — local-first, E2E-encrypted context vault (SQLCipher) exposed to AI tools via CLI and local MCP server; Electron desktop app on the same core.

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
  - desktop-ipc-call: renderer `bridge.*` → preload `ipcRenderer.invoke` → zod-validated handler → core use case → `{ code }`-only result back to renderer → `.context/flows/desktop-ipc-call.md`
  - get-context-pack: MCP `get_context` → open session → load project items → budgeted pack (pinned, latest handoff, per-type sections) → markdown → `.context/flows/get-context-pack.md`
  - import-conversations: `import <file>` → read export → parse to IR → select → chunk → one context write (deterministic ids, so re-run upserts) → counts → `.context/flows/import-conversations.md`
  - save-context: MCP `save_context` → parse input → open session (key from keychain) → one write transaction (find-or-create project, insert item, lineage bump) → device last-seen → `.context/flows/save-context.md`
  - unlock-vault: `unlock` / `vault:unlock` → read header → resolve key → schema gate → lineage read (migrates) → keychain key + device activity → fork notice if diverged → `.context/flows/unlock-vault.md`
- Existing docs (authoritative, not duplicated): `CONTRIBUTING.md`, `README.md`, `docs/SPEC.md`, `docs/gui.md`, `docs/sync.md`, `docs/vault-format.md`, `specs/README.md`
- Tool-specific instructions: `CLAUDE.md`
- Agents/skills/hooks: `.claude/agents/`, `.claude/hooks/`
- Before editing a module, read its flow doc if one exists.
- How to present answers: `.context/presentation.md`
<!-- ctxmap:end -->
