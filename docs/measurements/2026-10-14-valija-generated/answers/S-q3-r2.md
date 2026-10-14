## Plan: herramienta MCP `archive_context`

No edité nada. Esto sale de leer `server.ts`, el flow `mcp-save-context`, `vault-sessions.ts`, `item-repo.ts` y los gotchas.

### Lo que ya existe
- `ContextItemRepository.archive(itemId): boolean` ya está en el puerto (`src/context/application/ports/repositories.ts:28`) y en `SqliteContextItemRepository` (`item-repo.ts:121`). Tiene test, pero ningún use case lo llama.
- El código de error `ITEM_NOT_FOUND` ya existe en `src/context/errors.ts`.
- Los lectores (pack, search, `list`) ya excluyen `archived = 1`. No hay que tocar consultas ni esquema, así que **no hace falta migración**.

### Archivos a tocar

**Nuevos**
1. `src/context/application/use-cases/archive-context.use-case.ts`: clase `ArchiveContext implements UseCase<{ id: string }, { itemId: string }>`.
   - Valida el id antes de abrir sesión, igual que `SaveContext.parseInput`. Si no hay un value object de id, uso `parseUlid` o similar.
   - Hace `sessions.withSession(s => s.write(() => s.items.archive(id) ? ok(...) : contextErr("ITEM_NOT_FOUND", ...)))`.
2. `archive-context.use-case.test.ts`, al lado del use case. Cubre: éxito, id inexistente, id inválido, y que el bump de lineage ocurre solo en éxito.

**Modificados**
3. `src/delivery/container.ts`: añadir `archiveContext: ArchiveContext` al tipo `Container` y al wiring (`new ArchiveContext(sessions)`).
4. `src/delivery/mcp/server.ts`: añadir `archive_context` a `DESCRIPTIONS` y `registerTool` con `inputSchema: { id: z.string() }`. Devuelve `ok("Archived item <id>.")` o `err(...)`.
5. `src/delivery/mcp/server.test.ts:94`: el test "exposes exactly the 5 tools" pasa a 6 y gana un caso del tool nuevo.
6. Docs, en el mismo commit según CLAUDE.md:
   - `README.md:177`
   - `docs/SPEC.md:24` y la tabla de tools (~línea 113)
   - `specs/delivery.md:42` ("Five tools")
   - `specs/context.md`, con la lista de use cases
   - `CHANGELOG.md`
   - `.context/flows/`: nuevo flow `mcp-archive-context.md`, o ampliar `mcp-save-context.md`, más la línea del índice en `AGENTS.md`

### Qué tener en cuenta
- **Ritual y gate de aprobación.** Esto toca `src/**`, así que necesita `advances/<ADV>/plan.md` con la línea `Approved:` antes de cualquier edición. `guard-implementation.sh` lo bloquea mecánicamente. Por defecto va refine → Gate R → plan → Gate P → implementar → review → ship. Si quieres saltarte la ceremonia, dime "fast-track esto". El `Approved:` lo escribes tú, o lo escribo yo solo si me lo dices explícitamente.
- **Escritura siempre por `session.write()`.** Es el gotcha principal. Archivar es una mutación, así que tiene que ir dentro de `session.write()` para que el bump de lineage y el `recordSeen` ocurran. Si no, la detección de forks en sync queda ciega. No llames a `items.archive()` fuera de ahí.
- **`archive()` no actualiza `updated_at`.** Hoy solo hace `SET archived = 1`. Decide si archivar debe refrescar `updated_at`. Si debe, hay que cambiar el SQL del repo y su test. Revisa también `docs/vault-format.md`, que es contrato on-disk y podría tener algo que decir.
- **El error no distingue "no existe" de "ya archivado".** `changes > 0` es true también si el item ya estaba archivado (el UPDATE lo toca igual), así que archivar dos veces es idempotente y devuelve éxito. Parece lo correcto para un modelo que reintenta. Confírmalo, porque la alternativa es leer primero con `findById`, que hoy no existe en el puerto.
- **Sin comprobación de proyecto.** El tool recibe solo `id`, y los ids son ULID globales, así que no hace falta proyecto. Aun así, el mensaje de éxito sería más útil si dijera a qué proyecto pertenecía, pero eso exige un `findById` nuevo. Mi recomendación es no añadirlo.
- **Riesgo de permisos.** Un modelo podría archivar items `imported` o ajenos a su cliente. `ITEM_TYPES` excluye `imported` a propósito (gotcha del archivo `imported`). No hay un gate equivalente para archivar. Decide si `imported` debe ser archivable. Yo lo permitiría, porque archivar es reversible a nivel de datos y no crea nada nuevo.
- **No hay `unarchive`.** Archivar desde MCP sin camino de vuelta es poco amigable. Valora si el alcance incluye un `valija unarchive` en la CLI, o si queda como mejora aparte.
- **Descripción del tool.** Debe indicar cuándo usarlo (el usuario pide olvidar o quitar algo) y dónde obtener el id (`search_context` hoy no imprime ids). Eso es un punto real: `search_context` y `get_context` tendrían que mostrar el id del item para que `archive_context` sea utilizable. Habría que tocar `server.ts` (formato de `search_context`) y posiblemente `context-pack-markdown.ts`. Ojo con el último, porque el formato del pack es contrato publicado (`context-pack.ts` / golden vault). Mi recomendación es mostrar el id solo en `search_context`.
- **Desktop/IPC.** No necesita cambios. El tool es solo MCP.
- **Verificación.** `npm run typecheck && npm run lint && npm run test`.

### Decisiones que necesito de ti
1. ¿Mostrar el id en la salida de `search_context`? Sin eso el tool no se puede usar en la práctica.
2. ¿Archivar actualiza `updated_at`?
3. ¿Idempotente (archivar dos veces = éxito)?
4. ¿`imported` archivable?
5. ¿Ritual completo o fast-track?
