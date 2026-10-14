El recovery kit no se guarda en ningún lado. `valija init` lo arma en memoria a partir de la clave derivada y lo imprime una sola vez.

**Flujo**

1. **`initCommand`** (`src/delivery/cli/vault-commands.ts:6`) pide la passphrase dos veces con `promptHidden`. Si no coinciden, termina con error. Después llama a `c.createVault.execute(passphrase)`.

2. **`CreateVault.execute`** (`src/vault/application/use-cases/create-vault.use-case.ts:33`):
   - Falla con `VAULT_ALREADY_EXISTS` si ya hay un header en la máquina.
   - Valida la passphrase con `parsePassphrase`.
   - `forgeVault` (línea 59) genera un `vaultId` y un salt aleatorio. Con ellos deriva la clave mediante Argon2id (`crypto.deriveKey` con `DEFAULT_KDF_PARAMS`). Esa clave pasa a hex con `bytesToHex` (`domain/values/key-hex.ts`): 64 caracteres, o sea 32 bytes.
   - Escribe el header en disco (`vaultId`, `schemaVersion: 1`, parámetros KDF, salt, `createdAt`), inicializa la DB SQLCipher con esa clave y guarda la clave en el keychain del SO. Por eso el vault queda desbloqueado al crearse.
   - Devuelve `{ vaultId, keyHex, createdAt }`.

3. **El kit** se renderiza en `initCommand` (línea 22) con `renderRecoveryKit(vaultId, keyHex, createdAt)` de `src/vault/infra/recovery-kit.ts`. Esa función es solo una plantilla de texto. Incluye:
   - La clave cruda en hex, que es la misma que protege la DB.
   - Una explicación de qué es y la advertencia "passphrase perdida + kit perdido = datos perdidos".
   - Instrucciones para imprimirlo, guardarlo offline y borrar el archivo.
   - El comando de recuperación: `valija unlock --recovery-key <hex>`.

4. El kit se imprime con `console.log` y un aviso de que se muestra **una sola vez y no se guarda**. No se escribe a disco ni se persiste. Si lo perdés y olvidás la passphrase, no hay forma de recuperar los datos.

**Recuperación:** `unlockCommand` pasa `--recovery-key` como `recoveryKeyHex` al `UnlockVault`. Este usa esa clave directamente (vía `resolveUnlockKey`) y se salta Argon2id.

La versión desktop usa el mismo caso de uso. Su pantalla es `desktop/src/renderer/screens/recovery-kit.tsx`, y no la leí.
