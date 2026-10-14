# Overview
Purpose: Valija — local-first, E2E-encrypted context vault (SQLCipher) exposed to AI tools via CLI and local MCP server; Electron desktop app on the same core.

## Components
- `src/delivery/` — CLI (`cli/program.ts`), MCP server (`mcp/server.ts:buildMcpServer()`), DI wiring (`container.ts:buildContainer()`).
- `src/context/` — projects, context items, search, context pack; owns `infra/vault-sessions.ts:SqliteVaultSessions`, the only bridge to vault concerns.
- `src/vault/` — create/unlock/lock/relocate, OS keychain, lineage (sync fork detection); entry `application/use-cases/unlock-vault.use-case.ts:UnlockVault.execute()`.
- `src/importers/` — ChatGPT/Claude/generic exports → normalized conversations → chunks; entry `application/use-cases/import-conversations.use-case.ts:ImportConversations.execute()`.
- `src/shared/` — SQLCipher open (`infra/sqlite.ts:openVaultDb()`), migrations (`infra/migrations.ts:migrate()`), `Result` type, vault/state paths.
- `desktop/src/main/` — Electron main: IPC handlers, `ipc/register-handlers.ts:registerHandlers()`, imports `src/` directly.
- `desktop/src/preload/` — hand-written `window.valija` API (`desktop/src/preload/index.ts`).
- `desktop/src/renderer/` — React screens; talks only through `state/bridge.ts:ValijaBridge`.

## Data stores
| Store | Where | Holds |
|---|---|---|
| Vault DB (SQLCipher) | `src/shared/infra/vault-paths.ts:resolveVaultPaths()` | projects, context items, FTS index, `meta` (schema version, lineage stamp) |
| Vault header | `src/vault/infra/vault-header.ts:readVaultHeader()` | vault id, read before any key use |
| OS keychain | `src/vault/infra/keyring.ts:OsKeychain` | session key per vault id; presence = unlocked |
| Device state | `src/vault/infra/file-device-identity.ts:FileDeviceIdentity` | device id, last-seen lineage, activity time |
| Recovery kit text | `desktop/src/main/ipc/handlers/vault-handlers.ts:createVaultHandlers()` | in memory only, handed to renderer once |

## Boundaries
- Adapters are wired only in `src/delivery/container.ts`; use cases receive ports.
- Context reaches vault concerns only through `src/context/infra/vault-sessions.ts`; importers never touch the vault — they call context's `ImportItems`.
- Desktop main imports root `src/` (container, domain, migrations); renderer imports only pure domain values (e.g. `desktop/src/renderer/state/project-slug.ts`).
- Desktop ↔ main crosses only via enumerated channels; errors cross as `{ code }` only.
- Desktop has no network surface or telemetry (`desktop/src/main/infra/no-network-surface.test.ts`).
- Flows: `flows/unlock-vault.md`, `flows/save-context.md`, `flows/get-context-pack.md`, `flows/import-conversations.md`, `flows/desktop-ipc-call.md`.
- Existing docs: `docs/SPEC.md` (surface, decisions), `docs/sync.md` (fork, upgrades), `docs/vault-format.md` (on-disk format), `docs/gui.md` (desktop UX).
