# Overview
Purpose: Outline, a collaborative team knowledge base: React web client, Koa API, real-time Y.js collaboration, optional plugins.
## Components
- `app/` — React + MobX web client; `app/utils/files.ts:uploadFile()` for uploads, `app/components/WebsocketProvider.tsx` for realtime.
- `server/routes/` — RPC-style Koa routes (`/api/<resource>.<action>`), e.g. `server/routes/api/documents/documents.ts`; entry `server/routes/index.ts`.
- `server/commands/` — multi-model business logic called by routes, e.g. `server/commands/documentUpdater.ts:documentUpdater()`.
- `server/models/` — Sequelize models; `server/models/Document.ts` holds hooks that drive collaboration; `server/models/helpers/` does Markdown/ProseMirror/Y.js conversion.
- `server/collaboration/` — Y.js collaboration server; `server/collaboration/APIUpdateExtension.ts` receives REST-side body updates.
- `server/mcp/` — MCP tools that reuse the same models, e.g. `server/mcp/tools/documents.ts`.
- `server/storage/files/` — attachment backends: `S3Storage.ts`, `LocalStorage.ts`.
- `shared/` — code used by app and server via `@shared/`: editor (`shared/editor/`), Markdown serializer, types, i18n.
- `plugins/` — optional features with own server/client code, e.g. `plugins/storage/server/api/files.ts`.
## Data stores
| Store | Where | Holds |
|---|---|---|
| PostgreSQL | Sequelize models in `server/models/` | documents (Markdown-derived `content` plus Y.js `state`), collections, comments, shares, attachments, events |
| Redis | Bull queues (see `docs/ARCHITECTURE.md`) | background jobs and async events |
| S3 or local disk | `server/storage/files/` | uploaded attachment bytes |
## Boundaries
- Client ↔ server: POST RPC routes under `/api/` plus the realtime WebSocket for Y.js sync; responses shaped by presenters.
- Body text has two representations; REST writes reach open editors only through the collaboration hooks (see `.context/gotchas.md`).
- `shared/` is the code both app and server import via `@shared/`; keep server-only logic out of it.
- Upload bytes go from the browser straight to S3 when presigned; only local storage routes bytes through the API.
