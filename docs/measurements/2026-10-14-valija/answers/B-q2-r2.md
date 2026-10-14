Valija detecta el conflicto con un contador de "linaje" guardado dentro del propio vault. Lo comprueba al desbloquear, y solo avisa: nunca fusiona. Revisé el código (`classifyLineage` y su uso en `UnlockVault`) y coincide con el doc `.context/flows/sync-handoff.md`.

**Cómo lo detecta**
1. Cada escritura sube el linaje de forma atómica: `generation + 1`, un *write stamp* nuevo, el `deviceId` del escritor y la hora. Está en `meta` dentro de `vault.db`, así que Dropbox lo replica (`SqliteLineageStore.bump()`, llamado desde `commitWrite()` en `context/infra/vault-sessions.ts`).
2. Cada computadora guarda en `$VALIJA_STATE_HOME/state.json` el último linaje que vio (`lastSeen`). Ese archivo no se sincroniza.
3. Al hacer `valija unlock`, `classifyLineage(actual, lastSeen)` compara los dos (`vault/domain/services/vault-lineage.ts`, usado en `unlock-vault.use-case.ts:85`):
   - Sin `lastSeen`, o generación mayor: *fast-forward*. Adopta el estado en silencio.
   - Mismo write stamp: en sincronía.
   - Misma generación o menor, pero con stamp distinto: **fork**. Las dos máquinas escribieron sin ver los cambios de la otra.

**Qué hace ante un fork**
- Devuelve el aviso `VAULT_FORK_DETECTED`. El vault igual se desbloquea.
- No fusiona nada. Tú eliges con qué copia quedarte.
- No pisa el `lastSeen` local, así que el aviso se repite hasta que lo resuelvas.

**Qué más ayuda con Dropbox**
- `valija doctor` (`src/delivery/diagnostics.ts`) detecta archivos de "conflicted copy". También avisa de sidecars `-wal/-shm/-journal` sueltos y de `.pre-NNN.bak` sobrantes.
- `valija lock` en la máquina A comprueba que no queden sidecars. El vault usa `journal_mode=DELETE`, así que es un solo archivo y Dropbox lo sube completo.

**Límites**
- Los nombres de conflicto de OneDrive (`vault-<HOST>.db`) no se detectan.
- El detector depende de que hagas `lock` en A y esperes a que Dropbox termine antes de hacer `unlock` en B. Si abres el vault en las dos a la vez, es justo el caso que produce forks.
- Detectar un fork no lo arregla. Resolverlo depende de ti.

Más detalle del uso en `docs/sync.md`.
