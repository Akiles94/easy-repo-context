**Resumen:** el cifrado no es un paso explícito en el código de guardado. Lo hace SQLCipher de forma transparente al abrir la base con la clave (`openVaultDb`). Todo lo que se escribe después, en la transacción de guardado, se cifra por página al ir a disco. La clave sale del keychain del SO, donde quedó tras `valija unlock`.

## Recorrido

1. **Entrada MCP**: `src/delivery/mcp/server.ts:buildMcpServer()`
   - La tool `save_context` valida con zod; `type` solo admite `ITEM_TYPES`.
   - `source` es el nombre del cliente MCP (Claude, Cursor…).
   - `save_handoff` llama al mismo caso de uso con `type: "handoff"`.

2. **Validación**: `src/context/application/use-cases/save-context.use-case.ts:SaveContext.execute()`
   - `parseInput` parsea proyecto, tipo, tags y contenido **antes** de abrir ninguna sesión, así que una entrada inválida nunca toca el vault.

3. **Apertura de sesión**: `src/context/infra/vault-sessions.ts:SqliteVaultSessions.open()`
   - Lee el header del vault.
   - Pide la clave al keychain. Si no está, devuelve `VAULT_LOCKED`.
   - `SessionGuard.guard()` comprueba el TTL de inactividad. Si expiró, borra la clave del keychain y devuelve `VAULT_LOCKED`.
   - Llama a `openVaultDb` y `migrate`.

4. **Escritura**: `SaveContext` llama a `session.write(...)`, que es `commitWrite()`. En una sola transacción:
   - busca o crea el proyecto,
   - hace `items.save(item)` (también actualiza el índice FTS),
   - hace `lineageStore.bump()`.

   Si la mutación falla, se hace rollback con `WriteFailedSentinel`. `recordSeen` solo se ejecuta después del commit.

5. **Cierre y respuesta**
   - `runWithSession` cierra la DB en un `finally`.
   - El servidor responde `Saved <type> to project "…"`. Si hay error, devuelve `isError` con el texto `"msg [CODE]"`.

## Cuándo se cifra

- **Apertura**: en `src/shared/infra/sqlite.ts:openVaultDb()`, `db.pragma("cipher='sqlcipher'")` y `db.pragma("key=\"x'<hex>'\"")` activan el cifrado con la clave cruda de 32 bytes.
  - La línea `SELECT count(*) FROM sqlite_master` verifica la clave. Si es incorrecta lanza `SQLITE_NOTADB`, y `openRepositories` borra la clave obsoleta del keychain y devuelve `VAULT_LOCKED`.
- **Escritura**: el contenido llega en claro hasta `items.save(...)`. SQLCipher lo cifra por página cuando la transacción de `commitWrite` se persiste en `vault.db`. En disco nunca hay texto plano.
- **Derivación de la clave**: según `.context/flows/vault-unlock-and-session.md`, `valija unlock` deriva la clave con Argon2id y la guarda en el keychain. No abrí ese código, así que eso lo doy por lo que dice el doc.

## Detalles que conviene saber

- **No hay daemon.** Cada llamada a una tool reabre la DB. "Desbloqueado" solo significa que hay una clave en el keychain, y el auto-lock por inactividad se comprueba al abrir la sesión.
- **El modo de journal es `DELETE`, no WAL.** Así una carpeta sincronizada solo ve `vault.db`, sin ficheros `-wal` ni `-shm`.
- **Toda escritura debe pasar por `session.write()`.** Si no, no se incrementa el lineage y la detección de forks de sync queda ciega.

El flow doc `.context/flows/mcp-save-context.md` coincide con el código que leí.
