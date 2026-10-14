Valija detecta el conflicto con un contador de generación y un sello de escritura que guarda dentro del vault. Si lo detecta, te avisa, pero no hace merge ni borra nada.

## Cómo lo detecta

Cada escritura deja en `vault.db` una generación, un sello de escritura (`writeStamp`) y el id del dispositivo que escribió. Cada computadora guarda por separado, fuera de Dropbox (`VALIJA_STATE_HOME`, por defecto `~/.valija-state`), qué sello vio por última vez.

En `valija unlock`, `classifyLineage()` (`src/vault/domain/services/vault-lineage.ts`) compara el sello del vault con el último que vio ese dispositivo:

- **Nunca visto:** adopta el vault (es el primer unlock del dispositivo).
- **Mismo sello:** no cambió nada.
- **Generación mayor:** el otro dispositivo escribió y sincronizó limpio, así que adopta en silencio.
- **Sello distinto con generación igual o menor:** es un fork. Las dos computadoras escribieron desde el mismo punto sin sincronizar entre medio.

## Qué hace si hay fork

1. `unlock` devuelve un aviso `VAULT_FORK_DETECTED`. Dice que el vault cambió en otro dispositivo desde la misma generación y que puede haber un archivo "conflicted copy".
2. El vault queda desbloqueado y no toca ni borra nada. Tampoco actualiza el "last-seen" de ese dispositivo, así que el aviso persiste.
3. No hay merge automático, y es una decisión de diseño. Dropbox se queda con una sola copia y deja la otra como `vault (conflicted copy).db`. Esta tiene la misma passphrase.
4. Lo resuelves a mano. Eliges cuál copia queda como `vault.db`. Si necesitas algo de la otra, la abres apuntando `VALIJA_HOME` a una copia temporal y vuelves a guardar ese contexto.
5. `valija doctor` avisa si todavía hay un archivo de conflicto en la carpeta. Reconoce los nombres de Dropbox, iCloud y Syncthing, pero no los de OneDrive.

## Cómo evitarlo

Antes de cambiar de computadora, corre `valija lock` en la primera. Confirma que el vault es un solo archivo, sin `-wal` ni `-shm`, y muestra la generación. Espera a que Dropbox diga "up to date" y haz `valija unlock` en la segunda. Valija no sabe si Dropbox terminó de sincronizar, así que el fork solo te avisa si te saltas esa espera.

Fuentes: `.context/flows/unlock-vault.md`, `docs/sync.md` y `classifyLineage()`. Verifiqué la clasificación en el código y coincide con la documentación. No revisé la detección de archivos de conflicto en `file-vault-folder.ts`; eso lo tomé de `docs/sync.md`.
