El recovery kit no es un archivo ni un secreto aparte. Es la clave de cifrado derivada de tu passphrase, formateada como texto e impresa en la terminal una sola vez.

**Flujo de `valija init`** (`src/delivery/cli/vault-commands.ts:6`, `initCommand`):

1. Pide la passphrase dos veces con `promptHidden` y aborta si no coinciden.
2. Llama a `c.createVault.execute(passphrase)`, el caso de uso `CreateVault` (`src/vault/application/use-cases/create-vault.use-case.ts:33`).
3. Con el resultado, llama a `renderRecoveryKit(vaultId, keyHex, createdAt)` y lo imprime con `console.log`.

**Cómo se obtiene la clave dentro de `CreateVault`:**

- `forgeVault` (línea 59) genera un `vaultId` y un salt aleatorio (`crypto.generateSalt()`).
- Luego deriva la clave con Argon2id: `crypto.deriveKey(passphrase, salt, DEFAULT_KDF_PARAMS)`.
- `bytesToHex(key)` convierte esa clave en `keyHex`. Es la clave cruda de SQLCipher, sin ninguna capa intermedia.
- La passphrase y la clave son equivalentes. Por eso la clave sirve para recuperar el vault sin la passphrase.

**Qué hace `CreateVault` con esa clave:**

- Escribe el header del vault, con el salt y los parámetros de KDF.
- Inicializa la base de datos cifrada con `keyHex`.
- Guarda la clave en el keychain del sistema y registra la actividad para el auto-lock.
- Devuelve `{ vaultId, keyHex, createdAt }`.

**Formato del kit** (`src/vault/infra/recovery-kit.ts`): es una plantilla de texto plano con la fecha, el vault id y la clave en hex. Incluye instrucciones para imprimirla, guardarla offline y borrarla del disco. También indica cómo recuperar el vault: `valija unlock --recovery-key <hex>`.

**Puntos a tener en cuenta:**

- No se persiste en ningún lado. La CLI avisa que "se muestra UNA vez y nunca se guarda". Si cierras la terminal sin copiarlo, solo te queda la passphrase.
- Quien tenga el hex puede leer el vault completo.
- No leí `.context/gotchas.md` ni los specs, que mencionan el recovery kit, así que no sé si hay invariantes adicionales. El flujo de unlock con `--recovery-key` está en `.context/flows/vault-unlock-and-session.md`.
