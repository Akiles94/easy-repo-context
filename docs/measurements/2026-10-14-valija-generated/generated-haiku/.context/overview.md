# Overview
Purpose: valija — local-first, end-to-end encrypted context vault; exposes AI context to Claude/ChatGPT/Cursor via a local MCP server (CLI + Electron desktop app).

## Components
- `src/vault/` — keychain, Argon2id KDF, SQLCipher header/db, unlock/lock/relocate, lineage and fork detection; entry `src/vault/application/use-cases/unlock-vault.use-case.ts:UnlockVault.execute()`
- `src/context/` — projects, context items, search, context pack; owns the write session port; entry `src/context/infra/vault-sessions.ts:SqliteVaultSessions.withSession()`
- `src/importers/` — export readers and chatgpt/claude/generic parsers → normalized conversations; entry `src/importers/application/use-cases/import-conversations.use-case.ts:ImportConversations.execute()`
- `src/shared/` — SQLite open, migrations, vault and state paths, `Result` type; entry `src/shared/infra/sqlite.ts:openVaultDb()`
- `src/delivery/` — composition root `src/delivery/container.ts:buildContainer()`; CLI `src/delivery/cli/program.ts`; MCP server `src/delivery/mcp/server.ts:buildMcpServer()`
- `desktop/` — Electron app: main process IPC `desktop/src/main/ipc/register-handlers.ts:registerHandlers()`, hand-written preload `desktop/src/preload/index.ts`, renderer `desktop/src/renderer/app.tsx`, IPC contract `desktop/src/shared/ipc/channels.ts`

## Data stores
| Store | Where | Holds |
|---|---|---|
| Vault header | `vault.json` in the vault root (`docs/vault-format.md` §3) | plaintext vault id, salt, KDF params |
| Vault db | SQLCipher db in the vault root (`src/shared/infra/vault-paths.ts`) | projects, context items, `meta` (lineage stamp) |
| OS keychain | `src/vault/infra/keyring.ts:OsKeychain` | session key per vault id; present = unlocked |
| Device state | `src/vault/infra/file-device-identity.ts:FileDeviceIdentity` (state dir) | per-device last-seen lineage, last activity; outside the vault |

## Boundaries
- Writes reach the db only through `SqliteVaultSessions`, which implements the context-owned `VaultSessions` port; context depends on vault only there.
- Importers never touch the vault. They hand drafts to `ImportItems` (context), the single write path for imported items.
- Delivery (CLI, MCP, desktop) reaches use cases only through `buildContainer()`.
- Desktop main ↔ renderer crosses only the IPC contract: `channels.ts` → `schemas.ts` (zod) → handler → `toIpcResult`. Errors cross as codes.
- Renderer calls main only through the preload API, via the lock-aware bridge.
- Docs by path: `README.md` (user), `docs/SPEC.md` (M0 spec + build history), `docs/vault-format.md` (on-disk format), `docs/sync.md` (BYO-cloud and fork ritual), `docs/gui.md` (desktop), `CLAUDE.md` (advance ritual).
