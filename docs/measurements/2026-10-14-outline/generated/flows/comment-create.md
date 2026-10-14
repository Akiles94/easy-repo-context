# Flow: comment-create
Summary: comments.create → lock document row → apply comment mark to ProseMirror state → silent save → comment row
Trigger: `server/routes/api/comments/comments.ts` (RPC `comments.create`)
Path:
1. `server/routes/api/comments/comments.ts` — `commentingEnabled()`, rate limiter, `transaction()`.
2. `server/routes/api/comments/comments.ts` — when anchored (`anchorText` or `anchorNodeId`), `FOR UPDATE` lock on the document row happens before the document is read with state.
3. `server/routes/api/comments/comments.ts` — `authorize(user, "comment", document)`; `text` is parsed with `commentParser` after `TextHelper.replaceImagesWithAttachments()`.
4. `server/models/helpers/DocumentHelper.tsx:DocumentHelper.toState()` then `server/models/helpers/ProsemirrorHelper.tsx:ProsemirrorHelper.applyCommentMarkByText()` or `applyCommentMarkByNode()`; no match throws `ValidationError`.
5. `server/routes/api/comments/comments.ts` — `document.update({ state, content }, { silent: true })` with hooks enabled, so the collaboration server is notified.
6. `Comment.createWithCtx()` inserts the comment row.
Side effects: documents.state and documents.content rewritten without bumping `updatedAt`; comments row; collaboration server notified after commit.
Gotchas: see `.context/gotchas.md` under `server/routes/api/comments`.
Related: `flows/document-update.md`
