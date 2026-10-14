# Flow: document-list
Summary: documents.list → filter/status → membership-scoped query + COUNT → presented documents
Trigger: `server/routes/api/documents/documents.ts` (RPC `documents.list`; `documents.drafts` shares the draft logic)
Path:
1. `server/routes/api/documents/documents.ts` — builds `where`; excludes `archivedAt` unless `statusFilter` or the filter names `archivedAt`.
2. `server/routes/api/documents/documents.ts:draftVisibilityClauses()` — drafts visible only to creator or direct membership; used by both the `publishedAt` filter path and legacy `statusFilter=draft`.
3. `server/routes/api/documents/documents.ts:directMembershipDocumentIds()` — reads `UserMembership` ids directly, no association join.
4. `server/models/Document.ts:Document.withMembershipScope()` — `withDrafts` or `defaultScope`, plus `withoutState`, `withViews` and `withMembership` LEFT JOINs.
5. `server/routes/api/documents/documents.ts` — `paginateQuery` runs `findAll` and a `count` without membership includes; for `sort=index` pagination is done by slicing `documentIds`.
Side effects: none (read-only).
Gotchas: see `.context/gotchas.md` under `server/routes/api/documents`.
Related: `flows/document-update.md`
