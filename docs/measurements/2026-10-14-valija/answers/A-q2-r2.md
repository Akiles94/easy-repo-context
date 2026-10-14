Valija detecta el conflicto al hacer `unlock`. Cuando lo detecta, abre el vault igual, avisa y no borra nada.

## Cómo lo detecta

Cada escritura en el vault guarda un sello de linaje dentro de la tabla `meta`, que está cifrada. El sello tiene cuatro campos: `generation` (un contador que sube en cada escritura), `writeStamp` (un ID único por escritura), `writer` (el dispositivo) y `writtenAt` (la fecha). El código está en `sqlite-lineage-store.ts`.

Cada computadora recuerda además el último sello que vio, con `deviceIdentity.lastSeen`. Al hacer `unlock`, `classifyLineage` (`src/vault/domain/services/vault-lineage.ts:30`) compara el sello actual con el último visto:

| Situación | Resultado |
|---|---|
| Nunca vio este vault, o es el primer unlock en este equipo | `fast-forward` |
| Mismo `writeStamp` que la última vez | `in-sync` |
| `generation` mayor que la última vista | `fast-forward`: el otro equipo escribió limpio y sincronizó, así que se adopta en silencio |
| `generation` igual o menor, pero con otro `writeStamp` | `fork` |

Un `fork` significa que las dos computadoras escribieron desde el mismo punto de partida sin haber sincronizado antes.

## Qué hace cuando hay un fork

El comportamiento está en `unlock-vault.use-case.ts:86-102`:

- Abre el vault igual y devuelve un aviso `VAULT_FORK_DETECTED`.
- No actualiza el "último visto", así que el aviso se repite en cada unlock hasta que lo resuelvas.
- No borra ni fusiona nada. El README dice que no hay merge automático, "ever, by design".
- `valija doctor` busca en la carpeta archivos como `conflicted copy` o `.sync-conflict-` (`file-vault-folder.ts:19`) y los lista.

## Cómo se resuelve (según `docs/sync.md`)

1. Dropbox suele guardar una sola versión como `vault.db` y dejar la otra como "conflicted copy".
2. Las dos abren con la misma passphrase.
3. Tú eliges cuál conservar como `vault.db`. Si necesitas algo de la otra, la abres apuntando `VALIJA_HOME` a una copia temporal y guardas ese contexto a mano.

## Cómo evitarlo

Haz `valija lock` en una computadora, espera a que Dropbox diga "up to date" y recién entonces haz `unlock` en la otra.

Una limitación que sale del diseño: la detección ocurre en el `unlock` de la computadora que recibe los cambios. Valija no ve nada si el cliente de sync pisa el archivo mientras el vault está abierto.
