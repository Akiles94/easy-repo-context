El control de acceso a un documento compartido públicamente tiene dos partes. Una crea y gestiona el share (usuarios autenticados, con políticas). La otra lo lee de forma anónima, con `loadPublicShare` como único guardián. El share no tiene contraseña ni lista de usuarios: quien tenga el enlace puede verlo mientras cumpla las condiciones que se comprueban en cada petición.

## 1. Crear y gestionar shares (autenticado)

Todo está en `server/routes/api/shares/shares.ts`. Las reglas están en `server/policies/share.ts`.

| Endpoint | Comprobaciones |
|---|---|
| `shares.create` | `authorize(user, "createShare", team)`: mismo equipo, equipo modificable y no invitado. Después `authorize(user, "read", document/collection)`. Si `share.published`, también `authorize(user, "share", team/document/collection)`. |
| `shares.update` | `authorize(user, "share", team)`. Carga el share con el scope `withCollectionPermissions` y exige `"update"`. La política `update` pide mismo equipo, no invitado, no *viewer*, y que el usuario pueda `"share"` la colección o el documento. |
| `shares.revoke` | La política `revoke` exige mismo equipo, no invitado, no *viewer*, y ser admin o creador del share (`isOwner`). |
| `shares.list` | `"listShares"`. Filtra por las colecciones a las que el usuario tiene acceso (`user.collectionIds()`). Un admin ve los shares de todos. |
| `shares.info` sin `id` | `loadShareWithParent` (`server/commands/shareLoader.ts:146`). Exige `"read"` sobre el share y sobre su documento o colección. También busca un share padre (de la colección o de un documento ancestro con `includeChildDocuments`) que el usuario pueda leer. |

La capacidad `"share"` sobre documentos y colecciones se define en sus propias políticas (`server/policies/document.ts` y `collection.ts`). Ahí dependen del rol y de la membresía.

## 2. Lectura pública: `loadPublicShare`

Está en `server/commands/shareLoader.ts:23`. Lo usan `shares.info` (con `id`), `documents.info` (con `shareId`), `documents.search` (con `shareId`), `shares.sitemap` y `shares.subscribe`. Esos endpoints usan `auth({ optional: true })`, así que no exigen login. Esto es lo que comprueba, en orden:

1. **Resolución del id.** Acepta el UUID del share o un `urlId` (slug personalizado). El slug solo vale junto a un `teamId`, que sale del dominio o subdominio de la petición mediante `getTeamFromContext`. Sin `teamId` lanza `InvalidRequestError`. Esto evita colisiones de slugs entre equipos.
2. **Estado del share.** El `where` exige `revokedAt IS NULL` y `published = true`. Revocar o despublicar corta el acceso de inmediato.
3. **Existencia y estado del recurso.** Devuelve `NotFoundError` si no hay share, si el equipo está suspendido (`team.suspendedAt`) o si la colección o el documento están archivados.
4. **Sharing habilitado.** Lanza `AuthorizationError` si `team.sharing` está desactivado. También lo hace si la colección asociada tiene `sharing` desactivado, salvo en un borrador sin colección. Un admin puede cerrar el compartir a nivel de equipo o de colección y eso invalida shares ya existentes.
5. **Alcance dentro del share.**
   - Si se pide una `collectionId` distinta de la del share, `AuthorizationError`.
   - Si se pide un `documentId` distinto del documento del share, solo se permite cuando `includeChildDocuments` es true y ese id está en el árbol compartido (`getAllIdsInSharedTree`). Si no, `AuthorizationError`. Así no se puede pedir cualquier documento del equipo usando un `shareId` válido.
6. **Importaciones de prueba.** Si el documento es `isTrialImport`, lanza `PaymentRequiredError`.

## 3. Qué se devuelve

Tras `loadPublicShare`, los endpoints deciden cuánta información devolver:

- **Usuario con sesión.** El documento o la colección se recarga con `findByPk(..., { userId })` para cargar su membresía. Luego `isPublic = cannot(user, "read", document)`. Un miembro con permiso real ve la vista completa. Un anónimo, o un usuario sin acceso, recibe la vista pública.
- **Presenters.** Con `isPublic` activo, `presenters/document.ts` y `presenters/collection.ts` recortan campos. Por ejemplo, `updatedAt` solo sale si `share.showLastUpdated` está activo (`document.ts:101`). `presenters/share.ts:30` oculta datos del usuario creador en la vista pública.
- **Backlinks.** En `documents.info` solo se incluyen los que están dentro del árbol compartido (`findSourceDocumentIdsInSharedTree`), para no filtrar títulos de documentos no compartidos.
- **Dominios propios.** El middleware `server/middlewares/shareDomains.ts` y `share.domain` resuelven el equipo por dominio. Con dominio propio, las URLs del árbol se vacían (`sharedTree.url = ""`, línea 101).

## 4. Otros controles

- **Limitación de peticiones.** `documents.search` y `shares.sitemap` llevan `rateLimiter`.
- **Indexado.** `shares.sitemap` devuelve 404 si `allowIndexing` es false.
- **Suscripciones.** `shares.subscribe` exige que `allowSubscriptions` esté activo y que el email se confirme con un token firmado. El enlace de confirmación usa `safeEqual` y un paso `follow` contra pre-fetch de clientes de correo.

## Resumen

- Gestión del share: `server/policies/share.ts` más `authorize(...)` en `shares.ts`.
- Acceso anónimo: `server/commands/shareLoader.ts`, función `loadPublicShare`. Para cambiar algo del acceso público, empieza por ahí.
- Nivel de detalle devuelto: `isPublic` con `cannot(user, "read", ...)` y los presenters.

No ejecuté los tests ni la aplicación. Esta explicación sale de leer el código.
