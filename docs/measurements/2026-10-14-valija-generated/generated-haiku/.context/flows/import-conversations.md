# Flow: import-conversations
Summary: `valija import <file>` → read export (zip under size cap) → detect/parse → select → chunk → one write session → upsert imported items
Trigger: `src/delivery/cli/import-command.ts:importCommand()` (registered in `src/delivery/cli/program.ts`)
Path:
1. `src/importers/infra/file-export-reader.ts:FileExportReader.read()` — `.json` or `.zip`; inflated entries count toward a total cap.
2. `src/importers/application/use-cases/import-conversations.use-case.ts:ImportConversations.resolveParser()` — `--from` wins; otherwise first autodetect match, else `UNSUPPORTED_SOURCE`.
3. `ImportConversations.resolveMode()` — no selection flag means list only; `--dry-run` never reaches the write.
4. `src/importers/domain/services/selection.ts` — `--all`, `--pick`, `--query`, `--since` narrowing.
5. `ImportConversations.buildItems()` — chunks via `src/importers/domain/services/chunk-render.ts`; undated conversations stamped with the import instant.
6. `src/context/application/use-cases/import-items.use-case.ts:ImportItems.execute()` — one `session.write()` for the batch; project auto-created; bad chunks collected as failures, batch continues.
7. `src/context/domain/entities/context-item.ts:importedItemId()` — deterministic id; repo `save()` upserts on id.
Side effects: `context_items` (type `imported`, source `<src>-import`); project row; one lineage bump per batch.
Gotchas: see `gotchas.md` — ids include project id.
Related: `flows/save-context.md`, `README.md` ("Import your history")
