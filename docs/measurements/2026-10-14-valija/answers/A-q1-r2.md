Cuando un cliente MCP llama a `save_context`, la llamada pasa por las capas delivery, application e infra. El cifrado no ocurre en ninguna de ellas como paso propio. Lo hace SQLCipher dentro del driver, al escribir el archivo, y usa una clave que sale del keychain del sistema operativo.

## Recorrido

**1. Arranque.** `src/delivery/cli/program.ts:115` llama a `runMcpServer(container)`. El `container` (`src/delivery/container.ts`) conecta todos los puertos con sus adaptadores: `OsKeychain`, `SqliteVaultSessions`, `SessionGuard` y `SaveContext`. El servidor escucha por stdio (`src/delivery/mcp/server.ts:218-221`).

**2. Delivery (MCP).** `server.ts:43-72` registra la tool `save_context`. Zod valida la forma del input: `project`, `content`, y `type` y `tags` opcionales. El campo `source` sale del nombre del cliente MCP (`getClientVersion().name`, por ejemplo Claude o Cursor). Luego llama a `c.saveContext.execute(...)`. `save_handoff` hace lo mismo con `type: "handoff"`.

**3. Application.** `SaveContext.execute` (`src/context/application/use-cases/save-context.use-case.ts:44`) trabaja en dos pasos:
- **Parseo.** `parseInput` (líneas 73-90) convierte los strings en value objects con `parseProjectName`, `parseItemType`, `parseTags` y `parseContent`. Esto ocurre antes de abrir ninguna sesión, así que un input inválido nunca toca el vault.
- **Escritura.** `sessions.withSession(session => session.write(...))` busca o crea el proyecto, construye el `ContextItem` con `createContextItem` y llama a `session.items.save(item)`.

**4. Infra: apertura de sesión.** `SqliteVaultSessions.open` (`src/context/infra/vault-sessions.ts:65-76`) hace estas comprobaciones:
1. Lee la cabecera del vault (`vaultId`, salt, parámetros del KDF).
2. `requireKey` pide la clave al keychain del SO. Si no está, devuelve `VAULT_LOCKED`.
3. `SessionGuard` aplica el auto-lock por inactividad (`VALIJA_AUTOLOCK_MINUTES`). Si el TTL expiró, borra la clave del keychain y devuelve `VAULT_LOCKED`.
4. `openRepositories` llama a `openVaultDb` y a `migrate`.

**5. Infra: escritura.** `commitWrite` (líneas 115-139) abre una transacción SQLite. Dentro hace dos cosas:
- `SqliteContextItemRepository.save` (`item-repo.ts:50-77`) ejecuta un `INSERT ... ON CONFLICT DO UPDATE` con el contenido en texto plano.
- `lineageStore.bump` actualiza el sello de linaje, atómicamente con la escritura.

Si la mutación falla, se lanza un `WriteFailedSentinel` y se hace rollback. Al terminar, `runWithSession` cierra la base de datos en un `finally`.

## Cuándo se cifra

**Al escribir.** El repositorio no cifra nada. En `src/shared/infra/sqlite.ts:21-31`, `openVaultDb` hace esto:

```ts
db.pragma("cipher='sqlcipher'");
db.pragma(`key="x'${keyHex}'"`);
db.prepare("SELECT count(*) FROM sqlite_master").get(); // verifica la clave
```

Desde ese `PRAGMA key`, la conexión completa queda cifrada. El motor SQLCipher (`better-sqlite3-multiple-ciphers`) cifra cada página al escribirla en `vault.db`. Eso incluye tablas, índices y el FTS. Para el código de los repositorios todo es SQL normal.

Tres consecuencias de este diseño:
- El `content` existe en claro solo en memoria, durante la llamada. En disco está siempre cifrado.
- Con la clave equivocada, SQLCipher devuelve `SQLITE_NOTADB`. El código lo trata como clave obsoleta, borra la entrada del keychain y devuelve `VAULT_LOCKED` (`vault-sessions.ts:99-103`).
- El modo del journal es `DELETE`, no WAL (`sqlite.ts:33-36`). Así una carpeta sincronizada solo ve `vault.db` en reposo, sin archivos `-wal` ni `-shm`.

## De dónde sale la clave

La clave se deriva o se genera al crear o desbloquear el vault, no durante el guardado:
- **Passphrase.** `resolveUnlockKey` (`vault/application/services/resolve-unlock-key.ts`) llama a `crypto.deriveKey` con Argon2id, usando el salt y los parámetros de la cabecera. El resultado son 32 bytes en hexadecimal.
- **Recovery key.** Se usa tal cual, si son 64 caracteres hexadecimales.
- **Keychain.** `CreateVault` (línea 49) y `UnlockVault` (línea 77) llaman a `keychain.setKey(vaultId, keyHex)`. Esa es la clave que `requireKey` recupera después. `lock` la borra.

Por eso el servidor MCP nunca ve la passphrase. Solo funciona mientras el vault esté desbloqueado, es decir, mientras la clave esté en el keychain. Si no lo está, la tool devuelve el error `VAULT_LOCKED` al cliente.

No leí `keyring.ts` ni `argon2.js` en detalle. Los parámetros concretos de Argon2 y el backend exacto del keychain no los he verificado.
