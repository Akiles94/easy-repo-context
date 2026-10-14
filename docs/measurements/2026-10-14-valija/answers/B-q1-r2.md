**Resumen:** el cliente MCP llama a `save_context` o `save_handoff`, el caso de uso valida la entrada y se abre una sesión del vault con la clave guardada en el keychain del SO. Después se escribe en una sola transacción. El contenido se cifra al escribir en SQLCipher. No hay cifrado por ítem: cifra el archivo de base de datos completo.

Verifiqué lo esencial contra el código. La documentación en `.context/flows/save-context.md` coincide en lo que revisé, pero no abrí todos los archivos del recorrido.

## Recorrido

1. **Entrada MCP**: `src/delivery/mcp/server.ts` registra `save_context` (línea 44) y `save_handoff` (línea 74). Define el esquema con zod y toma `source` del nombre del cliente MCP. `save_handoff` fuerza `type = handoff`. El CLI no tiene comando de guardado.
2. **Validación**: `SaveContext.execute()` en `src/context/application/use-cases/save-context.use-case.ts` ejecuta `parseInput()` antes de cualquier I/O. Comprueba:
   - el nombre del proyecto;
   - el tipo, que por defecto es `fact`;
   - hasta 10 tags con formato `[a-z0-9-]`;
   - el contenido, recortado y de hasta 32 KB.
3. **Apertura de sesión**: `SqliteVaultSessions.open()` en `src/context/infra/vault-sessions.ts` hace lo siguiente:
   - lee la cabecera `vault.json`;
   - obtiene la clave del keychain y, si falta, devuelve `VAULT_LOCKED`;
   - pasa por `SessionGuard.guard()`, que controla el TTL de inactividad;
   - llama a `openVaultDb()` y luego a `migrate()`.
4. **Escritura**: `session.write()` llama a `commitWrite()`, que corre en una sola transacción. Dentro de ella:
   - busca o crea el proyecto;
   - `createContextItem()` crea el ítem;
   - `SqliteContextItemRepository.save()` hace un upsert, con los tags como JSON y el índice FTS5 actualizado por triggers;
   - `SqliteLineageStore.bump()` incrementa el linaje.

   Si algo falla, se revierte todo, incluido el incremento del linaje.
5. **Después del commit**: `FileDeviceIdentity.recordSeen()` guarda la nueva generación en `state.json`. La sesión siempre se cierra, porque `runWithSession` lo hace en un `finally`.

## Cuándo se cifra

- **Apertura**: la clave de 32 bytes, derivada con Argon2id al hacer unlock y guardada en el keychain, se aplica en `openVaultDb()` (`src/shared/infra/sqlite.ts:21-30`). Esa función valida que sea hex de 64 caracteres, activa `cipher='sqlcipher'` y pasa la clave como `key="x'<hex>'"`. Una clave incorrecta falla con `SQLITE_NOTADB`.
- **Escritura**: SQLCipher cifra las páginas transparentemente cuando SQLite las escribe a disco. Esto ocurre en el paso 4, al hacer commit. Hasta entonces el contenido está en claro en memoria del proceso.
- **No cifrado**: `vault.json` y `state.json` quedan fuera de la base de datos, y la documentación no dice que se cifren. No inspeccioné su contenido.

Si quieres, abro `commitWrite()` o el flujo de unlock (`.context/flows/unlock.md`) para ver cómo se deriva la clave.
