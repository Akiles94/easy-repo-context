El recovery kit no se guarda en ningún lado: es un texto que se arma en el momento y que `valija init` imprime una sola vez. Contiene la **clave de cifrado derivada de tu passphrase**, no una clave aparte.

1. **`initCommand`** (`src/delivery/cli/vault-commands.ts:6`) pide la passphrase dos veces con prompt oculto y verifica que coincidan.
2. **`CreateVault.execute`** (`src/vault/application/use-cases/create-vault.use-case.ts:33`) falla si ya existe un vault. Luego valida la passphrase y llama a `forgeVault`.
3. **`forgeVault`** (línea 59 del mismo archivo) genera el `vaultId` y un salt, y deriva la clave con Argon2id (`crypto.deriveKey`, parámetros `DEFAULT_KDF_PARAMS`). Esa clave pasa a hex con `bytesToHex`, y es el `keyHex`.
4. **Persistencia.** El use case:
   - escribe el header del vault (id, salt, parámetros KDF, fecha);
   - inicializa la base SQLCipher con `keyHex`;
   - guarda `keyHex` en el keychain del SO, así que el vault queda desbloqueado;
   - registra la actividad para el auto-lock.

   Devuelve `{ vaultId, keyHex, createdAt }`.
5. **`renderRecoveryKit`** (`src/vault/infra/recovery-kit.ts:1`) es una función pura que arma el texto con ese `vaultId`, el `keyHex` y la fecha. Incluye las instrucciones de guardarlo offline y de recuperar con `valija unlock --recovery-key <hex>`.
6. **`initCommand`** imprime el kit en consola con un aviso de que se muestra una sola vez y no se almacena. No escribe ningún archivo, así que tenés que copiarlo antes de cerrar la terminal.

- **Qué significa la clave.** Como la clave de recuperación es la misma que deriva la passphrase, quien tenga ese hex abre el vault sin la passphrase. Esa es la razón de ser del kit.
- **Desktop.** La app usa el mismo flujo, pero el texto del kit viaja por IPC una sola vez (`vault:readRecoveryKit` en `desktop/src/main/ipc/handlers/vault-handlers.ts`). Según `.context/gotchas.md`, `keyHex` nunca debe agregarse a un tipo de respuesta.

No ejecuté el código. Esto sale de leer los archivos.
