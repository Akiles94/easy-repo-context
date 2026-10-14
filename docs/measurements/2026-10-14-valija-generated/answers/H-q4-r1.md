El recovery kit no es un archivo aparte ni una clave independiente. Es un texto que se arma con la misma clave de cifrado que deriva tu passphrase, y solo se muestra por pantalla.

**Flujo de `valija init`** (`src/delivery/cli/vault-commands.ts:6`, `initCommand`):

1. Te pide la passphrase dos veces (mínimo 8 caracteres) y verifica que coincidan.
2. Llama a `createVault.execute(passphrase)`, que está en `src/vault/application/use-cases/create-vault.use-case.ts:33`:
   - Si ya existe un header, devuelve `VAULT_ALREADY_EXISTS`.
   - `forgeVault` genera un `vaultId`, genera un `salt` y deriva la clave con Argon2id (`crypto.deriveKey(passphrase, salt, DEFAULT_KDF_PARAMS)`).
   - Convierte la clave a hex con `bytesToHex(key)`. Ese `keyHex` es la clave cruda de SQLCipher.
   - Escribe el header (`vaultId`, `schemaVersion: 1`, parámetros KDF, `salt`, `createdAt`), inicializa la base cifrada con `keyHex` y guarda la clave en el keychain del SO. Por eso el vault queda desbloqueado al crearse.
   - Devuelve `{ vaultId, keyHex, createdAt }`.
3. `initCommand` pasa esos tres valores a `renderRecoveryKit` (`src/vault/infra/recovery-kit.ts:1`). Esta función solo interpola esos valores en una plantilla de texto con la fecha, el vault id, la clave hex y las instrucciones. La plantilla explica que la clave abre el vault sin la passphrase, que hay que guardarla offline y borrarla del disco, y cómo recuperar con `valija unlock --recovery-key <hex>`.
4. El kit se imprime con `console.log`, con el aviso de que se muestra una sola vez y no se guarda. No se escribe en ningún archivo.

**Consecuencias:**
- El kit es la clave derivada en claro. Quien lo tenga puede leer el vault, y si pierdes la passphrase y el kit, los datos no se pueden recuperar.
- Como no se persiste, no se puede regenerar después desde la CLI. En la versión de escritorio, la clave cruda tampoco sale del proceso main. Solo sale el texto del kit, que se lee una vez con `vault:readRecoveryKit` (ver `.context/gotchas.md:18`).

No leí `unlock-vault.use-case.ts` ni `resolveUnlockKey`, así que no verifiqué cómo valida `--recovery-key` al desbloquear. Eso está documentado en `.context/flows/unlock-vault.md`.
