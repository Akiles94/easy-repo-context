Guardar contexto desde un cliente MCP escribe el contenido en claro dentro de SQLCipher, que lo cifra en el momento en que SQLite escribe las páginas al disco. No hay una función "encrypt()" en el código de la aplicación. El cifrado queda fijado al abrir la base con la clave, y esa apertura ocurre antes de que se escriba nada.

## Recorrido

1. **Entrada MCP**: `src/delivery/mcp/server.ts:buildMcpServer()`. La herramienta `save_context` valida el input con zod y toma el nombre del cliente (Claude, Cursor, etc.) como `source`. Luego llama a `c.saveContext.execute(...)`. `save_handoff` hace lo mismo con `type: "handoff"`.
2. **Validación previa**: `SaveContext.execute()` y `parseInput()` en `save-context.use-case.ts`. Se parsean proyecto, tipo, tags y contenido antes de abrir sesión, así que un input inválido nunca toca la bóveda.
3. **Apertura de sesión**: `SqliteVaultSessions.withSession()` y `open()` en `src/context/infra/vault-sessions.ts`. El orden es:
   - Lee el header de la bóveda.
   - Pide la clave al keychain del SO. Si no está, devuelve `VAULT_LOCKED`.
   - Pasa el guard de inactividad.
   - Abre la base con `openVaultDb` y corre `migrate()`.
4. **Escritura en una transacción**: `session.write(...)` llama a `commitWrite()`. Dentro de un solo `db.transaction` se hace lo siguiente:
   - `findOrCreateProject()` busca el proyecto o lo crea.
   - `createContextItem` + `items.save(item)` guarda el ítem.
   - `lineageStore.bump()` incrementa el sello de linaje.
   - Si la mutación falla, se lanza un `WriteFailedSentinel` y se hace rollback, incluido el bump.
5. **Después del commit**: `deviceIdentity.recordSeen()` guarda localmente el último sello visto, fuera de la bóveda. Va después del commit a propósito: si fuera antes, un write revertido parecería ya visto.
6. **Cierre**: `runWithSession()` cierra la base en el `finally`. La respuesta vuelve al cliente como "Saved … Item id: …".

## Cuándo se cifra

- **La clave se aplica en `openVaultDb`** (`src/shared/infra/sqlite.ts:21`). Hace `pragma cipher='sqlcipher'` y `pragma key="x'<64 hex>'"` con una clave cruda de 32 bytes. Desde ese punto todo lo que SQLite escribe a `vault.db` pasa por SQLCipher.
- **El cifrado ocurre al escribir las páginas al disco**, al hacer commit de la transacción. Antes de eso, `content`, `tags`, etc. están en claro en memoria del proceso. Es cifrado en reposo del archivo completo (datos, índices, FTS), no cifrado por campo.
- **La clave viene del keychain del SO**, no de una passphrase. La passphrase (Argon2id) o la recovery key se usan solo en `valija unlock`, que deriva la clave y la deja en el keychain. "Desbloqueado" significa únicamente que la clave está en el keychain. Un guardado MCP sin unlock da `VAULT_LOCKED`.
- **Clave incorrecta**: `SELECT count(*) FROM sqlite_master` fuerza la verificación y falla con `SQLITE_NOTADB`. En ese caso `openRepositories` borra la entrada del keychain y devuelve `VAULT_LOCKED`.
- **Modo de journal**: se usa rollback journal (`journal_mode = DELETE`), no WAL. Así una carpeta sincronizada solo ve `vault.db` en reposo, sin archivos `-wal` ni `-shm`.

## Dos cosas que conviene saber

- **Lo que queda fuera de la bóveda**: el estado por dispositivo (last-seen y actividad) vive en el directorio de estado, sin pasar por esta base.
- **Qué contrastó el código y qué no**: `save-context.md` coincide con el código en los pasos que revisé. No leí `item-repo.ts` ni `project-repo.ts` ni `SqliteLineageStore`, así que no verifiqué cómo hacen el INSERT ni si indexan el contenido para FTS. Por la forma del código, esos repos solo usan la conexión `db` ya abierta con clave, sin lógica de cifrado propia.
