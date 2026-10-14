Hay dos fases: quién puede crear o gestionar un share (usuarios autenticados, con políticas) y quién puede verlo por el enlace público (cualquiera, con comprobaciones sobre el estado del share). No leí `server/policies/collection.ts`, así que lo que digo de `shareDocument` sale de cómo lo referencia `policies/document.ts`.

## 1. Crear, editar y revocar (usuarios autenticados)

El código está en `server/routes/api/shares/shares.ts` y las reglas en `server/policies/share.ts`.

**`shares.create`**
1. `authorize(user, "createShare", user.team)` exige que el usuario sea de ese equipo, que el equipo sea mutable y que no sea invitado (`guest`). Antes de eso, el rate limiter limita las llamadas a 25 por minuto.
2. Carga el documento o la colección con `findByPk(..., { userId })`, que aplica el alcance por membresía. Si no existe o el usuario no tiene acceso, devuelve `NotFoundError`. Después exige `authorize(user, "read", ...)`.
3. `Share.findOrCreateWithCtx` busca un share activo (`revokedAt: null`) para ese documento o colección y equipo. Los campos de la petición solo se usan como `defaults`, así que si ya existe uno se devuelve tal cual (está anotado en `.context/gotchas.md`).
4. Si el share resultante está `published`, exige además `share` sobre el equipo, el documento y la colección.
   - La política `share` de `Document` (`policies/document.ts:85`) pide que el documento esté activo, que el equipo sea mutable, `read` sobre el documento y `shareDocument` sobre su colección.

**`shares.update`**
- Exige `share` sobre el equipo y luego `update` sobre el share (`policies/share.ts:30`). Esa política pide mismo equipo, que no sea invitado ni lector (`viewer`), y `share` sobre la colección o el documento. El share se carga con el scope `withCollectionPermissions`.

**`shares.revoke`**
- Exige `revoke`, que solo permiten los administradores o quien creó el share.
- `share.revoke(ctx)` marca `revokedAt`.

**`shares.list`**
- Exige `listShares` y filtra por las colecciones accesibles del usuario (`user.collectionIds()`).
- Los administradores ven todos los shares del equipo y el resto solo los suyos.

**`shares.info` sin `id`**
- Es la variante para el popover de compartir (`loadShareWithParent`, `commands/shareLoader.ts:146`). Exige `read` sobre el share y sobre su documento o colección, y busca el share padre.

## 2. Ver el enlace público (acceso anónimo)

Todo pasa por `loadPublicShare` (`server/commands/shareLoader.ts:23`). Lo usan `shares.info`, `documents.info` con `shareId`, `documents.list` con `shareId`, `shares.sitemap` y `shares.subscribe`. Sus comprobaciones, en orden:

1. **Resolver el share.**
   - Si el `id` es un `urlId` (un slug) y no un UUID, exige `teamId` y lo resuelve a partir del dominio o la petición mediante `getTeamFromContext`.
   - Solo acepta shares con `published: true` y `revokedAt` nulo.
2. **Estado del recurso.** Devuelve `NotFoundError` si el equipo está suspendido o si la colección o el documento están archivados.
3. **Interruptores de sharing.** Devuelve `AuthorizationError` si `team.sharing` está desactivado, o si `collection.sharing` lo está en la colección asociada (salvo un borrador sin colección).
4. **Alcance del enlace.**
   - Si piden un `collectionId` distinto del share, lanza `AuthorizationError`.
   - Si piden un `documentId` distinto del del share, solo se permite cuando `includeChildDocuments` está activo y el documento está en el árbol compartido (`getAllIdsInSharedTree`).
5. **Importación de prueba.** Un documento de una importación de prueba (`isTrialImport`) devuelve `PaymentRequiredError`.

Estas comprobaciones no usan `authorize` porque no hay usuario. El acceso se decide con el estado del share y del recurso. Si la petición trae un usuario autenticado, `documents.info` recarga el documento con su membresía y calcula `isPublic = cannot(user, "read", document)`. Con ese valor el presentador decide si devuelve la vista completa o la pública, y `showLastUpdated` controla si se incluye la fecha de actualización (`includeUpdatedAt`).

## Dónde mirar según lo que busques

- Qué puede hacer cada rol con un share: `server/policies/share.ts` y `policies/document.ts` (`share`).
- Qué se expone públicamente: `server/commands/shareLoader.ts`.
- Cómo se aplica en cada endpoint: `server/routes/api/shares/shares.ts` y `documents.ts` (líneas 729 y 1253 en adelante).
