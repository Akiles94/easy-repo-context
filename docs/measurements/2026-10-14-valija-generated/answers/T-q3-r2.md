Todavía no he tocado nada. Este es el plan, basado en lo que leí del repo.

## Lo que ya existe
- `ContextItemRepository.archive(itemId): boolean` está en el puerto (`src/context/application/ports/repositories.ts:28`) y en `src/context/infra/item-repo.ts:121`. Hace `UPDATE … archived = 1` y devuelve `false` si el id no existe.
- El código de error `ITEM_NOT_FOUND` ya está en `src/context/domain/errors.ts`.
- Nada llama hoy a `archive()` salvo su test. Falta el use case, el cableado y la herramienta MCP.

## Archivos que tocaría
1. **`src/context/application/use-cases/archive-context.use-case.ts`** (nuevo): clase `ArchiveContext implements UseCase<{ itemId: string }, { itemId: string }>`.
   - Valida que el id no esté vacío antes de abrir sesión, como `SaveContext.parseInput`.
   - Llama a `sessions.withSession(s => s.write(() => …))`.
   - Dentro del write llama a `session.items.archive(id)`. Si devuelve `false`, devuelve `contextErr("ITEM_NOT_FOUND", …)`.
   - Tiene su test al lado: `archive-context.use-case.test.ts`.
2. **`src/delivery/container.ts`**: añadir `archiveContext: ArchiveContext` a la interfaz y a `buildContainer`.
3. **`src/delivery/mcp/server.ts`**:
   - Añadir una entrada `archive_context` en `DESCRIPTIONS`.
   - Registrar la tool con `inputSchema: { id: z.string() }`.
   - Responder con `ok("Archived item <id>.")`, o `err(r.error)` si falla.
4. **`src/delivery/mcp/server.test.ts`**: el test actual "exposes exactly the 5 tools and 2 prompts" (línea 94) pasaría a 6. Añadir casos de archivar y de id inexistente. También comprobar que el item deja de salir en `search_context` y en `get_context`.
5. **Docs en el mismo commit** (lo exige el CLAUDE.md):
   - `docs/SPEC.md` §7 (superficie de tools MCP).
   - `specs/delivery.md` y `specs/context.md`.
   - `.context/flows/` (probablemente un flow nuevo corto, o una nota en `save-context.md`).
   - `AGENTS.md` si añades el flow.
   - `CHANGELOG.md`.
   - `README.md` si lista las tools.

## Qué tener en cuenta
- **El gate de aprobación.** No se puede editar `src/**` hasta que exista `advances/<ADV>/plan.md` con la línea `Approved: Oscar <fecha>`. El hook `guard-implementation.sh` lo impone. Con el ritual completo serían refiner → Gate R → planner → Gate P. Si quieres saltarlo, di "fast-track esto". Aun así yo escribiría un `plan.md` corto, y la línea `Approved:` solo la pongo si tú lo dices explícitamente.
- **Escrituras.** Todo cambio debe ir por `session.write()` para que `commitWrite()` suba el lineage en la misma transacción. Llamar a `archive()` fuera de un write rompe la detección de forks en sync (`gotchas.md`, Repo-wide).
- **Validar antes de abrir sesión.** Un input malo no debe tocar la bóveda ni la clave del keychain.
- **`updated_at`.** El `archive()` actual no actualiza `updated_at`, solo `archived`. Si el campo se usa para sync o para "última actividad", habría que decidir si cambiarlo. Eso tocaría `item-repo.ts` y su test, y conviene decidirlo en el plan.
- **Idempotencia.** Archivar un item ya archivado devuelve `true`, porque el `UPDATE` sigue matcheando la fila. Me parece aceptable y lo documentaría. No hay forma de restaurar (unarchive); queda fuera de este alcance salvo que quieras otra tool.
- **Seguridad de la tool.** Es destructiva en el sentido de que oculta contenido de búsquedas y de context packs, así que la descripción debe decirle al modelo que la use solo cuando el usuario lo pida. Aun así el item sigue en el archivo SQLCipher y sigue siendo recuperable por CLI o directamente en la base de datos.
- **Ids.** Los items se identifican por ULID, y `save_context` ya devuelve `Item id:`. En cambio `search_context` no muestra el id en sus resultados (línea 139), así que el modelo no tiene forma de conocer ids de items antiguos. Propongo incluir `id` en la línea de cada hit. Eso cambia el formato de salida y puede romper asserts en `server.test.ts`, así que es decisión tuya.
- **Fuera de alcance, pero relacionado.** Un comando CLI `valija archive <id>` y un canal IPC en desktop. Este último exigiría las cuatro ediciones de `gotchas.md` (channels, schemas, handler y preload).
- **Rama:** `feat/<ADV>`, con `npm run typecheck && npm run lint && npm run test` a medida que avanzo.

## Decisiones que necesito de ti
1. ¿Ritual completo o fast-track?
2. ¿Hay que actualizar `updated_at` al archivar?
3. ¿Muestro el id en los resultados de `search_context`?
4. ¿Incluyo el CLI en este mismo advance, o lo dejo aparte?
