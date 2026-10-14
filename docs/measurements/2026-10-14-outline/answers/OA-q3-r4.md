Este es el plan. Lo he armado a partir del flujo de `comments.resolve`/`unresolve`, que es el patrón más parecido: cambia un campo del comentario, guarda con `saveWithCtx` y se propaga por WebSocket.

## Cómo funciona hoy (lo que reutilizarías)

- `comments.resolve` en `server/routes/api/comments/comments.ts` usa `auth()`, `commentingEnabled()`, `validate()` y `transaction()`. Bloquea la fila con `lock UPDATE`, autoriza, llama a un método del modelo y guarda con `saveWithCtx(ctx, { silent: true })`.
- El guardado dispara el evento `comments.update`. `WebsocketsProcessor` lo recoge (`case "comments.update"`), recarga el comentario y lo emite con `presentComment` a los canales del documento.
- En el cliente, `WebsocketProvider.tsx` escucha `comments.update` y hace `comments.add(event)`.

Como `comments.update` ya llega a todos los clientes conectados, **no hace falta un evento nuevo**. Basta con que `pin` añada un campo al comentario y lo guarde de la misma forma.

## Archivos a tocar

**Backend**

1. **Migración nueva** en `server/migrations/` (por ejemplo `2026101xxxxxxx-add-pinned-to-comments.js`). Se crea con `yarn sequelize migration:create --name=add-pinned-to-comments`.
   - Columnas `pinnedAt` (DATE, null) y `pinnedById` (UUID, FK a `users`, null), igual que `resolvedAt` y `resolvedById`.
   - Un índice parcial `(documentId) WHERE pinnedAt IS NOT NULL` si vas a listar o limitar los fijados.
2. **`server/models/Comment.ts`**
   - Añade las columnas `pinnedAt`, `pinnedBy` (BelongsTo) y `pinnedById`.
   - Añade los métodos `pin(user)` y `unpin()`, con el mismo estilo que `resolve`/`unresolve`: validan, mutan y no guardan.
   - Si quieres que `pinnedBy` llegue en las respuestas, inclúyelo en el `DefaultScope`.
3. **`server/policies/comment.ts`**: acciones `pin` y `unpin`.
4. **`server/routes/api/comments/schema.ts`**: `CommentsPinSchema` con `{ id: uuid }` y su tipo `CommentsPinReq`.
5. **`server/routes/api/comments/comments.ts`**: la ruta `comments.pin`.
6. **`server/presenters/comment.ts`**: añade `pinnedAt`, `pinnedById` y `pinnedBy`.
7. **`server/routes/api/comments/comments.test.ts`**: tests de la ruta. Hay que actualizar los snapshots de `__snapshots__` si el presenter aparece en ellos.
8. **Docs de la API**: mira si hay un `openapi` o similar que liste los endpoints de comments.

**Frontend**

9. **`app/models/Comment.ts`**: campos `pinnedAt` y `pinnedById`, un getter `isPinned` y los métodos `pin()` y `unpin()`.
10. **`app/stores/CommentsStore.ts`**: acciones `pin` y `unpin` que llamen a `/comments.pin` y `/comments.unpin`. Añade también un computed para los hilos fijados de un documento y ordénalos primero en la lista.
11. **`app/components/WebsocketProvider.tsx`**: en el handler de `comments.update` ya se invalida la policy cuando cambia `resolvedAt`. Haz lo mismo con `pinnedAt`.
12. **UI** (`app/scenes/Document/components/Comments/...`): una acción de menú "Fijar/Desfijar" en el hilo y un indicador visual.

## Decisiones y cosas a tener en cuenta

- **`comments.unpin`**: tendrás que crearlo también. Es la convención de `resolve`/`unresolve`. Si prefieres un solo endpoint, puedes usar `comments.pin` con un flag `pinned: boolean`, pero se aparta del patrón actual.
- **Permisos**: define quién puede fijar. Las opciones son cualquier miembro con acceso de edición al documento, o solo el autor o los admins. `resolve` exige además `authorize(user, "update", document)`, y lo razonable es copiarlo. El comentario debe ser raíz (`parentCommentId === null`), igual que en `resolve`. Valida eso en el modelo y en la policy.
- **Qué significa "fijado"**: decide si es por documento y visible para todos, que es lo que describes. Decide también si hay un máximo de fijados por documento (si lo hay, valídalo dentro de la transacción para evitar carreras) y si un hilo resuelto puede seguir fijado.
- **Concurrencia**: mantén el `lock UPDATE` sobre el comentario, como en `resolve`.
- **Evento de WebSocket**: `saveWithCtx` con `silent: true` sigue emitiendo `comments.update`. Compruébalo en `Model.saveWithCtx` y en el hook `AfterUpdate` de `Comment`. Si el campo está marcado con `@SkipChangeset`, no afecta al evento, pero sí al historial.
- **Efectos secundarios en otros procesadores**: `comments.update` también lo consumen `NotificationsProcessor` y `SearchIndexProcessor`. Verifica que un cambio solo de `pinnedAt` no dispare notificaciones de "comentario actualizado" ni reindexaciones innecesarias. `CommentUpdatedNotificationsTask` solo debería actuar si hay `newMentionIds`.
- **Tiempo real y canales**: `getDocumentEventChannels` ya decide quién recibe el evento según el acceso al documento, así que no se filtra a usuarios sin permiso.
- **API keys**: `comments.pin` modifica contenido colaborativo, no credenciales, así que `auth()` por defecto vale. Ten en cuenta que el `AuthenticationType.APP` de las reglas es solo para email y passkeys.
- **Rate limiting**: opcional. Las reacciones usan `rateLimiter(TwentyFivePerMinute)`. Para fijar no es imprescindible.
- **MCP**: `server/mcp/tools/comments.ts` expone herramientas de comentarios. Decide si quieres exponer ahí pin/unpin. No es necesario.
- **Convenciones del repo**: JSDoc en lo exportado, sin `any`, sin `as`, llaves en todos los `if`, y no añadir strings de traducción a mano. Después ejecuta `yarn tsc`, `yarn lint` y `yarn test server/routes/api/comments/comments.test.ts`.

## Orden de trabajo sugerido

1. Migración y modelo.
2. Policy, schema y ruta, con los tests del servidor.
3. Presenter.
4. Modelo, store y WebSocket del cliente.
5. UI.
6. Verificación end-to-end con dos sesiones, para comprobar que el segundo usuario ve el hilo fijado sin recargar. Para eso está la skill `verify-outline`.

Si quieres, el siguiente paso es cerrar las dos decisiones abiertas: quién puede fijar y si habrá un máximo de fijados. Con eso podría pasar a implementarlo.
