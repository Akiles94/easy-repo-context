## Recorrido de `save_context` (cliente MCP → disco)

### 1. Arranque del servidor MCP
- `src/delivery/cli/program.ts:115` llama a `runMcpServer(container)`.
- `src/delivery/mcp/server.ts:218` conecta el servidor por **stdio**. El cliente (Claude, Cursor, etc.) lanza el proceso y habla con él por stdin/stdout, así que no hay red ni puerto.
- `src/delivery/container.ts` es la raíz de composición. Ahí se construyen `SqliteVaultSessions` (línea 63) y `SaveContext` (línea 82).

### 2. La tool `save_context` (capa delivery)
- `server.ts:43-72` registra la tool. `zod` valida la forma de los argumentos: `project`, `content`, `type?` y `tags?` (máximo 10).
- El handler toma el nombre del cliente con `getClientVersion()?.name` y lo usa como `source`. Así queda registrado qué herramienta escribió cada ítem.
- Llama a `c.saveContext.execute(...)` y devuelve el `Result` como texto. Si falla, devuelve `isError` con `message [code]`.
- `save_handoff` (líneas 74-97) hace lo mismo, pero con `type: "handoff"` fijo.

### 3. Caso de uso `SaveContext` (`src/context/application/use-cases/save-context.use-case.ts`)
1. **`parseInput` (línea 73):** parsea todo antes de abrir ninguna sesión (`parseProjectName`, `parseItemType`, `parseTags`, `parseContent`). Lo inválido nunca toca el vault.
2. **`sessions.withSession(...)` y `session.write(...)` (líneas 48-49):** abre la sesión y envuelve la escritura en una transacción.
3. **`findOrCreateProject`:** busca el proyecto por nombre y lo crea si no existe.
4. **`createContextItem`:** crea la entidad de dominio con un id nuevo.
5. **`session.items.save(item)`:** persiste el ítem.

### 4. Apertura de sesión (`src/context/infra/vault-sessions.ts`)
`SqliteVaultSessions.open()` (línea 65) hace lo siguiente:
1. Lee el header del vault (`readVaultHeader`) para obtener el `vaultId`.
2. **`requireKey` (línea 79):** pide la clave al **llavero del SO** (`keychain.getKey(vaultId)`). Si no está, devuelve `VAULT_LOCKED`. Por eso el MCP no puede escribir con el vault bloqueado.
3. Pasa por `SessionGuard`.
4. **`openVaultDb(path, keyHex)`** y luego `migrate`.
5. Construye los repositorios `SqliteProjectRepository` y `SqliteContextItemRepository`.

`runWithSession` (línea 24) cierra la DB siempre, incluso si la acción lanza una excepción.

### 5. Escritura transaccional (`commitWrite`, línea 115)
- Ejecuta `mutate()` dentro de `db.transaction`.
- Si la mutación falla, lanza un `WriteFailedSentinel` para forzar el rollback.
- Si tiene éxito, hace `lineageStore.bump(writer)` en la misma transacción, que es el sello de linaje para sincronización multi-dispositivo.
- Solo después del commit se llama a `recordSeen`.

### 6. Persistencia (`src/context/infra/item-repo.ts:50`)
`SqliteContextItemRepository.save` es un `INSERT ... ON CONFLICT(id) DO UPDATE` común. Tiene tags serializadas como JSON y fechas en ISO. No hay lógica de cifrado en este código.

## ¿Cuándo se cifra?

**El cifrado no es una fase del flujo de guardado. Lo hace el motor SQLCipher de forma transparente, y se activa en un único punto:** `openVaultDb` en `src/shared/infra/sqlite.ts:21-43`.

```ts
db.pragma("cipher='sqlcipher'");
db.pragma(`key="x'${keyHex}'"`);       // clave cruda de 32 bytes
db.prepare("SELECT count(*) FROM sqlite_master").get(); // verifica la clave
```

- Desde el `PRAGMA key`, cada página que SQLCipher escribe a `vault.db` se cifra. Eso cubre las tablas, el índice FTS y los metadatos. Los `INSERT` de los pasos 3 a 6 trabajan con texto plano en memoria y SQLCipher lo cifra al volcar las páginas, dentro del commit de `db.transaction`.
- Con clave incorrecta, la primera lectura lanza `SQLITE_NOTADB`. `isWrongKeyError` lo detecta, borra la clave obsoleta del llavero y devuelve `VAULT_LOCKED`.
- El modo de journal es `DELETE`, sin WAL, para que una carpeta sincronizada solo vea `vault.db` en reposo.

### Origen de la clave
- **Crear el vault** (`create-vault.use-case.ts:49`): guarda la clave en el llavero.
- **Desbloquear** (`unlock-vault.use-case.ts:77`): usa `resolveUnlockKey` (`resolve-unlock-key.ts`). Con passphrase, `crypto.deriveKey` la deriva con el salt y los parámetros KDF del header, que son Argon2id. Con recovery key, esta se usa tal cual (64 hex).
- Después, `keychain.setKey(vaultId, keyHex)` deja la clave en el llavero. La passphrase no se vuelve a pedir en cada guardado.

### Resumen
El contenido viaja en claro por stdio (proceso local) hasta el repositorio. Está en claro en memoria durante la sesión y se cifra al escribirlo en disco, porque la conexión se abrió con la clave del llavero. La clave solo existe en el llavero, derivada de tu passphrase con Argon2id.

No ejecuté el código ni los tests. Esto sale de leer los archivos citados.
