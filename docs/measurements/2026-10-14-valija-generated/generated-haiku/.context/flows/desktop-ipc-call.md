# Flow: desktop-ipc-call
Summary: renderer → lock-aware bridge → preload `ipcRenderer.invoke` → main `ipcMain.handle` → zod schema → handler → `toIpcResult` (code only)
Trigger: `desktop/src/main/ipc/register-handlers.ts:registerHandlers()` — one `ipcMain.handle` per entry of `CHANNELS` in `desktop/src/shared/ipc/channels.ts`
Path:
1. `desktop/src/renderer/state/lock-aware-bridge.ts:withLockDetection()` — wraps the bridge; `VAULT_LOCKED` triggers the locked transition. Built once in `desktop/src/renderer/app.tsx`.
2. `desktop/src/preload/index.ts` — hand-written `contextBridge.exposeInMainWorld("valija", …)`; one `ipcRenderer.invoke(channel, req)` per method.
3. `register-handlers.ts:registerHandlers()` — throws at registration if a `CHANNELS` entry has no handler.
4. `desktop/src/main/ipc/schemas.ts:SCHEMAS` — `safeParse` on the raw request; invalid → thrown `Error`, not an `IpcResult`.
5. `desktop/src/main/ipc/handlers/*-handlers.ts` — per-channel handler calls a use case via `getContainer()`.
6. `desktop/src/main/ipc/to-ipc-result.ts:toIpcResult()` — `Result` → `IpcResult` (`{ ok, value }` or `{ ok: false, error: { code } }`).
Side effects: only those of the invoked use case.
Gotchas: see `gotchas.md` — a new channel needs four edits; error text never crosses.
Related: `desktop/src/shared/ipc/messages.ts` (request/response types), `docs/gui.md`
