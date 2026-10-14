Con lo que he leído, este es el plan. No he editado nada.

## Lo que ya existe
- `ContextItemRepository.archive(itemId): boolean` ya está en el puerto (`src/context/application/ports/repositories.ts:28`) y en `SqliteItemRepository` (`src/context/infra/item-repo.ts:121`), con test.
- `ITEM_NOT_FOUND` ya existe en `src/context/domain/errors.ts`.
- Las consultas de pack, listado y búsqueda ya excluyen `archived = 1`.

Falta el caso de uso, el cableado y la tool MCP.

## Proceso (CLAUDE.md)
- Por defecto aplica el ritual completo: `task-refiner`, Gate R, `task-planner`, Gate P y la línea `Approved: Oscar <fecha>` en `advances/<ADV>/plan.md`.
- Hasta que esa línea exista, `guard-implementation.sh` bloquea cualquier edición en `src/**`.
- Para saltarte la ceremonia, dime "fast-track esto". El `plan.md` con `Approved:` sigue siendo obligatorio, y lo escribo yo solo si tú me lo dices.
- La rama sería `feat/archive-context-<ADV>`.

## Archivos a tocar

| Archivo | Cambio |
|---|---|
| `src/context/application/use-cases/archive-context.use-case.ts` (nuevo) | `ArchiveContext implements UseCase<{ itemId: string }, { itemId: string }>`. Valida el input antes de abrir sesión y ejecuta `withSession(s => s.write(() => …))`. Si `items.archive()` devuelve `false`, devuelve `contextErr("ITEM_NOT_FOUND", …)`. |
| `src/context/application/use-cases/archive-context.use-case.test.ts` (nuevo) | Pruebas: caso feliz, id inexistente, el item archivado desaparece de `get_context` y `search_context`, y el lineage avanza. |
| `src/delivery/container.ts` | Añadir `archiveContext: ArchiveContext` a la interfaz (~línea 45) y construirlo (~línea 82). |
| `src/delivery/mcp/server.ts` | Añadir `archive_context` en `DESCRIPTIONS` y un `registerTool` con `inputSchema: { id: z.string() }`. Usa `ok()`/`err()` como las demás tools. |
| `src/delivery/mcp/server.test.ts` | Añadir `archiveContext` al container de test (línea ~60) y casos de la tool. |
| `src/delivery/multi-device-sync.test.ts` | Solo si su container tipado exige el campo nuevo. |
| `.context/flows/archive-context.md` (nuevo) y `AGENTS.md` | Flujo nuevo, igual que `save-context.md`. Los docs van en el mismo commit. |
| `specs/context.md`, `specs/delivery.md`, `README.md`, `CHANGELOG.md` | Listar la tool nueva y el caso de uso. |

Según la convención, el caso de uso va en la subcarpeta `use-cases/`, sin archivos sueltos. No hace falta tocar el esquema, así que no hay migración.

## Qué tener en cuenta
1. **`session.write()` es obligatorio** (gotchas). Si archivas fuera de `write()`, el cambio se confirma sin `lineageStore.bump()` y la sincronización y la detección de fork no lo ven. El `bump` y `recordSeen` ya los hace `commitWrite()`.
2. **Un id inexistente es un error.** `archive()` devuelve `changes > 0`, así que un id que no existe da `false` y debe mapearse a `ITEM_NOT_FOUND`.
3. **Volver a archivar un item ya archivado** devuelve `true` porque el `UPDATE` coincide con la fila. Es idempotente. Decide si eso te vale o si quieres distinguir "ya estaba archivado".
4. **`archive()` no actualiza `updated_at`.** Hay que decidir si debe hacerlo. Si sí, hay que tocar el SQL del repo y su test.
5. **Los items `imported` también se pueden archivar.** Quedan fuera de la búsqueda, porque `search` filtra `archived = 0`. Decide si eso es deseable.
6. **No hay "desarchivar".** Archivar sería irreversible desde MCP, así que la descripción de la tool debe advertirlo, para que el modelo no lo use a la ligera. Valora si añadir `unarchive_context` queda fuera de este avance.
7. **El id viene del modelo.** Valida que sea una cadena no vacía antes de abrir sesión (parse-don't-validate). No hay un value object de ULID para ids de item, y los ids de import son hashes, así que no los restrinjas a ULID.
8. **Preguntas para el refiner:**
   - ¿Debe poder pasarse también el proyecto, para evitar archivar por error un id de otro proyecto?
   - ¿Se expone también en el CLI (`valija archive <id>`) o solo en MCP?
   - ¿Se expone en el escritorio? Eso exigiría los 4 cambios de IPC de los gotchas, y lo dejaría fuera.
9. **Verificación:** `npm run typecheck && npm run lint && npm run test`. El test del servidor MCP y la fixture `golden-vault` ya cubren "archived-excluded", así que comprueba que sigan pasando.

¿Lanzo el ritual completo con `task-refiner`, o prefieres fast-track?
