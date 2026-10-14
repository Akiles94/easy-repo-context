# Plan: `comments.pin`

No he editado nada. Esto sale de leer `.context/gotchas.md`, el flujo `comment-create` y los handlers de `comments.resolve` y `comments.unresolve`. Esos dos son la plantilla más cercana, porque cambian un estado del comentario y lo difunden por WebSocket.

## Cómo funciona la difusión en tiempo real

`comments.resolve` hace `comment.saveWithCtx(ctx, { silent: true })`. Eso genera un evento `comments.update`. `WebsocketsProcessor` (`server/queues/processors/WebsocketsProcessor.ts:624`) lo recoge, recarga el comentario y lo emite a los canales del documento con `presentComment`. En el cliente, `useCommentHandlers` (`app/components/WebsocketProvider.tsx:639`) lo aplica con `comments.add(event)`.

Si `pinnedAt` y `pinnedById` se serializan en `presentComment`, el fijado llega a los demás usuarios sin añadir eventos ni tocar el procesador de websockets.

## Archivos a tocar

**Backend**
1. **`server/migrations/<timestamp>-add-pinned-to-comments.js`**: crea la migración con `yarn sequelize migration:create`. Las más recientes son de `20261012...`, así que el nombre debe ser posterior.
   - Añade `pinnedAt` (fecha, nullable) y `pinnedById` (uuid, FK a `users`).
   - Añade un índice por `documentId` si vas a listar los fijados.
2. **`server/models/Comment.ts`**: añade las columnas y la relación `pinnedBy`, igual que `resolvedAt`, `resolvedById` y `resolvedBy`.
   - Añade los métodos `pin(user)` y `unpin()` con el mismo patrón que `resolve()` (líneas 217-240). No guardan; lanzan `ValidationError` si ya está fijado o si es una respuesta.
   - Añade el getter `isPinned`.
3. **`server/policies/comment.ts`**: añade las políticas `pin` y `unpin`, calcadas de `resolve` y `unresolve`. Solo se permiten sobre comentarios raíz (`parentCommentId === null`) y del mismo equipo.
4. **`server/routes/api/comments/schema.ts`**: añade `CommentsPinSchema` y su tipo `CommentsPinReq`, con `id` como uuid.
5. **`server/routes/api/comments/comments.ts`**: añade el handler `comments.pin`, copiando `resolve`.
   - Middlewares: `auth()`, `commentingEnabled()`, `validate`, `transaction()`.
   - Bloquea la fila del comentario con `FOR UPDATE`.
   - Carga el documento con `includeContent: false`.
   - Autoriza con `authorize(user, "pin", comment)` y con `authorize(user, "update", document)`.
   - Llama a `comment.pin(user)`, guarda con `saveWithCtx(ctx, { silent: true })` y devuelve `presentComment` más `presentPolicies`.
6. **`server/presenters/comment.ts`**: añade `pinnedAt` y `pinnedById` (y `pinnedBy`, si `resolvedBy` ya se presenta así). Sin esto el fijado no llega a nadie, ni por API ni por socket.
7. **Opcional: `comments.unpin`**. Sin él el fijado no se puede deshacer. Yo lo incluiría en el mismo cambio.
8. **Opcional: `comments.list`**. Un filtro `pinned`, o al menos el orden, si la UI debe mostrar los fijados arriba.

**Frontend**
9. **`app/models/Comment.ts`**: añade `pinnedAt`, `pinnedById`, `isPinned`, `pin()` y `unpin()`, con el patrón de `resolve()`.
10. **`app/stores/CommentsStore.ts`**: añade `pin(id)` y `unpin(id)` que llaman a `/comments.pin` (patrón de `resolve`, línea 129). Añade también un selector `pinnedThreadsInDocument`, siguiendo el estilo de `resolvedThreadsInDocument`.
11. **Componentes de `app/scenes/Document/components/Comments/`**: un botón o entrada de menú para fijar y una sección o indicador de fijados.
12. **`app/components/WebsocketProvider.tsx`**: probablemente no haga falta tocarlo, porque `comments.update` ya funciona. Compruébalo al probar.

**Tests**
13. **`server/routes/api/comments/comments.test.ts`**: cubre éxito, comentario ya fijado, respuesta (debe fallar), usuario de otro equipo y sin permiso de `update` sobre el documento. Recarga el modelo para verificar que se persistió, como pide `AGENTS.md`.
14. **`server/policies/`**: tests de política si encajan con los existentes.
15. **`server/mcp/tools/comments.ts`**: solo si quieres exponer la acción por MCP; no es necesario.

## Cosas a tener en cuenta

- **No hace falta lock del documento.** El gotcha de `server/routes/api/comments` (bloquear con `FOR UPDATE` antes de leer el `state`) aplica a comentarios anclados que modifican el estado de ProseMirror. Fijar solo cambia una fila de `comments`, así que basta bloquear el comentario, como en `resolve`. No toques `document.state` ni `content`. Si lo hicieras, tendrías que guardar con hooks activos (gotcha repo-wide).
- **Decide el modelo de permisos antes de escribir la política.** Ahora `resolve` exige `update` sobre el documento, y `update` y `delete` del comentario exigen ser autor o admin. Para fijar, lo más coherente es copiar `resolve` (cualquiera con `update` sobre el documento), pero conviene confirmarlo.
- **Decide si fijar es por comentario o por documento.** Con una columna en `comments`, el fijado es global para todos. Si quieres uno por usuario, haría falta otra tabla; no encaja con "los demás lo ven fijado".
- **¿Uno o varios fijados por documento?** Si es solo uno, hay que desfijar el anterior en la misma transacción y emitir un `comments.update` por cada comentario afectado. Puede dar carreras entre dos usuarios, así que habría que bloquear algo común. Si son varios, es más simple.
- **Respuestas e hilos.** Un comentario fijado debe ser raíz de hilo (`parentCommentId === null`), como `resolve`. Decide qué pasa si se resuelve un hilo fijado (¿se desfija?) y si se borra (el borrado ya emite `comments.delete`).
- **Visibilidad del socket.** `getDocumentEventChannels` ya respeta la visibilidad del documento, incluidos los borradores, así que reutilizar `comments.update` no filtra nada a quien no deba verlo.
- **Estilo del repo** (`AGENTS.md`):
  - JSDoc en todo lo exportado.
  - Early returns y llaves siempre.
  - Sin `any` ni aserciones.
  - No crear archivos `.md`.
  - No añadir strings de traducción a mano.
  - Los eventos que llegan por websocket deben tener tipos en `server/types.ts` (aquí no hace falta tocar nada si reutilizas `comments.update`).
- **Validación.**
  - Prueba con `yarn test server/routes/api/comments/comments.test.ts`.
  - Pasa `yarn tsc` y `yarn lint`.
  - Para ver el tiempo real con dos sesiones, existe la skill `verify-outline`.
  - Antes de editar, `easy-repo-context context <archivo>` lista los gotchas por archivo.

## Preguntas antes de empezar

1. ¿Uno o varios comentarios fijados por documento?
2. ¿Quién puede fijar? Propongo lo mismo que `resolve`.
3. ¿Incluimos `comments.unpin` y el filtro en `comments.list`?
4. ¿Hace falta UI o solo el endpoint?
