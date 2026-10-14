El recovery kit no se guarda en ningún lado. Es un texto que se arma en memoria durante `valija init`, se imprime una sola vez y se descarta.

**Flujo** (`initCommand`, `src/delivery/cli/vault-commands.ts:6-28`):

1. Te pide la passphrase dos veces. Si no coinciden, sale con error.
2. Llama a `c.createVault.execute(passphrase)` (`src/vault/application/use-cases/create-vault.use-case.ts:33`). Esto hace lo siguiente:
   - Falla con `VAULT_ALREADY_EXISTS` si ya hay un header.
   - Valida la passphrase con `parsePassphrase`.
   - En `forgeVault` (línea 59) genera un `vaultId`, un salt aleatorio y deriva la clave con Argon2id usando `DEFAULT_KDF_PARAMS`.
   - Esa clave de 32 bytes se convierte a hex con `bytesToHex`. Es la **clave de cifrado cruda** de la base SQLCipher, no la passphrase.
   - Escribe el header (`vaultId`, `schemaVersion: 1`, parámetros KDF, salt, `createdAt`), inicializa la base con esa clave y guarda la clave en el keychain del SO, así que el vault queda desbloqueado.
   - Devuelve `{ vaultId, keyHex, createdAt }`.
3. `renderRecoveryKit(vaultId, keyHex, createdAt)` (`src/vault/infra/recovery-kit.ts:1`) es una plantilla de texto plano. Incluye la fecha, el vault id y la clave hex. También trae una explicación de qué es, qué hacer con el kit (imprimirlo, guardarlo offline y borrarlo del disco) y cómo recuperar: `valija unlock --recovery-key <hex>`.
4. El CLI hace `console.log(kit)` y avisa: *"shown ONCE and never stored"*. No escribe ningún archivo, así que copiarlo es cosa tuya.

**Qué implica:**
- El kit sirve para desbloquear sin la passphrase. `unlockCommand` pasa `recoveryKeyHex` a `unlockVault`, que salta la derivación Argon2id y usa la clave directamente.
- Si perdés la passphrase y el kit, los datos no se pueden recuperar. No existe ningún reset.
- En la app de escritorio el flujo es parecido, pero la clave cruda nunca sale del proceso main. Solo sale el texto ya renderizado, que se lee una vez con `vault:readRecoveryKit` (`.context/gotchas.md:18`).

No ejecuté nada. Esto sale solo de leer el código.
