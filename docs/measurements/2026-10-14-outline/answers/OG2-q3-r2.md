# Plan: `comments.pin`

`comments.resolve`/`unresolve` ya hacen casi lo mismo, así que las sigo como plantilla. Es el mismo patrón: un campo en `Comment`, `saveWithCtx`, evento `comments.update` y propagación por WebSocket. No he editado nada.

## Archivos a tocar

**Backend**
1. **`server/migrations/2026101XXXXXXX-add-pinned-to-comments.js`**
   - Se crea con `yarn sequelize migration:create --name=add-pinned-to-comments`.
   - Añade `pinnedAt` (DATE, nullable) y `pinnedById` (UUID, FK a `users`, nullable).
   - Valora un índice sobre `(documentId, pinnedAt)` para listar los fijados.
2. **`server/models/Comment.ts`**
   - Añade `pinnedAt`, `pinnedById` y la relación `pinnedBy` (como `resolvedBy`, líneas ~80-88).
   - Añade los métodos `pin(user)` y `unpin()` (como `resolve`/`unresolve`, líneas ~215-240).
   - Si `pinnedBy` se carga por scope, añádelo al `@DefaultScope` (como `resolvedBy`, línea ~46).
3. **`server/routes/api/comments/schema.ts`**
   - `CommentsPinSchema` con `{ id: uuid }` y su tipo `CommentsPinReq`.
   - Si haces `comments.unpin`, también `CommentsUnpinSchema`.
4. **`server/routes/api/comments/comments.ts`**
   - Nuevo `router.post("comments.pin", auth(), commentingEnabled(), validate(...), transaction(), ...)`, copiando el handler de `comments.resolve` (líneas 327-360).
   - Cierra con `comment.saveWithCtx(ctx, { silent: true })`.
5. **`server/policies/comment.ts`**
   - Nuevas habilidades `pin` y `unpin`, como las de `resolve` y `unresolve`.
6. **`server/presenters/comment.ts`**
   - Añade `pinnedAt`, `pinnedById` y `pinnedBy`.
7. **`server/types.ts`**
   - Probablemente no hace falta tocarlo. `saveWithCtx` ya emite `comments.update` y `CommentUpdateEvent` lo cubre.
8. **`server/queues/processors/WebsocketsProcessor.ts`** (líneas ~624-643)
   - `comments.update` ya presenta el comentario y lo emite al canal del documento, así que el tiempo real llega sin cambios.
   - Solo hay que revisar que el payload incluya los campos nuevos.
9. **`server/mcp/tools/comments.ts`**
   - Opcional: expón la acción si quieres paridad con MCP.

**Frontend**
10. **`app/models/Comment.ts`**
    - Añade los campos `pinnedAt` y `pinnedBy`, y un getter `isPinned`.
11. **`app/stores/CommentsStore.ts`**
    - Añade `pin(id)` y `unpin(id)` (como `resolve`, línea ~129).
    - Añade el computed `pinnedThreadsInDocument`.
12. **`app/components/WebsocketProvider.tsx`** (líneas ~639-648)
    - El handler de `comments.update` hace `comments.add(event)`, así que el estado se actualiza solo.
    - Revisa la lógica `resolvedAt !== event.resolvedAt` de ese handler. Puede que necesites un efecto parecido para `pinnedAt`.
13. **UI**
    - Un botón o menú en el hilo de comentarios y una sección de fijados en el sidebar. Localiza los componentes con `grep -r "unresolve" app/scenes/Document/components`.

**Tests**
14. **`server/routes/api/comments/comments.test.ts`**
    - Casos: éxito, 403 sin permiso, 404 con id inexistente, y fijar un comentario ya fijado.
    - Recarga el modelo para comprobar que se persiste.
    - Añade un test de la policy.

## Qué tener en cuenta

- **Reglas de AGENTS.md.**
  - No crear `.md` nuevos.
  - JSDoc en las funciones exportadas.
  - Sin `any`.
  - Las cadenas de UI no se añaden a mano a las traducciones.
- **Decisiones de producto que condicionan la policy.**
  - ¿Quién puede fijar? Hoy `resolve` exige `authorize(user, "update", document)`, o sea, permiso de edición. Fijar es una acción de moderación, así que lo coherente es exigir lo mismo que `resolve`.
  - ¿Solo hilos raíz (`parentCommentId === null`)? Lo habitual es que sí, como en `resolve`.
  - ¿Hay un límite de fijados por documento? ¿Puede haber varios?
  - ¿Los comentarios resueltos se pueden fijar?
  - ¿Se hace `unpin` al resolver o al borrar el comentario?
- **No necesitas el bloqueo del documento.** El gotcha de `.context/gotchas.md` ("Anchored comments must lock the document row") aplica a `comments.create` porque reescribe el estado Y.js del documento. Fijar solo cambia columnas del comentario, así que basta bloquear la fila del comentario (`FOR UPDATE`), como hace `resolve`. No toques `document.state`; si lo hicieras, tendrías que respetar las reglas de `silent: true` y de hooks habilitados.
- **`silent: true` en `saveWithCtx`.** Evita bumpear `updatedAt` del comentario, igual que `resolve`. Decide si fijar debe contar como actividad.
- **Tiempo real.** Los demás clientes lo ven vía `comments.update`, que se emite solo al canal del documento. Verifica que la presentación respeta los permisos de lectura del documento (el processor ya usa `getDocumentChannels`/similar; compruébalo).
- **Cascada con respuestas.** `Comment.cascadeResolvedToReplies` (línea ~305) solo reacciona a `resolvedAt`. Fijar un hilo raíz no necesita propagarse a las respuestas, así que no lo añadas ahí.
- **Idempotencia.** Decide si volver a fijar un comentario ya fijado devuelve el comentario sin cambios o un error. La policy puede exigir `pinnedById === null`, igual que `resolve`.
- **Auth.** `auth()` con el tipo por defecto basta, porque no cambia credenciales. No hace falta `AuthenticationType.APP`.
- **Reglas Sequelize de AGENTS.md.** Si `pinnedBy` fuera un array/JSON, reemplázalo en vez de mutarlo. Aquí son columnas escalares, así que no aplica.
- **Alternativa más simple.** Si solo quieres un fijado por documento, puede ser mejor un `pinnedCommentId` en `Document`, pero mezcla responsabilidades y notifica a la colaboración. La opción por comentario es más limpia.

## Verificación

- `yarn test server/routes/api/comments/comments.test.ts` y el test de policies.
- `yarn tsc` y `yarn lint`.
- Si quieres comprobar el tiempo real con dos sesiones, la skill `verify-outline` levanta la app con navegador headless.

Dime las decisiones de producto (quién puede fijar, cuántos, si es solo para hilos raíz) y lo implemento.
