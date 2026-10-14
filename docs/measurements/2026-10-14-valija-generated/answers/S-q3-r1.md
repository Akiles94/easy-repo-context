Estoy terminando de leer el código del módulo `context` y del servidor MCP. Con eso ya tengo el plan, y no he editado nada.

## Lo que ya existe
- `ContextItemRepository.archive(itemId): boolean` ya está en `src/context/application/ports/repositories.ts:28`. Su implementación en `src/context/infra/item-repo.ts:121` hace `UPDATE … SET archived = 1`.
- El código de error `ITEM_NOT_FOUND` ya está en `src/context/domain/errors.ts`.
- Los archivados ya se excluyen de packs, de búsqueda y de los conteos. Eso es contrato publicado en `docs/vault-format.md`. Por eso **no hay que tocar el formato ni regenerar el golden vault**.
- Falta el use case y la tool MCP.

## Archivos a tocar
**Código (`src/`)**
1. `src/context/application/use-cases/archive-context.use-case.ts` (nuevo). Es `ArchiveContext implements UseCase<{itemId}, {itemId}>`.
   - Valida el input antes de abrir sesión (id no vacío).
   - Llama a `sessions.withSession(s => s.write(() => s.items.archive(id) ? ok(...) : contextErr("ITEM_NOT_FOUND", ...)))`.
2. `src/context/application/use-cases/archive-context.use-case.test.ts` (nuevo): éxito, id inexistente, ya archivado, y que no hay bump de lineage cuando falla.
3. `src/delivery/container.ts`: añadir `archiveContext: new ArchiveContext(sessions)` al tipo `Container` y al wiring (junto a `saveContext`, líneas ~45 y ~82).
4. `src/delivery/mcp/server.ts`:
   - Entrada nueva en `DESCRIPTIONS`.
   - `registerTool("archive_context", { inputSchema: { id: z.string() } })`.
   - Mapea errores con el helper `err` existente.
5. `src/delivery/mcp/server.test.ts`: caso feliz y caso `ITEM_NOT_FOUND`.
6. Posiblemente `src/context/infra/item-repo.ts` (ver decisión 3).

**Docs (van en el mismo commit)**
- `specs/delivery.md` y `specs/context.md`.
- `docs/SPEC.md` (lista de tools MCP).
- `README.md` y `CHANGELOG.md`.
- `.context/flows/mcp-save-context.md`: añadir una nota o crear `flows/mcp-archive-context.md` y enlazarlo desde `AGENTS.md`.

## Qué tener en cuenta
1. **Toda escritura va por `session.write()`** (gotcha del repo). Así la mutación y el bump de lineage quedan en una transacción. Si `archive` devuelve `false`, hay que devolver `err` dentro de `write()` para que haga rollback y no bumpee. Si no, la detección de forks de sync queda ciega.
2. **El modelo no puede conocer ids hoy.** `search_context` imprime proyecto, tipo, fecha y contenido, pero no el id (`server.ts:139`). El único id que ve es el que devuelve `save_context`. Sin cambiar eso, `archive_context` solo sirve para lo que se guardó en la misma conversación. Hay que decidir si `search_context` (y quizá `get_context`) pasan a mostrar ids. Eso toca `renderContextPackMarkdown` y sus tests, así que conviene confirmar antes que no rompe ningún contrato. No he verificado si `ContextItemView` ya lleva el id.
3. **`archive()` no actualiza `updated_at`.** Decide si debe hacerlo. Si sí, es un cambio de infra con su test.
4. **No hay "unarchive".** Un modelo podría ocultar contexto sin forma de revertirlo desde MCP. Los datos siguen en la vault, pero conviene reflejarlo en la descripción de la tool y valorar `destructiveHint`.
5. **Items `imported`:** son archivables a nivel de storage. Decide si el MCP puede archivarlos. Con el criterio de "un modelo no mina imports" (gotcha del repo), tendría sentido permitirlo solo en lectura, pero es decisión tuya.
6. **No valides el id como ULID.** Los ids de import son hashes deterministas (`importedItemId()`), no ULID.
7. **Estructura de carpetas:** el use case va en `use-cases/`, sin ficheros sueltos. Sigue el patrón `XUseCase`, `contextErr`, y no hace falta un `parseX` nuevo salvo que quieras un value `ItemId`.

## Proceso (CLAUDE.md)
- Por defecto aplica el ritual completo: `task-refiner` → Gate R → `task-planner` → Gate P → implementar → `change-reviewer` → `git-ops`.
- No editaré `src/**` hasta que `advances/<ADV>/plan.md` tenga la línea `Approved: Oscar <fecha>`, y esa línea la pones tú o me dices que la escriba.
- Si quieres saltarte la ceremonia, dime "fast-track esto". Yo escribo el plan, tú lo apruebas, y el resto lo hago sin subagentes. El gate de `Approved:` se mantiene igual.
- La rama sería `feat/archive-context-<ADV>`.

## Decisiones para ti
- ¿Exponer ids en `search_context` y `get_context`? (punto 2)
- ¿Actualizar `updated_at` al archivar? (punto 3)
- ¿Permitir archivar items `imported` por MCP? (punto 5)
- ¿Añadir también un `unarchive_context`, o queda fuera de este advance?
- ¿Ritual completo o fast-track?
