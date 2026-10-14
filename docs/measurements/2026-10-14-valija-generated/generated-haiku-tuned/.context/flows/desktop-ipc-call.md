# Flow: desktop-ipc-call
Summary: renderer `bridge.*` → preload `ipcRenderer.invoke` → zod-validated handler → core use case → `{ code }`-only result back to renderer
Trigger: `desktop/src/preload/index.ts` (`contextBridge.exposeInMainWorld("valija")`, one hand-written method per channel)
Path:
1. `desktop/src/renderer/state/bridge.ts:ValijaBridge` — the only interface screens call; tests fake it.
2. `desktop/src/preload/index.ts` — each method wraps `ipcRenderer.invoke(channel)`.
3. `desktop/src/main/ipc/register-handlers.ts:registerHandlers()` — `ipcMain.handle` per channel in `CHANNELS`; `SCHEMAS[channel].safeParse()` before the handler runs.
4. `desktop/src/main/ipc/handlers/vault-handlers.ts:createVaultHandlers()` (other `*-handlers.ts` alike) — calls `getContainer()` use case, maps the `Result`.
5. `desktop/src/main/ipc/to-ipc-result.ts:toIpcResult()` — drops `DomainError.message`; wire carries `code` only.
6. `desktop/src/renderer/state/bridge.ts:ValijaBridge` — renderer shows localized copy keyed by `code` (`desktop/src/shared/i18n/error-copy.ts`).
Side effects: none of its own; the core use case decides.
Gotchas: see `gotchas.md` → desktop.
Related: `docs/gui.md`, `desktop/src/shared/ipc/messages.ts` (wire types)
