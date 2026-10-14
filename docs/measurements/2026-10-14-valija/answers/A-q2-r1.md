Valija detecta el conflicto con un contador de generación y un sello de escritura que guarda dentro del vault. Cuando lo detecta, avisa y no toca nada: no mezcla las copias. Esto sale de `docs/sync.md` y de `src/vault/domain/services/vault-lineage.ts`. No ejecuté nada.

## Cómo lo detecta

Cada escritura al vault guarda cuatro datos junto con ella:
- una **generación** (un contador que sube);
- un **write stamp**;
- el **id del dispositivo** que escribió;
- la hora de la escritura.

Cada computadora recuerda por separado la generación y el sello que vio la última vez. Ese registro vive en `VALIJA_STATE_HOME` (por defecto `~/.valija-state`), fuera de la carpeta de Dropbox, así que no se sincroniza.

Al hacer `unlock`, `classifyLineage` compara el vault actual con lo que ese dispositivo vio por última vez:

| Situación | Resultado |
|---|---|
| Es la primera vez que este dispositivo ve el vault | `fast-forward`: adopta el vault sin avisar |
| Mismo sello que la última vez | `in-sync`: no cambió nada |
| La generación avanzó | `fast-forward`: el otro dispositivo escribió limpio y sincronizó, así que adopta sin avisar |
| Generación igual o menor, pero sello distinto | `fork` |

El caso `fork` quiere decir que las dos computadoras escribieron a partir del mismo punto sin sincronizar entre una y otra.

## Qué hace cuando hay un fork

- **Avisa y desbloquea igual.** El `unlock` termina bien, pero muestra el error `VAULT_FORK_DETECTED`. Dice que el vault cambió en otro dispositivo desde la misma generación y que quizá Dropbox se quedó con una sola copia.
- **No borra ni fusiona nada.** Dropbox solo conserva una versión del `vault.db` y deja la otra como "conflicted copy". Valija no sabe fusionar dos bases SQLCipher y no lo intenta.
- **`valija doctor`** señala si sigue habiendo un archivo de copia en conflicto en la carpeta. Reconoce los nombres de Dropbox, iCloud y Syncthing. En OneDrive no puede, porque ahí el archivo se llama `vault-<HOSTNAME>.db`.

## Cómo lo resolvés vos

1. Buscá en la carpeta el archivo tipo `vault (conflicted copy).db`.
2. Los dos archivos abren con la misma passphrase.
3. Elegí cuál dejar como `vault.db`. Si necesitás algo de la otra copia, abrila apuntando `VALIJA_HOME` a una copia temporal y volvé a guardar ese contexto a mano.

## Cómo evitarlo

- Corré `valija lock` en la computadora A y esperá a que Dropbox diga "up to date" antes de hacer `unlock` en B.
- `lock` verifica que el vault sea un único archivo, sin `-wal`, `-shm` ni `-journal`. Imprime la generación y qué dispositivo escribió último.
- Valija no mira si Dropbox terminó de subir. Se apoya en el indicador de Dropbox y, si te lo salteás, en la detección de fork como red de seguridad.

El modelo soportado es secuencial: usás A y después B, nunca las dos a la vez.
