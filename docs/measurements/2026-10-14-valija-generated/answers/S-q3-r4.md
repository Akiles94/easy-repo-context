## Plan: tool MCP `archive_context`

**Proceso.** Por `CLAUDE.md`, esto es un advance (por ejemplo `advances/ARCHIVE-MCP/`) con el ritual completo: refine, Gate R, plan, Gate P, implementar, review y ship. Hasta que `plan.md` tenga la línea `Approved: Oscar <fecha>`, el hook `guard-implementation.sh` bloquea cualquier edición en `src/**`. Si quieres saltarte la ceremonia, dime "fast-track esto". Aun así necesitaría un `plan.md` con tu `Approved:`.

**Lo que ya existe.**
- `ContextItemRepository.archive(itemId): boolean` está en el puerto (`src/context/application/ports/repositories.ts:28`) y en `SqliteContextItemRepository` (`item-repo.ts:121`).
- `ITEM_NOT_FOUND` ya está en `ContextErrorCode` y en los catálogos i18n del desktop.
- Las consultas ya excluyen `archived = 1` en packs, búsqueda y conteos de proyecto.

Falta el use case, el wiring y la tool.

### Archivos a tocar
1. **`src/context/application/use-cases/archive-context.use-case.ts`** (nuevo), más su `.test.ts`.
   - `ArchiveContext implements UseCase<{ itemId: string }, { itemId: string }>`.
   - Debe hacer `sessions.withSession(s => s.write(() => …))`, y si `items.archive(id)` devuelve `false`, devolver `contextErr("ITEM_NOT_FOUND", …)`. `write()` hace rollback con el sentinel.
2. **`src/delivery/container.ts`**: añadir `archiveContext` al tipo `Container` y al wiring, junto a `saveContext`, que está en las líneas 45 y 82.
3. **`src/delivery/mcp/server.ts`**:
   - Añadir `archive_context` a `DESCRIPTIONS`.
   - Registrar la tool con `inputSchema: { id: z.string() }`.
   - Responder con `ok("Archived item <id>.")` o `err(r.error)`.
4. **`src/delivery/mcp/server.test.ts`**:
   - El test "exposes exactly the 5 tools" pasa a 6 y añade el nombre a la lista ordenada.
   - Casos nuevos: happy path, id inexistente (`isError` con `[ITEM_NOT_FOUND]`), vault bloqueado, y que el item archivado desaparece de `search_context` y `get_context`.
   - Comprobar que el test "never exposes sync/lineage/device metadata" sigue pasando.
5. **Docs en el mismo commit** (lo exige `CLAUDE.md`):
   - `docs/SPEC.md` (superficie MCP).
   - `specs/context.md` (lista de use cases) y `specs/delivery.md` (tools).
   - `README.md` (tabla de tools).
   - `CHANGELOG.md`.
   - `.context/flows/mcp-save-context.md` (opcional, o un flow nuevo `mcp-archive-context`) y la entrada correspondiente en `AGENTS.md`.

### Qué tener en cuenta
- **Escritura y lineage.** Debe pasar por `session.write()`. Una escritura fuera de ahí no incrementa el lineage y la detección de forks de sync se queda ciega (gotcha #3). No llames a `items.archive` directamente sobre la sesión sin `write`.
- **`updated_at`.** `archive()` hoy no actualiza `updated_at`. Decide si debe hacerlo. Las consultas que dependen de `updated_at` o el sync podrían notar el cambio. Si lo cambias, sería un cambio de repo y de test, no de esquema.
- **Reversibilidad.** El puerto solo tiene `archive`, no `unarchive`. Un modelo de IA que archiva por error no puede deshacerlo desde MCP. Valora si basta con documentarlo en la descripción de la tool, o si añades `unarchive` o confirmación.
- **Seguridad y alcance.** Cualquier cliente MCP conectado podrá archivar cualquier item por id. Eso es una mutación que oculta datos de los packs. La descripción de la tool debe decir que solo se use cuando el usuario lo pida explícitamente.
- **Items `imported`.** `archive` actúa sobre cualquier id, incluidos los importados. Decide si es válido. Hoy los `imported` no se pueden crear por MCP (gotcha #7), pero archivarlos no rompe esa regla.
- **Idempotencia.** Si el item ya está archivado, `UPDATE` igualmente reporta `changes > 0`, así que devolvería éxito y bumpearía el lineage sin cambio real. Decide si eso te vale o si quieres comprobarlo antes.
- **Descubrimiento del id.** `search_context` no imprime el id de cada hit, y solo `save_*` lo devuelve. Para que el modelo pueda archivar algo que no acaba de guardar, `search_context` tendría que incluir el id en sus líneas. Eso cambia un formato de salida existente y toca sus tests.
- **Contrato publicado.** Los packs y los fixtures del golden vault ya cubren `archived`, así que no debería requerir regenerar nada. No toques el ensamblado de packs (gotcha #10) ni el esquema. No hace falta migración, porque la columna `archived` ya existe.
- **Calidad.** Sigue las convenciones: un use case por archivo en `use-cases/`, sin ficheros sueltos, y `npm run typecheck && npm run lint && npm run test` durante la implementación. La rama sería `feat/<ADV>`.

### Decisiones que necesito de ti
1. ¿Actualizar `updated_at` al archivar?
2. ¿Añadir `unarchive`, o dejarlo irreversible desde MCP?
3. ¿Hacer idempotente el archivado de un item que ya lo está?
4. ¿Incluir el id en la salida de `search_context`?
5. ¿Permitir archivar items `imported`?

¿Arranco el refine del advance, o prefieres fast-track?
