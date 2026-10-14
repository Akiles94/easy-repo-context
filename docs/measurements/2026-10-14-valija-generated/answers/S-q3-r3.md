## Plan: herramienta MCP `archive_context`

Lo que encontré en el código marca el alcance, y no es mucho.

- `ContextItemRepository.archive(itemId): boolean` **ya existe** (`src/context/application/ports/repositories.ts:28`, `src/context/infra/item-repo.ts:121`), con test. Nada lo llama.
- `ITEM_NOT_FOUND` **ya existe** en `ContextErrorCode` (`src/context/domain/errors.ts`).
- Search, packs y conteos de proyecto ya excluyen `archived = 1`. No hay que tocar lectura.
- No hace falta migración de esquema.

Falta el caso de uso, su cableado en el container, el registro de la tool y la documentación.

### Proceso (CLAUDE.md)
Este cambio va por el ritual completo, salvo que digas "fast-track esto".

1. `task-refiner` escribe `advances/<ADV>/refined.md`. **Gate R**: te lo presento y espero tu aprobación.
2. `task-planner` escribe `plan.md`. **Gate P**: te presento resumen, *Decisions to confirm* y el árbol de estructura resultante.
3. Hasta que `plan.md` tenga la línea `Approved: Oscar <fecha>` (la escribes tú, o yo solo si me lo dices explícitamente), el hook bloquea cualquier edición en `src/**`.
4. Rama `feat/archive-context-<ADV>`, `change-reviewer` y `git-ops`.

El nombre del ADV lo defines tú.

### Archivos a tocar

**Nuevos**
- `src/context/application/use-cases/archive-context.use-case.ts`: clase `ArchiveContext implements UseCase<{itemId: string}, {itemId: string}>`. Valida el id antes de abrir sesión. Después hace `withSession` y `session.write(...)`, donde llama a `items.archive(id)`. Si devuelve `false`, responde `contextErr("ITEM_NOT_FOUND", ...)`.
- `archive-context.use-case.test.ts`: caso feliz, id inexistente, idempotencia, que el item desaparece de search y del pack, y que la escritura sube el lineage.

**Modificados**
- `src/delivery/container.ts`: añadir `archiveContext: ArchiveContext` al tipo y al wiring (cerca de la línea 45 y la 82).
- `src/delivery/mcp/server.ts`: entrada nueva en `DESCRIPTIONS` y un `registerTool("archive_context", …)` con `inputSchema: { id: z.string() }`. Éxito con `ok("Archived item <id>.")` y error con `err(r.error)`.
- `src/delivery/mcp/server.test.ts`: el fake container (línea ~60) necesita `archiveContext`. Hay que actualizar la lista de tools esperadas (línea ~98) y añadir un test de la tool.

**Documentación (va en el mismo commit)**
- `docs/SPEC.md` (tabla de tools, ~línea 113), `README.md:177` ("Five tools" pasa a seis), `CHANGELOG.md`, `specs/delivery.md` y `specs/context.md`.
- `.context/flows/mcp-save-context.md` y `AGENTS.md`: añadir una nota o un flow nuevo (`mcp-archive-context`).

### Cosas a tener en cuenta
1. **Debe ir por `session.write()`** (gotcha #1). Si llamas a `items.archive()` fuera de él, no hay bump de lineage y la detección de forks de sync queda ciega.
2. **Se necesita `withSession`** (gotcha #6). Así se respeta el bloqueo por keychain y el TTL de inactividad.
3. **Estructura de carpetas.** El caso de uso va en `use-cases/`. Cualquier DTO nuevo va en `dto/`, sin archivos sueltos.
4. **Decisión: ¿se pueden archivar items `imported`?** Hoy un modelo no puede crear imports (gotcha #7), pero con esta tool sí podría ocultarlos. Yo lo permitiría, porque es soft-delete, pero conviene que lo confirmes.
5. **Decisión: la operación es irreversible desde MCP.** No existe `unarchive`. Un modelo puede archivar por error y el usuario no tiene cómo deshacerlo, salvo tocando la base. Opciones:
   - Dejarlo así.
   - Añadir `unarchive` (más alcance).
   - Redactar la descripción de la tool para que pida confirmación al usuario.

   Recomiendo lo último, más dejar `unarchive` como advance aparte.
6. **Sutileza en `archive()`.**
   - Devuelve `true` si la fila existe, aunque ya estuviera archivada. Archivar dos veces es idempotente, y creo que es lo correcto. Yo lo documentaría y lo cubriría con un test.
   - No actualiza `updated_at`. Decide si archivar debe contar como modificación, porque afecta a "last activity" de `list_projects`. Si quieres que cuente, hay que cambiar la query y su test.
7. **El id viene del modelo y no está verificado.** Solo se usa como parámetro enlazado, así que no hay riesgo de inyección. Pero no revela a qué proyecto pertenece, así que valora si el mensaje de éxito debería incluir el nombre del proyecto. Eso requiere una lectura previa dentro de la misma sesión.
8. **El contrato del pack y el golden vault no se tocan.** No cambia el ensamblado, así que `VALIJA_WRITE_GOLDEN_VAULT` no hace falta.
9. **Desktop.** La app Electron no usa esto, por lo que no hay cambios en IPC. Si luego quieres un botón "archivar" en la GUI, es otro advance.

Dime si arrancamos con el ritual completo (lanzo `task-refiner`) o con fast-track, y qué decides en los puntos 4, 5 y 6.
