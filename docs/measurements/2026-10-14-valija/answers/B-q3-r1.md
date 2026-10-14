Este es el plan. No he editado nada.

## Qué ya existe
- `ContextItemRepository.archive(itemId): boolean` ya está en el puerto (`src/context/application/ports/repositories.ts`) y en `SqliteContextItemRepository` (`src/context/infra/item-repo.ts:122`). No hace falta cambiar el puerto ni la infra.
- La columna `archived` ya existe desde `001-init`, así que **no hay migración ni cambio de formato**.
- `ITEM_NOT_FOUND` ya está en `ContextErrorCode`.

## Archivos que tocaría
1. **`src/context/application/use-cases/archive-context.use-case.ts`** (nuevo): clase `ArchiveContext` que implementa `UseCase`.
   - Parsea el `id` antes de abrir sesión (que sea un string no vacío).
   - Llama a `sessions.withSession(s => s.write(() => …))`.
   - Dentro del `write`, llama a `s.items.archive(id)`. Si devuelve `false`, devuelve `contextErr("ITEM_NOT_FOUND", …)`.
2. **`archive-context.use-case.test.ts`** (nuevo): cubre el caso OK, el id inexistente, el id inválido (no debe tocar la sesión) y que el lineage se incrementa.
3. **`src/delivery/container.ts`**: añadir `archiveContext: ArchiveContext` al tipo `Container` (línea ~45) y construirlo (línea ~82).
4. **`src/delivery/mcp/server.ts`**: añadir `archive_context` en `DESCRIPTIONS` y un `registerTool` con `inputSchema: { id: z.string() }`. Responde con un mensaje de éxito o con `err(r.error)`.
5. **`src/delivery/mcp/server.test.ts`**: test del nuevo tool.
6. **Docs, en el mismo commit**:
   - `docs/SPEC.md` §7: la tabla y el encabezado "5 tools" pasan a 6.
   - Intro de `docs/SPEC.md` (línea ~24, "MCP server with 5 tools").
   - `specs/delivery.md` y `specs/context.md`.
   - `README.md`.
   - `CHANGELOG.md`.
   - `.context/overview.md`.
   - Un flow nuevo `.context/flows/archive-context.md`, o una nota en `save-context.md`.
   - `.context/gotchas.md`, para actualizar la línea de "5 tools".

## Qué tener en cuenta
- **Proceso**: según `CLAUDE.md` hay que crear `advances/<ADV>/` y seguir el ritual (refine → Gate R → plan → Gate P). Hasta que `plan.md` tenga la línea `Approved: Oscar <fecha>`, el hook `guard-implementation.sh` bloquea cualquier edición en `src/**`. Si quieres saltarte la ceremonia, dime "fast-track esto". Aun así el `plan.md` con `Approved:` sigue siendo obligatorio, y solo lo escribo si tú me lo dices explícitamente.
- **Decisión de producto**: `docs/SPEC.md` §7 dice "5 tools — resist adding more", y el Gate R debería confirmar que se quiere superar ese límite. Hay que ver también si interesa un tool más general (por ejemplo `archive_context` con `unarchive`) o solo este.
- **Escritura**: toda mutación debe pasar por `session.write()`. Así se incrementa el lineage en la misma transacción y se mantiene la detección de forks. Si no, se rompe la sincronización entre dispositivos. Después del commit, `recordSeen()` actualiza `state.json`, igual que en `save-context`.
- **Idempotencia**: `archive()` hace `UPDATE … SET archived = 1`, así que archivar un item ya archivado devuelve `true` (el `UPDATE` sigue contando como cambio). Decidir si eso es éxito silencioso (lo más simple) o un error. Por otro lado, `archive()` no actualiza `updated_at`. Hay que decidir si debería hacerlo, ya que el item cambia.
- **Id inexistente**: se devuelve `ITEM_NOT_FOUND` y el `write` hace rollback, también del bump de lineage (el patrón `WriteFailedSentinel`).
- **Efecto del archivado**: los items archivados se excluyen de context packs, `search_context` y los conteos por proyecto, y el FTS no los devuelve. Esto ya está cubierto por el contrato de `docs/vault-format.md`, por lo que no cambia nada.
- **Id en el MCP**: `save_context` ya devuelve el `Item id`, pero `search_context` no lo muestra. Un modelo no podría descubrir ids para archivar. Habría que añadir el id a las líneas de `search_context`, o lo hará inútil. Eso modifica la salida de un tool existente y tiene que quedar reflejado en la spec, aunque no afecta al formato de disco.
- **Seguridad de la superficie MCP**: la respuesta no debe incluir datos de lineage o de dispositivo.
- **Descripción del tool**: es "prompt engineering". Debe indicar que solo se use cuando el usuario lo pide explícitamente, porque ocultar contexto es poco visible y no hay un tool para deshacerlo.
- **Desktop**: reutiliza `container.ts`, pero no expone MCP. No hace falta tocar `desktop/` salvo que quieras un botón en la GUI.
- **Verificación**: `npm run typecheck && npm run lint && npm run test`. Si cambia la salida de `search_context`, hay que revisar `vault-format-conformance.test.ts`.

¿Quieres que lo lance con el ritual completo o en fast-track? Y dime tu decisión sobre la idempotencia y sobre añadir el id a `search_context`.
