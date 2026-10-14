Hay dos planos de control distintos: quién puede **crear y gestionar** un share (usuarios autenticados, con políticas) y quién puede **ver** el contenido compartido (cualquiera con el enlace, sin política de usuario, con comprobaciones sobre el propio share).

## 1. Crear y gestionar shares (autenticado, con políticas)

Todo está en `server/routes/api/shares/shares.ts`, con las reglas en `server/policies/share.ts`.

**`shares.create`** (línea 263)
1. `rateLimiter` y `auth()` obligatorio.
2. `authorize(user, "createShare", user.team)` (línea 282). La política exige que el usuario sea de ese equipo, que el equipo permita modificaciones y que no sea invitado (`!actor.isGuest`).
3. Carga el documento o la colección con `findByPk(..., { userId })`, es decir, con el alcance de membresía del usuario. Si no existe o no tiene acceso, devuelve `NotFoundError`. Después comprueba `authorize(user, "read", ...)`.
4. `Share.findOrCreateWithCtx` busca un share activo (`revokedAt: null`) para ese documento o colección. Si ya existe, lo devuelve tal cual. Los campos de la petición solo son `defaults`.
5. Si el share resultante está `published`, exige el permiso `"share"` sobre el equipo, el documento y la colección (líneas 328-336):
   - `document.ts:85`: el documento debe estar activo, el usuario debe poder leerlo, y la colección debe permitir `shareDocument`.
   - `collection.ts:122`: la colección no puede ser personal.
   - `collection.ts:130`: `shareDocument` descarta invitados y exige un equipo mutable, entre otras comprobaciones.

**`shares.update`** (línea 350)
- Exige `"share"` sobre el equipo y `"update"` sobre el share.
- `"update"` pide que el actor sea del equipo, no sea invitado ni viewer, y tenga el permiso `"share"` sobre la colección o el documento (`share.ts:30`).
- Cargas el share con el scope `withCollectionPermissions`, que incluye los permisos del usuario sobre la colección.
- Aquí se cambia `published`, `includeChildDocuments`, `urlId`, `allowIndexing` y similares.

**`shares.revoke`** (línea 424)
- `"revoke"` exige ser admin o el creador del share (`isOwner`), y no ser invitado ni viewer.
- `share.revoke()` solo rellena `revokedAt` y `revokedById`. No borra la fila.

**`shares.list`** (línea 159)
- Exige `"listShares"`.
- Filtra por `teamId`, por `published: true` y por no revocados.
- Un usuario normal solo ve sus propios shares. Un admin ve todos los del equipo.
- Limita los resultados a colecciones a las que el usuario tiene acceso (`user.collectionIds()`).

## 2. Ver un share público (sin login)

Aquí no hay política `cancan` sobre el usuario. El control es `loadPublicShare` en `server/commands/shareLoader.ts:23`. Lo usan `shares.info` (con `id`), `documents.info` y `collections.info` (con `shareId`), `shares.sitemap` y `shares.subscribe`. Las rutas son `auth({ optional: true })`.

Comprobaciones, en orden:

1. **Resolución del share** (líneas 29-48). Solo coincide si `published: true` y `revokedAt IS NULL`.
   - Si el identificador es un UUID, se busca por `id`.
   - Si es un slug (`urlId`), se exige `teamId`, que se saca del dominio o contexto con `getTeamFromContext`. Sin él, `InvalidRequestError`. Así un slug no puede resolverse entre equipos.
2. **Estado del recurso** (líneas 71-78). Devuelve `NotFoundError` si el equipo está suspendido o si la colección o el documento están archivados.
3. **Flags de compartición** (líneas 84-89). Exige `team.sharing` y `collection.sharing`; si no, devuelve `AuthorizationError`. La excepción es un borrador sin colección. Esto permite desactivar el compartir a nivel de equipo o de colección y que los enlaces ya publicados dejen de funcionar.
4. **Alcance del árbol** (líneas 91-126).
   - Si el share es de una colección, `sharedTree` es el árbol de la colección.
   - Si es de un documento con `includeChildDocuments`, es el árbol de sus hijos.
   - Si la petición pide otro `documentId` distinto del compartido, ese documento debe estar dentro de `getAllIdsInSharedTree(sharedTree)`; si no, `AuthorizationError`. Así no se puede navegar fuera de lo compartido cambiando el id.
   - Un `collectionId` que no coincide con el del share también da `AuthorizationError`.
5. **Trial import** (línea 128): devuelve `PaymentRequiredError`.

## 3. Qué se devuelve al visitante

- En `documents.info` (línea 742), si hay `shareId`, se llama a `loadPublicShare`. Si además hay usuario autenticado, se recarga el documento con su membresía. Luego `isPublic = cannot(user, "read", document)`.
- `isPublic` se pasa a `presentDocument` y `presentCollection`, junto con `shareId` y `includeUpdatedAt: share.showLastUpdated`. Los presenters recortan los datos para quien no tiene permiso real.
- Las `policies` solo se devuelven si no es vista pública (línea 805).
- Los backlinks se filtran para incluir solo documentos dentro del árbol compartido (línea 768).

## Cosas a tener en cuenta

- **`shares.create` es idempotente sobre un share activo.** Devuelve el existente sin aplicar los campos de la petición. Para cambiar algo hay que usar `shares.update` (está en `.context/gotchas.md`).
- **El `read` sobre `Share` es solo de equipo.** `share.ts:22` no mira la colección. Los accesos finos van por `"update"` y `"share"`, que sí dependen del documento y la colección.
- **Revocar y despublicar son cosas distintas.** `published: false` o `revokedAt` informado hacen que `loadPublicShare` responda `NotFoundError`, aunque la fila siga existiendo.
- **No ejecuté nada**, solo leí el código. No he revisado `collections.info`, los presenters ni el middleware `shareDomains` (dominios personalizados), así que ahí puede haber matices que no cubro.
