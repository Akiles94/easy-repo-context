El recovery kit no es un archivo aparte ni se guarda en ningún lado. `valija init` lo genera en memoria y lo imprime una sola vez en la terminal.

**Flujo** (`initCommand` en `src/delivery/cli/vault-commands.ts:6`):

1. Te pide la passphrase (mínimo 8 caracteres) y su confirmación, con input oculto.
2. Llama a `c.createVault.execute(passphrase)`, que corre `CreateVault` en `src/vault/application/use-cases/create-vault.use-case.ts:33`.
3. Con lo que devuelve, llama a `renderRecoveryKit(vaultId, keyHex, createdAt)` y lo imprime con `console.log`.

**Qué hace `CreateVault`:**

- Falla con `VAULT_ALREADY_EXISTS` si ya hay un header de vault en la máquina.
- Valida la passphrase y genera un `vaultId` y un salt.
- Deriva la clave con Argon2id (`DEFAULT_KDF_PARAMS`) a partir de la passphrase y el salt. Esa clave pasa a hex (`bytesToHex`) y es el `keyHex`.
- Escribe el header (`vaultId`, `schemaVersion: 1`, parámetros del KDF, salt, `createdAt`) y abre la base SQLCipher con esa clave.
- Guarda la clave en el keychain del SO, así que el vault queda desbloqueado, y registra la actividad para el reloj de auto-lock.
- Devuelve `{ vaultId, keyHex, createdAt }`.

**El kit en sí** (`src/vault/infra/recovery-kit.ts`) es una plantilla de texto con tres datos: fecha de creación, `vaultId` y la **clave de cifrado cruda en hex**. Esa es la misma clave derivada de la passphrase, no un secreto aparte. Por eso permite abrir el vault sin la passphrase. El texto explica qué es, que hay que guardarlo offline y borrarlo del disco, y cómo recuperar:

```
valija unlock --recovery-key <hex>
```

Después de imprimirlo, el CLI avisa que se muestra una sola vez y que lo copies antes de cerrar la terminal. Si perdés la passphrase y el kit, no hay forma de recuperar los datos.

La versión de escritorio tiene su propia pantalla en `desktop/src/renderer/screens/recovery-kit.tsx`, que no revisé.
