Valija detecta el conflicto al hacer `unlock`, comparando un contador de generación y un sello de escritura. No fusiona nada: te avisa y deja todo en disco como está.

## Cómo lo detecta

Cada escritura en el vault pasa por `session.write()`. Esa función guarda en la misma transacción un sello de linaje con tres datos:
- una **generación** (contador que sube con cada escritura),
- un **write stamp** (identificador de esa escritura),
- el **id del dispositivo** que escribió.

Cada computadora recuerda, en un estado local que no se sincroniza (`VALIJA_STATE_HOME`, por defecto `~/.valija-state`), cuál fue el último sello que vio. En cada `unlock`, `classifyLineage()` (`src/vault/domain/services/vault-lineage.ts:30`) compara el sello actual del vault con el último visto:

| Situación | Resultado |
|---|---|
| Esta máquina nunca vio el vault | `fast-forward`, adopta |
| Mismo write stamp | `in-sync`, no cambió nada |
| La generación actual es mayor que la última vista | `fast-forward`: el otro dispositivo escribió limpio y sincronizó, adopta en silencio |
| Distinto stamp y generación igual o menor | **`fork`** |

Un fork significa que las dos computadoras escribieron desde el mismo punto de partida, antes de que Dropbox sincronizara. Por ejemplo, ambas estaban en la generación 42 y las dos escribieron.

## Qué hace en caso de fork

- **Sigue desbloqueando.** No te deja afuera.
- Muestra el error `VAULT_FORK_DETECTED`. Dice que el vault cambió en otro dispositivo desde la misma generación, que Dropbox pudo haber conservado una sola copia y que los cambios del otro lado pueden estar en un archivo "conflicted copy".
- **No borra ni toca nada.**
- **No actualiza el "last-seen"** (según `gotchas.md`), así que el aviso se repite hasta que lo resuelvas.

## Cómo lo resolvés vos

No hay merge automático, y eso es deliberado. Dropbox se queda con una sola copia del `vault.db` y deja la otra como un archivo tipo `vault (conflicted copy).db`. Ambas abren con la misma passphrase.

1. Buscá el archivo de conflicto en la carpeta del vault. `valija doctor` lo señala si sigue ahí.
2. Elegí cuál copia dejar como `vault.db`.
3. Si necesitás algo de la otra, abrila apuntando `VALIJA_HOME` a una copia temporal y volvé a guardar ese contexto a mano.

## Cómo evitarlo

- En la computadora A, corré `valija lock`. Confirma que el vault quedó como un solo archivo, sin `-wal`/`-shm`/`-journal`.
- Esperá a que Dropbox muestre "up to date".
- Recién entonces hacé `unlock` en la B.

Valija no detecta si Dropbox todavía está subiendo. Si no esperás, el aviso de fork es la red de seguridad.

## Límites

- Si usás OneDrive, `doctor` no puede marcar el archivo de conflicto automáticamente, porque lo renombra a `vault-<HOSTNAME>.db`. Con Dropbox, iCloud y Syncthing sí lo detecta.
- Toda la detección depende de que las escrituras pasen por `session.write()`. Una escritura directa a la base de datos no actualiza el sello y no se vería.

Fuentes: `docs/sync.md`, `.context/flows/unlock-vault.md`, `.context/gotchas.md` y `src/vault/domain/services/vault-lineage.ts`.
