## Plan para `archive_context`

El repositorio ya tiene `ContextItemRepository.archive(itemId): boolean` (`src/context/infra/item-repo.ts:121`, puerto en `ports/repositories.ts:28`). También existe el código de error `ITEM_NOT_FOUND`. Falta el use case, el tool MCP y la documentación. No hace falta migración de esquema.

### Archivos a tocar

**Código (`src/`)**
1. `src/context/application/use-cases/archive-context.use-case.ts` (nuevo): clase `ArchiveContext implements UseCase<{ itemId: string }, { itemId: string }>`.
   - Valida el id antes de abrir sesión. Usa `contextErr("ITEM_NOT_FOUND", …)` si `archive()` devuelve `false`.
   - Ejecuta todo dentro de `sessions.withSession(s => s.write(() => …))`.
2. `archive-context.use-case.test.ts` (nuevo): casos ok, id inexistente, id ya archivado y fork de lineage.
3. `src/delivery/container.ts`: añadir `archiveContext: ArchiveContext` al tipo `Container` y al cableado (junto a la línea 82).
4. `src/delivery/mcp/server.ts`: añadir la entrada en `DESCRIPTIONS` y un `registerTool("archive_context", …)` con `inputSchema: { id: z.string() }`. Devuelve `ok(...)` o `err(...)`, como los demás tools.
5. `src/delivery/mcp/server.test.ts`: test del tool nuevo y del caso de vault bloqueado.

**Documentación (va en el mismo commit)**
6. `docs/SPEC.md` §7: la tabla dice "5 tools — resist adding more" y la línea 24 dice "5 tools". Hay que actualizar ambas a 6 y añadir la fila.
7. `CHANGELOG.md`, y `.context/overview.md` o `specs/delivery.md` si listan los tools.

### Qué tener en cuenta

- **Decisión de producto.** `.context/gotchas.md` y `SPEC.md` dicen que la superficie MCP es pequeña a propósito. Hay que decidir si el tool merece existir. La alternativa es dejarlo solo en CLI y desktop. Si lo añadimos, la descripción del tool debe indicar que solo se use cuando el usuario lo pida explícitamente.
- **Escritura y lineage.** La mutación tiene que pasar por `VaultSession.write()`, para que se incremente la generación y se detecten forks entre dispositivos. Llamar a `session.items.archive()` fuera de `write()` rompería la sincronización.
- **`updated_at`.** `archive()` hoy no actualiza `updated_at`. Hay que decidir si debe hacerlo. Si lo hace, es un cambio de comportamiento del repo y hay que revisar `docs/vault-format.md`.
- **Idempotencia.** `UPDATE … WHERE id = ?` cuenta como cambio aunque el item ya estuviera archivado. Archivar dos veces el mismo id devolverá ok. Si prefieres un error o un mensaje distinto ("ya archivado"), el use case tiene que leer el estado antes.
- **Ids visibles al modelo.** El modelo solo puede pasar un id que haya visto. `save_context` lo devuelve, pero hay que comprobar si `search_context` y `get_context` lo muestran en su salida. Si no, el tool es poco útil sin un cambio adicional en esos tools.
- **Sin vault-format.** `archived` ya está en el contrato (`vault-format.md` §278 y §290), así que no hay cambio de esquema ni de formato. No hace falta actualizar la fixture de `golden-vault`.
- **Sin fugas.** La respuesta no debe incluir datos de lineage ni de dispositivo.
- **Convenciones.** Usar el sufijo `.use-case.ts` y `ArchiveContext` como nombre de clase, igual que `SaveContext`. Los errores van por `contextErr`. No dejes archivos sueltos en la raíz de una capa.

### Proceso (CLAUDE.md)

- Es un cambio en `src/**`, así que hace falta `advances/<ADV>/plan.md` con la línea `Approved: Oscar <fecha>` antes de editar. El hook `guard-implementation.sh` lo impide si no está.
- Flujo completo: refine → Gate R → plan → Gate P → rama `feat/<ADV>` → implementar → `change-reviewer` → `git-ops`. Si quieres saltarte la ceremonia, di "fast-track esto". Aun así el `plan.md` con `Approved:` sigue siendo obligatorio.
- Verificación: `npm run typecheck && npm run lint && npm run test`.

¿Quieres que arranque con el refine o prefieres fast-track? Antes, confírmame tres decisiones:
1. ¿Se actualiza `updated_at` al archivar?
2. ¿Archivar un item ya archivado devuelve ok o error?
3. ¿Hay que exponer ids en `search_context` y `get_context` si hoy no salen?
