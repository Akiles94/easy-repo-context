El recovery kit no es un archivo ni un artefacto aparte. Es un texto que se renderiza en memoria y se imprime una sola vez en la terminal. Esto es lo que pasa cuando corrés `valija init`:

1. **Pide la passphrase** (`src/delivery/cli/vault-commands.ts:6-16`). Te la pide dos veces y aborta si no coinciden.
2. **Crea el vault** con `c.createVault.execute(passphrase)` (`create-vault.use-case.ts:33`):
   - Falla con `VAULT_ALREADY_EXISTS` si ya hay un header.
   - `forgeVault` (línea 59) genera un `vaultId`, una salt aleatoria y deriva la clave con Argon2id (`crypto.deriveKey` con `DEFAULT_KDF_PARAMS`). Después convierte esa clave a hex con `bytesToHex(key)`.
   - Escribe el header (vaultId, kdf, salt, createdAt), inicializa la DB SQLCipher con esa clave y guarda la clave en el keychain del SO.
   - Devuelve `{ vaultId, keyHex, createdAt }`.
3. **Renderiza el kit** con `renderRecoveryKit(vaultId, keyHex, createdAt)` (`src/vault/infra/recovery-kit.ts`). Es un template string con un banner, la fecha, el vault id y la **clave de cifrado en bruto en hex**. Incluye instrucciones: guardarlo offline, borrarlo del disco y recuperar con `valija unlock --recovery-key <hex>`.
4. **Lo imprime con `console.log`** y avisa: *"shown ONCE and never stored"*.

- **El kit es la clave derivada, no la passphrase.** Abre el vault sin la passphrase, así que quien lo tenga puede leer tus datos.
- **No se persiste.** Si cerrás la terminal sin copiarlo, no hay forma de regenerarlo desde el vault. Solo seguiría sirviendo la clave que está en el keychain, mientras exista.
- **Desktop.** La app tiene una pantalla equivalente en `desktop/src/renderer/screens/recovery-kit.tsx`, que no revisé. Para el CLI, lo anterior es todo el flujo.
