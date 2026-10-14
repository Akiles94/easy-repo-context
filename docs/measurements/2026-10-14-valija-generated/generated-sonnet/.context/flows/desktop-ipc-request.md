# Flow: desktop-ipc-request
Summary: renderer bridge call → preload `invoke` → zod-validated channel → handler → use case → `{ok, error:{code}}` wire result.
Trigger: `window.valija.*` methods in `desktop/src/preload/index.ts`, consumed via `desktop/src/renderer/state/bridge.ts`.
Path:
1. `desktop/src/preload/index.ts` — hand-written method per channel (no loop over the channel tuple).
2. `desktop/src/main/ipc/register-handlers.ts:registerHandlers()` — iterates `CHANNELS` (`desktop/src/shared/ipc/channels.ts`); channel without handler throws at startup; request parsed by `SCHEMAS[channel]` (`desktop/src/main/ipc/schemas.ts`).
3. `desktop/src/main/ipc/handlers/vault-handlers.ts` (and siblings) — thin: call `getContainer().<useCase>`.
4. `desktop/src/main/ipc/to-ipc-result.ts:toIpcResult()` — drops `DomainError.message`, keeps `code`.
5. Renderer maps `code` to i18n copy (`desktop/src/shared/i18n`).
Side effects: whatever the use case does; container may be rebuilt after relocation.
Gotchas: a new channel touches `channels.ts`, `schemas.ts`, `messages.ts`, the handler map, preload, and bridge. Call `getContainer()` per request, since the container is swapped on relocation.
Related: `flows/relocate-vault.md`, `docs/gui.md`
