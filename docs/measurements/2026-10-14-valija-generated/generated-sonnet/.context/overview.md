# Overview
Purpose: local-first E2E-encrypted context vault (SQLCipher) exposed to AI tools via a local stdio MCP server, a CLI, and an Electron companion app. Spec: `docs/SPEC.md`; on-disk contract: `docs/vault-format.md`; sync: `docs/sync.md`; GUI: `docs/gui.md`; process: `CLAUDE.md`.
## Components
- `src/vault` — passphrase/key lifecycle: create/unlock/lock/relocate, lineage (fork detection), idle auto-lock; entry `src/vault/application/use-cases/unlock-vault.use-case.ts`.
- `src/context` — projects + items, context-pack assembly, FTS search; entry `src/context/application/use-cases/save-context.use-case.ts`; sole guardian of `ContextItem`.
- `src/importers` — ChatGPT/Claude/generic export → chunks, handed to context's `ImportItems`; entry `src/importers/application/use-cases/import-conversations.use-case.ts`.
- `src/shared` — `Result`, `UseCase`, SQLite open/migrations, vault paths; `src/shared/infra/sqlite.ts`.
- `src/delivery` — composition root `src/delivery/container.ts`; CLI `src/delivery/cli/program.ts`; MCP `src/delivery/mcp/server.ts`.
- `desktop/` — Electron app (own `package.json`); main imports root `src/` by relative path; IPC in `desktop/src/main/ipc/register-handlers.ts`, wire types `desktop/src/shared/ipc/messages.ts`.
- `src/testing` — golden-vault fixture + helpers behind the format-conformance test.
- `advances/` — per-advance refined/plan/review records (decision log).
## Data stores
| Store | Where | Holds |
|---|---|---|
| `vault.db` | `$VALIJA_HOME` (default `~/.valija/`) | SQLCipher DB: projects, context_items (+FTS5), meta, lineage |
| `vault.json` | same dir, plaintext | vaultId, salt, KDF params (`src/vault/infra/vault-header.ts`) |
| OS keychain | `src/vault/infra/keyring.ts` | session key; present = unlocked |
| device state file | `src/shared/infra/state-paths.ts` | device id, last-seen lineage, last activity (`src/vault/infra/file-device-identity.ts`) |
| desktop prefs | `desktop/src/main/infra/file-app-preferences-store.ts` | UI prefs + vault path hint only |
## Boundaries
- Every adapter (CLI, MCP, IPC handlers) calls use cases from one `Container`; none opens the DB itself.
- Context reaches the vault only through the `VaultSessions` port (`src/context/application/ports/vault-session.ts`), implemented in `src/context/infra/vault-sessions.ts`.
- Use cases don't call each other, except importers → context via an injected use case.
- Nothing networks: no telemetry, no HTTP MCP, no auto-update (desktop tests enforce it).
- Renderer sees error `code` only, never `DomainError.message`.
