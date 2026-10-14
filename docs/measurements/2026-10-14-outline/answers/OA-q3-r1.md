# Plan para `comments.pin`

`comments.resolve` y `comments.unresolve` ya hacen casi lo mismo que necesitas, así que `pin` y `unpin` pueden seguir ese patrón. No he editado nada.

## Cómo funciona hoy `resolve`
- La ruta (`server/routes/api/comments/comments.ts:327`) usa `auth()`, `commentingEnabled()`, `validate()` y `transaction()`.
- Bloquea la fila con `Comment.findByPk(... lock UPDATE)` y autoriza con `authorize(user, "resolve", comment)` y `authorize(user, "update", document)`.
- Llama a un método del modelo y guarda con `comment.saveWithCtx(ctx, { silent: true })`.
- Ese `saveWithCtx` emite el evento `comments.update`. `WebsocketsProcessor` lo captura, presenta el comentario y lo emite a los canales del documento. En el cliente, `WebsocketProvider` hace `comments.add(event)`.
- Por eso el tiempo real sale casi gratis: si `pin` modifica el comentario con `saveWithCtx`, los demás usuarios reciben el cambio con el flujo existente.

## Archivos a tocar

**Backend**
1. **Migración nueva** en `server/migrations/` (la última es `20261012120000-…`). Crea con `yarn sequelize migration:create --name=add-pinned-to-comments`. Añade `pinnedAt` (fecha, nullable) y `pinnedById` (UUID, nullable, FK a `users`, `ON DELETE SET NULL`). Añade un índice por `documentId` si vas a consultar los fijados.
2. **`server/models/Comment.ts`**
   - Añade las columnas `pinnedAt`, `pinnedById` y la relación `pinnedBy`, igual que `resolvedBy` (líneas ~46 y ~81-88).
   - Añade los métodos `pin(user)` y `unpin()`, con el mismo estilo que `resolve()` y `unresolve()` (línea ~217). Deben lanzar `ValidationError` si ya está fijado, si no lo está o si es una respuesta.
3. **`server/routes/api/comments/schema.ts`**: añade `CommentsPinSchema` y `CommentsUnpinSchema` con `BaseIdSchema`, más sus tipos `Req`.
4. **`server/routes/api/comments/comments.ts`**: añade las rutas `comments.pin` y `comments.unpin`, copiando la estructura de `resolve`.
5. **`server/policies/comment.ts`**: añade las políticas `pin` y `unpin`, con las mismas condiciones que `resolve` (comentario raíz, mismo equipo).
6. **`server/presenters/comment.ts`**: añade `pinnedAt`, `pinnedBy` y `pinnedById` a la respuesta.
7. **Tests** en `server/routes/api/comments/comments.test.ts`. Cubre fijar, doble fijado, fijar una respuesta, falta de permisos, usuario sin acceso al documento y `unpin`. Si el snapshot de la carpeta `__snapshots__` se ve afectado, actualízalo.

**Frontend**
8. **`app/models/Comment.ts`**: añade los campos `pinnedAt`, `pinnedBy` y `pinnedById`, y los métodos `pin()` y `unpin()`.
9. **`app/stores/CommentsStore.ts`**: añade las acciones `pin` y `unpin`, junto a `resolve` (línea ~129). Añade también un `computedFn` para los hilos fijados de un documento.
10. **UI**: un botón en el menú del hilo y una sección o ordenación de fijados en `app/scenes/Document/components/Comments/`.

## Cosas a decidir y tener en cuenta
- **¿Quién puede fijar?** `resolve` exige `update` sobre el documento. Para fijar probablemente quieras lo mismo, para que un lector no pueda fijar. Decide si cualquiera con permiso de edición puede fijar o solo admins o el autor.
- **¿Uno o varios fijados por documento?** Si es solo uno, `pin` debe desfijar el anterior dentro de la misma transacción. Hay que emitir también un evento para el comentario desfijado, o los clientes quedarán con dos fijados. El bloqueo `FOR UPDATE` no basta: bloquea también las filas del resto de comentarios fijados del documento.
- **Evento de tiempo real**: reutilizar `comments.update` es lo más simple y no requiere cambios en `WebsocketsProcessor`. Si prefieres eventos propios (`comments.pin`), tendrías que ampliar `CommentEvent` en `server/types.ts` (línea ~408), añadir el caso en `WebsocketsProcessor.ts` (línea ~624) y el listener en `WebsocketProvider.tsx` (línea ~635). Solo lo haría si el cliente necesita distinguir "fijado" de "editado".
- **`silent: true`** en `saveWithCtx` evita que cambie `updatedAt`. Revisa si quieres lo mismo con pin.
- **Notificaciones**: `comments.update` puede disparar procesadores, por ejemplo menciones o notificaciones. Comprueba que fijar no genere notificaciones espurias. `CommentUpdateEvent.data.newMentionIds` es opcional, así que debería ser seguro, pero verifícalo.
- **Respuestas**: solo se deben poder fijar hilos raíz (`parentCommentId === null`), como en `resolve`.
- **Comentarios resueltos**: decide si se pueden fijar. Lo más coherente es que resolver desfije, o que no se pueda fijar un hilo resuelto.
- **Borrado**: `pinnedById` con `SET NULL` evita errores al borrar usuarios. Un comentario borrado ya sale del flujo por `comments.delete`.
- **Convenciones del repo**
  - JSDoc en todo lo público.
  - Líneas en blanco antes de los comentarios.
  - Nada de `any` ni aserciones.
  - No añadir cadenas de traducción a mano.
  - Probar con `yarn test server/routes/api/comments/comments.test.ts`.
  - Pasar `yarn tsc` y `yarn lint`.
- **Documentación de la API**: mira si el repo mantiene un OpenAPI o spec de rutas que haya que actualizar. No lo he comprobado.

Si me confirmas las dos decisiones principales (permisos y uno o varios fijados), te preparo la implementación.
