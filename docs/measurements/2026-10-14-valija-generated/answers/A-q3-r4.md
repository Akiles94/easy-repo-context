## Plan para `archive_context`

El repo ya tiene casi todo lo de abajo. `ContextItemRepository.archive(itemId): boolean` ya existe (`src/context/application/ports/repositories.ts:28` e `infra/item-repo.ts:121`). El código de error `ITEM_NOT_FOUND` ya está en `src/context/domain/errors.ts`. Solo falta el caso de uso, el cableado y la herramienta.

### Proceso (CLAUDE.md)
- Esto es un advance nuevo, por ejemplo `advances/ARCHIVE/`, con la rama `feat/ARCHIVE`.
- Por defecto va con el ritual completo: refiner, Gate R, planner, Gate P, `Approved:` de Oscar, implementación, reviewer y git-ops.
- No puedo tocar `src/**` hasta que `plan.md` tenga la línea `Approved: Oscar <fecha>`, y el hook `guard-implementation.sh` lo impone.
- Esa línea la escribe Oscar, o yo solo si Oscar me lo dice explícitamente.
- Solo se salta con un "fast-track esto" explícito. Incluso entonces el `plan.md` con `Approved:` sigue siendo obligatorio.

### Archivos a tocar
1. **Nuevo `src/context/application/use-cases/archive-context.use-case.ts`**
   - Clase `ArchiveContext implements UseCase<ArchiveContextInput, ArchiveContextView>`, con el mismo estilo que `ShowProject`.
   - Hace `sessions.withSession(...)` y llama a `session.items.archive(id)`.
   - Si devuelve `false`, responde `contextErr("ITEM_NOT_FOUND", ...)`.
   - Valida que el id no esté vacío.
2. **Nuevo `archive-context.use-case.test.ts`** junto al caso de uso. Cubre el caso feliz, el id inexistente y la bóveda bloqueada.
3. **`src/delivery/container.ts`**: añadir `archiveContext: ArchiveContext` a la interfaz `Container` (cerca de la línea 47) y construirlo (cerca de la línea 84).
4. **`src/delivery/mcp/server.ts`**
   - Añadir `archive_context` en `DESCRIPTIONS`.
   - Añadir `server.registerTool("archive_context", { inputSchema: { id: z.string() } })`, con el mismo patrón `if (!r.ok) return err(r.error)`.
5. **`src/delivery/mcp/server.test.ts`**: añadir `archiveContext` al container de test (línea ~62) y un test de la herramienta.
6. **Docs, en el mismo commit**
   - `README.md:177` ("Five tools" pasa a seis).
   - `docs/SPEC.md:~115` (tabla de herramientas).
   - `specs/delivery.md:42`.
   - `CHANGELOG.md`.

### Puntos a tener en cuenta
- **Idempotencia:** `archive()` hace `UPDATE ... SET archived = 1 WHERE id = ?`. Un item ya archivado también devuelve `changes > 0`, así que archivar dos veces da OK. Si quieres distinguir ese caso, hay que ampliar el puerto.
- **Reversibilidad y alcance:** el archivado es soft y no se puede deshacer desde MCP, porque no hay `unarchive`. Un modelo podría archivar contexto por error. La descripción de la herramienta debe indicar que solo se use cuando el usuario lo pida.
- **Items `imported`:** el archivado los alcanzaría. Hay que decidir si es lo deseado. Las reglas de `imported` (nunca creable por MCP) apuntan a que podrías querer bloquearlo, pero no está especificado.
- **Descubrimiento de ids:** `search_context` no devuelve el id del item, solo `save_*` lo hace. El modelo no podría archivar nada de lo que busca. Habría que incluir el id en la salida de `search_context` (y en `ContextItemView`, `dto/context-item-view.ts`), lo que cambia ese formato y sus tests. Es el punto más importante para decidir.
- **Efecto en los resultados:** los items archivados desaparecen de la búsqueda, de `get_context` y de los conteos de `list_projects`. Eso ya está implementado así en el repo.
- **Bóveda bloqueada:** `withSession` ya devuelve el error uniforme de bóveda bloqueada. No hay que añadir nada.
- **Convenciones:** sin archivos sueltos en la raíz de una capa, y el nombre de la clase y del archivo siguen `XUseCase`. Antes de dar nada por hecho hay que pasar `npm run typecheck && npm run lint && npm run test`.
- **Fuera de alcance:** la CLI (`valija archive`) y la GUI de `desktop/` no entran, salvo que las quieras. Dime si sí.

### Decisiones que necesito de ti
1. ¿Exponer el id en `search_context`? Yo digo que sí, porque si no la herramienta es inutilizable.
2. ¿Permitir archivar items `imported` por MCP?
3. ¿Archivar un item ya archivado devuelve OK, o un error?
4. ¿Ritual completo o fast-track?
