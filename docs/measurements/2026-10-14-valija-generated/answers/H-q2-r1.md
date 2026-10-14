Valija detecta el conflicto al hacer `unlock` y no intenta resolverlo. Solo te avisa y deja todos los archivos como están. Esto sale de `docs/sync.md` y de `vault-lineage.ts`.

## Cómo lo detecta

Cada escritura en el vault guarda un sello de linaje dentro de la base cifrada, en la misma transacción que el cambio. El sello tiene:
- una **generación**, que es un contador;
- un **write stamp**, que identifica esa escritura en concreto;
- el **id del dispositivo** que escribió.

Cada computadora guarda por separado, fuera de la carpeta sincronizada (`VALIJA_STATE_HOME`, por defecto `~/.valija-state`), el último sello que vio. Ese registro nunca viaja por Dropbox.

En `unlock`, `classifyLineage()` compara el sello del vault con el último que esa máquina vio:

| Situación | Resultado |
|---|---|
| Esta máquina nunca vio el vault | `fast-forward`: adopta el vault |
| Mismo write stamp que el último visto | `in-sync`: no hubo cambios |
| Generación mayor que la última vista | `fast-forward`: el otro equipo escribió y sincronizó limpio, así que lo adopta en silencio |
| Generación igual o menor, pero con otro write stamp | **`fork`**: los dos equipos escribieron desde el mismo punto |

El caso del fork aparece cuando editás en A y en B antes de que Dropbox sincronice. Dropbox no sabe fusionar dos bases SQLCipher, así que conserva una y deja la otra como «conflicted copy».

## Qué hace cuando detecta un fork

- **El vault se desbloquea igual.** El aviso no te deja bloqueado.
- **Muestra el error `VAULT_FORK_DETECTED`.** Dice la generación de la que partieron los dos cambios y que puede haber un archivo «conflicted copy» en la carpeta.
- **No actualiza el «último visto» de esa máquina.** Así el aviso se repite hasta que lo resuelvas.
- **No borra ni fusiona nada.**

## Cómo lo resolvés vos

1. Buscá en la carpeta del vault el archivo que dejó Dropbox, algo como `vault (conflicted copy).db`.
2. Los dos archivos abren con tu misma passphrase, porque son dos puntos divergentes del mismo vault.
3. Elegí cuál queda como `vault.db`. Si necesitás algo del otro, abrilo apuntando `VALIJA_HOME` a una copia temporal y volvé a guardar ese contexto a mano.
4. `valija doctor` avisa si todavía hay un archivo de conflicto en la carpeta. Detecta los nombres de Dropbox, iCloud y Syncthing, pero no los de OneDrive.

## Cómo evitar el conflicto

Usá un equipo a la vez: `valija lock` en A, esperá a que Dropbox diga «up to date» y recién ahí `valija unlock` en B. Valija no mira si la sincronización terminó. La detección de forks es la red de seguridad para cuando no esperás.

Los archivos que leí fueron `docs/sync.md`, `.context/flows/unlock-vault.md` y `src/vault/domain/services/vault-lineage.ts`.
