No edito nada. Esto es lo que encontré y lo que haría.

## Qué ya existe
- `ContextItemRepository.archive(itemId): boolean` ya está en el puerto (`src/context/application/ports/repositories.ts:28`). `SqliteItemRepository` lo implementa en `src/context/infra/item-repo.ts:121` con `UPDATE … SET archived = 1`.
- `ITEM_NOT_FOUND` ya existe en `src/context/domain/errors.ts`.
- Ningún use case llama a `archive()` todavía.

## Proceso (CLAUDE.md)
Es un cambio con comportamiento nuevo, así que aplica el ritual de cinco fases salvo que digas "fast-track esto".
1. `task-refiner` escribe `advances/<ADV>/refined.md`, y yo me paro en el Gate R.
2. `task-planner` escribe `plan.md`, y yo me paro en el Gate P. Ahí te presento el resumen, las *Decisions to confirm* y el árbol de cambios.
3. **No puedo tocar `src/**` hasta que `plan.md` tenga la línea `Approved: Oscar <fecha>`.** El hook `guard-implementation.sh` lo bloquea. Esa línea la escribes tú, o yo solo si me lo dices explícitamente.
4. Después viene la rama `feat/<ADV>`, la implementación, `change-reviewer` y `git-ops`.

Si haces fast-track, sigo necesitando el `plan.md` con `Approved:`. Lo escribo yo, pero la aprobación sigue siendo tuya.

## Archivos que tocaría
| Archivo | Cambio |
|---|---|
| `src/context/application/use-cases/archive-context.use-case.ts` (nuevo) | Clase `ArchiveContext implements UseCase<{ itemId: string }, …>`. Dentro de `sessions.withSession`, llama a `session.items.archive(id)` y devuelve `contextErr("ITEM_NOT_FOUND", …)` si es `false`. |
| `archive-context.use-case.test.ts` (nuevo) | Casos: ok, id inexistente, vault bloqueado. |
| `src/delivery/container.ts` | Instanciar `archiveContext` y exponerlo en `Container`. |
| `src/delivery/mcp/server.ts` | Añadir `archive_context` a `DESCRIPTIONS` y un `registerTool` con `inputSchema: { id: z.string() }`. Respuesta `ok("Archived item <id>.")`, o `err(...)`. |
| `src/delivery/mcp/server.test.ts` | Test de la tool (éxito, no encontrado, vault bloqueado). |
| `specs/delivery.md` (línea ~42) | "Five tools" pasa a seis, y se documenta la nueva. |
| `specs/context.md`, `docs/SPEC.md` §7 | Añadir el use case y la descripción de la tool. |
| `CHANGELOG.md`, `README.md` | Si el README lista las tools. |

El puerto y el repo SQLite no cambian, salvo que decidamos lo de más abajo. Tampoco hay migración, porque la columna `archived` existe desde `001-init`.

## Cosas a tener en cuenta
1. **Buscar por id.** El puerto no tiene `findById`, solo `archive()`. Mi idea es usar el booleano para detectar el "no encontrado". Eso no distingue "no existe" de "ya estaba archivado", porque `changes` cuenta la fila igualmente. Hay que decidir si archivar dos veces es idempotente o un error. Si quieres distinguirlo, haría falta `findById`, que implica puerto, repo y tests.
2. **`updated_at` y sync.** `archive()` no actualiza `updated_at`. Revisaría `docs/sync.md` y el lineage (migración 003) para ver si archivar debe contar como cambio sincronizable. Si es así, el UPDATE debe tocar `updated_at`.
3. **Efecto en lectura.** Un item archivado desaparece de `get_context`, `search_context` y del pack. Está cubierto por el test de conformidad `vault-format-conformance.test.ts`, que no debería romperse.
4. **Seguridad del modelo.** Que un LLM pueda archivar es una acción destructiva. Es reversible a nivel de base de datos, pero no hay tool para desarchivar. Dos decisiones para el Gate P:
   - Si hace falta `unarchive_context`, o por ahora solo el CLI.
   - Qué dice la descripción de la tool. Debe pedir confirmación del usuario y usarse solo con ids reales devueltos por `search_context` o `save_context`.
5. **Ids visibles.** `search_context` hoy no imprime el id del item (`server.ts`, líneas ~135-137). Sin eso el modelo no tiene cómo obtener ids antiguos, solo el que devuelve `save_context`. Habría que añadir el id a la salida de `search_context`, o la tool sería casi inútil.
6. **Convenciones.** Nombre `ArchiveContext`, sin archivos sueltos en la raíz de la capa, y docs en el mismo commit. Antes de entregar corro `npm run typecheck && npm run lint && npm run test`.

¿Lanzo el ritual completo con `task-refiner`, o prefieres fast-track? Y dime tu postura sobre los puntos 1, 4 y 5.
