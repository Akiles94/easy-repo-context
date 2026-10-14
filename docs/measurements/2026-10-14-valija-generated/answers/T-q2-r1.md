## Cómo detecta el conflicto

Valija no se conecta a Dropbox ni mira cuándo termina de sincronizar. Detecta el conflicto **al desbloquear**, comparando el "linaje" del vault con lo último que vio esa computadora.

- **Dentro de `vault.db`** (cifrado) viaja un *generation* (contador que sube con cada escritura), un *write stamp* y el id del dispositivo que escribió.
- **En cada computadora**, fuera de la carpeta sincronizada (`VALIJA_STATE_HOME`, por defecto `~/.valija-state`), se guarda qué generation y stamp vio por última vez. Eso nunca se sincroniza, a propósito.

Al hacer `unlock`, `classifyLineage()` (`src/vault/domain/services/vault-lineage.ts`) clasifica así:

| Caso | Resultado |
|---|---|
| Esta computadora nunca había visto el vault | `fast-forward`, lo adopta |
| El stamp es igual al último visto | `in-sync`, no hay cambios |
| El generation actual es **mayor** que el último visto | `fast-forward`: la otra máquina escribió y el cambio sincronizó bien, lo adopta en silencio |
| Stamp distinto y generation **igual o menor** | `fork` |

Un fork significa que las dos computadoras escribieron desde el mismo punto de partida (por ejemplo, ambas desde la generación 42) antes de que Dropbox sincronizara.

## Qué hace cuando hay fork

- **Desbloquea igual.** No te deja afuera.
- **Muestra el error `VAULT_FORK_DETECTED`**, que te avisa que los cambios de la otra máquina pueden estar en un archivo de "conflicted copy".
- **No borra ni mezcla nada.** Tampoco actualiza el "último visto" de esa máquina.
- **No hace merge automático**, ni lo hará: no sabe combinar dos bases SQLCipher, y Dropbox tampoco.

## Cómo lo resolvés vos

1. Buscá en la carpeta del vault el archivo que dejó Dropbox, por ejemplo `vault (conflicted copy).db`.
2. Las dos copias abren con la misma passphrase.
3. Elegí cuál dejar como `vault.db`. Si necesitás algo de la otra, abrila apuntando `VALIJA_HOME` a una copia temporal y volvé a guardar ese contexto a mano.
4. `valija doctor` te avisa si todavía queda un archivo de conflicto en la carpeta.

## Cómo evitarlo

Usá `valija lock` en la máquina A y esperá a que Dropbox diga "up to date" antes de hacer `unlock` en la B. `lock` además comprueba que el vault esté en un solo archivo, sin `-wal`, `-shm` ni `-journal`, e indica qué dispositivo escribió por última vez.

Todo está en `docs/sync.md` y `.context/flows/unlock-vault.md`.
