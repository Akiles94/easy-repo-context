**Resumen:** el cliente MCP llama a la herramienta `save_context`. El caso de uso valida la entrada y `SqliteVaultSessions` abre la base con la clave que está en el keychain del SO. Escribe en una sola transacción. **No hay un paso de "cifrar este texto"**: la información viaja en claro dentro del proceso y SQLCipher la cifra de forma transparente al escribir las páginas en `vault.db`.

## Recorrido

1. **Entrada MCP** – `src/delivery/mcp/server.ts:buildMcpServer()`. La herramienta `save_context` recibe `project`, `content`, `type` y `tags`.
   - `type` se limita con zod a `ITEM_TYPES`, que excluye `imported`.
   - `source` es el nombre del cliente MCP (Claude, Cursor, etc.).
   - `save_handoff` usa el mismo caso de uso con `type: "handoff"`.
2. **Caso de uso** – `src/context/application/use-cases/save-context.use-case.ts:SaveContext.execute()`. Parsea proyecto, tipo, tags y contenido antes de abrir ninguna sesión. Si algo es inválido, falla sin tocar el disco.
3. **Apertura de sesión** – `src/context/infra/vault-sessions.ts:SqliteVaultSessions.open()`:
   - Lee el header (`readVaultHeader`) y obtiene el `vaultId`.
   - `requireKey` pide la clave al keychain del SO. Si no está, devuelve `VAULT_LOCKED`. "Desbloqueado" solo significa que hay una clave en el keychain; no hay daemon.
   - `SessionGuard.guard()` (`src/vault/application/policies/session-guard.ts`) revisa el TTL de inactividad. Si expiró, borra la clave del keychain y devuelve `VAULT_LOCKED`.
4. **Escritura** – `SqliteVaultSessions.commitWrite()`. En una única transacción:
   - busca o crea el proyecto;
   - guarda el ítem (`items.save`, que también alimenta el FTS);
   - incrementa el linaje con `lineageStore.bump()`.

   Si la mutación falla, `WriteFailedSentinel` fuerza el rollback, incluido el bump. `recordSeen` se llama solo tras el commit. La sesión siempre se cierra en el `finally` de `runWithSession`.
5. **Respuesta** – el servidor devuelve `Saved <type> to project "..." Item id: ...`. Si hay un error de dominio, devuelve un `isError` con el texto `"msg [CODE]"`.

## Cuándo se cifra

El cifrado ocurre en `src/shared/infra/sqlite.ts:openVaultDb()`, que se llama desde `openRepositories` en el paso 3:

- `db.pragma("cipher='sqlcipher'")` y `db.pragma("key=\"x'<keyHex>'\"")` activan SQLCipher con una clave cruda de 32 bytes (64 hex).
- La siguiente consulta a `sqlite_master` verifica la clave. Si es incorrecta lanza `SQLITE_NOTADB`. En ese caso `openRepositories` borra la clave obsoleta del keychain y devuelve `VAULT_LOCKED`.
- Desde ahí, cada página que SQLite escribe al hacer commit en el paso 4 sale cifrada hacia `vault.db`. Cifrar y descifrar lo hace el motor, por debajo de los repositorios.

La clave no se guarda en disco en claro. Se deriva con Argon2id durante `valija unlock` y se coloca en el keychain; este flujo solo la lee. Ese tramo está en `flows/vault-unlock-and-session.md`, que no he abierto.

## Detalles útiles
- Cada llamada a una herramienta reabre y cierra la base, porque no hay proceso persistente.
- El journal es `DELETE`, no WAL, para que una carpeta sincronizada solo vea un `vault.db` cifrado, sin `-wal` ni `-shm`.
- Todo cambio de datos debe pasar por `session.write()`. Si no, no se incrementa el linaje y la detección de forks en la sincronización queda ciega.

Verifiqué contra el código `server.ts`, `vault-sessions.ts` y `sqlite.ts`. Los pasos 2 y 3 (`SaveContext.execute()` y `SessionGuard.guard()`) los tomo de `.context/flows/mcp-save-context.md` sin haber abierto esos archivos.
