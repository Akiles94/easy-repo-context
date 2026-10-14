Valija detecta el conflicto al hacer `unlock`. Cuando lo detecta, te avisa y no toca nada: no resuelve ni mezcla.

## Cómo lo detecta

Cada escritura en el vault actualiza dos datos dentro de la misma transacción:

- **Generación:** un contador que sube con cada escritura.
- **Write stamp:** un identificador de esa escritura.

Cada computadora guarda por separado lo último que vio. Ese registro está en `VALIJA_STATE_HOME` (por defecto `~/.valija-state`), fuera de la carpeta de Dropbox, así que no se sincroniza.

Al hacer `unlock`, `classifyLineage()` (`src/vault/domain/services/vault-lineage.ts`) compara el vault actual con lo último que vio esa máquina:

| Situación | Resultado |
|---|---|
| Esta máquina nunca vio el vault | Se adopta (`fast-forward`) |
| Mismo write stamp que la última vez | Sin cambios (`in-sync`) |
| Generación mayor, con otro stamp | Se adopta (`fast-forward`): el otro equipo escribió y sincronizó limpio |
| Generación igual o menor, con otro stamp | **Fork** |

El caso del fork es el tuyo: editaste en A y en B desde la misma generación (por ejemplo la 42) antes de que Dropbox sincronizara. Dropbox solo puede conservar una de las dos copias.

## Qué hace cuando detecta un fork

- **El vault se desbloquea igual.** No te deja bloqueado.
- **Devuelve `VAULT_FORK_DETECTED`.** El mensaje dice que el vault cambió en otro equipo desde la misma generación y que los cambios pueden estar en un archivo "conflicted copy".
- **No borra ni modifica nada.** Tampoco actualiza lo "último visto" de esa máquina, así que el aviso se repite hasta que lo resuelvas.
- **`valija doctor` marca la copia en conflicto.** Reconoce los nombres de Dropbox, iCloud y Syncthing. En OneDrive no puede, porque renombra el archivo a `vault-<HOSTNAME>.db`.

## Cómo resolverlo (a mano)

1. Busca en la carpeta algo como `vault (conflicted copy).db`. Ambas copias abren con tu misma passphrase.
2. Elige cuál dejar como `vault.db`.
3. Si necesitas algo de la otra, ábrela apuntando `VALIJA_HOME` a una copia temporal y vuelve a guardar ese contexto a mano.

No hay merge automático, y es a propósito.

## Cómo evitar el conflicto

Haz `valija lock` en A y espera a que Dropbox diga "up to date" antes de hacer `unlock` en B. `lock` confirma que el vault quedó como un solo archivo, sin `-wal`, `-shm` ni `-journal`, y te muestra la generación y qué dispositivo escribió último. Valija no detecta si Dropbox todavía está subiendo, y no soporta uso simultáneo.

Fuentes: `docs/sync.md`, `.context/flows/vault-unlock-and-session.md`.
