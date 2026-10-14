# Overview
Purpose: valija — local-first, end-to-end encrypted context vault that exposes AI context to MCP clients over stdio (`src/delivery/mcp/server.ts:buildMcpServer()`).
## Components
- `src/delivery/` — CLI (`cli/program.ts`), MCP server, composition root (`container.ts:buildContainer()`); the only layer that touches the console, stdio, and env.
- `src/context/` — projects, items, search, context packs. Entry: `application/use-cases/save-context.use-case.ts`.
- `src/vault/` — passphrase → key, vault header, keychain, lineage and fork detection, idle auto-lock. Entry: `application/use-cases/unlock-vault.use-case.ts`.
- `src/importers/` — ChatGPT/Claude/generic exports → conversations → chunks handed to context. Entry: `application/use-cases/import-conversations.use-case.ts`.
- `src/shared/` — SQLCipher open, migrations, vault and state paths, `Result`, `UseCase` base.
- `src/testing/` — test-vault helpers and the golden fixture (`__fixtures__/golden-vault/`).
## Data stores
| Store | Where | Holds |
|---|---|---|
| `vault.db` | `VALIJA_HOME` (default `~/.valija`) | SQLCipher db: projects, context_items + FTS5, meta (schema version, lineage) |
| `vault.json` | `VALIJA_HOME` | plaintext header: vault id, salt, KDF params, schema version |
| `vault.db.pre-NNN.bak` | `VALIJA_HOME` | ciphertext backup, transient, during a table-rebuild migration |
| `state.json` | `VALIJA_STATE_HOME` (default `~/.valija-state`) | device id, last-seen lineage, last activity; never synced |
| OS keychain | service `valija`, account = vault id | session key; present = unlocked |
## Boundaries
- Dependency direction: delivery → context, importers, vault. Context depends on vault only through the `VaultSessions` port (`src/context/application/ports/vault-session.ts`), implemented in `src/context/infra/vault-sessions.ts`.
- Importers never touch repositories or SQL. They hand drafts to `ImportItems`, a context use case, through an injected `UseCase`.
- Plaintext leaves the vault only as CLI/MCP output. `src/` has no network code.
- Devices share only the vault folder. Coordination is a lineage stamp inside the encrypted db, plus device-local `state.json`; there is no merge (`docs/sync.md`).
- Decisions: `docs/SPEC.md`. On-disk contract: `docs/vault-format.md`. User-facing sync ritual: `docs/sync.md`.
