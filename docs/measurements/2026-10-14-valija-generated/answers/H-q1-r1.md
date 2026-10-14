**En resumen:** el cliente MCP llama a la herramienta `save_context`. El caso de uso valida la entrada y abre una sesión con la clave que está en el keychain del SO. El cifrado no ocurre al guardar cada campo: la base completa es SQLCipher, y se cifra de forma transparente cuando SQLite escribe las páginas al disco.

## Recorrido

1. **Entrada MCP**: `src/delivery/mcp/server.ts:buildMcpServer()` registra la tool `save_context`. Traduce el nombre del cliente MCP (Claude, Cursor…) a `source` y llama a `container.saveContext`. `save_handoff` usa el mismo caso de uso con tipo `handoff`.
2. **Validación**: `save-context.use-case.ts:SaveContext.execute()` llama a `parseInput()`. Valida proyecto, tipo, tags y contenido antes de abrir ninguna sesión.
3. **Apertura de sesión**: `src/context/infra/vault-sessions.ts:SqliteVaultSessions.withSession()`:
   - lee el header del vault;
   - pide la clave al keychain (`requireKey`). Si no está, devuelve `VAULT_LOCKED`, es decir, hay que hacer `valija unlock`;
   - abre la base con `openVaultDb` y ejecuta `migrate()`.
4. **Escritura**: dentro de `session.write()`, `findOrCreateProject()` busca o crea el proyecto. `commitWrite()` hace en **una sola `db.transaction`** la inserción del item en `context_items` y el `SqliteLineageStore.bump()`. Si la mutación falla, se hace rollback.
5. **Después del commit**: `deviceIdentity.recordSeen()` guarda el last-seen del dispositivo en el state dir local, fuera del vault. La sesión se cierra en el `finally` de `runWithSession()`.

## Cuándo se cifra

- **Clave**: se deriva en el unlock (Argon2id o recovery key) y queda en el keychain. Al guardar solo se lee, no se deriva.
- **Activación del cifrado**: en `src/shared/infra/sqlite.ts:openVaultDb()` (líneas 28-29) se ejecutan `cipher='sqlcipher'` y `key="x'<64 hex>'"`. Desde ahí, todo lo que se escribe por esa conexión va cifrado.
- **En el disco**: el cifrado se aplica en el commit, cuando SQLCipher escribe las páginas. Se cifra todo el archivo, no solo `content`: proyectos, tags, `meta` y el lineage. En memoria, durante la sesión, el contenido está en claro.
- **Clave incorrecta**: el `SELECT` sobre `sqlite_master` (línea 31) la detecta. En ese caso se borra la clave del keychain y se trata el vault como bloqueado.
- **Journal**: se usa `journal_mode = DELETE`, sin WAL, para que una carpeta sincronizada solo vea `vault.db` en reposo.

Solo leí el flow doc `save-context.md`, `vault-sessions.ts` (por grep, no completo) y `openVaultDb`. No abrí `server.ts` ni el use case, así que los pasos 1, 2 y 4 salen del doc y no los comprobé en el código. Lo que dicen los pasos 3 y del cifrado sí coincide con el código.
