Solo he leído el código; no he editado nada.

## Antes de tocar `src/**`

El repo exige el ritual de avances. Necesitas un `advances/<ADV>/plan.md` con la línea `Approved: Oscar <fecha>`, o decir "fast-track" para saltarte refiner, planner y reviewer. Aun con fast-track, `guard-implementation.sh` bloquea las ediciones de `src/**` hasta que exista esa línea. La escribe Oscar, o yo solo si me lo dice explícitamente. Cuando se implemente, la rama sería algo como `feat/archive-context-<ADV>`.

## Lo que ya existe

- `ContextItemRepository.archive(itemId): boolean` ya está en el puerto (`src/context/application/ports/repositories.ts:28`) y en `SqliteContextItemRepository` (`src/context/infra/item-repo.ts:121`). Hoy solo lo llama su test.
- El código de error `ITEM_NOT_FOUND` ya existe en `src/context/domain/errors.ts`.
- Las lecturas (`findByProject`, `search`, `list`) ya excluyen `archived = 1`. No hay que tocar nada de ahí.

## Archivos a tocar

1. **`src/context/application/use-cases/archive-context.use-case.ts`** (nuevo): clase `ArchiveContext implements UseCase<ArchiveContextInput, ArchiveContextOutput>`.
   - Parsea el `id` antes de abrir sesión (gotcha de `context`: la entrada mala nunca abre el vault).
   - Hace `sessions.withSession(s => s.write(() => …))` y llama a `s.items.archive(id)`.
   - Si devuelve `false`, responde `contextErr("ITEM_NOT_FOUND", …)`.
   - Hace falta `session.write()` para que el lineage se incremente en la misma transacción (gotcha repo-wide). Si no, la detección de fork en sync no ve el cambio.
2. **`archive-context.use-case.test.ts`** (nuevo), con casos para éxito, id inexistente, id vacío y vault bloqueado.
3. **`src/delivery/container.ts`**: añadir `archiveContext: ArchiveContext` al tipo `Container` (~línea 45) y al wiring (~línea 82, junto a `saveContext`).
4. **`src/delivery/mcp/server.ts`**: entrada en `DESCRIPTIONS` y `registerTool("archive_context", { inputSchema: { id: z.string() } })`, con el mismo patrón `err(r.error)` / `ok(...)`.
5. **`src/delivery/mcp/server.test.ts`**: el test "exposes exactly the 5 tools" pasa a 6 y se añade un caso de integración (guardar, archivar, comprobar que `search_context` ya no lo devuelve).
6. **Docs, en el mismo commit** (regla del repo):
   - `docs/SPEC.md`: la tabla de la línea ~109 y el título "Tools (5 — resist adding more)".
   - `specs/delivery.md:42`, `specs/context.md` (use cases) y `README.md:177`.
   - `CHANGELOG.md`.
   - `.context/flows/` y `AGENTS.md`, si quieres un flow nuevo; no es obligatorio.
   - `docs/SPEC.md:15` y `:228`, `CHANGELOG.md:15` y `:51` dicen "no MCP tool added" en avances anteriores. Es histórico, no se toca.

Las carpetas nuevas respetan la convención: el use case va en `use-cases/` y no hace falta ningún archivo suelto.

## Qué tener en cuenta

- **Decisión de diseño:** `docs/SPEC.md` dice "5 tools — resist adding more". Añadir una sexta es una decisión de producto y conviene confirmarla en el Gate.
- **Es destructivo para el modelo y no hay vuelta atrás.** No existe `unarchive` ni en MCP, ni en CLI, ni en desktop. Un modelo que archive por error hace desaparecer el item de los packs y de la búsqueda, y solo se recupera tocando la base de datos. Opciones:
  - añadir un `unarchive` o un comando CLI para restaurar;
  - redactar la descripción de la herramienta para que exija confirmación del usuario;
  - aceptarlo tal cual.
  Mi recomendación es al menos la descripción con confirmación.
- **Cómo obtiene el modelo el `id`:** `save_context` lo devuelve, pero `search_context` y `get_context` hoy no lo muestran (`server.ts:139`, `context-pack-markdown.ts`). Sin ese cambio, el modelo solo podría archivar lo que acaba de guardar en la misma sesión. Si quieres que sea útil de verdad, hay que incluir el id en la salida de búsqueda, y quizá en el pack. Eso ya cambia el formato de salida y puede afectar a `context-pack-markdown.test.ts` y al test de conformidad.
- **`archive()` no actualiza `updated_at`.** Decide si debe hacerlo. El upsert sí lo hace, y el formato del vault está documentado en `docs/vault-format.md`.
- **Idempotencia:** `archive()` devuelve `true` si la fila existe aunque ya estuviera archivada, porque `changes > 0` cuenta la fila coincidente. Archivar dos veces no da error, pero sí hace un bump de lineage innecesario. Se puede comprobar el estado antes si te molesta.
- **Fuera de alcance:** desktop. Si no entra en este avance, no hace falta tocar IPC ni `bridge`. Si entra, aplica la regla de los cuatro cambios por canal.
- **Verificación:** `npm run typecheck && npm run lint && npm run test` desde la raíz.

## Decisiones para confirmar

1. ¿Aceptas una sexta herramienta MCP, contra la regla "resist adding more"?
2. ¿Añadimos un `unarchive` o un comando CLI para deshacer?
3. ¿Se expone el `id` en `search_context` y en `get_context`?
4. ¿`archive()` actualiza `updated_at`?
5. ¿Fast-track o ritual completo?
