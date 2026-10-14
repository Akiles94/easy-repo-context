# Flow: import-conversations
Summary: `valija import <file>` / desktop import → read export → detect parser → select → chunk → single-session upsert of `imported` items.
Trigger: `src/delivery/cli/import-command.ts` (command `import` in `src/delivery/cli/program.ts`); desktop `desktop/src/main/ipc/handlers/import-handlers.ts`.
Path:
1. `src/importers/application/use-cases/import-conversations.use-case.ts:ImportConversations.execute()` — `resolveMode()`: no selection flag or `--list` → list only; `--dry-run` previews; else import.
2. `ImportConversations.resolveParser()` — `--from` forces a parser; else first `detect()` in `autodetect` (`src/importers/infra/parser-registry.ts`).
3. `src/importers/domain/services/selection.ts:selectConversations()` then `src/importers/domain/services/chunk-render.ts:renderConversationChunks()`; epoch-dated conversations get import-time `createdAt`.
4. `src/context/application/use-cases/import-items.use-case.ts:ImportItems.execute()` — one `session.write` for the whole batch; per-chunk failures collected, never abort.
5. `src/context/domain/entities/context-item.ts:createImportedContextItem()` — id = sha256(project, source, conversation, chunk).
Side effects: context_items typed `imported`, source `<src>-import`, tags `imported,<src>`; project auto-created; one lineage bump.
Gotchas: re-import upserts (`ON CONFLICT(id)` in `src/context/infra/item-repo.ts:SqliteContextItemRepository.save()`): safe to rerun, but overwrites content/tags.
Related: `flows/mcp-save-context.md`, `docs/vault-format.md`
