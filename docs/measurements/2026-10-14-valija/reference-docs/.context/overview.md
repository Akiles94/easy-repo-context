# Overview

## Components
- `src/delivery/` — composition root and adapters to the outside.
  - `container.ts:buildContainer()` — wires every use case; shared by CLI, MCP and desktop.
  - `cli/program.ts` — commander CLI (init, unlock, lock, status, projects, show, search, export, import, install, mcp, doctor).
  - `mcp/server.ts:buildMcpServer()` — stdio MCP server: 5 tools (save_context, save_handoff, get_context, search_context, list_projects) + 2 prompts.
  - `diagnostics.ts` — `doctor`/`status` checks (sidecars, conflicted copies, leftover backups, lineage).
- `src/vault/` — vault lifecycle: create, unlock, lock, status, relocate, upgrade check; keys, lineage, auto-lock.
- `src/context/` — projects and context items: save, search, context pack, import items. Depends on `vault/` only through the `VaultSessions` port.
- `src/importers/` — parse ChatGPT/Claude/generic exports into items (`ImportConversations` → `ImportItems`).
- `src/shared/` — `Result`/`DomainError`, `UseCase`, SQLite open (`infra/sqlite.ts`), migrations, path resolution.
- `desktop/` — Electron main/preload/renderer; calls the same container over IPC.

Each module: `domain/` (values, entities, pure services) → `application/` (ports, use cases, policies) → `infra/` (tech-named adapters).

## Data stores
| Store | Where | Synced | Holds |
|---|---|---|---|
| `vault.json` | `$VALIJA_HOME` (default `~/.valija`) | yes | plaintext header: vaultId, Argon2id params, salt |
| `vault.db` | `$VALIJA_HOME` | yes | SQLCipher db: projects, context_items (+FTS5), meta (schema_version, lineage_*) |
| OS keychain | service `valija`, account = vaultId | no | session key (hex) while unlocked |
| `state.json` | `$VALIJA_STATE_HOME` (default `~/.valija-state`) | never | deviceId, per-vault last-seen lineage, last activity |

## Boundaries
- Unlocked = key present in OS keychain. Every use case opens the db per operation through `context/infra/vault-sessions.ts:SqliteVaultSessions` and closes it after.
- No network calls anywhere. Sync is an external client replicating `$VALIJA_HOME`.
- Errors are values: `Result<T, DomainError>`; codes via `vaultErr`/`contextErr`.
