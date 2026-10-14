# Flow: document-update
Summary: documents.update → documentUpdater → row lock → save → afterCommit collaboration notify
Trigger: `server/routes/api/documents/documents.ts` (RPC `documents.update`)
Path:
1. `server/routes/api/documents/documents.ts` — loads document with `includeState`, authorizes `update` (or `updateDeprecatedReason`), checks publish rights when `publish` is set.
2. `server/commands/documentUpdater.ts:documentUpdater()` — applies title/icon/preferences; `text` goes through `DocumentHelper.applyMarkdownToDocument()` in the requested `editMode`.
3. `server/commands/documentUpdater.ts:documentUpdater()` — takes `FOR UPDATE` row lock; `lastRevision` joins the lock predicate, mismatch throws `DocumentConflictError`.
4. `server/commands/documentUpdater.ts:documentUpdater()` — `publish` calls `document.publish()`, otherwise `saveWithCtx()`; `done` alone only schedules an event.
5. `server/models/Document.ts:Document.notifyCollaborationServer()` — AfterUpdate hook; runs only when `state` changed, deferred to parent transaction `afterCommit`.
6. `server/models/Document.ts:Document.publishTitleChangeEvent()` — AfterUpdate hook; emits `title_change` when title changed.
Side effects: documents row (title, content, state), Event rows, live editors notified via `server/collaboration/APIUpdateExtension.ts`, base64 images converted to attachments by `TextHelper.replaceImagesWithAttachments()`.
Gotchas: without `lastRevision` there is no conflict check, so concurrent REST writes are last-write-wins.
Related: `flows/comment-create.md`, `flows/document-list.md`
