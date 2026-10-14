Valija detecta el conflicto con un contador de "linaje" guardado dentro del propio vault. Cuando detecta una bifurcación, avisa pero **no fusiona nada**: el vault se desbloquea igual y vos elegís qué copia conservar. Verifiqué esto contra el código y coincide con `.context/flows/sync-handoff.md`.

**Cómo lo detecta**

1. Cada escritura incrementa el linaje de forma atómica, dentro del mismo `vault.db`. Guarda un número de generación (+1), un sello de escritura nuevo, el `deviceId` del escritor y la fecha. Está en `SqliteLineageStore.bump()`, llamado desde `commitWrite()`.
2. Cada computadora recuerda por separado el último linaje que vio. Lo guarda en `$VALIJA_STATE_HOME/state.json`, que Dropbox no sincroniza.
3. Al hacer `valija unlock`, `classifyLineage()` (`src/vault/domain/services/vault-lineage.ts`) compara lo que hay en el vault con lo último que vio esa máquina:
   - Si nunca había visto el vault, o la generación es mayor, lo adopta en silencio. Eso pasa cuando la otra máquina escribió y Dropbox sincronizó bien.
   - Si el sello de escritura es igual, no hubo cambios.
   - Si la generación es igual o menor pero el sello es distinto, es una **bifurcación**. Las dos máquinas escribieron desde el mismo punto de partida sin verse.

**Qué hace en caso de bifurcación**

- Devuelve el aviso `VAULT_FORK_DETECTED`. El vault igual se desbloquea.
- No mezcla ni resuelve nada automáticamente. Elegís una de las copias.
- `valija doctor` (`src/delivery/diagnostics.ts`) revisa además si hay archivos de copia en conflicto de Dropbox, como `vault (… conflicted copy …).db`. También avisa de archivos `-wal`/`-shm`/`-journal` sueltos y de backups `.pre-NNN.bak` sobrantes.
- Mientras quede una copia en conflicto sin resolver, no podés mover el vault a otra carpeta (`vault-relocation.ts`).

**Cómo evitar el problema:** hacé `valija lock` antes de cambiar de computadora y esperá a que Dropbox termine de sincronizar. Así queda un único archivo, porque el vault usa `journal_mode=DELETE`.

Una limitación: los nombres de conflicto de OneDrive (`vault-<HOST>.db`) no se detectan. Con Dropbox no hay problema.
