# Plan: MCP tool `archive_context`

El repositorio ya tiene `ContextItemRepository.archive(itemId): boolean` (`src/context/application/ports/repositories.ts:28`, `src/context/infra/item-repo.ts:121`). Nadie lo llama fuera de los tests. Falta el caso de uso, el cableado en el container y la tool MCP.

## Proceso (CLAUDE.md)
- Por defecto aplica el ritual de 5 fases: `task-refiner`, Gate R, `task-planner`, Gate P, implementar, `change-reviewer` y `git-ops`.
- Si quieres saltarlo, tienes que decirlo tú ("fast-track esto"). Yo no lo asumo.
- Incluso con fast-track, `advances/<ADV>/plan.md` debe llevar la línea `Approved: Oscar <fecha>` antes de que yo toque `src/**`. El hook `guard-implementation.sh` lo exige. Esa línea la escribes tú o me lo pides explícitamente.
- La rama sería `feat/<ADV>`. Hace falta elegir el nombre del advance.

## Archivos a tocar

| Archivo | Cambio |
|---|---|
| `src/context/application/use-cases/archive-context.use-case.ts` (nuevo) | `ArchiveContext implements UseCase<{itemId}, {itemId}>`. Ver «Qué tener en cuenta». |
| `src/context/application/use-cases/archive-context.use-case.test.ts` (nuevo) | Ok, id inexistente (`ITEM_NOT_FOUND`), vault bloqueado, y que no se pueda archivar dos veces sin sentido (ver abajo). |
| `src/context/domain/errors.ts` | `ITEM_NOT_FOUND` ya existe. Probablemente no hay que añadir nada. |
| `src/delivery/container.ts` | Añadir `archiveContext: ArchiveContext` al tipo (cerca de la línea 45) y construirlo (cerca de la línea 82). |
| `src/delivery/mcp/server.ts` | Entrada en `DESCRIPTIONS` y `server.registerTool("archive_context", …)` con `inputSchema: { id: z.string() }`. Mismo patrón `ok()`/`err()` que las demás. |
| `src/delivery/mcp/server.test.ts` | Línea ~94: el test «exposes exactly the 5 tools» pasa a 6. También hay que montar `archiveContext` en el container de test (línea ~60). |
| `src/context/infra/item-repo.test.ts` | Probablemente ya cubre `archive`. Solo habría que añadir casos si cambia el contrato. |
| Documentación (mismo commit) | `README.md:177` («Five tools»), `docs/SPEC.md` (líneas 24, 79 y la tabla de §7), `specs/context.md` y `specs/delivery.md`, `CHANGELOG.md`. Nuevo `.context/flows/archive-context.md` y su entrada en `AGENTS.md`. |

Los use cases de `context/application/use-cases/` no usan subcarpetas extra, así que el nuevo va ahí.

## Qué tener en cuenta
1. **La mutación va dentro de `session.write()`.** Es el gotcha nº 1 de `.context/gotchas.md`. Sin `write()`, el archivado se confirma sin `lineageStore.bump()` y la sincronización y la detección de fork no lo ven. Hay que replicar la estructura de `SaveContext.execute()`: `withSession(s => s.write(() => …))`.
2. **`archive()` devuelve `false` si el id no existe.** El use case debe convertir eso en `contextErr("ITEM_NOT_FOUND", …)`. Ojo: dentro de `write()` un `err` hace rollback por centinela, y eso es lo deseado, porque no se bumpea el lineage si no cambió nada.
3. **Idempotencia.** `UPDATE … WHERE id = ?` devuelve `changes > 0` aunque el item ya estuviera archivado, y además no toca `updated_at`. Hay que decidir si re-archivar es un éxito silencioso o un error. Mi recomendación es éxito idempotente. Un punto relacionado: `updated_at` no cambia al archivar, y eso puede importar para la sincronización. Conviene decidirlo.
4. **Validar el id antes de abrir sesión.** Es el patrón «parse everything first». Hay que ver cómo son los ids (ULID, y los de importados son hash determinista) y decidir si hay un `parseItemId` o basta con un string no vacío.
5. **Los items `imported` también se pueden archivar.** El id viene del modelo, que lo obtiene de `save_context` (que devuelve `Item id`). Pero `search_context` hoy **no muestra el id** (`server.ts:139`), así que el modelo solo puede archivar lo que acaba de guardar. Para que la tool sea realmente útil probablemente haya que incluir el id en la salida de búsqueda. Eso cambia una salida existente, así que conviene decidirlo explícitamente.
6. **Reversibilidad.** No existe un `unarchive` ni forma de ver archivados por MCP. Para el modelo es una acción casi destructiva desde su punto de vista. La descripción de la tool debe decirle que solo archive cuando el usuario lo pida.
7. **Superficie MCP acotada.** Hay un test que exige que no se filtren metadatos de sync, lineage o dispositivo (`server.test.ts:186`). La respuesta debe ser mínima: solo id y confirmación.
8. **Escritor dentro de un fork o con la vault bloqueada.** El error `VAULT_LOCKED` ya lo gestiona `withSession`, no hay que duplicarlo.
9. **Desktop/CLI.** La spec dice que MCP y CLI son adaptadores finos sobre los mismos use cases. No hay comando CLI de archivar. No lo incluyo salvo que lo pidas. Si se añade `valija archive`, sería un cambio aparte. Añadir IPC en desktop requeriría las 4 ediciones del gotcha nº 17, y tampoco lo incluyo.

## Validación
`npm run typecheck && npm run lint && npm run test`. Hay que comprobar sobre todo que el item archivado desaparece de `get_context` y `search_context`, algo que el repo ya garantiza con `archived = 0`.

## Decisiones para ti
- ¿Ritual completo o fast-track? ¿Nombre del advance?
- ¿Re-archivar un item ya archivado es éxito o error? (recomiendo éxito)
- ¿Incluyo el id en la salida de `search_context`? (recomiendo sí, si no la tool es poco usable)
- ¿Se actualiza `updated_at` al archivar?
