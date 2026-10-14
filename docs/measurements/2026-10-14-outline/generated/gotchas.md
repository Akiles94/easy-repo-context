# Gotchas
## Repo-wide
- Document body lives in two forms: Markdown `text` and the Y.js `state`. The collaboration server is only told about a body change when `state` changed (`server/models/Document.ts:Document.notifyCollaborationServer()`); a write that touches only `content` is not pushed to open editors. Write body changes through `DocumentHelper.applyMarkdownToDocument()`.
- Do not save documents with `hooks: false`. `silent: true` only skips timestamp bumps; the AfterUpdate hooks still notify collaboration. Evidence: comment in `server/routes/api/comments/comments.ts` ("Save with hooks enabled so the AfterUpdate hook notifies the collaboration server").
## By area
### server/routes/api/documents
- Drafts are visible only to their creator or to users with a direct membership. Any path that returns drafts must go through `draftVisibilityClauses()`; the `publishedAt` filter and legacy `statusFilter=draft` both depend on it. Evidence: a8ced149.
- `Document.withMembershipScope()` with `includeDrafts` uses the `withDrafts` scope, which drops the defaultScope filters. Re-apply `template: false` and the trial-import exclusion, as the list handler does, or templates and trial imports appear in listings (`server/routes/api/documents/documents.ts`, comment near the `withDrafts` branch).
- Membership includes must stay non-filtering LEFT JOINs: the count query runs without them, so a `required` include makes totals disagree with returned rows (`server/routes/api/documents/documents.ts`; `directMembershipDocumentIds()` exists to avoid the association for this reason).
### server/routes/api/comments
- Anchored comments must lock the document row before reading its state. The handler takes `FOR UPDATE` first; otherwise two concurrent inline comments overwrite each other's marks (`server/routes/api/comments/comments.ts`).
### server/routes/api/shares
- `shares.create` returns an existing unrevoked share unchanged: request fields are only `defaults` and the publish checks run on the stored `published` value. Use `shares.update` to change a share (`server/routes/api/shares/shares.ts`).
### server/storage/files
- The S3 presigned POST must name `AWS_S3_UPLOAD_BUCKET_NAME`, not `getBucket()`, which returns the accelerate URL (`server/storage/files/S3Storage.ts:S3Storage.getPresignedPost()`).
- The presigned PUT signs `Content-Length`; S3 rejects any mismatch, so do not drop it (`server/storage/files/S3Storage.ts:S3Storage.getPresignedPut()`).
- `files.create` treats the declared attachment size as a cap: an oversize upload destroys the attachment row and fails. Evidence: fedbf28a (`plugins/storage/server/api/files.ts`).
- Upload signatures are JWTs with type `attachment-upload` bound to one key; `verifyUploadSignature()` rejects other token types, so do not reuse `attachment` read tokens for uploads (`plugins/storage/server/api/files.ts:verifyUploadSignature()`).
### server/models/helpers
- `DocumentHelper.toProsemirror()` memoizes its result against the source content or state; mutating the returned node corrupts the cache for every later caller (`server/models/helpers/DocumentHelper.tsx:DocumentHelper.toProsemirror()`).
### shared/editor
- A code fence must be longer than the longest backtick run in its content, or serialized Markdown closes the fence early (`shared/editor/nodes/CodeFence.ts`). Evidence: 63486f29.
- Markdown serializer `renderContent()` suppresses block-position tracking for nested renders; their positions are parent-relative and must not enter the top-level map (`shared/editor/lib/markdown/serializer.ts`).
