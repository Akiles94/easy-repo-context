El recovery kit no es un archivo. Es un texto que se imprime en la terminal una sola vez, y la clave que contiene sale directamente de tu passphrase.

**Flujo de `valija init`** (`src/delivery/cli/vault-commands.ts:6`)

1. Te pide la passphrase dos veces, con entrada oculta, y verifica que coincidan.
2. Llama a `c.createVault.execute(passphrase)`.
3. Con el resultado (`vaultId`, `keyHex`, `createdAt`) renderiza el kit y lo imprime con `console.log`.

**Dónde nace la clave** (`src/vault/application/use-cases/create-vault.use-case.ts:59`, `forgeVault`)

1. Genera un `vaultId` y un salt aleatorio.
2. Deriva la clave con Argon2id: `crypto.deriveKey(passphrase, salt, DEFAULT_KDF_PARAMS)`.
3. Convierte esa clave a hex con `bytesToHex(key)`. Ese `keyHex` es la clave cruda de SQLCipher.

Después del `forgeVault`, `execute` escribe el header (con salt y parámetros KDF) y crea la DB cifrada con `keyHex`. También guarda la clave en el keychain del SO, así que el vault queda desbloqueado. Por último devuelve `keyHex` al CLI.

**Cómo se arma el texto** (`src/vault/infra/recovery-kit.ts`)

`renderRecoveryKit(vaultId, keyHex, createdAt)` es una función pura que devuelve un string con una plantilla fija. Incluye:
- la fecha de creación y el vault id
- la clave hex cruda
- una explicación de qué es
- instrucciones: imprimirlo, guardarlo offline y borrarlo
- el comando de recuperación: `valija unlock --recovery-key <hex>`

**Detalles importantes**

- **No se persiste.** El CLI avisa "shown ONCE and never stored". Si cierras la terminal sin copiarlo, no hay forma de regenerarlo.
- **No hay segundo secreto.** El kit es la misma clave derivada de tu passphrase, no una clave independiente. Descifra el vault sin pasar por la passphrase.
- **Perder ambos es irrecuperable.** Si pierdes la passphrase y el kit, los datos se pierden. No hay servidor ni reset.

La app de escritorio tiene su propia pantalla (`desktop/src/renderer/screens/recovery-kit.tsx`), con los handlers en `vault-handlers.ts`. Esa parte no la revisé.
