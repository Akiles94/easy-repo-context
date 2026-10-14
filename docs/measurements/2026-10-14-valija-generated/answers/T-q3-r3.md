## Plan: herramienta MCP `archive_context`

Casi todo lo difícil ya existe. `context_items.archived` está en el esquema desde la migración 001. `ContextItemRepository.archive(itemId): boolean` ya está en el puerto y en `item-repo.ts:121`. `ITEM_NOT_FOUND` ya está en `ContextErrorCode`. Las búsquedas, el context pack y `list_projects` ya excluyen los items archivados. Falta el caso de uso y su exposición por MCP.

### Proceso (CLAUDE.md)
- El ritual completo es el predeterminado: refine → Gate R → plan → Gate P → implementar → review → ship. Si quieres saltarte la ceremonia, di "fast-track esto".
- En ambos casos hace falta `advances/<ADV>/plan.md` con la línea `Approved: Oscar <fecha>` antes de tocar `src/**`. Solo la escribo si tú lo dices explícitamente.
- La rama sería algo como `feat/archive-context`.

### Archivos a tocar
| Archivo | Cambio |
|---|---|
| `src/context/application/use-cases/archive-context.use-case.ts` (nuevo) | `ArchiveContext implements UseCase<{ id: string }, { itemId }>`. Parsea el id antes de abrir sesión. Después hace `sessions.withSession(s => s.write(() => …))`. Si `items.archive(id)` devuelve `false`, devuelve `contextErr("ITEM_NOT_FOUND", …)`. |
| `…/archive-context.use-case.test.ts` (nuevo) | Casos: archiva bien, id inexistente, id vacío (sin abrir sesión), idempotencia. |
| `src/delivery/container.ts` | Añadir `archiveContext: ArchiveContext` al tipo `Container` y a la composición, junto a `saveContext` (líneas ~45 y ~82). |
| `src/delivery/mcp/server.ts` | Añadir `DESCRIPTIONS.archive_context` y `registerTool("archive_context", { id: z.string() })`. Devuelve `ok(...)` o `err(...)`. |
| `src/delivery/mcp/server.test.ts` | El test de la línea ~94 ("exactamente 5 tools") pasa a 6. Añadir un test de extremo a extremo: guardar, archivar, y comprobar que `search_context` ya no lo devuelve. |
| Docs, en el mismo commit | `docs/SPEC.md` (tabla de herramientas, ~línea 112), `specs/delivery.md:42` ("Five tools"), `README.md:177`, `CHANGELOG.md` (Unreleased/Added) y `.context/flows/` si lo consideras un flujo nuevo. |

El layout de módulos sigue la regla de carpetas por tipo: el caso de uso va en `application/use-cases/`. No hay ningún archivo suelto nuevo.

### Qué tener en cuenta
1. **Escritura por `session.write()`.** Es obligatorio, porque ahí se hace el bump de lineage en la misma transacción. Si llamara al repo fuera de `write()`, la detección de forks de sync no vería el cambio. El gotcha está en `gotchas.md` (Repo-wide).
2. **Parsear antes de abrir sesión.** Un id inválido nunca debe tocar la vault. Es el mismo patrón que `SaveContext.parseInput`.
3. **`archive()` no actualiza `updated_at`.** Es un `UPDATE … SET archived = 1`. Decide si quieres que sí lo haga. Para sync parece lo correcto, aunque el bump de lineage ya marca el cambio. Si lo cambias, hay que tocar el SQL y `item-repo.test.ts`.
4. **Semántica con id inexistente.** `archive()` devuelve `changes > 0`, así que un item ya archivado devuelve `true` (idempotente) y uno inexistente devuelve `false`. Conviene fijarlo en los tests.
5. **No hay forma de desarchivar.** La API no tiene `unarchive`, y un modelo podría archivar cosas por error. Hay tres cosas por decidir:
   - Si el archivado es reversible, y si hace falta una herramienta o comando de desarchivo, ahora o después.
   - Si hay que avisar en la descripción de la herramienta de que solo se use cuando el usuario lo pida.
   - Si los items `pinned` o `imported` deben poder archivarse.
6. **Descubrir ids.** `search_context` y `get_context` hoy no imprimen el id del item. `save_context` sí lo devuelve, pero un modelo en otra sesión no tendrá ids. Para que la herramienta sea utilizable hay que incluir el id en la salida de `search_context` (y quizá del pack). Eso cambia el markdown del pack, que tiene tests de conformidad con el fixture golden (`vault-format-conformance.test.ts`, `context-pack-markdown.test.ts`) y está documentado en `docs/vault-format.md`. Yo lo limitaría a `search_context` para no romper el contrato del formato.
7. **Desktop.** No hace falta nada: no toca canales IPC. Si más adelante quieres un botón de archivar en la GUI, serían las cuatro ediciones de canal descritas en `gotchas.md`.
8. **CLI.** Si quieres paridad (`valija archive <id>`), es un archivo más en `src/delivery`. Hay que confirmar si está dentro del alcance.

### Decisiones que necesito de ti
- ¿Fast-track o ritual completo?
- ¿`updated_at` se actualiza al archivar? (Recomiendo que sí.)
- ¿Incluyo el id en la salida de `search_context`? (Recomiendo que sí, solo ahí.)
- ¿Añado ahora una vía de desarchivo, o queda fuera del alcance?
- ¿Añado también el comando de CLI?
