# Plan: `comments.pin`

`comments.resolve` / `comments.unresolve` ya hacen casi lo mismo (cambiar un campo del comentario y propagarlo por websocket), así que el plan sigue ese patrón. No he editado nada.

## Decisión de diseño previa

Fijar es un cambio de estado del comentario, no del cuerpo del documento. Por eso va en una columna nueva de `comments` y no en el Y.js `state`. Así evitas los trampas de `.context/gotchas.md` (locks sobre el documento, `hooks: false`, etc.), que solo aplican a comentarios anclados al crearlos.

Yo propondría `pinnedAt` y `pinnedById`, igual que `resolvedAt` y `resolvedById`. Ya tienes la plantilla y saldría quién lo fijó.

## Archivos a tocar

**Backend**
1. `server/migrations/<timestamp>-add-pinned-to-comments.js`: crear con `yarn sequelize migration:create --name=add-pinned-to-comments`. Añade `pinnedAt` y `pinnedById` (FK a `users`). Considera un índice sobre `documentId` y `pinnedAt` si vas a listar los fijados.
2. `server/models/Comment.ts`: añade las columnas y la relación `pinnedBy`. Añade los métodos `pin(user)` y `unpin()` con JSDoc, que lanzan `ValidationError`, como `resolve()` en las líneas ~213-240. No guardan nada.
3. `server/routes/api/comments/schema.ts`: `CommentsPinSchema` y `CommentsPinReq`, con `BaseIdSchema`. Añade también `CommentsUnpinSchema` si quieres endpoint inverso.
4. `server/routes/api/comments/comments.ts`: ruta `comments.pin` copiando `comments.resolve`:
   - `auth()`, `commentingEnabled()`, `validate()`, `transaction()`.
   - `findByPk` con `lock: UPDATE` sobre el comentario.
   - `authorize(user, "pin", comment)` y `authorize(user, "update", document)`.
   - `comment.pin(user)` y `saveWithCtx(ctx, { silent: true })`.
   - Devuelve `presentComment` y `presentPolicies`.
5. `server/policies/comment.ts`: habilidades `pin` y `unpin`. Solo comentarios raíz (`parentCommentId === null`), igual que `resolve`. Un comentario resuelto probablemente no debería poder fijarse; decídelo.
6. `server/presenters/comment.ts`: expón `pinnedAt`, `pinnedBy` y `pinnedById`.
7. `server/models/Comment.ts` (`findAll` / filtros, si aplica): decide si el listado de `comments.list` ordena los fijados primero o si hace falta un filtro.
8. Tiempo real: `server/queues/processors/WebsocketsProcessor.ts` ya reenvía `comments.update` (líneas ~624-643) con `presentComment`. Si `saveWithCtx` emite ese evento, no hace falta código nuevo en el procesador. Comprueba que lo emite y que el evento llega con `modelId`.

**Frontend**
9. `app/models/Comment.ts`: campos `pinnedAt` y `pinnedById` (observables), más un getter `isPinned`.
10. `app/stores/CommentsStore.ts`: acciones `pin(comment)` y `unpin(comment)`, y un computed para los fijados por documento. Respeta las reglas de MobX del repo: nada de escanear `orderedData` en lookups por fila.
11. `app/components/WebsocketProvider.tsx` (`useCommentHandlers`, línea ~639): el handler de `comments.update` ya hace `comments.add(event)`, así que los otros clientes recibirán el cambio. Revisa solo si la comparación `comment?.resolvedAt !== event.resolvedAt` necesita equivalente para `pinnedAt`.
12. UI: opción "Fijar/Desfijar" en el menú del comentario y un indicador visual o sección de fijados. Usa `handle*` para los handlers y no uses cadenas de traducción manuales.

**Tests**
13. `server/routes/api/comments/comments.test.ts`: casos para fijar, desfijar, doble fijado (error), respuesta, usuario sin permiso, otro equipo y sin autenticación. Si hay snapshots en `__snapshots__`, actualízalos.
14. `server/policies/` (test de la política) y un test de `Comment.pin()`.

## Cosas a tener en cuenta

- **Permisos**: ¿quién puede fijar? Con `resolve` se exige `update` sobre el documento; es lo coherente. Pero las políticas de `update` y `delete` del comentario son solo para el autor o un admin, y fijar es una acción de moderación. No copies esas.
- **Visibilidad**: el evento websocket va a los canales del documento. Comprueba que no filtre a usuarios sin acceso (borradores, compartidos).
- **Concurrencia**: el lock `FOR UPDATE` sobre el comentario evita que dos fijados simultáneos se pisen. No hace falta bloquear el documento, porque no tocas su estado.
- **Límite de fijados**: decide si hay un máximo por documento; si lo hay, la comprobación debe ir dentro de la transacción.
- **Notificaciones**: `comments.update` también dispara procesadores como `NotificationsProcessor` y `SearchIndexProcessor`. Verifica que fijar no genere notificaciones de menciones ni reindexado innecesarios. El evento tiene `data.newMentionIds`, y conviene no enviarlo.
- **API pública y MCP**: si la documentación OpenAPI o `server/mcp/` listan los endpoints de comentarios, añade el nuevo.
- **Convenciones**: JSDoc en todo lo exportado, `if` con llaves, early returns, sin `any`, y línea en blanco antes de cada comentario. Después ejecuta `yarn tsc`, `yarn lint` y `yarn test server/routes/api/comments/comments.test.ts`.

Antes de empezar convendría ejecutar `easy-repo-context context server/routes/api/comments/comments.ts`, como pide el repo, y confirmar con `saveWithCtx` que de verdad se emite `comments.update`.

¿Quieres que fije algún punto abierto (permisos, límite, resueltos) antes de implementarlo?
