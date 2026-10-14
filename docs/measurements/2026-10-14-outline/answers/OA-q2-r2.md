El control de acceso a un documento compartido públicamente tiene dos lados. Uno es quién puede crear o gestionar el enlace, y el otro es quién puede leerlo.

## 1. El modelo: `Share`
`server/models/Share.ts` tiene `published`, `revokedAt`, `includeChildDocuments`, `allowIndexing`, `urlId`, `domain` y otros campos, y apunta a un `documentId` o a un `collectionId`. El enlace público es `/s/:id`, donde `id` es el UUID o un `urlId` personalizado.

## 2. Crear y gestionar enlaces (usuarios autenticados)
Las rutas están en `server/routes/api/shares/shares.ts`. Todas usan `auth()` y `authorize()`, que viene de `server/policies/`.

| Endpoint | Comprobaciones |
|---|---|
| `shares.create` (l. 263) | `authorize(user, "createShare", team)`. Después `read` sobre el documento o la colección. Si `published`, también `share` sobre el team, el documento y la colección. |
| `shares.update` (l. 350) | `share` sobre el team y `update` sobre el `Share`. |
| `shares.revoke` (l. 424) | `revoke` sobre el `Share`. |
| `shares.list` (l. 159) | `listShares`. Filtra por `userId`, salvo que el usuario sea admin, y por las colecciones a las que tiene acceso. |

Las políticas están en `server/policies/share.ts`:
- `createShare` y `listShares` exigen ser del mismo team y no ser guest. `createShare` además exige que el team sea mutable.
- `update` exige mismo team, ni guest ni viewer, y `can(actor, "share", share.collection)` o `can(actor, "share", share.document)`.
- `revoke` exige ser admin o el creador del share (`isOwner`).

La política `share` sobre `Document` (`server/policies/document.ts:85`) exige que el documento esté activo, que el usuario pueda leerlo y que la colección permita `shareDocument`. Esta última (`server/policies/collection.ts:130`) devuelve `false` si `collection.sharing` es `false`, si el usuario es guest o si es de otro team. Para colecciones personales solo vale el propietario.

## 3. Leer un documento compartido (sin login o con él)
Todo pasa por `loadPublicShare` en `server/commands/shareLoader.ts:23`. Los endpoints que lo usan son `documents.info` (l. 729), `documents.search` (l. 1244), `shares.info`, `shares.sitemap` y `shares.subscribe`. Los dos primeros están en `server/routes/api/documents/documents.ts` y el resto en `shares.ts`. Todos usan `auth({ optional: true })`, así que el token de usuario no hace falta.

`loadPublicShare` aplica estas comprobaciones en orden:
1. Si `id` no es un UUID y encaja con el slug de `urlId`, exige el `teamId` del dominio o contexto. Si falta, lanza `InvalidRequestError`.
2. Busca el `Share` con `published: true` y `revokedAt IS NULL`. Si no existe, lanza `NotFoundError`.
3. Lanza `NotFoundError` si el team está suspendido o si la colección o el documento están archivados.
4. Lanza `AuthorizationError` si el team tiene `sharing` desactivado, o si la colección asociada lo tiene. La excepción es un borrador sin colección.
5. Si se pidió un `collectionId` distinto del compartido, lanza `AuthorizationError`.
6. Si se pidió un `documentId` distinto del compartido, solo se permite cuando `includeChildDocuments` está activo y el documento está en el árbol compartido (`getAllIdsInSharedTree`). Si no, lanza `AuthorizationError`.
7. Si el documento es de importación de prueba (`isTrialImport`), lanza `PaymentRequiredError`.

Estas comprobaciones sustituyen a `authorize`: en una lectura pública no hay `user`, así que el control de acceso es que el `Share` exista, esté publicado y que el documento solicitado esté dentro de su alcance.

## 4. Qué se devuelve según quién mira
Si hay usuario autenticado, el endpoint recarga el documento con su contexto de membresía (`Document.findByPk(..., { userId })`). Después calcula `isPublic = cannot(user, "read", document)` (por ejemplo, `documents.info`, l. 766). Ese flag va al presenter, que recorta el contenido cuando la vista es pública. Así, un miembro con acceso ve el documento completo y un anónimo ve la versión pública.

`documents.info` también limita los backlinks a los documentos del árbol compartido. `showLastUpdated` controla si se incluye `updatedAt`.

## 5. Panel de compartir en la UI
`shares.info` sin `id` llama a `loadShareWithParent` (`shareLoader.ts:146`). Esa función exige `authorize(user, "read", share)` y `read` sobre el documento o la colección. También busca un share padre, ya sea de la colección o de un documento ancestro con `includeChildDocuments`. Solo devuelve el padre si el usuario tiene `read` sobre él.

## 6. Dominios personalizados
`server/middlewares/shareDomains.ts` resuelve el dominio personalizado de un share para llegar a un `teamId`. El middleware se usa, por ejemplo, en `shares.sitemap`. `allowIndexing` decide si el sitemap responde (404 si no).

## Resumen de capas
1. El flag del team (`sharing`) y el de la colección (`sharing`) deben estar activos.
2. Quien crea o edita el enlace debe poder `share` el documento o la colección. No puede ser guest o viewer, y el team debe ser mutable.
3. El `Share` debe estar publicado y no revocado.
4. El documento pedido debe estar dentro del alcance del share (`documentId` exacto o árbol con `includeChildDocuments`).
5. El estado del recurso se comprueba: team no suspendido y documento o colección no archivados.

No ejecuté los tests de `shareLoader.test.ts` ni de `shares.test.ts`, así que esto es lectura del código y no una verificación en ejecución.
