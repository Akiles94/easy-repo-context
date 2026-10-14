Todavía no he tocado nada. La repo ya tiene `archived` en el esquema y `ContextItemRepository.archive(itemId): boolean` en el puerto, así que el cambio es sobre todo cableado.

## Proceso (CLAUDE.md)
- Por defecto va el ritual completo: `task-refiner` → Gate R → `task-planner` → Gate P → implementar → `change-reviewer` → `git-ops`.
- Hasta que `advances/<ADV>/plan.md` tenga la línea `Approved: Oscar <fecha>`, el hook `guard-implementation.sh` bloquea las ediciones en `src/**`. Esa línea la escribe Oscar, o yo solo si Oscar lo dice explícitamente.
- Si quieres saltarte la ceremonia, dilo en el chat con "fast-track esto". El gate `Approved:` se mantiene igualmente.
- La rama sería `feat/<ADV>`. El nombre del advance lo eliges tú, por ejemplo `ARCHIVE`.

## Archivos que tocaría
| Capa | Archivo | Cambio |
|---|---|---|
| application | `src/context/application/use-cases/archive-context.use-case.ts` (+ `.test.ts`) | Nuevo `ArchiveContext implements UseCase`. Parsea el id y abre `sessions.withSession()`. Llama a `session.write()` con `itemRepo.archive(id)`. Si devuelve `false`, error de no encontrado. |
| domain | `src/context/errors.ts` | Añadir un código tipo `ITEM_NOT_FOUND` con `contextErr`, si no existe ya. Lo comprobaría antes. |
| domain | `src/context/domain/values/` | Posible `item-id.ts` con `parseItemId` (ULID), siguiendo "parse, don't validate". |
| infra | `src/context/infra/item-repo.ts` (+ test) | Revisar que `archive()` sea un `UPDATE ... SET archived=1, updated_at=?` y que devuelva `changes > 0`. Si no es así, ajustarlo. |
| delivery | `src/delivery/container.ts` | Instanciar `archiveContext` y añadirlo al tipo `Container` (líneas ~45 y ~82). |
| delivery | `src/delivery/mcp/server.ts` (+ `server.test.ts`) | `DESCRIPTIONS.archive_context` y `registerTool("archive_context", { id: z.string() })`, con la misma forma `ok`/`err` que las demás. |
| docs | `docs/SPEC.md` §7, `specs/context.md`, `specs/delivery.md`, `.context/flows/` (nuevo flow o ampliar `save-context.md`), `CHANGELOG.md`, `README.md` si lista las tools | Van en el mismo commit que el código. |

El CLI y el desktop no hacen falta. Si quieres `valija archive <id>` o un botón en la GUI, serían advances aparte. En desktop serían cuatro ediciones por canal IPC, según los gotchas.

## Qué tener en cuenta
1. **La tool no tiene `project`, solo `id`.** El id es único por ULID, así que `archive(id)` basta. Aun así habría que decidir si archivar es idempotente. Yo diría que sí: archivar uno ya archivado devuelve OK.
2. **Todas las escrituras van por `session.write()`.** Así se bumpea el lineage en la misma transacción. Un `UPDATE` directo rompe la detección de forks del sync.
3. **Parsear antes de abrir la sesión.** Un id mal formado no debe abrir el vault.
4. **Archivar es un soft-delete.** Los items archivados salen de `get_context` y de `search_context`, y el `archived = 0` está en la query (`docs/vault-format.md`). Para el modelo es de hecho una "delete" que no se puede deshacer por MCP, porque no hay `unarchive`. Conviene decirlo en la descripción de la tool.
5. **Los ids importados son deterministas.** Si un item `imported` se archiva y se vuelve a importar, el `ON CONFLICT DO UPDATE` de `save()` pone `archived = excluded.archived`, o sea 0, y lo desarchiva. Hay que decidir si eso es aceptable o si el upsert debe preservar `archived`.
6. **El FTS puede quedar desincronizado.** Hay que confirmar que el trigger de `context_items_fts` cubre los `UPDATE`, y añadir un test que compruebe que el item archivado desaparece de la búsqueda.
7. **Tests de conformidad y golden vault.** `vault-format-conformance.test.ts` y el fixture ya tienen un caso con un item archivado. Hay que verificar que no se rompan.
8. **Vault bloqueado.** Mismo manejo que el resto: `VAULT_LOCKED` con el mensaje estándar.
9. **SPEC dice "Tools (5 — resist adding more)".** Esta sería la sexta. Hay que actualizar ese texto y justificarlo en el spec, y es una decisión de Oscar en el Gate R.
10. **Seguridad.** Un modelo podría archivar items por error o por prompt injection. Una opción es exigir el id exacto (que ya sale en la respuesta de `save_context`) y devolver el proyecto y un extracto del contenido archivado, para que el usuario lo vea.

## Decisiones abiertas para el Gate R
- ¿Se aprueba una sexta tool, dado el "resist adding more" del SPEC?
- ¿Archivar es idempotente, o devuelve error si ya estaba archivado?
- ¿Se necesita `unarchive` desde ya, o se deja fuera?
- ¿Re-importar desarchiva (punto 5)?
- ¿Qué devuelve la tool: solo "archivado" o también proyecto y extracto?

Cuando me digas el nombre del advance y si es ritual completo o fast-track, arranco con el refined o el plan.
