Esto es lo que hace el repo cuando un cliente MCP llama a `save_context`. Leí `.context/flows/save-context.md` y el código que enlaza. No ejecuté nada.

## Recorrido

1. **Entrada MCP** (`src/delivery/mcp/server.ts:buildMcpServer()`)
   - Registra las tools `save_context` y `save_handoff`.
   - `save_handoff` es el mismo caso de uso con `type: "handoff"`.
   - Valida los argumentos con zod (`project`, `content`, `type`, `tags`) y pasa el nombre del cliente MCP como `source`.
   - Devuelve un texto como `Saved … Item id: …` o un error con su código.

2. **Caso de uso** (`src/context/application/use-cases/save-context.use-case.ts:SaveContext.execute()`)
   - `parseInput()` valida primero nombre de proyecto, tipo (por defecto `fact`), tags y contenido.
   - Esto ocurre antes de abrir el vault, así que un input inválido nunca toca la base ni crea proyectos.
   - Después llama a `sessions.withSession(...)`.

3. **Abrir sesión** (`src/context/infra/vault-sessions.ts:SqliteVaultSessions.open()`)
   - Lee el header del vault y obtiene el `vaultId`.
   - Busca la clave en el keychain del SO (`keychain.getKey(vaultId)`). Si no está, devuelve `VAULT_LOCKED`.
   - Pasa por `SessionGuard`.
   - Abre la base con `openVaultDb(...)` y ejecuta `migrate()`.
   - `runWithSession()` cierra la base siempre, incluso si hay excepción.

4. **Escritura transaccional** (`commitWrite()`)
   - `session.write(...)` abre una transacción de SQLite.
   - Dentro: `findOrCreateProject()`, `createContextItem()` y `session.items.save(item)`.
   - En la misma transacción, `lineageStore.bump()` actualiza el sello de linaje.
   - Si la mutación falla, se lanza un `WriteFailedSentinel` y todo hace rollback, incluido el bump.
   - Solo después del commit se llama a `deviceIdentity.recordSeen()`, que guarda el último estado visto del dispositivo.

## Cuándo se cifra

El cifrado no es un paso explícito en el caso de uso ni en los repositorios. Lo hace SQLCipher de forma transparente, en `src/shared/infra/sqlite.ts:openVaultDb()`:

```ts
db.pragma("cipher='sqlcipher'");
db.pragma(`key="x'${keyHex}'"`);
db.prepare("SELECT count(*) FROM sqlite_master").get(); // verifica la clave
```

- **Se configura al abrir la sesión** (paso 3), con una clave cruda de 32 bytes (64 hex) sacada del keychain. A partir de ahí, cada página que SQLite escribe a `vault.db` sale cifrada.
- **El texto plano solo existe en memoria**: en el input MCP, en las entidades de dominio y en las sentencias SQL. El cifrado ocurre cuando la transacción escribe páginas en disco, al hacer commit. El item, el proyecto y el sello de linaje quedan cifrados, y `vault.db` no tiene un `-wal` en claro porque usa `journal_mode = DELETE`.
- **La clave no se genera en este flujo.** Se deriva con Argon2id desde la passphrase al crear o desbloquear el vault (`src/vault/infra/argon2.ts`, `UnlockVault`) y queda en el keychain. `save_context` solo la consume. No revisé esas rutas en detalle.
- **Si la clave es incorrecta**, el `SELECT` sobre `sqlite_master` falla con `SQLITE_NOTADB`. `openRepositories()` borra la entrada del keychain y devuelve `VAULT_LOCKED`. Esto no es un fallo transitorio, así que no conviene reintentarlo.

El header del vault (`readVaultHeader`) se lee antes de tener la clave. No miré qué contiene, así que no puedo decirte si va cifrado.

Para más detalle: `.context/flows/save-context.md`, `.context/gotchas.md` (secciones context y vault) y `docs/vault-format.md`.
