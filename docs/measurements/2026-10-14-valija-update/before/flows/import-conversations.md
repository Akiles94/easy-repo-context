# Flow: import-conversations
Summary: `valija import <file> -p <project>` → read zip/json → pick parser → select conversations → render chunks → one batched context write with deterministic ids
Trigger: `src/delivery/cli/import-command.ts:importCommand()` → `ImportConversations.execute()`
Path:
1. `src/delivery/cli/import-command.ts:importCommand()` — no selection flag means list mode; `--dry-run` previews; `-p` is required only for a real import.
2. `src/importers/infra/file-export-reader.ts:FileExportReader.read()` — `.zip` entries inflated in memory, with size caps applied in the filter; `.json` parsed directly.
3. `src/importers/application/use-cases/import-conversations.use-case.ts:ImportConversations.resolveParser()` — `--from` forces one parser; otherwise the first `detect()` match among `autodetect` wins.
4. Parser `parse()` output is sorted by `createdAt` ascending; `--pick` indexes into this order.
5. `src/importers/domain/services/selection.ts:selectConversations()` — `--pick` first, then `--since` and `--query`.
6. `src/importers/domain/services/chunk-render.ts:renderConversationChunks()` — bodies of at most 28 KB, split on message boundaries.
7. `src/context/application/use-cases/import-items.use-case.ts:ImportItems.execute()` — one session, one `write()`; `createImportedContextItem()` upserts by deterministic id; a bad chunk is collected as a failure, not fatal.
Side effects: `context_items` upserts (type `imported`, tags `imported` plus source); project created if new; one lineage bump for the whole batch.
Gotchas: list and dry-run never call `ImportItems`, so they never open the vault and work while it is locked.
Related: `docs/SPEC.md` §10a (M2 importers), `README.md` "Import your history".
