# Flow: import-conversations
Summary: `import <file>` → read export → parse to IR → select → chunk → one context write (deterministic ids, so re-run upserts) → counts
Trigger: `src/delivery/cli/program.ts` command `import` → `src/delivery/cli/import-command.ts:importCommand()`
Path:
1. `src/importers/application/use-cases/import-conversations.use-case.ts:ImportConversations.execute()` — reads file, resolves parser (`--from`, else first `detect()` wins), parses to normalized conversations.
2. `src/importers/domain/services/selection.ts:selectConversations()` — applies `--all`, `--pick`, `--query`, `--since`.
3. `src/importers/domain/services/chunk-render.ts:renderConversationChunks()` — conversations → chunk drafts.
4. `src/importers/application/use-cases/import-conversations.use-case.ts:ImportConversations.execute()` — `list` and `dry-run` return here; no vault access.
5. `src/context/application/use-cases/import-items.use-case.ts:ImportItems.execute()` — one session, one write; project auto-created; a bad chunk is collected as a failure and the batch continues.
6. `src/context/domain/entities/context-item.ts:createImportedContextItem()` — id derived from project, source, conversation and chunk index.
Side effects: `imported` context items; one lineage bump per batch (only when the write commits).
Gotchas: see `gotchas.md` → context.
Related: `docs/gui.md` §"Importing your chat history" (desktop path), `docs/SPEC.md` §10a (importers)
