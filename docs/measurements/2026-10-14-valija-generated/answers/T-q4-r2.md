El recovery kit no es un archivo aparte. Es un texto que `valija init` imprime una sola vez en la terminal, y que lleva dentro la clave de cifrado en hexadecimal.

**Flujo**

1. **`initCommand`** (`src/delivery/cli/vault-commands.ts:6`) pide la passphrase dos veces con prompt oculto. Si no coinciden, termina con error. Luego llama a `c.createVault.execute(passphrase)`.

2. **`CreateVault`** (`src/vault/application/use-cases/create-vault.use-case.ts:33`):
   - Si ya existe un header, devuelve `VAULT_ALREADY_EXISTS`.
   - `parsePassphrase` valida la passphrase (mínimo 8 caracteres).
   - `forgeVault` (línea 59) genera un `vaultId` y un salt. Con Argon2id (`DEFAULT_KDF_PARAMS`) deriva la clave de 32 bytes a partir de la passphrase y el salt, y la convierte a hex con `bytesToHex`. Ese hex es `keyHex`.
   - Escribe el header (id, versión de esquema, parámetros del KDF, salt, `createdAt`). Inicializa la base SQLCipher con `keyHex`.
   - Guarda la clave en el keychain del sistema operativo y registra la actividad del dispositivo, así que el vault queda desbloqueado.
   - Devuelve `{ vaultId, keyHex, createdAt }`.

3. **`renderRecoveryKit`** (`src/vault/infra/recovery-kit.ts:1`) es una función que solo arma un string de texto plano. Incluye la fecha de creación, el vault id y la clave hex cruda (`RAW ENCRYPTION KEY`). También trae la explicación de qué es, qué hacer con el kit (imprimirlo, guardarlo offline, borrarlo del disco) y el comando para recuperar: `valija unlock --recovery-key <hex>`.

4. `initCommand` hace `console.log(kit)` y avisa: *"it is shown ONCE and never stored"*.

**Qué implica**
- El kit no se guarda en ningún lado. Si no lo copiás de la terminal, solo podés volver a entrar con la passphrase.
- La clave del kit descifra el vault sin pasar por la passphrase. Por eso el texto dice que quien la tenga puede leer tus datos.
- Para recuperar, `unlock --recovery-key` pasa el hex a `resolveUnlockKey`, que lo usa en lugar de derivar la clave desde la passphrase.

No ejecuté nada, solo leí el código.
