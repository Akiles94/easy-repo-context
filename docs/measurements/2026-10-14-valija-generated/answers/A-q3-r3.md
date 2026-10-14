# Plan: herramienta MCP `archive_context`

La parte difícil ya existe. `ContextItemRepository.archive(itemId): boolean` está en `src/context/application/ports/repositories.ts:28` y su implementación SQL en `src/context/infra/item-repo.ts:121`. Tiene test, y búsqueda, packs y conteos ya excluyen los archivados. Falta el caso de uso, el cableado en el container y el registro de la tool.

## Proceso (CLAUDE.md)

Por defecto aplica el ritual completo, salvo que digas "fast-track esto":

1. `task-refiner` escribe `advances/<ADV>/refined.md`, y se para en el Gate R.
2. `task-planner` escribe `plan.md`, y se para en el Gate P. Ahí te presento el resumen, las *Decisions to confirm* y la estructura de archivos resultante.
3. Hasta que `plan.md` tenga la línea `Approved: Oscar <fecha>`, el hook `guard-implementation.sh` bloquea las ediciones en `src/**`. Esa línea la escribes tú, o yo solo si me lo dices explícitamente.
4. Rama `feat/<ADV>`, implementación, y luego `change-reviewer` y `git-ops`.

## Archivos a tocar

| Archivo | Cambio |
|---|---|
| `src/context/application/use-cases/archive-context.use-case.ts` (nuevo) | Clase `ArchiveContext implements UseCase<{ itemId: string }, …>`. |
| `src/context/application/use-cases/archive-context.use-case.test.ts` (nuevo) | Tests del caso de uso. |
| `src/delivery/container.ts` | Añadir `archiveContext` a la interfaz `Container` y construir `new ArchiveContext(sessions)`. |
| `src/delivery/mcp/server.ts` | Entrada en `DESCRIPTIONS`, más `registerTool("archive_context", …)` con `inputSchema: { id: z.string() }`. |
| `src/delivery/mcp/server.test.ts` | Tests de la tool. |
| Docs, en el mismo commit | `README.md`, `specs/delivery.md`, `docs/SPEC.md` (donde se listan las tools) y `CHANGELOG.md`. |

Probablemente no haga falta tocar `errors.ts`, porque `ITEM_NOT_FOUND` ya existe en el contexto `context`.

## Qué tener en cuenta

1. **Debe usar `session.write(...)`.** Archivar es una mutación y `write` sella el linaje del vault, con generación y write stamp, en el mismo commit (`vault-session.ts`). Si llamo a `session.items.archive()` a pelo, la mutación no entra en la sincronización multi-dispositivo (`multi-device-sync.test.ts`). Este es el punto que más fácil se olvida.
2. **`archive()` no actualiza `updated_at`.** Es un `UPDATE … SET archived = 1`. Decisión a confirmar: si lo dejo así o añado `updated_at`. Cambiarlo toca infra y su test. Mi recomendación es no tocarlo en este advance, salvo que la sincronización lo necesite para resolver conflictos.
3. **No existe una forma de buscar un item por id.** El repo solo tiene `findByProject`, `search` y `archive`. Para devolver algo útil, como el proyecto o el tipo del item archivado, haría falta un `findById` nuevo en el puerto y en `SqliteItemRepository`. Mi recomendación es no añadirlo y que la respuesta sea solo `Archived item <id>.`.
4. **Errores.** Si `archive()` devuelve `false`, el caso de uso responde con `contextErr("ITEM_NOT_FOUND", …)` y la tool lo devuelve con `err(...)`. Archivar un item que ya estaba archivado también devuelve `true`, así que la operación es idempotente. Esto hay que dejarlo documentado y cubierto por un test.
5. **No hay forma de deshacerlo desde MCP.** Un modelo que se equivoque de id pierde ese item de las búsquedas y packs, y no puede revertirlo. Decisión a confirmar: si añadimos `unarchive_context` o lo dejamos fuera de alcance. Mi recomendación es dejarlo fuera y que la descripción de la tool avise de que es solo reversible desde la app o la CLI.
6. **La descripción de la tool importa.** Los clientes la leen para decidir cuándo llamarla. Debe decir que se usa solo cuando el usuario lo pide explícitamente, y que el id sale de `search_context`. Hoy `search_context` no incluye el id en su salida (`server.ts:138`), así que el modelo no podría obtenerlo. Habría que añadir `id` a las líneas de resultado, y eso cambia una salida existente. Esto es la decisión más importante.
7. **Convenciones.** El archivo va en la subcarpeta `use-cases/`. Hay que seguir el estilo `XUseCase`, con el nombre de clase como `SearchContext`, y mantener los tests por capa. No hay que crear archivos sueltos.
8. **Bloqueo del vault.** `withSession` devuelve `VAULT_LOCKED` si el vault está bloqueado, y la tool ya lo propaga bien a través de `err()`.
9. **Escritorio.** `desktop/` tiene su propio IPC, pero no es necesario tocarlo para la tool MCP. Solo habría que hacerlo si quieres el mismo botón en la GUI.

## Decisiones que necesito de ti

- Añadir `id` a la salida de `search_context`. Mi recomendación es que sí, es imprescindible para que la tool sea usable.
- Mantener `archive()` sin tocar `updated_at`. Mi recomendación es que sí.
- Dejar fuera `unarchive_context` y `findById`. Mi recomendación es que sí.
- Ritual completo o fast-track. Es un cambio pequeño, de unos 5 archivos más docs, así que fast-track encaja. De todos modos tendría que escribir yo un `plan.md` con tu aprobación explícita antes de editar `src/`.

No he editado nada. Dime las decisiones y cómo quieres proceder.
