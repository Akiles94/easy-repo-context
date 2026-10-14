The `.context/` docs are written and pass `easy-repo-context check` (9 docs, 0 broken). `index` and `stamp` have run. No code was edited; the only change outside `.context/` is an appended pointer block in `AGENTS.md` (29 lines, added by `index`).

**Files**
- `.context/overview.md`: components, data stores table, boundaries.
- `.context/gotchas.md`: 2 repo-wide bullets and 12 area bullets.
- `.context/flows/document-update.md`, `document-list.md`, `comment-create.md`, `attachment-upload.md`, `share-create.md`.
- `.context/presentation.md`, `.context/manifest.yaml`, and the `AGENTS.md` block, all from `index` and `stamp`.

**Flows chosen**
I took the five highest-ranked candidates that cover distinct mechanisms with side effects:
- **document-update** (`documents.update`): the core write path, through the row lock and the collaboration hook.
- **document-list** (`documents.list`): draft visibility and the membership-scoped count. It ranks high and has the most fix history.
- **comment-create**: anchored comments that write document state silently.
- **attachment-upload**: presigned S3 and local-storage branches.
- **share-create**: `findOrCreate` semantics and publish checks.

I skipped the `documents.drafts` and `revisions` routes because they reuse the list and update logic. I skipped the `comments.update`/`delete` and `groups` routes because they are plain CRUD. I skipped the Styles, Image and Mermaid fix hotspots because they are visual fixes.

**Gotchas I left out or softened**
- The shares gotcha is read from the code (`findOrCreate` applies `defaults` only on create), not confirmed by a test or a reproduced bug. I kept it because the trap is visible in the handler.
- The `ArchitectureDoc` Redis/Bull claim comes only from `docs/ARCHITECTURE.md`. I did not check the queue code.
- `check` validates that references resolve, not that the described behavior is still accurate. I read the code paths for each flow and gotcha, but did not run them.
