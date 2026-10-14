**Resumen:** el contenido nunca se cifra en el código de la aplicación. El use case trabaja con texto plano en memoria. Al abrir la base se le entrega a SQLCipher una clave de 32 bytes, y SQLCipher cifra cada página al escribirla a disco. Este flujo no usa Argon2: esa derivación ocurre en el desbloqueo (`unlock`), y aquí la clave ya está en el llavero del sistema.

## Recorrido

1. **Entrada MCP** (`src/delivery/mcp/server.ts:buildMcpServer`). La herramienta `save_context` valida el input con zod y toma el nombre del cliente MCP (Claude, Cursor, etc.) como `source`. Luego llama a `c.saveContext.execute(...)`. `save_handoff` hace lo mismo con `type: "handoff"`.
2. **Validación** (`save-context.use-case.ts:SaveContext.parseInput`). Se parsean proyecto, tipo, tags y contenido **antes** de abrir nada. Si algo es inválido, el vault ni se toca.
3. **Apertura de sesión** (`src/context/infra/vault-sessions.ts:SqliteVaultSessions.open`):
   - Lee el header del vault y saca el `vaultId`.
   - Pide la clave al llavero del SO (`keychain.getKey`). Si no está, devuelve `VAULT_LOCKED`.
   - Pasa por el `SessionGuard`.
   - Abre la base con `openVaultDb`.
   - Ejecuta `migrate()`.
4. **Escritura en una sola transacción** (`SqliteVaultSessions.commitWrite`). Dentro de `session.write()`:
   - `findOrCreateProject` busca o crea el proyecto.
   - `createContextItem` construye el ítem.
   - `items.save` lo inserta.
   - `lineageStore.bump` actualiza el sello de linaje en la misma transacción. Si la mutación falla, se hace rollback de todo mediante un `WriteFailedSentinel`.
5. **Después del commit**, `deviceIdentity.recordSeen` anota el "last-seen" del dispositivo. `runWithSession` siempre cierra la base en un `finally`.

## Cuándo se cifra

- **Paso 3, `openVaultDb`** (`src/shared/infra/sqlite.ts:21`). Ejecuta `PRAGMA cipher='sqlcipher'` y `PRAGMA key="x'<64 hex>'"`. Desde ahí la conexión está "con clave".
  - Una lectura de `sqlite_master` verifica la clave. Si es incorrecta salta `SQLITE_NOTADB`, se borra la entrada del llavero y se reporta `VAULT_LOCKED`.
- **Paso 4, al hacer commit.** Los `INSERT` de `items.save` son SQL normal. SQLCipher cifra las páginas de `vault.db` cuando las escribe, así que nada llega a disco en claro.
  - El journal es `DELETE`, no WAL. Por eso en una carpeta sincronizada solo aparece `vault.db` cifrado, sin archivos `-wal` ni `-shm` aparte.

## Matiz sobre el alcance

El cifrado cubre todo el archivo (contenido, tags y nombres de proyecto), no solo el campo `content`. Mientras la sesión está abierta, los datos están en claro dentro del proceso. La seguridad depende de que la clave solo viva en el llavero.

## Verificación

Leí `vault-sessions.ts`, `save-context.use-case.ts`, `sqlite.ts` y `server.ts`, y coinciden con `.context/flows/save-context.md`. Los ítems importados usan un camino distinto (ids determinísticos, ver `flows/import-conversations.md`), que no revisé.
