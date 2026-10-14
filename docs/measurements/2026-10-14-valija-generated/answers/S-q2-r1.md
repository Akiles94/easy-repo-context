**Resumen:** Valija detecta el conflicto comparando un "linaje" guardado dentro del vault con lo último que ese dispositivo vio. Si detecta una bifurcación, te avisa pero no borra ni mezcla nada. Dropbox se queda con una sola copia, y la otra queda como "conflicted copy" para que la resuelvas a mano.

**Cómo lo detecta** (`src/vault/domain/services/vault-lineage.ts:classifyLineage`)
1. Cada escritura guarda dentro de `vault.db` una *generación* (contador), un *write stamp* y el id del dispositivo que escribió.
2. Cada dispositivo recuerda localmente la última generación y stamp que vio. Esto vive en `VALIJA_STATE_HOME`, fuera de la carpeta sincronizada, así que no se sincroniza.
3. En `valija unlock` se compara el linaje actual con el último visto:
   - Mismo stamp: `in-sync`.
   - Generación mayor: `fast-forward`. El otro equipo escribió limpiamente y se adopta en silencio.
   - Generación igual o menor con stamp distinto: `fork`. Los dos equipos escribieron desde el mismo punto de partida.
   - Si el dispositivo nunca había visto el vault, cuenta como `fast-forward`.

**Qué hace cuando hay fork** (`UnlockVault.execute()`, `docs/sync.md`)
- Devuelve un aviso `VAULT_FORK_DETECTED` que indica la generación y que Dropbox pudo haber conservado solo una copia.
- El vault **sí se desbloquea**. No se actualiza el "último visto", así que el aviso persiste.
- No borra ni fusiona nada. No hay merge automático, por diseño.

**Cómo lo resuelves tú**
1. Busca en la carpeta del vault un archivo tipo `vault (conflicted copy).db`. `valija doctor` lo marca si sigue ahí.
2. Ambas copias abren con la misma passphrase.
3. Elige cuál dejar como `vault.db`. Si necesitas algo de la otra, ábrela apuntando `VALIJA_HOME` a una copia temporal y vuelve a guardar ese contexto a mano.

**Límites**
- Valija solo ve el fork al desbloquear. No vigila a Dropbox ni detecta si aún está subiendo.
- OneDrive renombra el perdedor a `vault-<HOSTNAME>.db`, y `doctor` no lo reconoce. Dropbox, iCloud y Syncthing sí se detectan.
- Para evitar el fork, haz `valija lock` en A, espera a que Dropbox diga "up to date" y recién ahí haz `valija unlock` en B.

Me basé en `docs/sync.md` y en el código de `classifyLineage`. No revisé la detección de archivos "conflicted copy" de `doctor`, que solo conozco por el doc.
