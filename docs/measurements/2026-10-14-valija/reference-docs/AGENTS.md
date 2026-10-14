<!-- ctxmap:begin -->
# Repo context (ctxmap)
valija: local-first, E2E-encrypted AI-context vault. One SQLCipher db, exposed via CLI + MCP server (`src/`) and an Electron app (`desktop/`, reuses `src/delivery/container.ts`).

## Commands
- install: `npm ci` (package-lock.json)
- typecheck: `npm run typecheck` (package.json#scripts.typecheck)
- lint: `npm run lint` (package.json#scripts.lint)
- test: `npm test` (package.json#scripts.test)
- build: `npm run build` (package.json#scripts.build)
- `desktop/` has its own package.json with the same script names; run them from `desktop/`.

## Where to look
- Architecture, modules, data stores: `.context/overview.md`
- Traps and invariants (read before editing `vault/`, `shared/infra/`, `context/infra/`): `.context/gotchas.md`
- Flows (read only the one matching the task):
  - save-context: MCP/CLI save → validate → session → encrypted write + lineage bump → `.context/flows/save-context.md`
  - unlock: passphrase → Argon2id key → schema gate → migrate → keychain → fork check → `.context/flows/unlock.md`
  - sync-handoff: lock on A, sync folder, unlock on B, fork detection → `.context/flows/sync-handoff.md`
  - schema-migration: adding or running a vault schema migration → `.context/flows/schema-migration.md`
- Existing docs (authoritative, not duplicated here): `docs/SPEC.md` (product spec, MCP/CLI surface), `docs/vault-format.md` (on-disk contract), `docs/sync.md` (user-facing sync), `docs/gui.md` (desktop), `CONTRIBUTING.md`
- Process (advance ritual, approval gates, hooks): `CLAUDE.md`; subagents in `.claude/agents/`; past specs/plans/reviews in `advances/<ADV>/`
- Before editing a module, read its flow doc if one exists.
- How to present answers: `.context/presentation.md`
<!-- ctxmap:end -->
