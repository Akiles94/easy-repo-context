Guardar contexto desde un cliente MCP escribe una fila normal en SQLite. El cifrado no ocurre sobre el ítem: toda la base de datos está cifrada con SQLCipher, y la clave se aplica al abrirla (`PRAGMA key`). No hay cifrado por ítem.

Seguí `.context/flows/save-context.md` y comprobé en el código que los símbolos principales existen. No leí cada función completa, así que los detalles internos salen de ese doc.

## Recorrido

1. **Entrada MCP**: `src/delivery/mcp/server.ts:buildMcpServer()` registra las herramientas `save_context` y `save_handoff`. `save_handoff` fuerza el tipo `handoff`. Valida con zod y toma `source` del nombre del cliente MCP. La CLI no tiene comando de guardado, así que este es el único camino.
2. **Caso de uso**: `src/context/application/use-cases/save-context.use-case.ts:SaveContext.execute()` llama a `parseInput()`. Valida el nombre del proyecto, el tipo (por defecto `fact`), las etiquetas (máximo 10, con formato `[a-z0-9-]`) y el contenido (recortado, máximo 32 KB). Si algo falla, termina antes de tocar disco.
3. **Abrir sesión**: `src/context/infra/vault-sessions.ts:SqliteVaultSessions.open()` hace esto:
   - Lee el encabezado `vault.json`.
   - Obtiene la clave del llavero del SO. Si falta, devuelve `VAULT_LOCKED`.
   - Comprueba el TTL de inactividad con `SessionGuard.guard()`.
   - Abre la base con `openVaultDb()` y ejecuta `migrate()`.
4. **Escritura**: `session.write()` llama a `commitWrite()`, que hace todo en una sola transacción:
   - Busca o crea el proyecto.
   - Llama a `createContextItem()`.
   - `SqliteContextItemRepository.save()` hace un upsert. Las etiquetas van como JSON y el índice FTS5 se actualiza con triggers.
   - `SqliteLineageStore.bump()` sube el linaje.
5. **Después del commit**: `FileDeviceIdentity.recordSeen()` (`src/vault/infra/file-device-identity.ts`) guarda la generación y el sello en `state.json`. La sesión siempre se cierra, en el `finally` de `runWithSession`.

## Cuándo se cifra

- **La clave se deriva en el unlock**: Argon2id produce una clave de 32 bytes. Esto ocurre en el flujo de unlock (`.context/flows/unlock.md`) y no en el guardado. La clave queda en el llavero del SO.
- **Se aplica al abrir la base**: `src/shared/infra/sqlite.ts:openVaultDb()` ejecuta `db.pragma("key=\"x'<hex>'\"")` con la clave cruda.
- **El cifrado ocurre al escribir páginas**: tras ese pragma, SQLCipher cifra de forma transparente cada página al escribirla al disco. Eso incluye las tablas, el índice FTS y los metadatos de linaje.
- **Qué queda en claro**: `vault.json` y `state.json`, que están fuera de la base. Por el doc, `state.json` solo guarda generación y sello. No verifiqué qué contiene `vault.json` más allá de que es el encabezado.

## Detalles a tener en cuenta

- Si la mutación falla, se revierte también el incremento de linaje (`WriteFailedSentinel`).
- Si la clave del llavero está obsoleta, se borra y se reporta como bloqueado.
