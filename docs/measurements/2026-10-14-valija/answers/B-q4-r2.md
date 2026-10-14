El recovery kit no es un archivo ni un secreto aparte. Es la clave de cifrado derivada de tu passphrase, impresa en una plantilla de texto. Esto es lo que hace `valija init`:

1. **`initCommand`** (`src/delivery/cli/vault-commands.ts:6`) te pide la passphrase dos veces con `promptHidden`. Si no coinciden, aborta. Después llama a `c.createVault.execute(passphrase)`.

2. **`CreateVault.execute`** (`src/vault/application/use-cases/create-vault.use-case.ts:33`) hace lo siguiente:
   - Falla con `VAULT_ALREADY_EXISTS` si ya hay un header.
   - Valida la passphrase con `parsePassphrase`.
   - En `forgeVault` (línea 59) genera un `vaultId` y un salt aleatorio. Con ellos deriva la clave con **Argon2id** (`DEFAULT_KDF_PARAMS`) y la convierte a hex con `bytesToHex`. Son 64 caracteres hex, o sea 32 bytes (`src/vault/domain/values/key-hex.ts`).
   - Escribe el header (con `vaultId`, `kdf`, `salt` y `createdAt`, pero sin la clave).
   - Crea la base SQLCipher con esa clave y aplica las migraciones (`initializeDb`).
   - Guarda la clave en el keychain del SO, así el vault queda desbloqueado, y registra la actividad para el auto-lock.
   - Devuelve `{ vaultId, keyHex, createdAt }`.

3. **`renderRecoveryKit(vaultId, keyHex, createdAt)`** (`src/vault/infra/recovery-kit.ts`) es una función pura que devuelve un string. Contiene un banner, la fecha, el vault id, la **clave raw en hex** y las instrucciones. Explica que la clave abre `~/.valija/vault.db` sin la passphrase, que hay que guardarla offline y que se recupera con `valija unlock --recovery-key <hex>`.

4. **`initCommand`** imprime ese string en la terminal con `console.log`. Después avisa: "shown ONCE and never stored. Copy it somewhere safe (offline)…".

- **No se escribe a disco.** El kit solo se muestra por stdout. Si cierras la terminal sin copiarlo, no hay forma de regenerarlo desde el vault. Aunque la clave sí está en el keychain mientras el vault esté desbloqueado.
- **Es la clave derivada, no la passphrase.** Cualquiera que tenga el hex puede leer el vault. Por eso el texto insiste en guardarlo offline.
- **Se usa con `unlock --recovery-key`.** `resolveUnlockKey` toma el hex en lugar de derivar con Argon2id (`program.ts:28`). Sigue el mismo flujo de desbloqueo: gate de schema, `readLineage`, keychain.

No leí `.context/flows/unlock.md`, así que el detalle de `resolveUnlockKey` lo estoy deduciendo de cómo se usa en `unlock-vault.use-case.ts`. Si quieres, lo reviso.
