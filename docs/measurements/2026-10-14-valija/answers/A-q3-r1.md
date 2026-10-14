## Plan: herramienta MCP `archive_context`

### Proceso primero
Según `CLAUDE.md`, esto va por el ritual de 5 fases (a menos que digas "fast-track"). No se puede tocar `src/**` hasta que `advances/<ADV>/plan.md` tenga la línea `Approved: Oscar <fecha>`, y el hook `guard-implementation.sh` lo impide. Pasos:
1. `task-refiner` escribe `refined.md` (**Gate R**: tú lo apruebas).
2. `task-planner` escribe `plan.md` (**Gate P**: apruebas el resumen, las decisiones y la estructura resultante).
3. Implementación en una rama `feat/archive-context-<ADV>`.
4. `change-reviewer` escribe `review.md` con `Verdict: PASS`.
5. `git-ops` hace el commit, el push y el merge.

Para algo tan pequeño puedes pedir fast-track. El `plan.md` aprobado sigue siendo obligatorio.

### Lo que ya existe
- `ContextItemRepository.archive(itemId): boolean` ya está en el puerto (`src/context/application/ports/repositories.ts`) y en `src/context/infra/item-repo.ts:121`. Devuelve `false` si no existe el id.
- `ITEM_NOT_FOUND` ya está en `src/context/domain/errors.ts`.
- La columna `archived` ya existe desde la migración 001. Búsqueda, packs y conteos de proyectos ya excluyen los archivados. **No hace falta migración ni cambio de esquema.**

### Archivos a tocar
| Archivo | Cambio |
|---|---|
| `src/context/application/use-cases/archive-context.use-case.ts` (nuevo) | `ArchiveContext implements UseCase<{ itemId: string }, { itemId: string }>`. Usa `sessions.withSession(...)` y llama a `session.items.archive(id)`. Si devuelve `false`, responde `contextErr("ITEM_NOT_FOUND", ...)`. |
| `archive-context.use-case.test.ts` (nuevo) | Caso feliz, id inexistente y archivar dos veces. |
| `src/delivery/container.ts` | Instanciar `archiveContext` y exponerlo en `Container`. |
| `src/delivery/mcp/server.ts` | Añadir `archive_context` en `DESCRIPTIONS` y un `registerTool` con `inputSchema: { id: z.string() }`. En error usa `err(r.error)`; si va bien, `ok("Archived item <id>.")`. |
| `src/delivery/mcp/server.test.ts` | Tests del tool: éxito, `ITEM_NOT_FOUND` con `isError`, y que el item desaparece de `search_context`. |
| `docs/SPEC.md`, `specs/context.md`, `specs/delivery.md` | Documentar el tool en el mismo commit, como exige `CLAUDE.md`. |
| `CHANGELOG.md` | Entrada nueva. |
| `plan.md` / `refined.md` en `advances/<ADV>/` | Artefactos del ritual. |

Si quieres paridad en el CLI, habría que tocar también `src/delivery/cli/content-commands.ts`. Lo dejaría fuera de este alcance salvo que lo pidas.

### Cosas a tener en cuenta
1. **Alcance del id.** `save_context` devuelve `Item id: ...` y `search_context` hoy **no muestra el id** en sus resultados (`server.ts`, línea `- [project] (type, date) content`). Sin el id, un modelo no puede archivar algo que encontró por búsqueda. Recomiendo incluir el id en la salida de búsqueda, pero eso cambia un tool existente y los tests que comprueban su formato. Decídelo en el Gate R.
2. **Archivar es irreversible desde MCP.** No hay `unarchive`, y `findByProject` solo ve archivados con `includeArchived`. Valora si basta con la descripción del tool o si quieres un `unarchive` aparte (otro avance).
3. **Descripción del tool.** Debe decirle al modelo que solo archive cuando el usuario lo pida explícitamente, porque el tool puede esconder contexto de forma silenciosa.
4. **Sesión y bloqueo.** Usa `VaultSessions.withSession` como los demás use cases, para que gestione la bóveda cerrada o bloqueada con los mismos errores.
5. **Convenciones.** El archivo del use case va en `use-cases/` con sufijo `.use-case.ts`. Usa `contextErr`, no errores ad hoc. Los tests van junto a cada capa.
6. **Validación del id.** Los ids son strings opacos. No hay un value object `ItemId`, así que valida solo que no esté vacío, o crea un `parseItemId` si prefieres rigor DDD (más archivos).
7. **Rama y checks.** Corre `npm run typecheck && npm run lint && npm run test` en cada slice.

### Decisiones para ti
- ¿Ritual completo o fast-track?
- ¿Incluir el id en `search_context`? (Lo recomiendo.)
- ¿Añadir también el comando CLI y/o `unarchive`, o dejarlos para otro avance?

Dime y arranco con el `task-refiner`. Si eliges fast-track, escribo el `plan.md` yo mismo y espero tu `Approved:` antes de tocar código.
